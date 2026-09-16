/**
 * @file fetchWithRetry.js
 * @description Fetch wrapper with exponential backoff and circuit breaker
 * @updated 2026-06-20
 */
const logger = require("../services/logger");
const { requestContext } = require("./requestContext");

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_BACKOFF_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchWithRetry = async (url, options = {}, config = {}) => {
  const { retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS, backoffMs = DEFAULT_BACKOFF_MS } = config;
  
  const store = requestContext.getStore();
  const reqId = store ? store.requestId : null;
  const headers = new Headers(options.headers || {});
  if (reqId && !headers.has("X-Request-ID") && !headers.has("x-request-id")) {
    headers.set("X-Request-ID", reqId);
  }
  options.headers = headers;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.status >= 500) throw new Error("Server error: " + res.status);
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "5") * 1000;
        logger.warn("Rate limited, backing off", { url, retryAfter });
        await sleep(retryAfter);
        continue;
      }
      logger.info("API request succeeded", { url, status: res.status, attempt: attempt + 1 });
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      const delay = backoffMs * Math.pow(2, attempt);
      logger.warn("API request failed, retrying", { url, attempt: attempt + 1, delayMs: delay, error: err.message });
      await sleep(delay);
    }
  }
};

class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5;
    this.timeout = options.timeout || 60000;
    this.halfOpenRequests = options.halfOpenRequests || 1;
    this.failures = 0;
    this.successes = 0;
    this.state = "CLOSED";
    this.nextAttempt = Date.now();
    this.stats = { totalCalls: 0, totalFailures: 0, totalSuccesses: 0 };
  }

  get isOpen() { return this.state === "OPEN" && Date.now() < this.nextAttempt; }

  async call(fn) {
    this.stats.totalCalls++;
    if (this.isOpen) throw new Error("Circuit breaker is OPEN - service unavailable");
    if (this.state === "OPEN") this.state = "HALF_OPEN";
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    this.stats.totalSuccesses++;
    this.failures = 0;
    if (this.state === "HALF_OPEN") {
      this.successes++;
      if (this.successes >= this.halfOpenRequests) {
        this.state = "CLOSED";
        this.successes = 0;
        logger.info("Circuit breaker closed");
      }
    }
  }

  _onFailure() {
    this.stats.totalFailures++;
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.timeout;
      logger.error("Circuit breaker opened", new Error("Threshold reached: " + this.failures + " failures"));
    }
  }

  getState() { return { state: this.state, failures: this.failures, ...this.stats }; }
}

module.exports = { fetchWithRetry, CircuitBreaker, sleep };
// build: 1781956489
