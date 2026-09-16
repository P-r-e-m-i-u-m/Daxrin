const request = require("supertest");
const express = require("express");
const healthRouter = require("../health");

jest.mock("../../config/db");
jest.mock("../../config/redis");
jest.mock("../../services/logger");

const db = require("../../config/db");
const redis = require("../../config/redis");

const app = express();
app.use("/", healthRouter);

describe("Health Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Invalidate the cache by manually advancing time or forcing a long delay,
    // but easier is to just clear the cache if we could. Since we can't export it easily,
    // we use jest fake timers to advance past the 10s TTL.
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("GET /health", () => {
    test("returns 200 and healthy status without checking downstream", async () => {
      // Ensure we don't mock them to succeed, they shouldn't even be called
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.uptime).toBeDefined();
      expect(res.body.version).toBeDefined();
      expect(db.raw).not.toHaveBeenCalled();
      expect(redis.ping).not.toHaveBeenCalled();
    });
  });

  describe("GET /live", () => {
    test("returns alive status with uptime", async () => {
      const res = await request(app).get("/live");
      expect(res.status).toBe(200);
      expect(res.body.alive).toBe(true);
      expect(res.body.uptime).toBeDefined();
    });
  });

  describe("GET /ready", () => {
    test("returns 200 and healthy status when all deps up", async () => {
      jest.setSystemTime(10000000000); // clear cache TTL
      db.raw.mockResolvedValue([{ health_check: 1 }]);
      redis.ping.mockResolvedValue("PONG");
      redis.info.mockResolvedValue("used_memory_human:10.5M");
      
      const res = await request(app).get("/ready");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.ready).toBe(true);
      expect(res.body.dependencies.database.status).toBe("healthy");
      expect(res.body.dependencies.cache.status).toBe("healthy");
      expect(db.raw).toHaveBeenCalledTimes(1);
    });

    test("returns 503 when DB is down", async () => {
      jest.setSystemTime(20000000000); // clear cache TTL
      db.raw.mockRejectedValue(new Error("Connection refused"));
      redis.ping.mockResolvedValue("PONG");
      redis.info.mockResolvedValue("");
      
      const res = await request(app).get("/ready");
      expect(res.status).toBe(503);
      expect(res.body.status).toBe("degraded");
      expect(res.body.ready).toBe(false);
      expect(res.body.dependencies.database.status).toBe("unhealthy");
    });

    test("caches deep check results to prevent downstream load", async () => {
      jest.setSystemTime(30000000000); // clear cache TTL
      db.raw.mockResolvedValue([{ health_check: 1 }]);
      redis.ping.mockResolvedValue("PONG");
      redis.info.mockResolvedValue("");
      
      // First request (hits DB)
      await request(app).get("/ready");
      expect(db.raw).toHaveBeenCalledTimes(1);

      // Advance time by 5 seconds (within TTL)
      jest.advanceTimersByTime(5000);
      
      // Second request (hits cache)
      const res2 = await request(app).get("/ready");
      expect(res2.status).toBe(200);
      expect(db.raw).toHaveBeenCalledTimes(1); // STILL 1!

      // Advance time by 6 more seconds (past TTL)
      jest.advanceTimersByTime(6000);

      // Third request (hits DB again)
      await request(app).get("/ready");
      expect(db.raw).toHaveBeenCalledTimes(2); // NOW 2!
    });
  });
});
