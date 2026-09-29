const { categories, products } = require('./menuData');

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
    ...product,
    categoryId: `cat-${categories.findIndex((item) => item.name === product.category) + 1}`,
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
  seats: [
    { _id: 'seat-1', auditorium: 'aud2', auditoriumName: 'Audi 2', seatNumber: 'B16', token: 'audi2-b16', status: 'active' },
    { _id: 'seat-2', auditorium: 'aud2', auditoriumName: 'Audi 2', seatNumber: 'C12', token: 'audi2-c12', status: 'active' },
    { _id: 'seat-3', auditorium: 'aud1', auditoriumName: 'Audi 1', seatNumber: 'A01', token: 'audi1-a01', status: 'active' },
  ],
  orders: [],
};

module.exports = { store };
