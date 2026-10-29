const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema(
  {
    auditorium: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auditorium',
      required: false,
    },
    auditoriumId: {
      type: String,
      trim: true,
      default: '',
    },
    auditoriumName: {
      type: String,
      required: true,
      trim: true,
    },
    row: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    number: {
      type: Number,
      default: 0,
    },
    seatNumber: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      trim: true,
      default: 'Standard',
    },
    price: {
      type: Number,
      default: 250,
      min: 0,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

seatSchema.index({ auditoriumName: 1, seatNumber: 1 }, { unique: true });
seatSchema.index({ status: 1 });

module.exports = mongoose.model('Seat', seatSchema);
