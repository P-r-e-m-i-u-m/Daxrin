const request = require("supertest");
const express = require("express");

// Setup an in-memory mock for Redis for the integration test
const mockRedisStore = new Map();

jest.mock("../../config/redis", () => ({
  zremrangebyscore: jest.fn(async (key, min, max) => {
    if (!mockRedisStore.has(key)) return 0;
    const items = mockRedisStore.get(key);
    const initialLen = items.length;
    mockRedisStore.set(key, items.filter(i => i.score > max));
    return initialLen - mockRedisStore.get(key).length;
  }),
  zcard: jest.fn(async (key) => {
    return mockRedisStore.has(key) ? mockRedisStore.get(key).length : 0;
  }),
  zadd: jest.fn(async (key, score, member) => {
    if (!mockRedisStore.has(key)) mockRedisStore.set(key, []);
    mockRedisStore.get(key).push({ score, member });
    return 1;
  }),
  pexpire: jest.fn(async () => 1)
}));

jest.mock("../../services/logger");

const { slidingWindowLimiter } = require("../rateLimiter");

describe("Auth Rate Limiter Integration", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisStore.clear();
    jest.useFakeTimers();
    jest.setSystemTime(10000000000);

    app = express();
    // Mount the limiter with a deterministic max of 5
    app.post("/api/auth/login", slidingWindowLimiter({ max: 5, windowMs: 60000 }), (req, res) => {
      res.status(200).json({ success: true });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("allows requests up to the limit, blocks exceeding requests, and resets after window", async () => {
    // 1. Allowed path: Fire 5 requests, they should all be 200 OK
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/auth/login").send();
      expect(res.status).toBe(200);
      expect(res.header["x-ratelimit-remaining"]).toBe(String(4 - i));
    }

    // 2. Blocked path: 6th request should fail with 429
    const blockedRes = await request(app).post("/api/auth/login").send();
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toBe("Too Many Requests");

    // 3. Fast-forward time halfway, still blocked
    jest.advanceTimersByTime(30000);
    const stillBlockedRes = await request(app).post("/api/auth/login").send();
    expect(stillBlockedRes.status).toBe(429);

    // 4. Fast-forward past the window (another 31 seconds)
    jest.advanceTimersByTime(31000);

    // 5. Window resets: should be allowed again
    const resetRes = await request(app).post("/api/auth/login").send();
    expect(resetRes.status).toBe(200);
  });
});
