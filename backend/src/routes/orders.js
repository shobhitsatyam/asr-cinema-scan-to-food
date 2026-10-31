const express = require('express');
const {
  createOrder,
  getOrders,
  updateOrderStatus,
  getOrderTracking,
  getAdminCustomers,
} = require('../controllers/orderController');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

router.post('/', createOrder);
router.get('/', requireAdminAuth, getOrders);
router.get('/customers/admin', requireAdminAuth, getAdminCustomers);
if (typeof getOrderTracking === 'function') {
  router.get('/:id/track', getOrderTracking);
}
router.patch('/:id/status', requireAdminAuth, updateOrderStatus);

module.exports = router;
