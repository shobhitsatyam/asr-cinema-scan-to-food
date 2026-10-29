const express = require('express');
const {
  getPaymentConfig,
  initiatePayment,
  handlePaytmCallback,
  verifyPaymentStatus,
} = require('../controllers/paymentController');

const router = express.Router();

router.get('/config', getPaymentConfig);
router.post('/initiate', initiatePayment);
router.post('/paytm-callback', handlePaytmCallback);
router.post('/verify-status', verifyPaymentStatus);

module.exports = router;
