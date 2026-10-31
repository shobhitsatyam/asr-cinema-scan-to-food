const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'cinema_settings' },
    general: {
      cinemaName: { type: String, default: 'ASR Cinemas' },
      tagline: { type: String, default: 'Premium Silver Screen Dining Experience' },
      address: { type: String, default: 'Connaught Place, Central Delhi' },
      city: { type: String, default: 'New Delhi' },
      phone: { type: String, default: '+91 98765 43210' },
      supportEmail: { type: String, default: 'concierge@asrcinemas.com' },
      openingTime: { type: String, default: '09:00' },
      closingTime: { type: String, default: '01:30' },
    },
    orders: {
      autoAcceptOrders: { type: Boolean, default: false },
      cutoffMinutesBeforeShowEnd: { type: Number, default: 20 },
      maxOrderItems: { type: Number, default: 15 },
      minOrderAmount: { type: Number, default: 100 },
      prepTimeBufferMinutes: { type: Number, default: 5 },
      allowCancellation: { type: Boolean, default: true },
      cancellationGracePeriodSec: { type: Number, default: 120 },
    },
    payment: {
      enableUPI: { type: Boolean, default: true },
      enableCards: { type: Boolean, default: true },
      enableCash: { type: Boolean, default: false },
      gstRate: { type: Number, default: 5 },
      gstNumber: { type: String, default: '07AAAAA0000A1Z5' },
      serviceChargeEnabled: { type: Boolean, default: false },
      serviceChargeRate: { type: Number, default: 0 },
    },
    notifications: {
      soundEnabled: { type: Boolean, default: true },
      soundVolume: { type: Number, default: 80 },
      repeatIntervalSec: { type: Number, default: 10 },
      smsAlertsEnabled: { type: Boolean, default: true },
    },
    profile: {
      adminName: { type: String, default: 'ASR Cinema Operations' },
      adminEmail: { type: String, default: 'ops@asrcinemas.com' },
      roleTitle: { type: String, default: 'Theatre General Manager' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);

