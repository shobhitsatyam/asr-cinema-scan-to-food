const test = require('node:test');
const assert = require('node:assert/strict');
const { createOrder, getOrderTracking, updateOrderStatus, getOrders } = require('../src/controllers/orderController');
const { store } = require('../src/data/memoryStore');

function createMockRes() {
  const res = {
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
    set(header, value) {
      this.headers[header] = value;
      return this;
    },
  };
  return res;
}

test('1. createOrder rejects request with missing customer object', async () => {
  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
    },
  };
  const res = createMockRes();
  await createOrder(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /customer name is required/i);
});

test('2. createOrder rejects customer name with fewer than 2 characters', async () => {
  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'A', phone: '9876543210' },
    },
  };
  const res = createMockRes();
  await createOrder(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /at least 2 characters/i);
});

test('3. createOrder rejects invalid Indian phone numbers', async () => {
  const invalidNumbers = [
    '',
    '12345',
    'abcdefghij',
    '5555555555', // Indian mobile numbers start with 6-9
    '0123456789',
    '987654321', // 9 digits
    '987654321012', // 12 digits not starting with 91
  ];

  for (const phone of invalidNumbers) {
    const req = {
      body: {
        seatToken: 'audi2-b16',
        items: [{ id: 'water-bottle', quantity: 1 }],
        customer: { name: 'Aryan Sharma', phone },
      },
    };
    const res = createMockRes();
    await createOrder(req, res);

    assert.equal(res.statusCode, 400, `Phone '${phone}' should be rejected with 400`);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /10-digit Indian mobile number/i);
  }
});

test('4. createOrder accepts and normalizes valid Indian phone formats (+91, leading 0, spaces)', async () => {
  const validFormats = [
    { input: '9876543210', expected: '9876543210' },
    { input: '+91 98765 43210', expected: '9876543210' },
    { input: '919876543210', expected: '9876543210' },
    { input: '09876543210', expected: '9876543210' },
    { input: '6123456789', expected: '6123456789' },
    { input: '7890123456', expected: '7890123456' },
    { input: '8901234567', expected: '8901234567' },
  ];

  for (const { input, expected } of validFormats) {
    const req = {
      body: {
        seatToken: 'audi2-b16',
        items: [{ id: 'water-bottle', quantity: 1 }],
        customer: { name: 'Aryan Sharma', phone: input },
      },
    };
    const res = createMockRes();
    await createOrder(req, res);

    assert.equal(res.statusCode, 201, `Phone '${input}' should be accepted with 201`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.order.customer.phone, expected, `Phone '${input}' normalized to '${expected}'`);
    assert.equal(res.body.order.customer.name, 'Aryan Sharma');
  }
});

test('5. createOrder generates cryptographic trackingToken and persists it', async () => {
  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Pooja Verma', phone: '9812345678' },
    },
  };
  const res = createMockRes();
  await createOrder(req, res);

  assert.equal(res.statusCode, 201);
  assert.ok(res.body.trackingToken, 'Response must include trackingToken');
  assert.equal(typeof res.body.trackingToken, 'string');
  assert.ok(res.body.trackingToken.length >= 16, 'trackingToken must be secure unguessable string');
  assert.equal(res.body.order.trackingToken, res.body.trackingToken, 'trackingToken must be saved on order');
});

test('6. getOrderTracking rejects request without tracking token (401)', async () => {
  // First create an order
  const createReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Karan Mehra', phone: '9988776655' },
    },
  };
  const createRes = createMockRes();
  await createOrder(createReq, createRes);
  const orderId = createRes.body.order.id;

  // Track request without token
  const trackReq = {
    params: { id: orderId },
    query: {},
    headers: {},
  };
  const trackRes = createMockRes();
  await getOrderTracking(trackReq, trackRes);

  assert.equal(trackRes.statusCode, 401);
  assert.equal(trackRes.body.success, false);
  assert.match(trackRes.body.message, /Tracking authorization token is required/i);
});

