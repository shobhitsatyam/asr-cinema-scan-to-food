const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['Veg', 'Non-Veg'], default: 'Veg' },
  },
  { _id: false }
);

const orderTimelineSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'],
      required: true,
    },
    time: { type: String, default: '' },
    note: { type: String, default: '' },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Cinema Guest' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    auditorium: {
      type: String,
      required: true,
      trim: true,
      default: 'Audi 2',
    },
    seat: {
      type: String,
      required: true,
      trim: true,
      default: 'B16',
    },
    customer: {
      type: customerSchema,
      default: () => ({ name: 'Cinema Guest', phone: '', email: '' }),
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [array => Array.isArray(array) && array.length > 0, 'Order must contain at least one item.'],
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    taxes: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Pending', 'Failed', 'Refunded'],
      default: 'Paid',
    },
    paymentMethod: {
      type: String,
      default: 'UPI',
    },
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    time: {
      type: String,
      required: true,
    },
    timeline: {
      type: [orderTimelineSchema],
      default: [],
    },
    specialInstructions: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
