const express = require('express');
const {
  createOrder,
  getOrders,
  updateOrderStatus,
} = require('../controllers/orderController');

const router = express.Router();

router.post('/', createOrder);
router.get('/', getOrders);
router.patch('/:id/status', updateOrderStatus);

module.exports = router;
