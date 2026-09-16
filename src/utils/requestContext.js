const { AsyncLocalStorage } = require("async_hooks");

const requestContext = new AsyncLocalStorage();

module.exports = { requestContext };
