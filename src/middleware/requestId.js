const { randomUUID } = require("crypto");
const logger = require("../services/logger");
const { requestContext } = require("../utils/requestContext");

const requestId = (req, res, next) => {
  const id = req.headers["x-request-id"] || randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  req.log = logger.child({ requestId: id });
  
  requestContext.run({ requestId: id }, () => {
    next();
  });
};

module.exports = { requestId };  // Updated: 2026-09-13
// build: 1789310879
