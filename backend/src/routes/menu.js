const express = require('express');
const {
  getMenu,
  getCategories,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  toggleProductAvailability,
  deleteProduct,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
} = require('../controllers/menuController');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// Public customer and menu read endpoints
router.get('/menu', getMenu);
router.get('/categories', getCategories);
router.get('/products', getProducts);
router.get('/products/:id', getProductById);

// Admin-protected product CRUD
router.post('/products', requireAdminAuth, createProduct);
router.patch('/products/:id', requireAdminAuth, updateProduct);
router.patch('/products/:id/availability', requireAdminAuth, toggleProductAvailability);
router.delete('/products/:id', requireAdminAuth, deleteProduct);

// Admin-protected category CRUD
router.post('/categories', requireAdminAuth, createCategory);
router.patch('/categories/:id', requireAdminAuth, updateCategory);
router.patch('/categories/:id/status', requireAdminAuth, toggleCategoryStatus);
router.delete('/categories/:id', requireAdminAuth, deleteCategory);

module.exports = router;
