const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createOrder, updateOrderStatus } = require('../src/controllers/orderController');
const { validateAndDeductStock, restoreStock } = require('../src/services/inventoryService');
const { store } = require('../src/data/memoryStore');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const paymentService = require('../src/services/paymentService');

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test('1. Sufficient stock allows order and atomically decrements product stock', async () => {
  // Ensure product has known stock in memoryStore
  let prod = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  if (!prod) {
    prod = { id: 'water-bottle', name: 'Water Bottle', price: 30, stock: 10, isAvailable: true, inStock: true };
    store.products.push(prod);
  }
  prod.stock = 10;
  prod.isAvailable = true;
  prod.inStock = true;

  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 2 }],
      customer: { name: 'Priya Sharma', phone: '9876543210' },
    },
    headers: {},
  };
  const res = createMockRes();
  await createOrder(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(prod.stock, 8, 'Product stock should be decremented from 10 to 8');
});

test('2. Insufficient stock (requested > stock) rejects order with 400 and does NOT deduct stock', async () => {
  let prod = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  prod.stock = 2;
  prod.isAvailable = true;
  prod.inStock = true;

  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 5 }], // Requests 5 when only 2 available
      customer: { name: 'Priya Sharma', phone: '9876543210' },
    },
    headers: {},
  };
  const res = createMockRes();
  await createOrder(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /insufficient stock/i);
  assert.equal(prod.stock, 2, 'Stock must not be decremented when order is rejected');
});

test('3. Multi-item order rolls back deducted stock when a subsequent item has insufficient stock', async () => {
  let prodA = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  let prodB = store.products.find((p) => p.id === 'french-fry' || p.slug === 'french-fry');
  if (!prodB) {
    prodB = { id: 'french-fry', name: 'French Fry', price: 240, stock: 1, isAvailable: true, inStock: true };
    store.products.push(prodB);
  }

  prodA.stock = 10;
  prodA.isAvailable = true;
  prodA.inStock = true;

  prodB.stock = 1;
  prodB.isAvailable = true;
  prodB.inStock = true;

  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [
        { id: 'water-bottle', quantity: 2 }, // Product A: sufficient (10 >= 2)
        { id: 'french-fry', quantity: 5 },   // Product B: insufficient (1 < 5)
      ],
      customer: { name: 'Priya Sharma', phone: '9876543210' },
    },
    headers: {},
  };
  const res = createMockRes();
  await createOrder(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /insufficient stock/i);
  assert.equal(prodA.stock, 10, 'Product A stock must be rolled back to 10');
  assert.equal(prodB.stock, 1, 'Product B stock must remain 1');
});

test('4. Out of stock product (inStock: false or stock: 0) rejects order with 400', async () => {
  let prod = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  prod.stock = 0;
  prod.inStock = false;

  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Priya Sharma', phone: '9876543210' },
    },
    headers: {},
  };
  const res = createMockRes();
  await createOrder(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /out of stock|unavailable/i);
});

test('5. Concurrent order attempts for remaining stock: prevents overselling', async () => {
  let prod = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  prod.stock = 1; // Exactly 1 item left in stock
  prod.isAvailable = true;
  prod.inStock = true;

  const req1 = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Patron A', phone: '9876543210' },
      idempotencyKey: 'concurrent-key-1',
    },
    headers: {},
  };
  const req2 = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Patron B', phone: '9876543211' },
      idempotencyKey: 'concurrent-key-2',
    },
    headers: {},
  };

  const res1 = createMockRes();
  const res2 = createMockRes();

  // Execute both orders concurrently
  await Promise.all([createOrder(req1, res1), createOrder(req2, res2)]);

  const results = [res1, res2];
  const successes = results.filter((r) => r.statusCode === 201);
  const failures = results.filter((r) => r.statusCode === 400);

  assert.equal(successes.length, 1, 'Exactly one order must succeed');
  assert.equal(failures.length, 1, 'The competing concurrent order must be rejected');
  assert.match(failures[0].body.message, /insufficient stock|out of stock/i);
  assert.equal(prod.stock, 0, 'Remaining stock must be 0, never negative');
  assert.equal(prod.inStock, false, 'Product must be marked out of stock');
});

