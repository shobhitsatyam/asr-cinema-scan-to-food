const { authenticate, validateSession, destroySession } = require('../services/authService');
const env = require('../config/env');

const extractToken = (req) => {
  const authHeader = req.get('authorization') || (req.headers && req.headers.authorization) || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const rawKey = req.get('x-admin-key') || (req.headers && req.headers['x-admin-key']) || '';
  if (rawKey) {
    return rawKey.trim();
  }
  // Also check cookie if cookie-parser or raw cookie header present
  const cookieHeader = req.get('cookie') || (req.headers && req.headers.cookie) || '';
  const match = cookieHeader.match(/adminSessionToken=([^;]+)/);
  if (match) {
    return decodeURIComponent(match[1]).trim();
  }
  return '';
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const userAgent = req.get('user-agent') || '';

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.',
      });
    }

    const result = await authenticate(username, password, userAgent);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        message: result.message || 'Invalid credentials.',
      });
    }

    // Set secure cookie
    const isProd = env.nodeEnv === 'production';
    res.cookie('adminSessionToken', result.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      token: result.token,
      expiresAt: result.expiresAt,
      admin: result.admin,
    });
  } catch (error) {
    console.error('[AUTH LOGIN ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed due to server error.',
    });
  }
};

const getMe = async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No active session token provided.',
      });
    }

    const admin = await validateSession(token);
    if (!admin) {
      // Check if it's the static ADMIN_API_KEY
      const configuredKey = ((env && env.adminApiKey) || process.env.ADMIN_API_KEY || '').trim();
      if (configuredKey && token === configuredKey) {
        return res.json({
          success: true,
          admin: {
            id: 'api-key-admin',
            username: 'admin',
            name: 'ASR Cinema Admin',
            role: 'superadmin',
          },
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Session has expired or is invalid. Please log in again.',
      });
    }

    return res.json({
      success: true,
      admin,
    });
  } catch (error) {
    console.error('[AUTH GETME ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify session.',
    });
  }
};

const logout = async (req, res) => {
  try {
    const token = extractToken(req);
    if (token) {
      await destroySession(token);
    }

    const isProd = env.nodeEnv === 'production';
    res.clearCookie('adminSessionToken', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    });

    return res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('[AUTH LOGOUT ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Logout encountered an error.',
    });
  }
};

module.exports = {
  login,
  getMe,
  logout,
  extractToken,
};

