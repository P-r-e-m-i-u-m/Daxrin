const { fetchWithRetry, CircuitBreaker } = require("../fetchWithRetry");
const { requestContext } = require("../requestContext");

jest.mock("../../services/logger", () => ({
  info: jest.fn(),
  warn: jest.fn((msg, obj) => console.log(msg, obj)),
  error: jest.fn()
}));

describe("fetchWithRetry", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test("returns response on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, headers: new Map() });
    const res = await fetchWithRetry("https://api.test.com");
    expect(res.status).toBe(200);
  });

  test("propagates X-Request-ID from AsyncLocalStorage", async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, headers: new Map() });
    
    await requestContext.run({ requestId: "test-id-123" }, async () => {
      await fetchWithRetry("https://api.test.com");
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers.get("X-Request-ID")).toBe("test-id-123");
  });

  test("retries on 500 error", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValue({ status: 200, headers: new Map() });
    await fetchWithRetry("https://api.test.com", {}, { retries: 1, backoffMs: 10 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("throws after max retries", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
    await expect(fetchWithRetry("https://api.test.com", {}, { retries: 2, backoffMs: 10 })).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

describe("CircuitBreaker", () => {
  test("starts in CLOSED state", () => {
    const cb = new CircuitBreaker();
    expect(cb.state).toBe("CLOSED");
  });

  test("opens after threshold failures", async () => {
    const cb = new CircuitBreaker({ threshold: 2 });
    const fail = jest.fn().mockRejectedValue(new Error("fail"));
    await cb.call(fail).catch(() => {});
    await cb.call(fail).catch(() => {});
    expect(cb.state).toBe("OPEN");
  });

  test("throws when circuit is open", async () => {
    const cb = new CircuitBreaker({ threshold: 1, timeout: 60000 });
    await cb.call(jest.fn().mockRejectedValue(new Error())).catch(() => {});
    await expect(cb.call(jest.fn())).rejects.toThrow("Circuit breaker is OPEN");
  });

  test("tracks stats correctly", async () => {
    const cb = new CircuitBreaker();
    await cb.call(jest.fn().mockResolvedValue("ok"));
    expect(cb.stats.totalCalls).toBe(1);
    expect(cb.stats.totalSuccesses).toBe(1);
  });
});