test('6. Duplicate order submission (idempotencyKey) does NOT double-deduct stock', async () => {
  let prod = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  prod.stock = 10;
  prod.isAvailable = true;
  prod.inStock = true;

  const idempotencyKey = 'duplicate-protection-key-' + Date.now();
  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 2 }],
      customer: { name: 'Duplicate Patron', phone: '9876543210' },
      idempotencyKey,
    },
    headers: {},
  };

  // 1. Initial submission
  const res1 = createMockRes();
  await createOrder(req, res1);
  assert.equal(res1.statusCode, 201);
  assert.equal(prod.stock, 8, 'Initial order deducts 2 from 10');

  // 2. Duplicate submission
  const res2 = createMockRes();
  await createOrder(req, res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.isDuplicate, true);
  assert.equal(prod.stock, 8, 'Duplicate submission must NOT deduct stock a second time');
});

test('7. Cancelling an order restores the deducted stock and re-enables inStock flag', async () => {
  let prod = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  prod.stock = 5;
  prod.isAvailable = true;
  prod.inStock = true;

  // Place order for 5 (stock drops to 0 and becomes out of stock)
  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 5 }],
      customer: { name: 'Cancel Patron', phone: '9876543210' },
    },
    headers: {},
  };
  const res = createMockRes();
  await createOrder(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(prod.stock, 0);
  assert.equal(prod.inStock, false);

  const orderId = res.body.order.id;

  // Cancel order via status update
  const cancelReq = { params: { id: orderId }, body: { status: 'Cancelled' } };
  const cancelRes = createMockRes();
  await updateOrderStatus(cancelReq, cancelRes);

  assert.equal(cancelRes.statusCode, 200);
  assert.equal(cancelRes.body.order.status, 'Cancelled');
  assert.equal(prod.stock, 5, 'Stock must be restored to 5');
  assert.equal(prod.inStock, true, 'Product must be re-marked as inStock');

  // Redundant cancellation should not double-restore stock
  const cancelReq2 = { params: { id: orderId }, body: { status: 'Cancelled' } };
  const cancelRes2 = createMockRes();
  await updateOrderStatus(cancelReq2, cancelRes2);
  assert.equal(prod.stock, 5, 'Duplicate cancellation must not double-restore stock');
});

test('8. Size variants and Combos correctly validate and decrement stock', async () => {
  // Test 1: Popcorn variant uses parent product stock
  let popcorn = store.products.find((p) => p.id === 'large-popcorn' || p.slug === 'large-popcorn');
  if (!popcorn) {
    popcorn = { id: 'large-popcorn', name: 'Large Popcorn', price: 600, stock: 15, isAvailable: true, inStock: true };
    store.products.push(popcorn);
  }
  popcorn.stock = 15;
  popcorn.isAvailable = true;
  popcorn.inStock = true;

  const popcornReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [
        {
          id: 'large-popcorn',
          variant: { id: 'var-pop-med', name: 'Medium', size: '300g' },
          quantity: 3,
        },
      ],
      customer: { name: 'Variant Patron', phone: '9876543210' },
    },
    headers: {},
  };
  const popcornRes = createMockRes();
  await createOrder(popcornReq, popcornRes);
  assert.equal(popcornRes.statusCode, 201);
  assert.equal(popcorn.stock, 12, 'Large popcorn parent stock must be decremented by 3');

  // Test 2: Combo product stock
  let combo = store.products.find((p) => p.id === 'family-combo' || p.slug === 'family-combo');
  if (!combo) {
    combo = { id: 'family-combo', name: 'Family Combo', price: 1899, stock: 8, isAvailable: true, inStock: true };
    store.products.push(combo);
  }
  combo.stock = 8;
  combo.isAvailable = true;
  combo.inStock = true;

  const comboReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'family-combo', quantity: 2 }],
      customer: { name: 'Combo Patron', phone: '9876543210' },
    },
    headers: {},
  };
  const comboRes = createMockRes();
  await createOrder(comboReq, comboRes);
  assert.equal(comboRes.statusCode, 201);
  assert.equal(combo.stock, 6, 'Family combo stock must be decremented by 2');
});

