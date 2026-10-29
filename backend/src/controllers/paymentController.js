const mongoose = require('mongoose');
const Order = require('../models/Order');
const { store } = require('../data/memoryStore');
const paymentService = require('../services/paymentService');
const env = require('../config/env');

/**
 * Find order by cinema orderId or paytmOrderId across DB and memoryStore.
 */
async function findOrder(identifier) {
  if (!identifier) return null;
  const cleanId = String(identifier).trim();
  const idWithHash = cleanId.startsWith('#') ? cleanId : `#${cleanId}`;
  const idWithoutHash = cleanId.replace(/^#/, '');

  if (mongoose.connection.readyState === 1) {
    try {
      const order = await Order.findOne({
        $or: [
          { id: cleanId },
          { id: idWithHash },
          { id: idWithoutHash },
          { paytmOrderId: cleanId },
          ...(mongoose.isValidObjectId(cleanId) ? [{ _id: cleanId }] : []),
        ],
      });
      if (order) return order;
    } catch (err) {
      console.warn('DB lookup failed in findOrder:', err.message);
    }
  }

  // Fallback to memoryStore
  return (
    store.orders.find(
      (o) =>
        o.id === cleanId ||
        o.id === idWithHash ||
        o.id === idWithoutHash ||
        o.paytmOrderId === cleanId
    ) || null
  );
}

/**
 * GET /api/payments/config
 * Expose public gateway configuration (safe for frontend, never exposes keys).
 */
const getPaymentConfig = (req, res) => {
  const config = paymentService.getPublicConfig();
  return res.json(config);
};

/**
 * POST /api/payments/initiate
 * Initiate transaction with official Paytm API for a server-validated order.
 */
const initiatePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required to initiate payment.',
      });
    }

    const order = await findOrder(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order '${orderId}' not found.`,
      });
    }

    // Check if order is already Paid
    if (order.paymentStatus === 'Paid') {
      return res.status(400).json({
        success: false,
        message: 'Order is already marked as Paid.',
        order,
      });
    }

    // Check if Paytm is configured
    if (!paymentService.isConfigured()) {
      return res.status(200).json({
        success: false,
        configured: false,
        status: 'unconfigured',
        orderId: order.id,
        amount: order.total,
        message: 'Paytm Payment Gateway is unconfigured in this environment. Live transactions cannot be initiated.',
      });
    }

    // Determine callback URL based on incoming request host
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const dynamicCallbackUrl = `${protocol}://${host}/api/payments/paytm-callback`;

    const initResult = await paymentService.initiateTransaction({
      order,
      callbackUrl: env.paytmCallbackUrl || dynamicCallbackUrl,
    });

    if (!initResult.success) {
      return res.status(400).json({
        success: false,
        message: initResult.message,
        resultCode: initResult.resultCode,
      });
    }

    // Persist paytm tracking info to order
    if (order.save && typeof order.save === 'function') {
      order.paytmOrderId = initResult.paytmOrderId;
      order.paytmTxnToken = initResult.txnToken;
      await order.save();
    } else {
      order.paytmOrderId = initResult.paytmOrderId;
      order.paytmTxnToken = initResult.txnToken;
    }

    return res.status(200).json({
      success: true,
      configured: true,
      txnToken: initResult.txnToken,
      paytmOrderId: initResult.paytmOrderId,
      amount: initResult.amount,
      mid: initResult.mid,
      host: initResult.host,
      orderId: order.id,
    });
  } catch (error) {
    console.error('Error in initiatePayment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate payment transaction with gateway.',
    });
  }
};

/**
 * POST /api/payments/paytm-callback
 * Receive and verify callback from Paytm Gateway.
 */
const handlePaytmCallback = async (req, res) => {
  try {
    const callbackData = req.body || {};
    const paytmOrderId = callbackData.ORDERID;

    if (!paytmOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing ORDERID in callback payload.',
      });
    }

    // 1. Verify Checksum Signature from Paytm
    const isSignatureValid = await paymentService.verifyCallbackChecksum(callbackData);
    if (!isSignatureValid) {
      console.warn('Paytm callback signature verification failed for order:', paytmOrderId);
      return res.status(400).json({
        success: false,
        message: 'Paytm callback signature verification failed. Untrusted callback rejected.',
      });
    }

    // 2. Locate matching order in system
    const order = await findOrder(paytmOrderId);
    if (!order) {
      console.warn('Order not found for callback ORDERID:', paytmOrderId);
      return res.status(404).json({
        success: false,
        message: `Order for Paytm reference '${paytmOrderId}' could not be located.`,
      });
    }

    // 3. Authoritative Server-to-Server Status Verification
    // Never trust callback body alone — always query Paytm Status API
    const statusResult = await paymentService.queryTransactionStatus(paytmOrderId);

    // 4. Idempotent Transition
    const transitionResult = await paymentService.processPaymentTransition({
      order,
      statusData: statusResult,
      rawCallback: callbackData,
    });

    // If browser form submission, redirect to frontend; otherwise return JSON
    const acceptsHtml = (req.headers.accept || '').includes('text/html');
    if (acceptsHtml) {
      const frontendUrl = env.corsOrigin ? (process.env.CORS_ORIGIN || '').split(',')[0] : 'http://localhost:5173';
      const redirectSeat = order.seat || 'B16';
      return res.redirect(`${frontendUrl}/order/${redirectSeat}/success?orderId=${encodeURIComponent(order.id)}&status=${order.paymentStatus}`);
    }

    return res.status(200).json({
      success: true,
      isDuplicate: transitionResult.isDuplicate,
      paymentStatus: order.paymentStatus,
      orderId: order.id,
    });
  } catch (error) {
    console.error('Error processing Paytm callback:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error processing payment callback.',
    });
  }
};

/**
 * POST /api/payments/verify-status
 * Query Paytm status server-to-server and update order state.
 */
const verifyPaymentStatus = async (req, res) => {
  try {
    const { orderId, paytmOrderId } = req.body;
    const lookupKey = paytmOrderId || orderId;

    if (!lookupKey) {
      return res.status(400).json({
        success: false,
        message: 'orderId or paytmOrderId is required for status verification.',
      });
    }

    const order = await findOrder(lookupKey);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order '${lookupKey}' not found.`,
      });
    }

    // Idempotency: If already Paid, return immediately
    if (order.paymentStatus === 'Paid') {
      return res.status(200).json({
        success: true,
        paymentStatus: 'Paid',
        isDuplicate: true,
        order,
      });
    }

    if (!paymentService.isConfigured()) {
      return res.status(200).json({
        success: false,
        configured: false,
        paymentStatus: order.paymentStatus,
        message: 'Paytm credentials are unconfigured. Cannot verify live payment.',
        order,
      });
    }

    const targetPaytmOrderId = order.paytmOrderId || paytmOrderId;
    if (!targetPaytmOrderId) {
      return res.status(400).json({
        success: false,
        message: 'No Paytm transaction reference associated with this order.',
      });
    }

    // Query status server-to-server
    const statusResult = await paymentService.queryTransactionStatus(targetPaytmOrderId);

    // Idempotent state transition
    const transitionResult = await paymentService.processPaymentTransition({
      order,
      statusData: statusResult,
    });

    return res.status(200).json({
      success: true,
      paymentStatus: order.paymentStatus,
      isDuplicate: transitionResult.isDuplicate,
      statusData: statusResult,
      order,
    });
  } catch (error) {
    console.error('Error verifying payment status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to query payment status from gateway.',
    });
  }
};

module.exports = {
  getPaymentConfig,
  initiatePayment,
  handlePaytmCallback,
  verifyPaymentStatus,
};
