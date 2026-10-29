const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    size: { type: String, trim: true, default: '' },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const addOnSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    categoryId: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['Veg', 'Non-Veg'],
      default: 'Veg',
    },
    isVeg: {
      type: Boolean,
      default: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    basePrice: {
      type: Number,
      min: 0,
      default: function () {
        return this.price;
      },
    },
    originalPrice: {
      type: Number,
      min: 0,
    },
    description: {
      type: String,
      default: '',
    },
    shortDescription: {
      type: String,
      default: '',
    },
    image: {
      type: String,
      default: '',
    },
    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },
    inStock: {
      type: Boolean,
      default: true,
    },
    stock: {
      type: Number,
      default: 100,
    },
    prepTime: {
      type: String,
      default: '10 mins',
    },
    aliases: {
      type: [String],
      default: [],
      index: true,
    },
    variants: {
      type: [variantSchema],
      default: [],
    },
    addOns: {
      type: [addOnSchema],
      default: [],
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to ensure basePrice matches price if not explicitly set
productSchema.pre('save', function () {
  if (this.basePrice === undefined || this.basePrice === null) {
    this.basePrice = this.price;
  }
  if (!this.slug) {
    this.slug = this.id;
  }
  if (this.isVeg === undefined) {
    this.isVeg = this.type === 'Veg';
  }
});

module.exports = mongoose.model('Product', productSchema);