test('9. Payment failure (TXN_FAILURE) restores deducted stock', async () => {
  let prod = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  prod.stock = 10;
  prod.isAvailable = true;
  prod.inStock = true;

  const orderReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 4 }],
      customer: { name: 'Payment Fail Patron', phone: '9876543210' },
    },
    headers: {},
  };
  const orderRes = createMockRes();
  await createOrder(orderReq, orderRes);
  assert.equal(orderRes.statusCode, 201);
  assert.equal(prod.stock, 6, 'Stock decremented to 6 on order placement');

  const createdOrder = orderRes.body.order;

  // Process payment failure transition
  await paymentService.processPaymentTransition({
    order: createdOrder,
    statusData: { resultStatus: 'TXN_FAILURE', resultMsg: 'Bank payment failed' },
  });

  assert.equal(createdOrder.paymentStatus, 'Failed');
  assert.equal(prod.stock, 10, 'Stock must be restored to 10 on payment failure');
});

test('10. Cancelled order cannot be transitioned to active kitchen statuses', async () => {
  let prod = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  prod.stock = 10;
  prod.isAvailable = true;
  prod.inStock = true;

  const orderReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 2 }],
      customer: { name: 'Cancelled Patron', phone: '9876543210' },
    },
    headers: {},
  };
  const orderRes = createMockRes();
  await createOrder(orderReq, orderRes);
  assert.equal(orderRes.statusCode, 201);
  const createdOrder = orderRes.body.order;

  // Cancel the order
  const cancelReq = { params: { id: createdOrder.id }, body: { status: 'Cancelled' } };
  const cancelRes = createMockRes();
  await updateOrderStatus(cancelReq, cancelRes);
  assert.equal(cancelRes.statusCode, 200);
  assert.equal(cancelRes.body.order.status, 'Cancelled');
  assert.equal(prod.stock, 10, 'Stock restored to 10 upon cancellation');

  // Attempting to transition cancelled order to 'Accepted' or 'Preparing' must be rejected
  const reopenReq = { params: { id: createdOrder.id }, body: { status: 'Accepted' } };
  const reopenRes = createMockRes();
  await updateOrderStatus(reopenReq, reopenRes);
  assert.equal(reopenRes.statusCode, 400);
  assert.match(reopenRes.body.message, /order is cancelled and cannot be transitioned/i);
  assert.equal(prod.stock, 10, 'Stock must not be re-deducted');
});

test('11. Late Paytm success callback on a cancelled order preserves status Cancelled', async () => {
  let prod = store.products.find((p) => p.id === 'water-bottle' || p.slug === 'water-bottle');
  prod.stock = 10;
  prod.isAvailable = true;
  prod.inStock = true;

  const orderReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Late Callback Patron', phone: '9876543210' },
    },
    headers: {},
  };
  const orderRes = createMockRes();
  await createOrder(orderReq, orderRes);
  assert.equal(orderRes.statusCode, 201);
  const createdOrder = orderRes.body.order;

  // Cancel the order
  const cancelReq = { params: { id: createdOrder.id }, body: { status: 'Cancelled' } };
  const cancelRes = createMockRes();
  await updateOrderStatus(cancelReq, cancelRes);
  assert.equal(cancelRes.statusCode, 200);
  assert.equal(prod.stock, 10, 'Stock restored to 10 upon cancellation');

  // Late Paytm callback arrives reporting TXN_SUCCESS
  await paymentService.processPaymentTransition({
    order: createdOrder,
    statusData: {
      resultStatus: 'TXN_SUCCESS',
      txnAmount: String(createdOrder.total),
      txnId: 'PAYTM_LATE_TXN_999',
      paymentMode: 'UPI',
    },
  });

  // Order status must remain 'Cancelled'
  assert.equal(createdOrder.status, 'Cancelled');
  assert.equal(createdOrder.paymentStatus, 'Paid');
  assert.equal(prod.stock, 10, 'Stock must remain 10');
});

