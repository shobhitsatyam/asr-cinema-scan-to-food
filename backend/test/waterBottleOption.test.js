const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { validateAndCalculateItem } = require('../src/data/catalog');
const { createOrder } = require('../src/controllers/orderController');
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

test('1. validateAndCalculateItem: single food item with water bottle adds flat ₹30 charge', () => {
  const item = {
    productId: 'large-popcorn',
    quantity: 1,
    hasWaterBottle: true,
  };
  const result = validateAndCalculateItem(item);
  assert.equal(result.valid, true);
  assert.equal(result.normalizedItem.price, 600, 'Base unit price is ₹600');
  assert.equal(result.normalizedItem.hasWaterBottle, true);
  assert.equal(result.normalizedItem.waterBottlePrice, 30);
  assert.equal(result.normalizedItem.total, 630, 'Total must be ₹600 + ₹30 = ₹630');
});

test('2. validateAndCalculateItem: Popcorn quantity 5 + water bottle = ₹3030 (flat ₹30, NOT ₹150)', () => {
  const item = {
    productId: 'large-popcorn',
    quantity: 5,
    hasWaterBottle: true,
  };
  const result = validateAndCalculateItem(item);
  assert.equal(result.valid, true);
  assert.equal(result.normalizedItem.quantity, 5);
  assert.equal(result.normalizedItem.price, 600);
  assert.equal(result.normalizedItem.hasWaterBottle, true);
  assert.equal(result.normalizedItem.waterBottlePrice, 30);
  assert.equal(result.normalizedItem.total, 3030, 'Total must be (600 * 5) + 30 = ₹3030, strictly NOT ₹150 for 5 bottles');
});

test('3. validateAndCalculateItem: item with water bottle unchecked charges ₹0 bottle fee', () => {
  const itemWithFalse = {
    productId: 'large-popcorn',
    quantity: 5,
    hasWaterBottle: false,
  };
  const resultFalse = validateAndCalculateItem(itemWithFalse);
  assert.equal(resultFalse.valid, true);
  assert.equal(resultFalse.normalizedItem.hasWaterBottle, false);
  assert.equal(resultFalse.normalizedItem.waterBottlePrice, 0);
  assert.equal(resultFalse.normalizedItem.total, 3000, 'Total must be 600 * 5 = ₹3000');

  const itemOmitted = {
    productId: 'large-popcorn',
    quantity: 5,
  };
  const resultOmitted = validateAndCalculateItem(itemOmitted);
  assert.equal(resultOmitted.valid, true);
  assert.equal(resultOmitted.normalizedItem.hasWaterBottle, false);
  assert.equal(resultOmitted.normalizedItem.waterBottlePrice, 0);
  assert.equal(resultOmitted.normalizedItem.total, 3000);
});

test('4. validateAndCalculateItem: multiple independent food items with mixed bottle selections', () => {
  // Line 1: Popcorn qty 2 with water bottle = (600 * 2) + 30 = 1230
  const line1 = validateAndCalculateItem({
    productId: 'large-popcorn',
    quantity: 2,
    hasWaterBottle: true,
  });
  // Line 2: French Fry qty 1 without bottle = 240
  const line2 = validateAndCalculateItem({
    productId: 'french-fry',
    quantity: 1,
    hasWaterBottle: false,
  });
  // Line 3: Cheesy Fries qty 3 with water bottle = (260 * 3) + 30 = 810
  const line3 = validateAndCalculateItem({
    productId: 'cheesy-fries',
    quantity: 3,
    hasWaterBottle: true,
  });

  assert.equal(line1.valid, true);
  assert.equal(line1.normalizedItem.total, 1230);
  assert.equal(line1.normalizedItem.hasWaterBottle, true);

  assert.equal(line2.valid, true);
  assert.equal(line2.normalizedItem.total, 240);
  assert.equal(line2.normalizedItem.hasWaterBottle, false);

  assert.equal(line3.valid, true);
  assert.equal(line3.normalizedItem.total, 810);
  assert.equal(line3.normalizedItem.hasWaterBottle, true);

  const orderSubtotal = line1.normalizedItem.total + line2.normalizedItem.total + line3.normalizedItem.total;
  assert.equal(orderSubtotal, 2280, 'Subtotal: 1230 + 240 + 810 = ₹2280');
});