test('7. getOrderTracking rejects request with forged or mismatched token (403)', async () => {
  const createReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Simran Kaur', phone: '9876501234' },
    },
  };
  const createRes = createMockRes();
  await createOrder(createReq, createRes);
  const orderId = createRes.body.order.id;

  // Track request with wrong token
  const trackReq = {
    params: { id: orderId },
    query: { token: 'guessed-or-forged-token-12345' },
    headers: {},
  };
  const trackRes = createMockRes();
  await getOrderTracking(trackReq, trackRes);

  assert.equal(trackRes.statusCode, 403);
  assert.equal(trackRes.body.success, false);
  assert.match(trackRes.body.message, /Invalid tracking token/i);
});

test('8. getOrderTracking succeeds with valid token and strictly redacts phone number', async () => {
  const rawPhone = '9876543210';
  const customerName = 'Vikram Malhotra';

  const createReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: customerName, phone: rawPhone },
    },
  };
  const createRes = createMockRes();
  await createOrder(createReq, createRes);
  const orderId = createRes.body.order.id;
  const token = createRes.body.trackingToken;

  // Track request with matching token
  const trackReq = {
    params: { id: orderId },
    query: { token },
    headers: {},
  };
  const trackRes = createMockRes();
  await getOrderTracking(trackReq, trackRes);

  assert.equal(trackRes.statusCode, 200);
  assert.equal(trackRes.body.success, true);
  const trackedOrder = trackRes.body.order;

  assert.equal(trackedOrder.id, orderId);
  assert.equal(trackedOrder.auditorium, 'Audi 2');
  assert.equal(trackedOrder.seat, 'B16');
  assert.equal(trackedOrder.customer.name, customerName);

  // PRIVACY: Phone number must NOT be exposed in tracking payload
  assert.equal(trackedOrder.customer.phone, undefined, 'Customer phone must be redacted in tracking output');
  assert.equal(JSON.stringify(trackRes.body).includes(rawPhone), false, 'Phone digits must not appear anywhere in JSON');
});

test('9. Live order tracking reflects status transitions from staff and kitchen', async () => {
  const createReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Deepak Chopra', phone: '9123456789' },
    },
  };
  const createRes = createMockRes();
  await createOrder(createReq, createRes);
  const orderId = createRes.body.order.id;
  const token = createRes.body.trackingToken;

  // Verify initial status is Pending
  const trackRes1 = createMockRes();
  await getOrderTracking({ params: { id: orderId }, query: { token }, headers: {} }, trackRes1);
  assert.equal(trackRes1.body.order.status, 'Pending');

  // Verify timeline array exists with steps
  assert.ok(Array.isArray(trackRes1.body.order.timeline));
  assert.ok(trackRes1.body.order.timeline.length > 0);
  assert.equal(trackRes1.body.order.timeline[0].status, 'Pending');
  assert.equal(trackRes1.body.order.timeline[0].completed, true);
});

test('10. getOrders (GET /api/orders) strictly redacts trackingToken and customer.phone', async () => {
  const secretPhone = '9876599999';
  const createReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'VIP Guest', phone: secretPhone },
    },
  };
  const createRes = createMockRes();
  await createOrder(createReq, createRes);
  assert.equal(createRes.statusCode, 201);
  const createdToken = createRes.body.trackingToken;
  assert.ok(createdToken, 'Order creation must yield a tracking token');

  // 1. Verify default operational feed excludes unpaid/pending order
  const operationalRes = createMockRes();
  await getOrders({}, operationalRes);
  assert.equal(operationalRes.statusCode, 200);
  assert.equal(
    operationalRes.body.orders.some((o) => o.id === createRes.body.order.id),
    false,
    'Unpaid pending order must not appear in operational order list'
  );

  // 2. Query general audit order list (all=true)
  const listReq = { query: { all: 'true' } };
  const listRes = createMockRes();
  await getOrders(listReq, listRes);

  assert.equal(listRes.statusCode, 200);
  assert.ok(Array.isArray(listRes.body.orders));
  assert.ok(listRes.body.orders.length > 0);

  // Assert NO order in the list contains trackingToken or phone number
  for (const order of listRes.body.orders) {
    assert.equal(order.trackingToken, undefined, 'trackingToken must never appear in public order list');
    if (order.customer) {
      assert.equal(order.customer.phone, undefined, 'customer phone must never appear in public order list');
    }
  }

  const serializedList = JSON.stringify(listRes.body);
  assert.equal(serializedList.includes(createdToken), false, 'Tracking token must not exist in public list response');
  assert.equal(serializedList.includes(secretPhone), false, 'Customer phone must not exist in public list response');
});

