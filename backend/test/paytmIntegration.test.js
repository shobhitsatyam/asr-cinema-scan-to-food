const test = require('node:test');
const assert = require('node:assert/strict');
const PaytmChecksum = require('paytmchecksum');
const paymentService = require('../src/services/paymentService');
const {
  getPaymentConfig,
  initiatePayment,
  handlePaytmCallback,
  verifyPaymentStatus,
} = require('../src/controllers/paymentController');
const { updateOrderStatus } = require('../src/controllers/orderController');
const { store } = require('../src/data/memoryStore');
const env = require('../src/config/env');

const TEST_MID = 'TEST_MID_ASR12345';
const TEST_KEY = '1234567890abcdef'; // 16-char test key for signature verification

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    redirect(url) {
      this.statusCode = 302;
      this.redirectUrl = url;
      return this;
    },
  };
}

test('1. Unconfigured gateway reports unconfigured safely without throwing', async () => {
  const origMid = env.paytmMid;
  const origKey = env.paytmMerchantKey;
  env.paytmMid = '';
  env.paytmMerchantKey = '';

  try {
    const config = paymentService.getPublicConfig();
    assert.equal(config.configured, false);
    assert.equal(config.gateway, 'paytm');

    const res = createMockRes();
    getPaymentConfig({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.configured, false);

    const initResult = await paymentService.initiateTransaction({
      order: { id: '#ASRTEST1', total: 600 },
    });
    assert.equal(initResult.configured, false);
    assert.equal(initResult.status, 'unconfigured');
  } finally {
    env.paytmMid = origMid;
    env.paytmMerchantKey = origKey;
  }
});

test('2. Transaction initiation generates unique Paytm order reference and valid signature', async () => {
  const origMid = env.paytmMid;
  const origKey = env.paytmMerchantKey;
  env.paytmMid = TEST_MID;
  env.paytmMerchantKey = TEST_KEY;

  try {
    const testOrder = {
      id: '#ASR991122',
      seat: 'B16',
      total: 650,
      customer: { phone: '9876543210' },
    };

    let capturedUrl = '';
    let capturedBody = null;

    // Mock fetch to simulate Paytm Initiate Transaction API response
    const mockFetch = async (url, options) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);

      return {
        ok: true,
        json: async () => ({
          head: { responseTimestamp: '123456', version: 'v1', signature: 'mock-head-sig' },
          body: {
            resultInfo: { resultStatus: 'S', resultCode: '0000', resultMsg: 'Success' },
            txnToken: 'mock-txn-token-abc123xyz',
            isPromoCodeValid: false,
            authenticated: false,
          },
        }),
      };
    };

    const result = await paymentService.initiateTransaction({
      order: testOrder,
      fetchFn: mockFetch,
    });

    assert.equal(result.configured, true);
    assert.equal(result.success, true);
    assert.equal(result.txnToken, 'mock-txn-token-abc123xyz');
    assert.equal(result.amount, '650.00');
    assert.ok(result.paytmOrderId.startsWith('PAYTM_ASR991122_'));

    // Validate request sent to Paytm endpoint
    assert.match(capturedUrl, new RegExp(`initiateTransaction\\?mid=${TEST_MID}`));
    assert.equal(capturedBody.body.mid, TEST_MID);
    assert.equal(capturedBody.body.txnAmount.value, '650.00');
    assert.equal(capturedBody.body.userInfo.custId, '9876543210');

    // Verify signature created using official PaytmChecksum
    const isSigValid = await PaytmChecksum.verifySignature(
      JSON.stringify(capturedBody.body),
      TEST_KEY,
      capturedBody.head.signature
    );
    assert.equal(isSigValid, true, 'Head signature must be valid according to Paytm algorithm');
  } finally {
    env.paytmMid = origMid;
    env.paytmMerchantKey = origKey;
  }
});

