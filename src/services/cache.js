const redis = require("../config/redis");

const withCache = (fn, ttl = 300) => async (...args) => {
  const key = "cache:" + fn.name + ":" + JSON.stringify(args);
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  const result = await fn(...args);
  await redis.setex(key, ttl, JSON.stringify(result));
  return result;
};

module.exports = { withCache };
// updated: 2026-09-26 build: 1790429378
