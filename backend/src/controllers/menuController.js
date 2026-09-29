const { store } = require('../data/memoryStore');

const getCategories = async (req, res) => {
  res.json({ categories: store.categories });
};

const getProducts = async (req, res) => {
  res.json({ products: store.products });
};

const getMenu = async (req, res) => {
  res.json({
    categories: store.categories,
    products: store.products,
  });
};

module.exports = {
  getCategories,
  getProducts,
  getMenu,
};
