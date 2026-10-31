const express = require('express');
const {
  getPaymentConfig,
  initiatePayment,
  handlePaytmCallback,
  verifyPaymentStatus,
  getAdminPayments,
} = require('../controllers/paymentController');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

router.get('/config', getPaymentConfig);
router.post('/initiate', initiatePayment);
router.post('/paytm-callback', handlePaytmCallback);
router.post('/verify-status', verifyPaymentStatus);
router.get('/admin', requireAdminAuth, getAdminPayments);

module.exports = router;
