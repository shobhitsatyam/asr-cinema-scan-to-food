const { categories, products } = require('./menuData');
const { generateSeatManifest } = require('./seatManifest');

const { seats: canonicalSeats } = generateSeatManifest();

const store = {
  auditoriums: [
    { _id: 'aud1', name: 'Audi 1', seatCount: 96, status: 'active' },
    { _id: 'aud2', name: 'Audi 2', seatCount: 32, status: 'active' },
    { _id: 'aud3', name: 'Audi 3', seatCount: 84, status: 'active' },
  ],
  categories: categories.map((category, index) => ({
    _id: `cat-${index + 1}`,
    ...category,
    isActive: true,
    sortOrder: index,
  })),
  products: products.map((product, index) => ({
    _id: `prod-${index + 1}`,
    id: product.slug || product.id || `prod-${index + 1}`,
    ...product,
    categoryId: `cat-${categories.findIndex((item) => item.name === product.category) + 1}`,
    stock: product.stock !== undefined ? product.stock : 100,
    isAvailable: true,
    inStock: true,
    variants: (product.variants || []).map((variant, variantIndex) => ({
      _id: `var-${index + 1}-${variantIndex + 1}`,
      ...variant,
    })),
    addOns: (product.addOns || []).map((addon, addOnIndex) => ({
      _id: `addon-${index + 1}-${addOnIndex + 1}`,
      ...addon,
    })),
    isActive: true,
    image: product.image || '',
  })),
  seats: canonicalSeats.map((seat) => ({
    _id: `seat-${seat.token}`,
    auditorium: seat.auditoriumId,
    auditoriumName: seat.auditoriumName,
    row: seat.row,
    number: seat.number,
    seatNumber: seat.seatNumber,
    seatLabel: seat.seatLabel,
    token: seat.token,
    section: seat.section,
    price: seat.price,
    status: seat.status,
    isDemo: false,
  })),
  orders: [],
};

module.exports = { store };
