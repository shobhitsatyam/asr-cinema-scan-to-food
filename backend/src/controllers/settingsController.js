const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const { store } = require('../data/memoryStore');

const defaultSettings = {
  general: {
    cinemaName: 'ASR Cinemas',
    tagline: 'Premium Silver Screen Dining Experience',
    address: 'Connaught Place, Central Delhi',
    city: 'New Delhi',
    phone: '+91 98765 43210',
    supportEmail: 'concierge@asrcinemas.com',
    openingTime: '09:00',
    closingTime: '01:30',
  },
  orders: {
    autoAcceptOrders: false,
    cutoffMinutesBeforeShowEnd: 20,
    maxOrderItems: 15,
    minOrderAmount: 100,
    prepTimeBufferMinutes: 5,
    allowCancellation: true,
    cancellationGracePeriodSec: 120,
  },
  payment: {
    enableUPI: true,
    enableCards: true,
    enableCash: false,
    gstRate: 5,
    gstNumber: '07AAAAA0000A1Z5',
    serviceChargeEnabled: false,
    serviceChargeRate: 0,
  },
  notifications: {
    soundEnabled: true,
    soundVolume: 80,
    repeatIntervalSec: 10,
    smsAlertsEnabled: true,
  },
  profile: {
    adminName: 'ASR Cinema Operations',
    adminEmail: 'ops@asrcinemas.com',
    roleTitle: 'Theatre General Manager',
  },
};

if (!store.settings) {
  store.settings = { ...defaultSettings };
}

const getSettings = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      let doc = await Settings.findOne({ key: 'cinema_settings' }).lean();
      if (!doc) {
        doc = await Settings.create({ key: 'cinema_settings', ...defaultSettings });
      }
      return res.json({ success: true, settings: doc });
    }
    return res.json({ success: true, settings: store.settings });
  } catch (err) {
    console.error('Error fetching settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve settings.', settings: store.settings });
  }
};

const updateSettings = async (req, res) => {
  try {
    const updateData = req.body;
    if (mongoose.connection.readyState === 1) {
      const doc = await Settings.findOneAndUpdate(
        { key: 'cinema_settings' },
        { $set: updateData },
        { new: true, upsert: true }
      ).lean();
      return res.json({ success: true, message: 'Settings saved successfully.', settings: doc });
    }

    store.settings = {
      ...store.settings,
      ...updateData,
      general: { ...store.settings.general, ...(updateData.general || {}) },
      orders: { ...store.settings.orders, ...(updateData.orders || {}) },
      payment: { ...store.settings.payment, ...(updateData.payment || {}) },
      notifications: { ...store.settings.notifications, ...(updateData.notifications || {}) },
      profile: { ...store.settings.profile, ...(updateData.profile || {}) },
    };

    return res.json({ success: true, message: 'Settings saved successfully.', settings: store.settings });
  } catch (err) {
    console.error('Error updating settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};

