const mongoose = require('mongoose');

const comboSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    items: { type: [String], default: [] },
    originalPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    image: { type: String, default: '' },
    isAvailable: { type: Boolean, default: true },
    description: { type: String, default: '' },
    badge: { type: String, default: 'Popular' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Combo', comboSchema);

