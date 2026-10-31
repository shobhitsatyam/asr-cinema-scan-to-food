const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // Auto-cleans expired sessions
    createdAt: { type: Date, default: Date.now },
    userAgent: { type: String, default: '' },
  },
  { _id: false }
);

const adminUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      default: 'Cinema Administrator',
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    salt: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'kitchen'],
      default: 'admin',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    activeSessions: {
      type: [sessionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminUser', adminUserSchema);

