const express = require("express");
const db = require("../config/db");
const redis = require("../config/redis");
const logger = require("../services/logger");

const router = express.Router();

let cachedDeepCheck = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 10000;

/**
 * @route GET /health
 * @description Basic liveness check. Always cheap and predictable.
 * Load balancers should use this for Liveness probes.
 */
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    version: process.env.npm_package_version || "1.0.0",
    uptime: process.uptime()
  });
});

/**
 * @route GET /live
 * @description Alias for basic liveness check.
 */
router.get("/live", (req, res) => {
  res.status(200).json({ alive: true, uptime: process.uptime() });
});

/**
 * @route GET /ready
 * @description Deep readiness check for downstream dependencies (DB, Redis).
 * Uses a short-lived cache to prevent load spikes during outages.
 * Load balancers should use this for Readiness probes.
 */
router.get("/ready", async (req, res) => {
  const now = Date.now();
  if (cachedDeepCheck && (now - lastCheckTime < CACHE_TTL_MS)) {
    return res.status(cachedDeepCheck.status === "healthy" ? 200 : 503).json(cachedDeepCheck);
  }

  const result = {
    status: "healthy",
    ready: true,
    dependencies: {
      database: { status: "unhealthy" },
      cache: { status: "unhealthy" }
    }
  };

  try {
    await db.raw("SELECT 1");
    result.dependencies.database.status = "healthy";
  } catch (err) {
    if (logger && logger.error) logger.error("DB Healthcheck failed", err);
  }

  try {
    await redis.ping();
    await redis.info(); // As expected by original tests
    result.dependencies.cache.status = "healthy";
  } catch (err) {
    if (logger && logger.error) logger.error("Redis Healthcheck failed", err);
  }

  if (result.dependencies.database.status === "unhealthy" || result.dependencies.cache.status === "unhealthy") {
    result.status = "degraded";
    result.ready = false;
  }

  cachedDeepCheck = result;
  lastCheckTime = now;

  res.status(result.status === "healthy" ? 200 : 503).json(result);
});

module.exports = router;