test('3. Valid Paytm callback with verified server status transitions order to Paid', async () => {
  const origMid = env.paytmMid;
  const origKey = env.paytmMerchantKey;
  env.paytmMid = TEST_MID;
  env.paytmMerchantKey = TEST_KEY;

  try {
    const cinemaOrderId = `#ASR${Date.now()}`;
    const paytmOrderId = paymentService.generatePaytmOrderId(cinemaOrderId);

    const testOrder = {
      id: cinemaOrderId,
      auditorium: 'Audi 2',
      seat: 'B16',
      total: 500,
      paymentStatus: 'Pending',
      status: 'Pending',
      paytmOrderId,
      timeline: [{ status: 'Pending', note: 'Order placed' }],
    };

    store.orders.unshift(testOrder);

    // Mock queryTransactionStatus to return verified TXN_SUCCESS
    const origQuery = paymentService.queryTransactionStatus;
    paymentService.queryTransactionStatus = async (orderId) => ({
      verified: true,
      resultStatus: 'TXN_SUCCESS',
      resultCode: '01',
      resultMsg: 'Txn Successful',
      orderId,
      txnId: 'PAYTM_TXN_778899',
      bankTxnId: 'BANK_TXN_445566',
      txnAmount: '500.00',
      paymentMode: 'UPI',
    });

    try {
      // Build callback payload with valid Paytm signature
      const rawCallbackParams = {
        MID: TEST_MID,
        ORDERID: paytmOrderId,
        TXNAMOUNT: '500.00',
        CURRENCY: 'INR',
        STATUS: 'TXN_SUCCESS',
        RESPCODE: '01',
        RESPMSG: 'Txn Successful',
        TXNID: 'PAYTM_TXN_778899',
        BANKTXNID: 'BANK_TXN_445566',
        PAYMENTMODE: 'UPI',
      };

      const checksum = await PaytmChecksum.generateSignature(rawCallbackParams, TEST_KEY);
      rawCallbackParams.CHECKSUMHASH = checksum;

      const req = {
        headers: {},
        body: rawCallbackParams,
      };
      const res = createMockRes();

      await handlePaytmCallback(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.paymentStatus, 'Paid');

      // Verify the in-memory order record updated to Paid
      const stored = store.orders.find((o) => o.id === cinemaOrderId);
      assert.equal(stored.paymentStatus, 'Paid');
      assert.equal(stored.paytmTxnId, 'PAYTM_TXN_778899');
    } finally {
      paymentService.queryTransactionStatus = origQuery;
    }
  } finally {
    env.paytmMid = origMid;
    env.paytmMerchantKey = origKey;
  }
});

test('4. Callback with invalid or forged checksum signature is rejected with 400', async () => {
  const origMid = env.paytmMid;
  const origKey = env.paytmMerchantKey;
  env.paytmMid = TEST_MID;
  env.paytmMerchantKey = TEST_KEY;

  try {
    const rawCallbackParams = {
      MID: TEST_MID,
      ORDERID: 'PAYTM_ORDER_FAKE_123',
      TXNAMOUNT: '500.00',
      STATUS: 'TXN_SUCCESS',
      CHECKSUMHASH: 'FORGED_INVALID_CHECKSUM_HASH_9999',
    };

    const req = {
      headers: {},
      body: rawCallbackParams,
    };
    const res = createMockRes();

    await handlePaytmCallback(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /signature verification failed/i);
  } finally {
    env.paytmMid = origMid;
    env.paytmMerchantKey = origKey;
  }
});

test('5. Amount mismatch between Paytm status and server order total rejects Paid transition', async () => {
  const origMid = env.paytmMid;
  const origKey = env.paytmMerchantKey;
  env.paytmMid = TEST_MID;
  env.paytmMerchantKey = TEST_KEY;

  try {
    const cinemaOrderId = `#ASR${Date.now()}_AMT`;
    const paytmOrderId = paymentService.generatePaytmOrderId(cinemaOrderId);

    // Server-side authoritative total is 1200
    const testOrder = {
      id: cinemaOrderId,
      total: 1200,
      paymentStatus: 'Pending',
      paytmOrderId,
      timeline: [],
    };
    store.orders.unshift(testOrder);

    // Attacker attempted to pay only 1.00 at gateway
    const statusData = {
      resultStatus: 'TXN_SUCCESS',
      txnAmount: '1.00', // Mismatch!
      txnId: 'TXN_UNDERPAID_123',
    };

    const transitionResult = await paymentService.processPaymentTransition({
      order: testOrder,
      statusData,
    });

    assert.equal(transitionResult.paymentStatus, 'Failed');
    assert.equal(testOrder.paymentStatus, 'Failed', 'Must not transition to Paid when amount mismatches');
    assert.match(testOrder.paymentDetails.error, /Amount mismatch/i);
  } finally {
    env.paytmMid = origMid;
    env.paytmMerchantKey = origKey;
  }
});

