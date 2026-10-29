const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Seat = require('../src/models/Seat');
const Auditorium = require('../src/models/Auditorium');
const { resolveSeat, listSeats } = require('../src/controllers/seatController');
const { createOrder } = require('../src/controllers/orderController');
const env = require('../src/config/env');
const { store } = require('../src/data/memoryStore');
const { catalogProducts, findCatalogProduct, validateAndCalculateItem } = require('../src/data/catalog');

// Helper to simulate Express res object
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(key, val) {
      this.headers[key] = val;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

test('1. Valid seat resolution preserves existing audi2-b16 demo token', async () => {
  const req = { params: { token: 'audi2-b16' } };
  const res = createMockRes();

  await resolveSeat(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body && res.body.seat);
  assert.equal(res.body.seat.auditorium, 'Audi 2');
  assert.equal(res.body.seat.seatNumber, 'B16');
  assert.equal(res.body.seat.token, 'audi2-b16');
  assert.equal(res.body.seat.status, 'active');
});

test('2. Invalid seat token returns 404', async () => {
  const req = { params: { token: 'invalid-seat-token-999' } };
  const res = createMockRes();

  await resolveSeat(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.seat, null);
  assert.match(res.body.message, /could not be verified/i);
});

test('3. Database seat resolution returns correct auditorium and seat from DB when connected', async () => {
  const origFindOne = Seat.findOne;
  try {
    // Mock Seat.findOne to return a simulated DB document
    Seat.findOne = () => ({
      lean: async () => ({
        _id: 'db-seat-101',
        auditoriumName: 'Audi 1',
        seatNumber: 'A01',
        token: 'audi1-a01',
        status: 'active',
      }),
    });

    // Temporarily mock readyState to 1 (connected)
    const origReadyState = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    const req = { params: { token: 'audi1-a01' } };
    const res = createMockRes();

    await resolveSeat(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.seat.auditorium, 'Audi 1');
    assert.equal(res.body.seat.seatNumber, 'A01');
    assert.equal(res.body.seat.token, 'audi1-a01');

    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  } finally {
    Seat.findOne = origFindOne;
  }
});

test('4. Database failure in production mode does not return fake success', async () => {
  const originalEnv = env.nodeEnv;
  env.nodeEnv = 'production';

  try {
    // When DB is disconnected (readyState !== 1)
    assert.notEqual(mongoose.connection.readyState, 1);

    const req = { params: { token: 'audi1-a01' } };
    const res = createMockRes();

    await resolveSeat(req, res);

    assert.equal(res.statusCode, 503, 'Must return 503 Service Unavailable when DB is down in production');
    assert.equal(res.body.seat, null);
  } finally {
    env.nodeEnv = originalEnv;
  }
});

test('5. Client-manipulated item price and total are ignored in favor of authoritative catalog price', async () => {
  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [
        {
          id: 'large-popcorn',
          productName: 'Large Popcorn',
          price: 1, // Manipulated price! Real base price is 600
          total: 1, // Manipulated total!
          quantity: 2,
        },
      ],
      total: 2, // Manipulated order total! Real total is 1200
      customer: { name: 'Cinema Guest', phone: '9876543210' },
    },
  };
  const res = createMockRes();

  await createOrder(req, res);

  assert.equal(res.statusCode, 201);
  const createdOrder = res.body.order;
  assert.equal(createdOrder.items[0].price, 600, 'Authoritative price must be 600');
  assert.equal(createdOrder.items[0].total, 1200, 'Authoritative item total must be 1200 (600 x 2)');
  assert.equal(createdOrder.subtotal, 1200, 'Authoritative subtotal must be 1200');
  assert.equal(createdOrder.total, 1200, 'Authoritative total must be 1200');
});

test('6. Authoritative price calculation supports variants and add-ons', () => {
  const itemWithVariantAndAddons = {
    productId: 'large-popcorn',
    quantity: 1,
    variant: { name: 'Medium' }, // 500
    addOns: [{ id: 'popcorn-cheese' }], // +50
  };

  const result = validateAndCalculateItem(itemWithVariantAndAddons);
  assert.ok(result.valid);
  assert.equal(result.normalizedItem.price, 550, 'Medium popcorn (500) + Cheese (50) must equal 550');
  assert.equal(result.normalizedItem.total, 550);
});

test('7. Invalid item quantity (<= 0 or non-integer) is rejected with 400', async () => {
  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'large-popcorn', quantity: -2 }],
      customer: { name: 'Cinema Guest', phone: '9876543210' },
    },
  };
  const res = createMockRes();

  await createOrder(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /Invalid quantity/i);
});

test('8. Unknown or unavailable product is rejected with 400', async () => {
  const req = {
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'nonexistent-expensive-steak-999', quantity: 1 }],
      customer: { name: 'Cinema Guest', phone: '9876543210' },
    },
  };
  const res = createMockRes();

  await createOrder(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /not recognized or unavailable/i);
});

test('9. Order idempotency returns existing order without creating duplicate', async () => {
  const testKey = `idemp-${Date.now()}-${Math.random()}`;

  const req = {
    headers: { 'idempotency-key': testKey },
    body: {
      seatToken: 'audi2-b16',
      items: [{ id: 'water-bottle', quantity: 1 }],
      customer: { name: 'Cinema Guest', phone: '9876543210' },
    },
  };
  const res1 = createMockRes();
  await createOrder(req, res1);

  assert.equal(res1.statusCode, 201);
  const orderId = res1.body.order.id;

  // Second identical request with same idempotency key
  const res2 = createMockRes();
  await createOrder(req, res2);

  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.isDuplicate, true);
  assert.equal(res2.body.order.id, orderId, 'Must return the existing order without creating a duplicate');
});