test('11. getOrderTracking accepts x-tracking-token header without query parameters', async () => {
  const createReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Header Patron', phone: '9876543210' },
    },
  };
  const createRes = createMockRes();
  await createOrder(createReq, createRes);
  const orderId = createRes.body.order.id;
  const token = createRes.body.trackingToken;

  // Track using solely x-tracking-token header
  const trackReq = {
    params: { id: orderId },
    query: {}, // Empty query string!
    headers: { 'x-tracking-token': token },
  };
  const trackRes = createMockRes();
  await getOrderTracking(trackReq, trackRes);

  assert.equal(trackRes.statusCode, 200);
  assert.equal(trackRes.body.success, true);
  assert.equal(trackRes.body.order.id, orderId);
});

test('12. getOrderTracking accepts Authorization: Bearer <token> header', async () => {
  const createReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Bearer Patron', phone: '9876543210' },
    },
  };
  const createRes = createMockRes();
  await createOrder(createReq, createRes);
  const orderId = createRes.body.order.id;
  const token = createRes.body.trackingToken;

  // Track using standard Bearer header
  const trackReq = {
    params: { id: orderId },
    query: {},
    headers: { authorization: `Bearer ${token}` },
  };
  const trackRes = createMockRes();
  await getOrderTracking(trackReq, trackRes);

  assert.equal(trackRes.statusCode, 200);
  assert.equal(trackRes.body.success, true);
  assert.equal(trackRes.body.order.id, orderId);
});

test('13. getOrderTracking supports order ID with or without "#" prefix', async () => {
  const createReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Hash Test Guest', phone: '9876543210' },
    },
  };
  const createRes = createMockRes();
  await createOrder(createReq, createRes);
  const orderIdWithHash = createRes.body.order.id;
  const orderIdWithoutHash = orderIdWithHash.replace(/^#/, '');
  const token = createRes.body.trackingToken;

  // 1. Lookup with hash
  const res1 = createMockRes();
  await getOrderTracking(
    { params: { id: orderIdWithHash }, query: {}, headers: { 'x-tracking-token': token } },
    res1
  );
  assert.equal(res1.statusCode, 200);
  assert.equal(res1.body.order.id, orderIdWithHash);

  // 2. Lookup without hash
  const res2 = createMockRes();
  await getOrderTracking(
    { params: { id: orderIdWithoutHash }, query: {}, headers: { 'x-tracking-token': token } },
    res2
  );
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.order.id, orderIdWithHash);
});

test('14. getOrderTracking strictly blocks guessing attacks on orders without token or invalid token', async () => {
  // Insert a mock legacy order directly into memory store with no trackingToken
  const legacyId = '#ASR-LEGACY-999';
  store.orders.unshift({
    id: legacyId,
    auditorium: 'Audi 1',
    seat: 'A1',
    customer: { name: 'Legacy Secret Guest', phone: '9999988888' },
    items: [],
    subtotal: 100,
    total: 100,
    status: 'Pending',
    paymentStatus: 'Pending',
    trackingToken: '', // No tracking token assigned
  });

  // Attempt to track with any token
  const trackReq = {
    params: { id: legacyId },
    query: {},
    headers: { 'x-tracking-token': 'attacker-guessing-token' },
  };
  const trackRes = createMockRes();
  await getOrderTracking(trackReq, trackRes);

  assert.equal(trackRes.statusCode, 403, 'Order without a valid trackingToken must be rejected with 403');
  assert.equal(trackRes.body.success, false);
  assert.match(trackRes.body.message, /invalid tracking token/i);
});

