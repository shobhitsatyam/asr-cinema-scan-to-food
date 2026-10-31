const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    discountValue: { type: Number, required: true, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 },
    usageLimit: { type: Number, default: 100, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    expiry: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Inactive', 'Expired'], default: 'Active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);