test('6. Failed transaction (TXN_FAILURE) transitions order paymentStatus to Failed', async () => {
  const cinemaOrderId = `#ASR${Date.now()}_FAIL`;
  const testOrder = {
    id: cinemaOrderId,
    total: 300,
    paymentStatus: 'Pending',
    timeline: [],
  };
  store.orders.unshift(testOrder);

  const statusData = {
    resultStatus: 'TXN_FAILURE',
    resultCode: '227',
    resultMsg: 'User cancelled transaction',
    txnAmount: '300.00',
  };

  const transitionResult = await paymentService.processPaymentTransition({
    order: testOrder,
    statusData,
  });

  assert.equal(transitionResult.paymentStatus, 'Failed');
  assert.equal(testOrder.paymentStatus, 'Failed');
});

test('7. Payment status transitions are idempotent for duplicate callbacks', async () => {
  const cinemaOrderId = `#ASR${Date.now()}_IDEMP`;
  const testOrder = {
    id: cinemaOrderId,
    total: 450,
    paymentStatus: 'Paid', // Already marked Paid
    paytmTxnId: 'TXN_EXISTING_11',
    timeline: [{ status: 'Pending', note: 'Payment verified' }],
  };
  store.orders.unshift(testOrder);

  const duplicateStatus = {
    resultStatus: 'TXN_SUCCESS',
    txnAmount: '450.00',
    txnId: 'TXN_DUPLICATE_CALL',
  };

  const transitionResult = await paymentService.processPaymentTransition({
    order: testOrder,
    statusData: duplicateStatus,
  });

  assert.equal(transitionResult.isDuplicate, true);
  assert.equal(transitionResult.order.paymentStatus, 'Paid');
  assert.equal(testOrder.paytmTxnId, 'TXN_EXISTING_11', 'Must not overwrite existing transaction details on duplicate');
});

test('8. Unpaid or unverified orders cannot be released for kitchen preparation', async () => {
  const cinemaOrderId = `#ASR${Date.now()}_UNPAID`;
  const testOrder = {
    id: cinemaOrderId,
    auditorium: 'Audi 1',
    seat: 'A01',
    total: 400,
    paymentStatus: 'Pending', // Unpaid!
    status: 'Pending',
    timeline: [],
  };
  store.orders.unshift(testOrder);

  // Attempting to advance status to 'Accepted'
  const req1 = { params: { id: cinemaOrderId }, body: { status: 'Accepted' } };
  const res1 = createMockRes();
  await updateOrderStatus(req1, res1);
  assert.equal(res1.statusCode, 400);
  assert.match(res1.body.message, /Unpaid or unverified orders cannot be released/i);

  // Attempting to advance status to 'Preparing'
  const req2 = { params: { id: cinemaOrderId }, body: { status: 'Preparing' } };
  const res2 = createMockRes();
  await updateOrderStatus(req2, res2);
  assert.equal(res2.statusCode, 400);
  assert.match(res2.body.message, /Unpaid or unverified orders cannot be released/i);

  // But 'Cancelled' is allowed
  const req3 = { params: { id: cinemaOrderId }, body: { status: 'Cancelled' } };
  const res3 = createMockRes();
  await updateOrderStatus(req3, res3);
  assert.equal(res3.statusCode, 200);
  assert.equal(res3.body.order.status, 'Cancelled');
});
