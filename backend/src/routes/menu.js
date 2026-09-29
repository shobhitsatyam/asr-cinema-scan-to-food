const express = require('express');
const { getMenu, getCategories, getProducts } = require('../controllers/menuController');

const router = express.Router();

router.get('/menu', getMenu);
router.get('/categories', getCategories);
router.get('/products', getProducts);

module.exports = router;
