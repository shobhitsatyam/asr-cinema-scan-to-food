const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Order = require('../src/models/Order');
const paymentService = require('../src/services/paymentService');
const { createOrder } = require('../src/controllers/orderController');
const { store } = require('../src/data/memoryStore');
const env = require('../src/config/env');

test('Order schema defaults paymentStatus to Pending', () => {
  const order = new Order({
    id: '#ASRTEST1',
    auditorium: 'Audi 2',
    seat: 'B16',
    items: [{ id: 'item-1', name: 'Popcorn', quantity: 1, price: 200 }],
    subtotal: 200,
    total: 200,
    time: '12:00 PM',
  });

  assert.equal(order.paymentStatus, 'Pending', 'Default paymentStatus must be Pending');
});

test('paymentService reports unconfigured state and does not fake verification', async () => {
  const orderRes = await paymentService.createPaymentOrder({
    amount: 500,
    seat: 'B16',
    orderNumber: '#ASR999999',
  });
  assert.equal(orderRes.configured, false);
  assert.equal(orderRes.status, 'unconfigured');

  const verifyRes = await paymentService.verifyPayment({
    paymentReference: 'PAY-12345',
    amount: 500,
    orderNumber: '#ASR999999',
  });
  assert.equal(verifyRes.verified, false);
  assert.equal(verifyRes.status, 'unconfigured');
});

test('createOrder sets paymentStatus to Pending even if client sends paymentStatus Paid', async () => {
  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'p1', name: 'Popcorn', price: 400, quantity: 1 }],
      total: 400,
      paymentMethod: 'UPI',
      paymentStatus: 'Paid', // Malicious or unverified client claim
      customer: { name: 'Cinema Guest', phone: '9876543210' },
    },
  };

  let responseStatus = 0;
  let responseData = null;

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  await createOrder(req, res);

  assert.equal(responseStatus, 201);
  assert.ok(responseData && responseData.success);
  assert.equal(responseData.order.paymentStatus, 'Pending', 'Order must be recorded as Pending payment');
});

test('createOrder fails closed with 503 in production if database is unavailable', async () => {
  const originalEnv = env.nodeEnv;
  env.nodeEnv = 'production';

  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'p1', name: 'Popcorn', price: 400, quantity: 1 }],
      total: 400,
      customer: { name: 'Cinema Guest', phone: '9876543210' },
    },
  };

  let responseStatus = 0;
  let responseData = null;

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  try {
    // When mongoose is not connected (readyState === 0)
    assert.notEqual(mongoose.connection.readyState, 1);
    await createOrder(req, res);

    assert.equal(responseStatus, 503, 'Must return 503 Service Unavailable when DB is down in production');
    assert.equal(responseData.success, false);
  } finally {
    env.nodeEnv = originalEnv;
  }
});

test('GET /api/orders operational feed strictly excludes unpaid/unverified orders', async () => {
  const { getOrders } = require('../src/controllers/orderController');
  const paidId = `#ASR_PAID_${Date.now()}`;
  const unpaidId = `#ASR_UNPAID_${Date.now()}`;

  store.orders.unshift({
    id: paidId,
    auditorium: 'Audi 1',
    seat: 'A01',
    paymentStatus: 'Paid',
    status: 'Accepted',
    items: [],
    createdAt: new Date(),
  });

  store.orders.unshift({
    id: unpaidId,
    auditorium: 'Audi 1',
    seat: 'A02',
    paymentStatus: 'Pending',
    status: 'Pending',
    items: [],
    createdAt: new Date(),
  });

  // 1. Default operational query (must exclude unpaid)
  const res1 = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await getOrders({}, res1);
  assert.equal(res1.body.success, true);
  assert.ok(res1.body.orders.some(o => o.id === paidId), 'Paid order must appear in operational feed');
  assert.equal(res1.body.orders.some(o => o.id === unpaidId), false, 'Unpaid order must NOT appear in operational feed');

  // 2. Audit query with all=true includes all orders
  const res2 = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await getOrders({ query: { all: 'true' } }, res2);
  assert.equal(res2.body.success, true);
  assert.ok(res2.body.orders.some(o => o.id === paidId), 'Paid order appears in audit feed');
  assert.ok(res2.body.orders.some(o => o.id === unpaidId), 'Unpaid order appears in audit feed when all=true');
});
