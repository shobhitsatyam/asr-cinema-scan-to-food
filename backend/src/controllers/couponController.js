const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const { store } = require('../data/memoryStore');

if (!store.coupons) store.coupons = [];

const getCoupons = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
      return res.json({ success: true, count: coupons.length, coupons: coupons || [] });
    }
    return res.json({ success: true, count: store.coupons.length, coupons: store.coupons });
  } catch (err) {
    console.error('Error fetching coupons:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve coupons.', coupons: [] });
  }
};

const createCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, minOrder, maxDiscount, usageLimit, expiry, description, status } = req.body;
    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Coupon code is required.' });
    }
    const cleanCode = code.trim().toUpperCase();

    const couponData = {
      code: cleanCode,
      discountType: discountType === 'fixed' ? 'fixed' : 'percentage',
      discountValue: Number(discountValue) || 0,
      minOrder: Number(minOrder) || 0,
      maxDiscount: Number(maxDiscount) || 0,
      usageLimit: Number(usageLimit) || 100,
      usedCount: 0,
      expiry: expiry || '',
      description: description || '',
      status: status || 'Active',
    };

    if (mongoose.connection.readyState === 1) {
      const existing = await Coupon.findOne({ code: cleanCode });
      if (existing) {
        return res.status(400).json({ success: false, message: `Coupon '${cleanCode}' already exists.` });
      }
      const coupon = new Coupon(couponData);
      const saved = await coupon.save();
      return res.status(201).json({ success: true, coupon: saved.toObject() });
    }

    store.coupons.unshift({ id: `coupon-${Date.now()}`, ...couponData });
    return res.status(201).json({ success: true, coupon: couponData });
  } catch (err) {
    console.error('Error creating coupon:', err);
    return res.status(500).json({ success: false, message: 'Failed to create coupon.' });
  }
};

const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).trim();

    const query = mongoose.isValidObjectId(cleanId) ? { _id: cleanId } : { code: cleanId.toUpperCase() };

    if (mongoose.connection.readyState === 1) {
      const updated = await Coupon.findOneAndUpdate(query, { $set: req.body }, { new: true });
      if (!updated) return res.status(404).json({ success: false, message: 'Coupon not found.' });
      return res.json({ success: true, coupon: updated.toObject() });
    }

    const idx = store.coupons.findIndex(c => c.id === cleanId || c.code === cleanId.toUpperCase());
    if (idx < 0) return res.status(404).json({ success: false, message: 'Coupon not found.' });
    store.coupons[idx] = { ...store.coupons[idx], ...req.body };
    return res.json({ success: true, coupon: store.coupons[idx] });
  } catch (err) {
    console.error('Error updating coupon:', err);
    return res.status(500).json({ success: false, message: 'Failed to update coupon.' });
  }
};

const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).trim();
    const query = mongoose.isValidObjectId(cleanId) ? { _id: cleanId } : { code: cleanId.toUpperCase() };

    if (mongoose.connection.readyState === 1) {
      const coupon = await Coupon.findOne(query);
      if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found.' });
      coupon.status = coupon.status === 'Active' ? 'Inactive' : 'Active';
      await coupon.save();
      return res.json({ success: true, coupon: coupon.toObject() });
    }

    const item = store.coupons.find(c => c.id === cleanId || c.code === cleanId.toUpperCase());
    if (!item) return res.status(404).json({ success: false, message: 'Coupon not found.' });
    item.status = item.status === 'Active' ? 'Inactive' : 'Active';
    return res.json({ success: true, coupon: item });
  } catch (err) {
    console.error('Error toggling coupon status:', err);
    return res.status(500).json({ success: false, message: 'Failed to toggle coupon status.' });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).trim();
    const query = mongoose.isValidObjectId(cleanId) ? { _id: cleanId } : { code: cleanId.toUpperCase() };

    if (mongoose.connection.readyState === 1) {
      const deleted = await Coupon.findOneAndDelete(query);
      if (!deleted) return res.status(404).json({ success: false, message: 'Coupon not found.' });
      return res.json({ success: true, message: 'Coupon removed.' });
    }

    store.coupons = store.coupons.filter(c => c.id !== cleanId && c.code !== cleanId.toUpperCase());
    return res.json({ success: true, message: 'Coupon removed.' });
  } catch (err) {
    console.error('Error deleting coupon:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete coupon.' });
  }
};

const validateCoupon = async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code is required.' });
    const cleanCode = String(code).trim().toUpperCase();
    const orderSubtotal = Number(subtotal) || 0;

    let coupon = null;
    if (mongoose.connection.readyState === 1) {
      coupon = await Coupon.findOne({ code: cleanCode, status: 'Active' }).lean();
    } else {
      coupon = store.coupons.find(c => c.code === cleanCode && c.status === 'Active');
    }

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or inactive coupon code.' });
    }

    if (coupon.minOrder && orderSubtotal < coupon.minOrder) {
      return res.status(400).json({
        success: false,
        message: `Order subtotal must be at least ₹${coupon.minOrder} to apply ${coupon.code}.`,
      });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit has been reached.' });
    }

    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = Math.round((orderSubtotal * coupon.discountValue) / 100);
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = coupon.discountValue;
    }

    if (discount > orderSubtotal) {
      discount = orderSubtotal;
    }

    return res.json({
      success: true,
      valid: true,
      code: coupon.code,
      discount,
      message: `Coupon applied: ₹${discount} discount`,
    });
  } catch (err) {
    console.error('Error validating coupon:', err);
    return res.status(500).json({ success: false, message: 'Failed to validate coupon.' });
  }
};

module.exports = {
  getCoupons,
  createCoupon,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  validateCoupon,
};

