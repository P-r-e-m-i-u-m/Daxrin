const redis = require("../config/redis");
const logger = require("../services/logger");
const crypto = require("crypto");

class QueueProcessor {
  constructor(queueName, maxRetries = 3) {
    this.queueName = queueName;
    this.maxRetries = maxRetries;
    this.stats = {
      processed: 0,
      retried: 0,
      failed: 0
    };
  }

  async enqueue(job, priority = 0) {
    const payload = JSON.stringify(job);
    await redis.zadd(this.queueName, priority, payload);
  }

  async _execute(job, handler) {
    try {
      await handler(job);
      this.stats.processed++;
    } catch (err) {
      job.retries = (job.retries || 0) + 1;
      
      if (job.retries > this.maxRetries) {
        this.stats.failed++;
        await this._moveToDLQ(job, err);
      } else {
        this.stats.retried++;
        const backoffDelay = Math.pow(2, job.retries) * 1000;
        this._scheduleRetry(job, backoffDelay);
      }
    }
  }

  _scheduleRetry(job, delay) {
    const timer = setTimeout(() => {
      this.enqueue(job, 0).catch((err) => {
        if (logger && logger.error) logger.error("Retry enqueue failed", err);
      });
    }, delay);
    // Use unref if possible to avoid blocking the event loop in tests/shutdown
    if (timer.unref) {
      timer.unref();
    }
  }

  async _moveToDLQ(job, err) {
    const dlqPayload = {
      jobType: job.type,
      errorSummary: err.message,
      lastAttemptTime: new Date().toISOString(),
      payloadHash: this._hashPayload(job),
      payload: this._scrubSensitiveFields(job)
    };
    
    await redis.lpush(`${this.queueName}:dlq`, JSON.stringify(dlqPayload));
  }

  _hashPayload(job) {
    return crypto.createHash('sha256').update(JSON.stringify(job)).digest('hex');
  }

  _scrubSensitiveFields(job) {
    const scrubbed = JSON.parse(JSON.stringify(job)); // deep clone
    
    const scrubRecursive = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object') {
          scrubRecursive(obj[key]);
        } else if (typeof obj[key] === 'string') {
          const lower = key.toLowerCase();
          if (lower.includes('password') || lower.includes('token') || lower.includes('secret') || lower.includes('key')) {
            obj[key] = '[REDACTED]';
          }
        }
      }
    };
    
    scrubRecursive(scrubbed);
    return scrubbed;
  }

  async getStats() {
    const pending = await redis.zcard(this.queueName);
    const dead = await redis.llen(`${this.queueName}:dlq`);
    return { pending, dead };
  }
}

module.exports = QueueProcessor;
