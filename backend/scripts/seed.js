const { store } = require('../src/data/memoryStore');

console.log('Seed ready');
console.log(JSON.stringify({
  auditoriums: store.auditoriums.length,
  seats: store.seats.length,
  products: store.products.length,
  categories: store.categories.length,
}, null, 2));
