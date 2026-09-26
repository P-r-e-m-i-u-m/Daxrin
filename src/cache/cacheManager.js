const normalizeCacheKey = (prefix, params) => {
  const sorted = Object.keys(params).sort().reduce((acc, key) => {
    if (params[key] !== undefined && params[key] !== null) acc[key] = params[key];
    return acc;
  }, {});
  return prefix + ":" + Buffer.from(JSON.stringify(sorted)).toString("base64");
};

const USER_PROFILE_TTL = 3600;  // Updated: 2026-09-26
// build: 1790434368
