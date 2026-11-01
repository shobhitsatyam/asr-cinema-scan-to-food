const test = require('node:test');
const assert = require('node:assert/strict');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const Seat = require('../src/models/Seat');
const Auditorium = require('../src/models/Auditorium');
const {
  buildCanonicalCatalogPayloads,
  inspectTarget,
  computeOrdersFingerprint,
  auditDatabaseCatalogState,
  generateDryRunReport,
  executeProductionCatalogInit,
} = require('../scripts/initProductionCatalog');

test('1. inspectTarget: strict validation of URI, host, and database name', () => {
  // Valid production target
  const prodTarget = inspectTarget('mongodb+srv://admin:pass@cluster0.xyz.mongodb.net/asr-cinema?retryWrites=true&w=majority');
  assert.equal(prodTarget.isValid, true);
  assert.equal(prodTarget.host, 'cluster0.xyz.mongodb.net');
  assert.equal(prodTarget.dbName, 'asr-cinema');
  assert.equal(prodTarget.isProduction, true);
  assert.equal(prodTarget.isLocal, false);

  // Valid local target
  const localTarget = inspectTarget('mongodb://127.0.0.1:27017/asr-cinema');
  assert.equal(localTarget.isValid, true);
  assert.equal(localTarget.host, '127.0.0.1:27017');
  assert.equal(localTarget.dbName, 'asr-cinema');
  assert.equal(localTarget.isProduction, false);
  assert.equal(localTarget.isLocal, true);

  // Valid staging target
  const stagingTarget = inspectTarget('mongodb+srv://admin:pass@cluster0.xyz.mongodb.net/asr-cinema-staging');
  assert.equal(stagingTarget.isValid, true);
  assert.equal(stagingTarget.host, 'cluster0.xyz.mongodb.net');
  assert.equal(stagingTarget.dbName, 'asr-cinema-staging');
  assert.equal(stagingTarget.isProduction, false);

  // Invalid: Empty URI
  const emptyTarget = inspectTarget('');
  assert.equal(emptyTarget.isValid, false);

  // Invalid: Missing database name in URI (would default to 'test')
  const noDbTarget = inspectTarget('mongodb+srv://admin:pass@cluster0.xyz.mongodb.net/?retryWrites=true');
  assert.equal(noDbTarget.isValid, false);
  assert.match(noDbTarget.reason, /missing/i);

  // Invalid: Unauthorized remote database
  const unauthorizedDb = inspectTarget('mongodb+srv://admin:pass@cluster0.xyz.mongodb.net/some-other-app-db');
  assert.equal(unauthorizedDb.isValid, false);
  assert.match(unauthorizedDb.reason, /not an authorized/i);
});

test('2. buildCanonicalCatalogPayloads: produces exact 7 categories and 43 products with valid schema mappings', () => {
  const catalog = buildCanonicalCatalogPayloads();

  // 1. Categories
  assert.equal(catalog.categories.length, 7, 'Must have exactly 7 canonical categories');
  const catSlugs = new Set(catalog.categories.map((c) => c.slug));
  const expectedSlugs = ['popcorn', 'fries', 'cold-beverages', 'coffee', 'combos', 'veg', 'non-veg'];
  for (const slug of expectedSlugs) {
    assert.ok(catSlugs.has(slug), `Missing expected category slug: ${slug}`);
  }

  // 2. Products
  assert.equal(catalog.products.length, 43, 'Must have exactly 43 canonical products');
  const seenProductIds = new Set();
  for (const p of catalog.products) {
    assert.ok(p.id, 'Product must have an ID');
    assert.ok(!seenProductIds.has(p.id), `Duplicate product ID detected: ${p.id}`);
    seenProductIds.add(p.id);

    assert.ok(p.name, `Product ${p.id} must have a name`);
    assert.ok(p.category, `Product ${p.id} must have a category`);
    assert.ok(catSlugs.has(p.categoryId), `Product ${p.id} categoryId '${p.categoryId}' must match a canonical category slug`);
    assert.ok(typeof p.price === 'number' && p.price > 0, `Product ${p.id} must have a positive price`);
    assert.equal(p.price, p.basePrice, `Product ${p.id} basePrice must equal price`);
    assert.ok(p.type === 'Veg' || p.type === 'Non-Veg', `Product ${p.id} type must be Veg or Non-Veg`);
    assert.equal(p.isVeg, p.type === 'Veg', `Product ${p.id} isVeg must correspond to type`);
  }

  // 3. Specific item integrity checks
  const popcorn = catalog.products.find((p) => p.id === 'large-popcorn');
  assert.ok(popcorn, 'Large Popcorn must exist');
  assert.equal(popcorn.price, 600);
  assert.equal(popcorn.variants.length, 3, 'Popcorn must have 3 variants (Regular, Medium, Large)');
  assert.equal(popcorn.addOns.length, 4, 'Popcorn must have 4 add-ons');

  const water = catalog.products.find((p) => p.id === 'water-bottle');
  assert.ok(water, 'Water Bottle must exist');
  assert.equal(water.price, 30);
  assert.equal(water.category, 'Cold Beverages');
  assert.equal(water.categoryId, 'cold-beverages');
});