test('5. validateAndCalculateItem: same product in separate cart lines with different bottle selections', () => {
  // Same food product (large-popcorn) in two cart lines: one with bottle, one without
  const lineWithBottle = validateAndCalculateItem({
    productId: 'large-popcorn',
    quantity: 1,
    hasWaterBottle: true,
  });
  const lineWithoutBottle = validateAndCalculateItem({
    productId: 'large-popcorn',
    quantity: 1,
    hasWaterBottle: false,
  });

  assert.equal(lineWithBottle.valid, true);
  assert.equal(lineWithBottle.normalizedItem.total, 630);
  assert.equal(lineWithBottle.normalizedItem.hasWaterBottle, true);

  assert.equal(lineWithoutBottle.valid, true);
  assert.equal(lineWithoutBottle.normalizedItem.total, 600);
  assert.equal(lineWithoutBottle.normalizedItem.hasWaterBottle, false);

  const combinedTotal = lineWithBottle.normalizedItem.total + lineWithoutBottle.normalizedItem.total;
  assert.equal(combinedTotal, 1230, 'Total for both independent lines is 630 + 600 = ₹1230');
});

test('6. validateAndCalculateItem: authoritative price calculation rejects client tampering', () => {
  const tamperedItem = {
    productId: 'large-popcorn',
    quantity: 2,
    hasWaterBottle: true,
    price: 10,       // Client claims unit price is 10
    total: 20,       // Client claims total is 20
    waterBottlePrice: 0, // Client claims water bottle is 0
  };
  const result = validateAndCalculateItem(tamperedItem);
  assert.equal(result.valid, true);
  assert.equal(result.normalizedItem.price, 600, 'Server enforces authoritative catalog price 600');
  assert.equal(result.normalizedItem.waterBottlePrice, 30, 'Server enforces authoritative ₹30 bottle price');
  assert.equal(result.normalizedItem.total, 1230, 'Server enforces authoritative total (600 * 2) + 30 = 1230');
});

test('7. createOrder controller: persists hasWaterBottle and waterBottlePrice in order payload', async () => {
  // Ensure seat exists in store for local dev environment
  if (!store.seats.some((s) => s.token === 'audi2-b16')) {
    store.seats.push({
      token: 'audi2-b16',
      seatNumber: 'B16',
      auditoriumName: 'Audi 2',
      status: 'active',
    });
  }

  const req = {
    body: {
      seatToken: 'audi2-b16',
      customer: {
        name: 'Arun Kumar',
        phone: '9876543210',
      },
      items: [
        {
          productId: 'large-popcorn',
          quantity: 5,
          hasWaterBottle: true,
          total: 9999, // Intentional client mismatch to verify server-side calculation
        },
        {
          productId: 'french-fry',
          quantity: 2,
          hasWaterBottle: false,
        },
      ],
      paymentMethod: 'UPI',
    },
    headers: {},
  };

  const res = createMockRes();
  await createOrder(req, res);

  assert.equal(res.statusCode, 201);
  assert.ok(res.body);
  assert.equal(res.body.success, true);
  assert.ok(res.body.order);

  const order = res.body.order;
  assert.equal(order.items.length, 2);

  // Line 1: Popcorn qty 5 + water bottle
  const popcornLine = order.items[0];
  assert.equal(popcornLine.hasWaterBottle, true);
  assert.equal(popcornLine.waterBottlePrice, 30);
  assert.equal(popcornLine.quantity, 5);
  assert.equal(popcornLine.total, 3030, 'Popcorn total: (600 * 5) + 30 = 3030');

  // Line 2: French Fry qty 2 without water bottle
  const fryLine = order.items[1];
  assert.equal(fryLine.hasWaterBottle, false);
  assert.equal(fryLine.waterBottlePrice, 0);
  assert.equal(fryLine.quantity, 2);
  assert.equal(fryLine.total, 480, 'Fry total: 240 * 2 = 480');

  // Authoritative Order Totals
  assert.equal(order.subtotal, 3510, 'Subtotal: 3030 + 480 = 3510');
  assert.equal(order.total, 3510, 'Total: 3510');
});
