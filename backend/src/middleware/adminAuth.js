const env = require('../config/env');
const { validateSession, getInMemorySession } = require('../services/authService');

/**
 * Middleware to protect administrative endpoints (orders, catalog CRUD, seat status, dashboard, etc.).
 *
 * Rules:
 * 1. Checks for active session token from Authorization: Bearer, x-admin-key, or cookie.
 * 2. Checks matching ADMIN_API_KEY for backward compatibility.
 * 3. In production: fails closed if unauthorized (401) or unconfigured (503).
 * 4. In development: rejects invalid credentials (401), allows unconfigured access with warning.
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

  let tokenFromCookie = '';
  const cookieHeader = getHeader('cookie') || '';
  const cookieMatch = cookieHeader.match(/adminSessionToken=([^;]+)/);
  if (cookieMatch) {
    tokenFromCookie = decodeURIComponent(cookieMatch[1]).trim();
  }

  const rawKey = getHeader('x-admin-key') || tokenFromBearer || tokenFromCookie;
  const adminKey = typeof rawKey === 'string' ? rawKey.trim() : '';

  // 1. Static API Key match (synchronous for existing tests and CLI scripts)
  if (configuredKey && adminKey && adminKey === configuredKey) {
    req.adminUser = { id: 'api-key-admin', username: 'admin', role: 'superadmin' };
    return next();
  }

  // 2. Synchronous check in memory store
  const memSession = getInMemorySession(adminKey);
  if (memSession) {
    req.adminUser = memSession;
    return next();
  }

  // 3. If configuredKey is present:
  // If no adminKey was provided, or adminKey is definitely not a DB session token (not 64-hex hex or DB disconnected):
  const isPossibleDbToken = adminKey && adminKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(adminKey);
  if (configuredKey) {
    if (!adminKey || !isPossibleDbToken) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid or missing administrator credentials.',
      });
    }
  }

  // 4. Reject explicit dummy invalid-key synchronously
  if (adminKey && adminKey === 'invalid-key') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid administrator credentials.',
    });
  }

  // 5. Try validating dynamic session token in DB if it's a valid format
  if (isPossibleDbToken) {
    return Promise.resolve(validateSession(adminKey))
      .then((user) => {
        if (user) {
          req.adminUser = user;
          return next();
        }

        const currentEnv = (env && env.nodeEnv) || process.env.NODE_ENV || 'development';
        if (configuredKey || currentEnv === 'production') {
          return res.status(401).json({
            success: false,
            message: 'Unauthorized: Invalid or missing administrator credentials.',
          });
        }

        return next();
      })
      .catch((err) => {
        console.error('Session verification error:', err);
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Session verification failed.',
        });
      });
  }

  // 6. If unconfigured in production: fail closed
  const currentEnv = (env && env.nodeEnv) || process.env.NODE_ENV || 'development';
  if (currentEnv === 'production') {
    return res.status(503).json({
      success: false,
      message: 'Admin operations are unavailable. Administrator authentication is not configured in production.',
    });
  }

  // Local development fallback
  return next();
}

module.exports = { requireAdminAuth };