test('3. computeOrdersFingerprint: SHA-256 detects any modification in full order documents', async () => {
  const origFind = Order.find;
  const mockOrders = [
    {
      _id: 'order-1',
      id: 'ORD-101',
      total: 630,
      subtotal: 630,
      customer: { name: 'Cinema Guest', phone: '9876543210' },
      items: [{ id: 'large-popcorn', name: 'Large Popcorn', price: 600, quantity: 1, hasWaterBottle: true, waterBottlePrice: 30 }],
      status: 'Served',
      createdAt: '2026-10-30T10:00:00.000Z',
    },
  ];

  try {
    Order.find = () => ({
      sort: () => ({
        lean: async () => JSON.parse(JSON.stringify(mockOrders)),
      }),
    });

    const baseline = await computeOrdersFingerprint();
    assert.equal(baseline.count, 1);
    assert.equal(typeof baseline.hash, 'string');
    assert.equal(baseline.hash.length, 64);

    // Tampering test: Modifying status alters hash
    const tamperedOrders = JSON.parse(JSON.stringify(mockOrders));
    tamperedOrders[0].status = 'Cancelled';

    Order.find = () => ({
      sort: () => ({
        lean: async () => tamperedOrders,
      }),
    });

    const tampered = await computeOrdersFingerprint();
    assert.notEqual(tampered.hash, baseline.hash, 'SHA-256 fingerprint must detect status tampering');
  } finally {
    Order.find = origFind;
  }
});

test('4. generateDryRunReport: accurately plans inserts without mutating database', async () => {
  const mockAudit = {
    ordersCount: 54,
    ordersHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    categoriesCount: 0,
    productsCount: 0,
    auditoriaCount: 3,
    totalSeats: 212,
    missingCategories: buildCanonicalCatalogPayloads().categories,
    missingProducts: buildCanonicalCatalogPayloads().products,
    existingCategories: [],
    existingProducts: [],
  };

  const report = await generateDryRunReport(mockAudit);
  assert.equal(report.plannedChanges.canonicalCategoriesTotal, 7);
  assert.equal(report.plannedChanges.categoriesToInsertCount, 7);
  assert.equal(report.plannedChanges.categoriesToSkipCount, 0);
  assert.equal(report.plannedChanges.canonicalProductsTotal, 43);
  assert.equal(report.plannedChanges.productsToInsertCount, 43);
  assert.equal(report.plannedChanges.productsToSkipCount, 0);

  // Untouched collections must explicitly include orders, auditoria, seats
  const untouchedNames = report.plannedChanges.untouchedCollections.map((u) => u.collection);
  assert.ok(untouchedNames.includes('orders'));
  assert.ok(untouchedNames.includes('auditoria'));
  assert.ok(untouchedNames.includes('seats'));
});

test('5. executeProductionCatalogInit: skips existing records and never overwrites them', async () => {
  const origCategoryFindOne = Category.findOne;
  const origCategoryCreate = Category.create;
  const origProductFindOne = Product.findOne;
  const origProductCreate = Product.create;
  const origOrderFind = Order.find;
  const origAuditoriumCount = Auditorium.countDocuments;
  const origSeatCount = Seat.countDocuments;
  const origCategoryCount = Category.countDocuments;
  const origProductCount = Product.countDocuments;

  const mockDbCategories = new Map();
  const mockDbProducts = new Map();

  // Pre-seed 1 existing category and 1 existing product
  mockDbCategories.set('popcorn', { name: 'Popcorn', slug: 'popcorn', description: 'Existing Popcorn' });
  mockDbProducts.set('large-popcorn', { id: 'large-popcorn', name: 'Large Popcorn', price: 600, category: 'Popcorn' });

  const insertedCategories = [];
  const insertedProducts = [];

  try {
    // Mock Order fingerprint
    Order.find = () => ({
      sort: () => ({
        lean: async () => [{ _id: 'ord-1', id: '#ASR123', total: 600 }],
      }),
    });

    Auditorium.countDocuments = async () => 3;
    Seat.countDocuments = async () => 212;

    Category.countDocuments = async (filter) => {
      if (filter?.isActive) return mockDbCategories.size;
      return mockDbCategories.size;
    };

    Product.countDocuments = async (filter) => {
      if (filter?.isAvailable) return mockDbProducts.size;
      return mockDbProducts.size;
    };

    Category.findOne = (query) => ({
      lean: async () => {
        const slug = query.$or?.[0]?.slug || query.slug;
        return mockDbCategories.get(slug) || null;
      },
    });

    Category.create = async (payload) => {
      insertedCategories.push(payload);
      mockDbCategories.set(payload.slug, payload);
      return payload;
    };

    Product.findOne = (query) => ({
      lean: async () => {
        const id = query.$or?.[0]?.id || query.id;
        return mockDbProducts.get(id) || null;
      },
    });

    Product.create = async (payload) => {
      insertedProducts.push(payload);
      mockDbProducts.set(payload.id, payload);
      return payload;
    };

    Category.find = () => ({
      lean: async () => Array.from(mockDbCategories.values()),
    });

    Product.find = () => ({
      lean: async () => Array.from(mockDbProducts.values()),
    });

    const result = await executeProductionCatalogInit();

    // Verification:
    // Out of 7 categories: 1 existed (popcorn) -> 6 inserted, 1 skipped
    assert.equal(result.categoriesInserted, 6);
    assert.equal(result.categoriesSkipped, 1);

    // Out of 43 products: 1 existed (large-popcorn) -> 42 inserted, 1 skipped
    assert.equal(result.productsInserted, 42);
    assert.equal(result.productsSkipped, 1);

    // Ensure the existing popcorn document was NOT overwritten
    assert.equal(mockDbCategories.get('popcorn').description, 'Existing Popcorn', 'Existing category must remain untouched');
  } finally {
    Category.findOne = origCategoryFindOne;
    Category.create = origCategoryCreate;
    Product.findOne = origProductFindOne;
    Product.create = origProductCreate;
    Order.find = origOrderFind;
    Auditorium.countDocuments = origAuditoriumCount;
    Seat.countDocuments = origSeatCount;
    Category.countDocuments = origCategoryCount;
    Product.countDocuments = origProductCount;
  }
});

