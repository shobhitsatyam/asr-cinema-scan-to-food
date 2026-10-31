const crypto = require('crypto');
const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');
const env = require('../config/env');

const inMemorySessions = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false;
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    const storedHashBuffer = Buffer.from(storedHash, 'hex');
    if (hashBuffer.length !== storedHashBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, storedHashBuffer);
  } catch (err) {
    return false;
  }
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Ensures an admin user exists when MongoDB is connected.
 * Existing admin accounts must never have their credentials overwritten.
 * Requires explicitly configured ADMIN_INITIAL_PASSWORD when no admin exists.
 */
async function ensureDefaultAdmin() {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    const count = await AdminUser.countDocuments();
    if (count === 0) {
      const defaultUsername = (process.env.ADMIN_INITIAL_USERNAME || 'admin').trim().toLowerCase();
      const defaultPassword = (process.env.ADMIN_INITIAL_PASSWORD || '').trim();

      if (!defaultPassword) {
        const errorMsg = 'Admin bootstrap aborted: No admin user exists in database and ADMIN_INITIAL_PASSWORD is not configured in environment variables.';
        console.error(`[AUTH] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const { hash, salt } = hashPassword(defaultPassword);

      const defaultAdmin = new AdminUser({
        username: defaultUsername,
        name: 'ASR Cinema Admin',
        passwordHash: hash,
        salt,
        role: 'superadmin',
        isActive: true,
      });
      await defaultAdmin.save();
      console.log(`[AUTH] Initialized default admin account: ${defaultUsername}`);
      return defaultAdmin;
    }
    return null;
  } catch (err) {
    console.error('[AUTH] Could not check/seed default admin:', err.message);
    throw err;
  }
}

/**
 * Authenticates admin credentials and creates an active session.
 */
async function authenticate(username, password, userAgent = '') {
  if (!username || !password) {
    return { success: false, message: 'Username and password are required.' };
  }

  const cleanUsername = String(username).trim().toLowerCase();
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // 1. Check MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      await ensureDefaultAdmin();
      const user = await AdminUser.findOne({ username: cleanUsername, isActive: true });

      if (user) {
        const isValid = verifyPassword(password, user.passwordHash, user.salt);
        if (!isValid) {
          return { success: false, message: 'Invalid credentials.' };
        }

        user.lastLogin = new Date();
        // Prune expired sessions and add new session
        const now = new Date();
        user.activeSessions = (user.activeSessions || [])
          .filter((s) => s.expiresAt && s.expiresAt > now)
          .slice(-10); // Keep last 10 active sessions max
        user.activeSessions.push({ token, expiresAt, createdAt: now, userAgent });

        await user.save();

        return {
          success: true,
          token,
          expiresAt,
          admin: {
            id: user._id.toString(),
            username: user.username,
            name: user.name,
            role: user.role,
          },
        };
      }
    } catch (dbErr) {
      console.error('[AUTH DB ERROR]:', dbErr.message);
      if (env.nodeEnv === 'production') {
        return { success: false, message: 'Authentication service temporarily unavailable.' };
      }
    }
  }

  // 2. Fallback for development / test or initial bootstrap
  const configuredKey = ((env && env.adminApiKey) || process.env.ADMIN_API_KEY || '').trim();
  const defaultUser = (process.env.ADMIN_INITIAL_USERNAME || 'admin').trim().toLowerCase();
  const defaultPass = (process.env.ADMIN_INITIAL_PASSWORD || configuredKey || '').trim();

  if (defaultPass && cleanUsername === defaultUser && (password === defaultPass || (configuredKey && password === configuredKey))) {
    inMemorySessions.set(token, {
      id: 'mem-admin-01',
      username: defaultUser,
      name: 'ASR Cinema Admin',
      role: 'superadmin',
      token,
      expiresAt,
    });

    return {
      success: true,
      token,
      expiresAt,
      admin: {
        id: 'mem-admin-01',
        username: defaultUser,
        name: 'ASR Cinema Admin',
        role: 'superadmin',
      },
    };
  }

  return { success: false, message: 'Invalid username or password.' };
}

/**
 * Validates a session token.
 */
async function validateSession(token) {
  if (!token) return null;
  const cleanToken = String(token).trim();

  if (mongoose.connection.readyState === 1) {
    try {
      const now = new Date();
      const user = await AdminUser.findOne({
        isActive: true,
        'activeSessions.token': cleanToken,
        'activeSessions.expiresAt': { $gt: now },
      }).lean();

      if (user) {
        return {
          id: user._id.toString(),
          username: user.username,
          name: user.name,
          role: user.role,
        };
      }
    } catch (err) {
      console.error('[AUTH SESSION VALIDATE ERROR]:', err.message);
    }
  }

  // Memory fallback
  const memSession = inMemorySessions.get(cleanToken);
  if (memSession && memSession.expiresAt > new Date()) {
    return {
      id: memSession.id,
      username: memSession.username,
      name: memSession.name,
      role: memSession.role,
    };
  }

  return null;
}

/**
 * Destroys a session token.
 */
async function destroySession(token) {
  if (!token) return true;
  const cleanToken = String(token).trim();

  if (mongoose.connection.readyState === 1) {
    try {
      await AdminUser.updateOne(
        { 'activeSessions.token': cleanToken },
        { $pull: { activeSessions: { token: cleanToken } } }
      );
    } catch (err) {
      console.error('[AUTH DESTROY SESSION ERROR]:', err.message);
    }
  }

  inMemorySessions.delete(cleanToken);
  return true;
}

function getInMemorySession(token) {
  if (!token) return null;
  const s = inMemorySessions.get(String(token).trim());
  if (s && s.expiresAt > new Date()) return s;
  return null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  ensureDefaultAdmin,
  authenticate,
  validateSession,
  destroySession,
  getInMemorySession,
};
