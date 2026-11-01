const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  NON_VEG_PRODUCTS,
  inspectTarget,
  generateDryRunPlan,
  executeMigration,
} = require('../scripts/migrateVegNonVegCatalog');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const Order = require('../src/models/Order');

test('1. inspectTarget: strict validation of URI and database name', () => {
  // Valid target
  const validAtlas = inspectTarget('mongodb+srv://admin:secret123@cluster0.xyz.mongodb.net/asr-cinema?retryWrites=true&w=majority');
  assert.equal(validAtlas.isValid, true);
  assert.equal(validAtlas.dbName, 'asr-cinema');
  assert.equal(validAtlas.isAtlas, true);

  // Invalid: missing URI
  const missing = inspectTarget('');
  assert.equal(missing.isValid, false);

  // Invalid: wrong database name
  const wrongDb = inspectTarget('mongodb+srv://admin:pass@cluster0.xyz.mongodb.net/wrong-db?retryWrites=true');
  assert.equal(wrongDb.isValid, false);
  assert.match(wrongDb.reason, /Expected exact database name 'asr-cinema'/);
});

test('2. NON_VEG_PRODUCTS: contains exact 18 items with valid portions, prices, and categories', () => {
  assert.equal(NON_VEG_PRODUCTS.length, 18, 'Must have exactly 18 non-veg products');

  const ids = new Set();
  let existingCount = 0;
  let newCount = 0;

  for (const item of NON_VEG_PRODUCTS) {
    assert.ok(item.id, 'Item must have an id');
    assert.ok(!ids.has(item.id), `Duplicate ID detected: ${item.id}`);
    ids.add(item.id);

    assert.ok(item.name, `Item ${item.id} must have a name`);
    assert.ok(item.portion, `Item ${item.id} must have a portion`);
    assert.ok(typeof item.price === 'number' && item.price > 0, `Item ${item.id} must have a positive price`);
    assert.equal(item.category, 'Non-Veg', `Item ${item.id} must belong to category Non-Veg`);

    if (item.isExisting) {
      existingCount++;
    } else {
      newCount++;
    }
  }

  assert.equal(existingCount, 4, 'Exactly 4 items must be marked as existing');
  assert.equal(newCount, 14, 'Exactly 14 items must be marked as new');
});

test('3. generateDryRunPlan: accurately plans backfills and inserts in mock database', async () => {
  // Use mock data by temporarily mocking Product.find and Category.find
  const originalProductFind = Product.find;
  const originalCategoryFind = Category.find;

  const mockExistingProducts = [
    { id: 'veg-grilled-sandwich', name: 'Veg Sandwich', type: 'Veg', isVeg: true, foodType: undefined },
    { id: 'chicken-grilled-sandwich', name: 'Chicken Grilled Sandwich', type: 'Veg', isVeg: true, foodType: undefined }, // Needs Non-Veg backfill
    { id: 'french-fry', name: 'French Fry', type: 'Veg', isVeg: true, foodType: 'veg' }, // Already veg
  ];

  Product.find = () => ({
    sort: () => ({
      lean: async () => mockExistingProducts,
    }),
  });

  Category.find = () => ({
    sort: () => ({
      lean: async () => [{ name: 'Veg', slug: 'veg' }, { name: 'Non-Veg', slug: 'non-veg' }],
    }),
  });

  try {
    const plan = await generateDryRunPlan();
    assert.equal(plan.totalExistingProducts, 3);
    assert.equal(plan.totalExistingCategories, 2);

    // veg-grilled-sandwich needs foodType: 'veg', chicken-grilled-sandwich needs foodType: 'non-veg'
    assert.equal(plan.backfillCount, 2);
    // 18 non-veg items - 1 existing (chicken-grilled-sandwich) = 17 new inserts planned
    assert.equal(plan.insertCount, 17);
  } finally {
    Product.find = originalProductFind;
    Category.find = originalCategoryFind;
  }
});

