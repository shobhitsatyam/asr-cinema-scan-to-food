const PaytmChecksum = require('paytmchecksum');
const env = require('../config/env');
const Order = require('../models/Order');
const { store } = require('../data/memoryStore');
const { restoreStock } = require('./inventoryService');
const mongoose = require('mongoose');

class PaymentService {
  /**
   * Check whether Paytm sandbox or production credentials are fully configured.
   */
  isConfigured() {
    const mid = env.paytmMid || process.env.PAYMENT_GATEWAY_KEY_ID;
    const key = env.paytmMerchantKey || process.env.PAYMENT_GATEWAY_KEY_SECRET;
    return Boolean(mid && key && mid.trim() && key.trim());
  }

  /**
   * Get public gateway configuration (safe for frontend consumption, never exposes secret keys).
   */
  getPublicConfig() {
    const isConfig = this.isConfigured();
    return {
      configured: isConfig,
      gateway: 'paytm',
      mid: isConfig ? (env.paytmMid || process.env.PAYMENT_GATEWAY_KEY_ID) : '',
      host: env.paytmHost || 'https://securegw-stage.paytm.in',
      website: env.paytmWebsite || 'WEBSTAGING',
    };
  }

  /**
   * Generate a unique, Paytm-compliant Order ID.
   * Format: alphanumeric and -_.@ only, max 50 characters.
   */
  generatePaytmOrderId(cinemaOrderId) {
    const cleanId = String(cinemaOrderId || '').replace(/[^a-zA-Z0-9]/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `PAYTM_${cleanId}_${Date.now()}_${randomSuffix}`.slice(0, 50);
  }

  /**
   * Initiate transaction using official Paytm Initiate Transaction API.
   * Endpoint: POST /theia/api/v1/initiateTransaction?mid={mid}&orderId={orderId}
   *
   * @param {Object} params
   * @param {Object} params.order - Authoritative server order
   * @param {string} [params.callbackUrl] - Optional custom callback URL
   * @param {Function} [params.fetchFn] - Custom fetch for testing / mocking
   */
  async initiateTransaction({ order, callbackUrl, fetchFn = globalThis.fetch }) {
    if (!order) {
      throw new Error('Order is required for transaction initiation.');
    }

    if (!this.isConfigured()) {
      return {
        configured: false,
        status: 'unconfigured',
        orderId: order.id,
        message: 'Paytm Payment Gateway credentials are not configured in environment.',
      };
    }

    const mid = env.paytmMid || process.env.PAYMENT_GATEWAY_KEY_ID;
    const merchantKey = env.paytmMerchantKey || process.env.PAYMENT_GATEWAY_KEY_SECRET;
    const gatewayHost = env.paytmHost || 'https://securegw-stage.paytm.in';
    const website = env.paytmWebsite || 'WEBSTAGING';

    // Validate authoritative total from database record
    const authoritativeTotal = Number(order.total);
    if (!authoritativeTotal || authoritativeTotal <= 0) {
      throw new Error('Authoritative order total must be greater than zero.');
    }

    const formattedAmount = authoritativeTotal.toFixed(2);
    const paytmOrderId = this.generatePaytmOrderId(order.id);
    const targetCallbackUrl = callbackUrl || env.paytmCallbackUrl || `${gatewayHost}/theia/paytmCallback?ORDER_ID=${paytmOrderId}`;

    const custId = (order.customer?.phone || order.customer?.email || `CUST_${order.seat || 'GUEST'}_${Date.now()}`)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 50);

    const paytmParams = {
      body: {
        requestType: 'Payment',
        mid,
        websiteName: website,
        orderId: paytmOrderId,
        callbackUrl: targetCallbackUrl,
        txnAmount: {
          value: formattedAmount,
          currency: 'INR',
        },
        userInfo: {
          custId,
        },
      },
    };

    // Generate SHA256 / AES signature using official PaytmChecksum
    const signature = await PaytmChecksum.generateSignature(
      JSON.stringify(paytmParams.body),
      merchantKey
    );

    paytmParams.head = {
      signature,
    };

    const endpoint = `${gatewayHost}/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(mid)}&orderId=${encodeURIComponent(paytmOrderId)}`;

    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paytmParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Paytm API returned HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const resultInfo = result?.body?.resultInfo || {};

    if (resultInfo.resultStatus !== 'S') {
      return {
        configured: true,
        success: false,
        paytmOrderId,
        resultCode: resultInfo.resultCode,
        message: resultInfo.resultMsg || 'Transaction initiation failed at Paytm Gateway.',
        raw: result,
      };
    }

    const txnToken = result.body.txnToken;

    // Attach tracking details to order
    order.paytmOrderId = paytmOrderId;
    order.paytmTxnToken = txnToken;

    return {
      configured: true,
      success: true,
      txnToken,
      paytmOrderId,
      amount: formattedAmount,
      mid,
      host: gatewayHost,
      orderId: order.id,
      callbackUrl: targetCallbackUrl,
    };
  }

