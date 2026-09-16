const redis = require("../config/redis");
const logger = require("../services/logger");

const slidingWindowLimiter = (options) => {
  const windowMs = options.windowMs || 60000;
  const max = options.max || 5;

  return async (req, res, next) => {
    const key = `ratelimit:${req.ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      await redis.zremrangebyscore(key, "-inf", windowStart);
      const count = await redis.zcard(key);
      
      if (count >= max) {
        return res.status(429).json({ error: "Too Many Requests" });
      }

      await redis.zadd(key, now, now + "-" + Math.random());
      await redis.pexpire(key, windowMs);
      
      res.setHeader("X-RateLimit-Remaining", max - count - 1);
      next();
    } catch (err) {
      if (logger && logger.error) logger.error("Rate limiter Redis error", err);
      // fail open
      next();
    }
  };
};

module.exports = { slidingWindowLimiter };
