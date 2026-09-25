# Module Dependency Graph
**Generated:** 2026-09-25
**Version:** 2026.09.25

## System Overview

```
                    +------------------------------------------+
                    |              Express App                 |
                    |         (src/index.js)                   |
                    +------------------+-----------------------+
                                       |
              +------------------------+------------------------+
              |                        |                        |
              v                        v                        v
    +------------------+    +------------------+    +------------------+
    |   Middleware     |    |     Routes       |    |    Services      |
    | auth.js          |    | health.js        |    | logger.js        |
    | rateLimiter.js   |    | users.js         |    | connManager.js   |
    | security.js      |    | orders.js        |    +------------------+
    | requestId.js     |    +------------------+
    | errorHandler.js  |
    +------------------+
              |                        |                        |
              +------------------------+------------------------+
                                       |
              +------------------------+------------------------+
              |                        |                        |
              v                        v                        v
    +------------------+    +------------------+    +------------------+
    |     Utils        |    |     Cache        |    |     Queue        |
    | fetchWithRetry   |    | cacheManager.js  |    | processor.js     |
    | paginate.js      |    | withCache HOF    |    | DLQ support      |
    | sanitize.js      |    +--------+---------+    +--------+---------+
    +------------------+             |                        |
                                     +------------------------+
                                                |
              +------------------------+--------+
              |                        |
              v                        v
    +------------------+    +------------------+
    |   config/        |    |   Database       |
    | redis.js         |    | connection.js    |
    | cors.js          |    | migrations/      |
    | db.js            |    | queries/         |
    +------------------+    +------------------+
              |                        |
              v                        v
    +------------------+    +------------------+
    |     Redis        |    |   PostgreSQL     |
    |   (External)     |    |   (External)     |
    +------------------+    +------------------+
```

## Module Dependency Matrix

| Module | Depends On | Used By |
|-|-|-|
| auth.js | redis, logger, jwt | requireAuth middleware, all routes |
| rateLimiter.js | redis, logger | all public routes |
| security.js | none | Express app |
| requestId.js | logger | Express app, all routes |
| errorHandler.js | logger | Express app |
| cacheManager.js | redis, logger | auth.js, user routes |
| processor.js | redis, logger | background workers |
| health.js | db, redis, logger | load balancer |
| paginate.js | logger | all list routes |
| sanitize.js | logger | all write routes |
| fetchWithRetry.js | logger | external API calls |
| logger.js | fs, path | everything |

## Circular Dependency Check

```
No circular dependencies detected
All modules follow single-direction dependency flow
External dependencies (Redis, PostgreSQL) only at config layer
```

## Dependency Health

| Dependency | Version | Vulnerabilities | Status |
|-|-|-|-|
| express | 4.19.2 | 0 | Current |
| jsonwebtoken | 9.0.0 | 0 | Current |
| redis | 4.6.14 | 0 | Current |
| axios | 1.7.2 | 0 | Current |
| dotenv | 16.4.5 | 0 | Current |
| date-fns | 3.6.0 | 0 | Current |

**Last dependency audit:** 2026-09-25
**Total vulnerabilities:** 0
<!-- generated: 1790358287 -->