  /**
   * Verify signature of callback parameters sent by Paytm.
   *
   * @param {Object} params - Key-value parameters from Paytm callback
   * @returns {Promise<boolean>}
   */
  async verifyCallbackChecksum(params) {
    if (!this.isConfigured()) return false;
    if (!params || typeof params !== 'object') return false;

    const merchantKey = env.paytmMerchantKey || process.env.PAYMENT_GATEWAY_KEY_SECRET;
    const paytmChecksum = params.CHECKSUMHASH;

    if (!paytmChecksum) return false;

    const paramsCopy = { ...params };
    delete paramsCopy.CHECKSUMHASH;

    try {
      return await PaytmChecksum.verifySignature(paramsCopy, merchantKey, paytmChecksum);
    } catch {
      return false;
    }
  }

  /**
   * Query authoritative transaction status from Paytm server-to-server.
   * Endpoint: POST /v3/order/status
   *
   * @param {string} paytmOrderId
   * @param {Function} [fetchFn]
   * @returns {Promise<Object>}
   */
  async queryTransactionStatus(paytmOrderId, fetchFn = globalThis.fetch) {
    if (!this.isConfigured()) {
      return {
        verified: false,
        status: 'unconfigured',
        message: 'Paytm credentials are not configured.',
      };
    }

    const mid = env.paytmMid || process.env.PAYMENT_GATEWAY_KEY_ID;
    const merchantKey = env.paytmMerchantKey || process.env.PAYMENT_GATEWAY_KEY_SECRET;
    const gatewayHost = env.paytmHost || 'https://securegw-stage.paytm.in';

    const paytmParams = {
      body: {
        mid,
        orderId: paytmOrderId,
      },
    };

    const signature = await PaytmChecksum.generateSignature(
      JSON.stringify(paytmParams.body),
      merchantKey
    );

    paytmParams.head = {
      signature,
    };

    const endpoint = `${gatewayHost}/v3/order/status`;

    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paytmParams),
    });

    if (!response.ok) {
      throw new Error(`Paytm status query returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const body = data?.body || {};
    const head = data?.head || {};

    // Verify response signature if present
    let isSignatureValid = true;
    if (head.signature) {
      try {
        isSignatureValid = await PaytmChecksum.verifySignature(
          JSON.stringify(body),
          merchantKey,
          head.signature
        );
      } catch {
        isSignatureValid = false;
      }
    }

    const resultInfo = body.resultInfo || {};

    return {
      verified: isSignatureValid,
      resultStatus: resultInfo.resultStatus || 'UNKNOWN',
      resultCode: resultInfo.resultCode,
      resultMsg: resultInfo.resultMsg,
      orderId: body.orderId,
      txnId: body.txnId,
      bankTxnId: body.bankTxnId,
      txnAmount: body.txnAmount,
      paymentMode: body.paymentMode,
      raw: data,
    };
  }

  /**
   * Idempotently apply payment status transition to order.
   * Only verified successful payments with matching amounts transition to 'Paid'.
   *
   * @param {Object} params
   * @param {Object} params.order - Mongoose doc or memoryStore object
   * @param {Object} params.statusData - Status query result from queryTransactionStatus
   * @param {Object} [params.rawCallback] - Optional raw callback payload
   */
  async processPaymentTransition({ order, statusData, rawCallback = {} }) {
    if (!order) {
      throw new Error('Order is required for payment transition.');
    }

    // 1. Idempotency Check: If already Paid, do not alter or recreate timeline
    if (order.paymentStatus === 'Paid') {
      return {
        order,
        isDuplicate: true,
        message: 'Order is already marked as Paid.',
      };
    }

    const resultStatus = statusData?.resultStatus || rawCallback?.STATUS;
    const reportedAmount = parseFloat(statusData?.txnAmount || rawCallback?.TXNAMOUNT || '0');
    const authoritativeAmount = Number(order.total);

    // 2. Validate Successful Payment
    if (resultStatus === 'TXN_SUCCESS') {
      // Must strictly verify amount matches server-calculated order total
      if (Math.abs(reportedAmount - authoritativeAmount) > 0.01) {
        order.paymentStatus = 'Failed';
        order.paymentDetails = {
          error: `Amount mismatch: reported ₹${reportedAmount} vs authoritative ₹${authoritativeAmount}`,
          statusData,
          rawCallback,
        };
      } else {
        // Transition to Paid
        order.paymentStatus = 'Paid';
        order.paytmTxnId = statusData?.txnId || rawCallback?.TXNID || '';
        order.paytmBankTxnId = statusData?.bankTxnId || rawCallback?.BANKTXNID || '';
        order.paytmPaymentMode = statusData?.paymentMode || rawCallback?.PAYMENTMODE || 'UPI';
        order.paymentDetails = {
          ...statusData,
          verifiedAt: new Date().toISOString(),
        };

        // Advance timeline note to indicate payment confirmed (unless order was already cancelled)
        if (Array.isArray(order.timeline) && order.timeline.length > 0 && order.status !== 'Cancelled') {
          order.timeline[0].note = `Payment verified via Paytm (${order.paytmPaymentMode}). Order accepted.`;
        }
      }
    } else if (resultStatus === 'TXN_FAILURE') {
      order.paymentStatus = 'Failed';
      order.paymentDetails = { statusData, rawCallback };
      if (!order.stockRestored && order.items && order.items.length > 0) {
        await restoreStock(order.items);
        order.stockRestored = true;
      }
    } else {
      // PENDING or other non-terminal status
      order.paymentStatus = 'Pending';
      order.paymentDetails = { statusData, rawCallback };
    }

    // Persist changes to database if connected
    if (order.save && typeof order.save === 'function') {
      order.markModified?.('paymentDetails');
      order.markModified?.('timeline');
      await order.save();
    } else if (mongoose.connection.readyState === 1 && order.id) {
      try {
        await Order.findOneAndUpdate(
          { id: order.id },
          {
            $set: {
              paymentStatus: order.paymentStatus,
              paytmTxnId: order.paytmTxnId || '',
              paytmBankTxnId: order.paytmBankTxnId || '',
              paytmPaymentMode: order.paytmPaymentMode || '',
              paymentDetails: order.paymentDetails,
              timeline: order.timeline,
              stockRestored: !!order.stockRestored,
            },
          }
        );
      } catch (err) {
        console.warn('Could not sync order update to DB:', err.message);
      }
    }

    // Sync memoryStore
    const memIdx = store.orders.findIndex((o) => o.id === order.id);
    if (memIdx >= 0) {
      store.orders[memIdx] = {
        ...store.orders[memIdx],
        paymentStatus: order.paymentStatus,
        paytmTxnId: order.paytmTxnId,
        paytmBankTxnId: order.paytmBankTxnId,
        paytmPaymentMode: order.paytmPaymentMode,
        paymentDetails: order.paymentDetails,
        timeline: order.timeline,
        stockRestored: !!order.stockRestored,
      };
    }

    return {
      order,
      isDuplicate: false,
      paymentStatus: order.paymentStatus,
    };
  }

  // --- Legacy helpers preserved for backward compatibility with existing tests ---
  async createPaymentOrder({ amount, seat, orderNumber }) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        gateway: 'unconfigured',
        orderNumber,
        amount,
        status: 'unconfigured',
        message: 'Paytm Payment Gateway is unconfigured. Live payment initiation is not yet active.',
      };
    }

    return {
      configured: true,
      gateway: 'paytm',
      orderNumber,
      amount,
      status: 'pending',
      paymentReference: `PAYTM-${orderNumber}-${Date.now()}`,
      metadata: { seat, mode: 'UPI' },
    };
  }

  async verifyPayment({ paymentReference, amount, orderNumber }) {
    if (!paymentReference || !amount || !orderNumber) {
      throw new Error('Invalid payment verification payload.');
    }

    if (!this.isConfigured()) {
      return {
        verified: false,
        status: 'unconfigured',
        message: 'Payment gateway credentials are not configured. Cannot verify real payments.',
        orderNumber,
      };
    }

    return {
      verified: false,
      status: 'pending_implementation',
      message: 'Paytm checksum verification is not yet implemented.',
      orderNumber,
    };
  }
}

module.exports = new PaymentService();