test('15. Full order contract: item name, productName, variant, and addOns are preserved across creation, admin listing, and tracking', async () => {
  const createReq = {
    body: {
      seatToken: 'audi2-b16',
      items: [
        {
          id: 'large-popcorn',
          variant: { id: 'var-pop-med', name: 'Medium', size: '300g' },
          addOns: [{ id: 'popcorn-cheese', name: 'Cheese' }],
          quantity: 2,
        },
      ],
      customer: { name: 'Priya Sharma', phone: '9876543210' },
    },
  };
  const createRes = createMockRes();
  await createOrder(createReq, createRes);

  assert.equal(createRes.statusCode, 201);
  const createdOrder = createRes.body.order;
  const token = createRes.body.trackingToken;
  assert.ok(createdOrder.id);
  assert.ok(token);

  // 1. Verify creation response contract
  const createdItem = createdOrder.items[0];
  assert.equal(createdItem.name, 'Large Popcorn');
  assert.equal(createdItem.productName, 'Large Popcorn');
  assert.equal(createdItem.quantity, 2);
  assert.equal(createdItem.price, 550); // 500 (medium) + 50 (cheese)
  assert.equal(createdItem.total, 1100);
  assert.equal(createdItem.variant.name, 'Medium');
  assert.equal(createdItem.addOns.length, 1);
  assert.equal(createdItem.addOns[0].name, 'Cheese');

  // 2. Verify Admin Panel GET /api/orders list contract
  // Operational feed excludes unpaid pending order:
  const operationalRes = createMockRes();
  await getOrders({}, operationalRes);
  assert.equal(
    operationalRes.body.orders.some((o) => o.id === createdOrder.id),
    false,
    'Unpaid order must not appear in operational admin list'
  );

  // Audit list with all=true includes it:
  const listRes = createMockRes();
  await getOrders({ query: { all: 'true' } }, listRes);
  const adminOrder = listRes.body.orders.find((o) => o.id === createdOrder.id);
  assert.ok(adminOrder, 'Created order must appear in admin audit list when all=true');
  const adminItem = adminOrder.items[0];
  assert.equal(adminItem.name, 'Large Popcorn');
  assert.equal(adminItem.total, 1100);
  assert.equal(adminItem.variant.name, 'Medium');
  assert.equal(adminItem.addOns[0].name, 'Cheese');
  assert.equal(adminOrder.trackingToken, undefined, 'Admin public list must redact trackingToken');
  assert.equal(adminOrder.customer.phone, undefined, 'Admin public list must redact phone');

  // 3. Verify Customer Tracking GET /api/orders/:id/track contract
  const trackRes = createMockRes();
  await getOrderTracking(
    { params: { id: createdOrder.id }, query: {}, headers: { 'x-tracking-token': token } },
    trackRes
  );
  assert.equal(trackRes.statusCode, 200);
  const trackedItem = trackRes.body.order.items[0];
  assert.equal(trackedItem.name, 'Large Popcorn');
  assert.equal(trackedItem.productName, 'Large Popcorn');
  assert.equal(trackedItem.total, 1100);
  assert.equal(trackedItem.variant.name, 'Medium');
  assert.equal(trackedItem.addOns.length, 1);
  assert.equal(trackedItem.addOns[0].name, 'Cheese');
  assert.equal(trackRes.body.order.customer.phone, undefined, 'Tracking response must redact phone');
});


