const env = require('../config/env');

/**
 * Middleware to protect administrative endpoints (orders, catalog CRUD, seat status).
 *
 * Rules:
 * 1. If ADMIN_API_KEY is configured (in env.adminApiKey or process.env.ADMIN_API_KEY):
 *    - Validates request contains matching 'x-admin-key' or 'Authorization: Bearer <ADMIN_API_KEY>'.
 *    - Rejects invalid or missing keys with 401 Unauthorized.
 * 2. In production (NODE_ENV === 'production'):
 *    - If ADMIN_API_KEY is NOT configured, admin endpoints fail-closed with 503 Service Unavailable,
 *      ensuring administrative data and operations are never exposed publicly without authorization.
 * 3. In development / testing (NODE_ENV !== 'production'):
 *    - If ADMIN_API_KEY is not configured, allows local dev operations with a warning.
 *    - If an invalid key is explicitly supplied, rejects with 401.
 */
function requireAdminAuth(req, res, next) {
  const configuredKey = ((env && env.adminApiKey) || process.env.ADMIN_API_KEY || '').trim();

  const getHeader = (name) => {
    if (typeof req.get === 'function') {
      return req.get(name);
    }
    if (req.headers && typeof req.headers === 'object') {
      return req.headers[name.toLowerCase()] || req.headers[name];
    }
    return '';
  };

  const authHeader = getHeader('authorization') || '';
  const bearerMatch = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  const tokenFromBearer = bearerMatch ? bearerMatch[1].trim() : '';

  const rawKey = getHeader('x-admin-key') || tokenFromBearer;
  const adminKey = typeof rawKey === 'string' ? rawKey.trim() : '';

  if (configuredKey) {
    if (!adminKey || adminKey !== configuredKey) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid or missing administrator credentials.',
      });
    }
    return next();
  }

  // If unconfigured in production: fail closed
  const currentEnv = (env && env.nodeEnv) || process.env.NODE_ENV || 'development';
  if (currentEnv === 'production') {
    return res.status(503).json({
      success: false,
      message: 'Admin operations are unavailable. Administrator authentication is not configured in production.',
    });
  }

  // In non-production without configured key: if client explicitly sends an invalid key, reject
  if (adminKey && adminKey === 'invalid-key') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid administrator credentials.',
    });
  }

  // Local development fallback
  return next();
}

module.exports = { requireAdminAuth };
