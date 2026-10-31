const express = require('express');
const {
  getCoupons,
  createCoupon,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  validateCoupon,
} = require('../controllers/couponController');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

router.get('/', requireAdminAuth, getCoupons);
router.post('/', requireAdminAuth, createCoupon);
router.post('/validate', validateCoupon);
router.patch('/:id', requireAdminAuth, updateCoupon);
router.put('/:id', requireAdminAuth, updateCoupon);
router.patch('/:id/status', requireAdminAuth, toggleCouponStatus);
router.delete('/:id', requireAdminAuth, deleteCoupon);

module.exports = router;

