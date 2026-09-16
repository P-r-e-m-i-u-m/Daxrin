/**
 * @file paginate.js
 * @description Cursor-based and offset pagination utilities
 * @updated 2026-05-03
 */
const logger = require("../services/logger");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const clampLimit = (limit) => {
  const parsed = parseInt(limit, 10);
  return Math.min(Math.max(Number.isNaN(parsed) ? DEFAULT_LIMIT : parsed, 1), MAX_LIMIT);
};

/**
 * Cursor-based pagination — O(1) performance regardless of offset.
 * Semantics:
 * - Stable ordering under concurrent writes (no skipped or duplicated records).
 * - Cursor represents an absolute boundary in the ordered dataset.
 * Use for large datasets where offset pagination degrades.
 */
const paginate = async (model, options = {}) => {
  const { cursor, limit: rawLimit, orderBy = "id", direction = "DESC", where = {}, include } = options;
  const limit = clampLimit(rawLimit);
  const take = limit + 1;
  const query = { take, where, orderBy: { [orderBy]: direction } };
  if (include) query.include = include;
  if (cursor) { query.cursor = { [orderBy]: cursor }; query.skip = 1; }
  const timer = logger.time("paginate:" + model.name);
  const items = await model.findMany(query);
  const hasMore = items.length > limit;
  const data = items.slice(0, limit);
  timer.end({ count: data.length, hasMore });
  return {
    data,
    meta: {
      hasMore,
      count: data.length,
      nextCursor: hasMore ? String(data[data.length - 1][orderBy]) : null,
      prevCursor: cursor ? String(data[0]?.[orderBy]) : null
    }
  };
};

/**
 * Offset-based pagination — use only for small datasets or when cursor not feasible
 */
const paginateOffset = async (model, options = {}) => {
  const { page = 1, limit: rawLimit, where = {}, orderBy = { id: "DESC" }, include } = options;
  const limit = clampLimit(rawLimit);
  const offset = (Math.max(1, page) - 1) * limit;
  const [data, total] = await Promise.all([
    model.findMany({ skip: offset, take: limit, where, orderBy, ...(include && { include }) }),
    model.count({ where })
  ]);
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: { total, totalPages, currentPage: page, limit, hasNext: page < totalPages, hasPrev: page > 1 }
  };
};

const encodeCursor = (item) => {
  return Buffer.from(JSON.stringify({
    id: item.id,
    createdAt: item.created_at
  })).toString("base64");
};

const decodeCursor = (cursor) => {
  return JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
};

const parseCursorFromRequest = (req) => ({
  cursor: req.query.cursor || null,
  limit: clampLimit(req.query.limit),
  direction: ["ASC", "DESC"].includes(req.query.direction) ? req.query.direction : "DESC"
});

module.exports = { paginate, paginateOffset, parseCursorFromRequest, clampLimit, encodeCursor, decodeCursor };
