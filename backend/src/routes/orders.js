const express = require('express');
const {
  createOrder,
  getOrders,
  updateOrderStatus,
  getOrderTracking,
} = require('../controllers/orderController');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

router.post('/', createOrder);
router.get('/', requireAdminAuth, getOrders);
if (typeof getOrderTracking === 'function') {
  router.get('/:id/track', getOrderTracking);
}
router.patch('/:id/status', requireAdminAuth, updateOrderStatus);

module.exports = router;
