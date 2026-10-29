const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const Order = require('../src/models/Order');
const {
  getMenu,
  getCategories,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  toggleProductAvailability,
  deleteProduct,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
} = require('../src/controllers/menuController');
const { requireAdminAuth } = require('../src/middleware/adminAuth');
const { createOrder } = require('../src/controllers/orderController');
const { validateAndCalculateItem, findCatalogProduct } = require('../src/data/catalog');
const env = require('../src/config/env');

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
  };
}

test('1. Product schema validation and default value hooks', () => {
  const prod = new Product({
    id: 'test-cheese-popcorn',
    name: 'Gourmet Cheese Popcorn',
    category: 'Popcorn',
    price: 450,
  });

  assert.equal(prod.id, 'test-cheese-popcorn');
  assert.equal(prod.name, 'Gourmet Cheese Popcorn');
  assert.equal(prod.category, 'Popcorn');
  assert.equal(prod.price, 450);
  assert.equal(prod.isAvailable, true, 'Default isAvailable must be true');
  assert.equal(prod.inStock, true, 'Default inStock must be true');
  assert.equal(prod.type, 'Veg');
});

test('2. Existing product ID compatibility across catalog aliases', () => {
  const idsToVerify = [
    'large-popcorn',
    'popcorn-large',
    'popcorn-medium',
    'popcorn-regular',
    'p1',
    'popcorn',
    'french-fry',
    'fries-french',
    'fries-cheesy',
    'fc-1',
    'cc-1',
    'water-bottle',
    'samosa',
  ];

  for (const id of idsToVerify) {
    const found = findCatalogProduct(id);
    assert.ok(found, `Product identifier '${id}' must be recognized in authoritative catalog.`);
    assert.ok(found.basePrice > 0, `Base price for '${id}' must be positive.`);
  }
});

test('3. Database menu retrieval returns MongoDB categories and products when connected', async () => {
  const origCatFind = Category.find;
  const origProdFind = Product.find;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    Category.find = () => ({
      sort: () => ({
        lean: async () => [
          { _id: 'cat-1', name: 'Popcorn', slug: 'popcorn', isActive: true },
          { _id: 'cat-2', name: 'Fries', slug: 'fries', isActive: true },
        ],
      }),
    });

    Product.find = () => ({
      sort: () => ({
        lean: async () => [
          { _id: 'prod-101', id: 'french-fry', name: 'French Fry', category: 'Fries', price: 240, isAvailable: true },
          { _id: 'prod-102', id: 'large-popcorn', name: 'Large Popcorn', category: 'Popcorn', price: 600, isAvailable: true },
        ],
      }),
    });

    const res = createMockRes();
    await getMenu({}, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.categories.length, 2);
    assert.equal(res.body.products.length, 2);
    assert.equal(res.body.products[0].name, 'French Fry');
  } finally {
    Category.find = origCatFind;
    Product.find = origProdFind;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('4. Database menu retrieval fails closed with 503 in production during database outage', async () => {
  const origEnv = env.nodeEnv;
  env.nodeEnv = 'production';

  try {
    // When DB is disconnected (readyState !== 1)
    assert.notEqual(mongoose.connection.readyState, 1);

    const res = createMockRes();
    await getMenu({}, res);

    assert.equal(res.statusCode, 503, 'Must return 503 Service Unavailable when DB is down in production');
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Database service is currently unavailable/i);
  } finally {
    env.nodeEnv = origEnv;
  }
});

test('5. Single product retrieval by ID returns product from database', async () => {
  const origProdFindOne = Product.findOne;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    Product.findOne = () => ({
      lean: async () => ({
        _id: 'db-prod-99',
        id: 'cheesy-fries',
        name: 'Cheesy Fries',
        category: 'Fries',
        price: 260,
        isAvailable: true,
      }),
    });

    const req = { params: { id: 'cheesy-fries' } };
    const res = createMockRes();
    await getProductById(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.product.name, 'Cheesy Fries');
    assert.equal(res.body.product.price, 260);
  } finally {
    Product.findOne = origProdFindOne;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('6. Authoritative price calculation enforces server prices and rejects client tampering', async () => {
  const mockDbProduct = {
    id: 'large-popcorn',
    name: 'Large Popcorn',
    category: 'Popcorn',
    price: 600,
    basePrice: 600,
    isAvailable: true,
    inStock: true,
    variants: [
      { id: 'v-reg', name: 'Regular', size: '170g', price: 400 },
      { id: 'v-med', name: 'Medium', size: '300g', price: 500 },
    ],
    addOns: [{ id: 'a-cheese', name: 'Cheese', price: 50 }],
  };

  // Client attempts to claim unit price is 1.00 and total is 1.00
  const tamperedItem = {
    id: 'large-popcorn',
    name: 'Large Popcorn',
    price: 1,
    total: 1,
    quantity: 2,
    variant: { name: 'Medium' }, // Authoritative variant price: 500
    addOns: [{ id: 'a-cheese' }], // Authoritative add-on: 50
  };

  const result = validateAndCalculateItem(tamperedItem, mockDbProduct);
  assert.equal(result.valid, true);
  // Authoritative: 500 (Medium) + 50 (Cheese) = 550 unitPrice, * 2 = 1100 total
  assert.equal(result.normalizedItem.price, 550, 'Client price must be ignored; authoritative unit price is 550');
  assert.equal(result.normalizedItem.total, 1100, 'Authoritative total for 2 items must be 1100');
});

test('7. Unavailable product (isAvailable: false) is rejected during order creation', async () => {
  const origFindOne = Product.findOne;
  const Seat = require('../src/models/Seat');
  const origSeatFindOne = Seat.findOne;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    Seat.findOne = () => ({
      lean: async () => ({
        auditoriumName: 'Audi 2',
        seatNumber: 'B16',
        token: 'audi2-b16',
        status: 'active',
      }),
    });

    // Mock product in DB with isAvailable: false (marked sold out by kitchen manager)
    Product.findOne = () => ({
      lean: async () => ({
        id: 'french-fry',
        name: 'French Fry',
        category: 'Fries',
        price: 240,
        isAvailable: false, // SOLD OUT!
        inStock: false,
      }),
    });

    const req = {
      body: {
        seatToken: 'audi2-b16',
        items: [{ id: 'french-fry', quantity: 1 }],
        customer: { name: 'Cinema Guest', phone: '9876543210' },
      },
    };
    const res = createMockRes();

    await createOrder(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /currently unavailable \/ sold out/i);
  } finally {
    Product.findOne = origFindOne;
    Seat.findOne = origSeatFindOne;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('8. Out of stock product (inStock: false) is rejected during order validation', () => {
  const outOfStockProduct = {
    id: 'water-bottle',
    name: 'Water Bottle',
    price: 30,
    isAvailable: true,
    inStock: false, // Out of stock!
  };

  const result = validateAndCalculateItem({ id: 'water-bottle', quantity: 1 }, outOfStockProduct);
  assert.equal(result.valid, false);
  assert.match(result.error, /currently unavailable \/ sold out/i);
});

test('9. Empty database behavior returns empty list gracefully without throwing', async () => {
  const origCatFind = Category.find;
  const origProdFind = Product.find;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    Category.find = () => ({
      sort: () => ({
        lean: async () => [],
      }),
    });

    Product.find = () => ({
      sort: () => ({
        lean: async () => [],
      }),
    });

    const res = createMockRes();
    await getMenu({}, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.categories));
    assert.ok(Array.isArray(res.body.products));
  } finally {
    Category.find = origCatFind;
    Product.find = origProdFind;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('10. getCategories and getProducts filter by category and availability when DB connected', async () => {
  const origCatFind = Category.find;
  const origProdFind = Product.find;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    Category.find = (query) => {
      assert.equal(query.isActive, true);
      return {
        sort: () => ({
          lean: async () => [
            { _id: 'cat-1', name: 'Popcorn', slug: 'popcorn', isActive: true },
          ],
        }),
      };
    };

    let receivedQuery = null;
    Product.find = (query) => {
      receivedQuery = query;
      return {
        sort: () => ({
          lean: async () => [
            { _id: 'prod-1', id: 'french-fry', name: 'French Fry', category: 'Fries', price: 240, isAvailable: true, inStock: true },
          ],
        }),
      };
    };

    const catRes = createMockRes();
    await getCategories({}, catRes);
    assert.equal(catRes.statusCode, 200);
    assert.equal(catRes.body.categories.length, 1);
    assert.equal(catRes.body.categories[0].name, 'Popcorn');

    const prodRes = createMockRes();
    await getProducts({ query: { category: 'Fries', availableOnly: 'true' } }, prodRes);
    assert.equal(prodRes.statusCode, 200);
    assert.equal(prodRes.body.products.length, 1);
    assert.equal(receivedQuery.isAvailable, true);
    assert.equal(receivedQuery.inStock, true);
  } finally {
    Category.find = origCatFind;
    Product.find = origProdFind;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('11. Regression test: connected empty database returns empty results without mock fallback', async () => {
  const origCatFind = Category.find;
  const origProdFind = Product.find;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    Category.find = () => ({ sort: () => ({ lean: async () => [] }) });
    Product.find = () => ({ sort: () => ({ lean: async () => [] }) });

    // 1. getMenu returns empty categories and empty products
    const menuRes = createMockRes();
    await getMenu({}, menuRes);
    assert.equal(menuRes.statusCode, 200);
    assert.equal(menuRes.body.success, true);
    assert.deepEqual(menuRes.body.categories, [], 'Must return empty categories when connected DB is empty');
    assert.deepEqual(menuRes.body.products, [], 'Must return empty products when connected DB is empty');

    // 2. getCategories returns empty array
    const catRes = createMockRes();
    await getCategories({}, catRes);
    assert.equal(catRes.statusCode, 200);
    assert.deepEqual(catRes.body.categories, [], 'Must return empty array for categories');

    // 3. getProducts returns empty array
    const prodRes = createMockRes();
    await getProducts({ query: {} }, prodRes);
    assert.equal(prodRes.statusCode, 200);
    assert.deepEqual(prodRes.body.products, [], 'Must return empty array for products');
  } finally {
    Category.find = origCatFind;
    Product.find = origProdFind;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('12. Popcorn variants cart identity and authoritative price validation', () => {
  // A. Unmapped variant ID without parent product must fail
  const rawVariantResult = validateAndCalculateItem({ productId: 'var-pop-reg', quantity: 1 });
  assert.equal(rawVariantResult.valid, false, 'Unmapped variant ID var-pop-reg must fail without parent product or alias mapping');

  // B. Regular Popcorn variant via parent product ID
  const regularResult = validateAndCalculateItem({
    productId: 'large-popcorn',
    variant: { id: 'var-pop-reg', name: 'Regular' },
    quantity: 1,
  });
  assert.equal(regularResult.valid, true);
  assert.equal(regularResult.normalizedItem.price, 400);
  assert.equal(regularResult.normalizedItem.total, 400);
  assert.equal(regularResult.normalizedItem.variant.name, 'Regular');

  // C. Medium Popcorn variant via variantId
  const mediumResult = validateAndCalculateItem({
    productId: 'large-popcorn',
    variantId: 'var-pop-med',
    quantity: 2,
  });
  assert.equal(mediumResult.valid, true);
  assert.equal(mediumResult.normalizedItem.price, 500);
  assert.equal(mediumResult.normalizedItem.total, 1000);
  assert.equal(mediumResult.normalizedItem.variant.name, 'Medium');

  // D. Large Popcorn variant
  const largeResult = validateAndCalculateItem({
    productId: 'large-popcorn',
    variant: { id: 'var-pop-lrg', name: 'Large' },
    quantity: 1,
  });
  assert.equal(largeResult.valid, true);
  assert.equal(largeResult.normalizedItem.price, 600);
  assert.equal(largeResult.normalizedItem.total, 600);

  // E. Popcorn with Cheese Add-On (+50)
  const regularWithCheese = validateAndCalculateItem({
    productId: 'large-popcorn',
    variant: { id: 'var-pop-reg', name: 'Regular' },
    addOns: [{ id: 'popcorn-cheese', name: 'Cheese', price: 999 }], // Client tampered add-on price
    quantity: 1,
  });
  assert.equal(regularWithCheese.valid, true);
  assert.equal(regularWithCheese.normalizedItem.price, 450, 'Authoritative price: 400 base + 50 cheese');
  assert.equal(regularWithCheese.normalizedItem.total, 450);

  // F. Client price tampering on variant is rejected
  const tamperedResult = validateAndCalculateItem({
    productId: 'large-popcorn',
    variant: { id: 'var-pop-reg', name: 'Regular', price: 10 },
    price: 10,
    total: 10,
    quantity: 1,
  });
  assert.equal(tamperedResult.valid, true);
  assert.equal(tamperedResult.normalizedItem.price, 400, 'Must enforce catalog price 400, ignoring client price 10');
  assert.equal(tamperedResult.normalizedItem.total, 400);
});

test('13. Admin Product CRUD API endpoints and input validation', async () => {
  // A. Validation: missing name
  const resBadName = createMockRes();
  await createProduct({ body: { category: 'Popcorn', price: 200 } }, resBadName);
  assert.equal(resBadName.statusCode, 400);
  assert.match(resBadName.body.message, /name is required/i);

  // B. Validation: missing category
  const resBadCat = createMockRes();
  await createProduct({ body: { name: 'Nachos', price: 200 } }, resBadCat);
  assert.equal(resBadCat.statusCode, 400);
  assert.match(resBadCat.body.message, /category is required/i);

  // C. Validation: negative price
  const resBadPrice = createMockRes();
  await createProduct({ body: { name: 'Nachos', category: 'Snacks', price: -50 } }, resBadPrice);
  assert.equal(resBadPrice.statusCode, 400);
  assert.match(resBadPrice.body.message, /Price must be a valid non-negative number/i);

  // D. Create product in development store
  const resCreate = createMockRes();
  await createProduct({
    body: {
      name: 'Loaded Nachos',
      category: 'Snacks',
      price: 320,
      type: 'Veg',
      description: 'Crispy corn nachos with salsa',
    },
  }, resCreate);
  assert.equal(resCreate.statusCode, 201);
  assert.equal(resCreate.body.success, true);
  assert.equal(resCreate.body.product.name, 'Loaded Nachos');
  assert.equal(resCreate.body.product.price, 320);

  // E. Update product
  const prodId = resCreate.body.product.id;
  const resUpdate = createMockRes();
  await updateProduct({ params: { id: prodId }, body: { price: 350 } }, resUpdate);
  assert.equal(resUpdate.statusCode, 200);
  assert.equal(resUpdate.body.product.price, 350);

  // F. Toggle availability
  const resToggle = createMockRes();
  await toggleProductAvailability({ params: { id: prodId }, body: { isAvailable: false } }, resToggle);
  assert.equal(resToggle.statusCode, 200);
  assert.equal(resToggle.body.isAvailable, false);
});

test('14. Safe deactivation: prevent accidental deletion of product referenced by existing order', async () => {
  const origOrderExists = Order.exists;
  const origProdFindOne = Product.findOne;
  const origProdDelete = Product.deleteOne;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    let savedAvailability = true;
    const fakeProductDoc = {
      _id: new mongoose.Types.ObjectId(),
      id: 'prod-referenced-1',
      name: 'Order-Referenced Samosa',
      category: 'Fries',
      isAvailable: true,
      inStock: true,
      save: async function () {
        savedAvailability = this.isAvailable;
        return this;
      },
      toObject: function () {
        return { ...this, isAvailable: savedAvailability, inStock: savedAvailability };
      },
    };

    Product.findOne = () => fakeProductDoc;
    // Simulate that product is referenced in customer orders
    Order.exists = async () => true;

    let deleteCalled = false;
    Product.deleteOne = async () => { deleteCalled = true; };

    const res = createMockRes();
    await deleteProduct({ params: { id: 'prod-referenced-1' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.deactivated, true, 'Product must be safely deactivated instead of deleted');
    assert.equal(deleteCalled, false, 'Product.deleteOne must NOT be called when referenced in orders');
    assert.equal(savedAvailability, false, 'Product isAvailable must be set to false');
  } finally {
    Order.exists = origOrderExists;
    Product.findOne = origProdFindOne;
    Product.deleteOne = origProdDelete;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('15. Admin Category CRUD API endpoints and validation', async () => {
  // A. Validation: missing category name
  const resBad = createMockRes();
  await createCategory({ body: {} }, resBad);
  assert.equal(resBad.statusCode, 400);

  // B. Create category
  const resCreate = createMockRes();
  await createCategory({
    body: {
      name: 'Gourmet Desserts',
      description: 'Churros and brownies',
      iconName: 'Cookie',
    },
  }, resCreate);
  assert.equal(resCreate.statusCode, 201);
  assert.equal(resCreate.body.category.name, 'Gourmet Desserts');
  assert.equal(resCreate.body.category.slug, 'gourmet-desserts');

  // C. Update category
  const catSlug = resCreate.body.category.slug;
  const resUpdate = createMockRes();
  await updateCategory({ params: { id: catSlug }, body: { description: 'Updated dessert description' } }, resUpdate);
  assert.equal(resUpdate.statusCode, 200);
  assert.equal(resUpdate.body.category.description, 'Updated dessert description');

  // D. Toggle category status
  const resToggle = createMockRes();
  await toggleCategoryStatus({ params: { id: catSlug }, body: { isActive: false } }, resToggle);
  assert.equal(resToggle.statusCode, 200);
  assert.equal(resToggle.body.isActive, false);
});

test('16. Safe deactivation: prevent accidental deletion of category with active products or orders', async () => {
  const origCatFindOne = Category.findOne;
  const origCatDelete = Category.deleteOne;
  const origProdCount = Product.countDocuments;
  const origOrderExists = Order.exists;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    let savedIsActive = true;
    const fakeCatDoc = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Active Popcorn Category',
      slug: 'active-popcorn-category',
      isActive: true,
      save: async function () {
        savedIsActive = this.isActive;
        return this;
      },
      toObject: function () {
        return { ...this, isActive: savedIsActive };
      },
    };

    Category.findOne = () => fakeCatDoc;
    // Simulate that active products exist in this category
    Product.countDocuments = async () => 3;
    Order.exists = async () => false;

    let deleteCalled = false;
    Category.deleteOne = async () => { deleteCalled = true; };

    const res = createMockRes();
    await deleteCategory({ params: { id: 'active-popcorn-category' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.deactivated, true, 'Category must be safely deactivated instead of deleted');
    assert.equal(deleteCalled, false, 'Category.deleteOne must NOT be called when products exist');
    assert.equal(savedIsActive, false, 'Category isActive must be set to false');
  } finally {
    Category.findOne = origCatFindOne;
    Category.deleteOne = origCatDelete;
    Product.countDocuments = origProdCount;
    Order.exists = origOrderExists;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('17. Admin write authorization: requireAdminAuth blocks unauthorized writes', () => {
  const origKey = env.adminApiKey;
  const origEnv = env.nodeEnv;

  try {
    // A. With configured key: valid key allows write
    env.adminApiKey = 'super-secret-admin-key';
    let nextCalled = false;
    const reqWithKey = { headers: { 'x-admin-key': 'super-secret-admin-key' } };
    const resGood = createMockRes();
    requireAdminAuth(reqWithKey, resGood, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Matching x-admin-key must pass');

    // B. With configured key: missing key rejected with 401
    nextCalled = false;
    const reqNoKey = { headers: {} };
    const resNoKey = createMockRes();
    requireAdminAuth(reqNoKey, resNoKey, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(resNoKey.statusCode, 401, 'Missing key must reject with 401');

    // C. With configured key: wrong key rejected with 401
    nextCalled = false;
    const reqWrongKey = { headers: { 'x-admin-key': 'wrong-key' } };
    const resWrongKey = createMockRes();
    requireAdminAuth(reqWrongKey, resWrongKey, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(resWrongKey.statusCode, 401, 'Wrong key must reject with 401');

    // D. Production fail-closed when key unconfigured
    env.adminApiKey = '';
    env.nodeEnv = 'production';
    nextCalled = false;
    const reqProd = { headers: {} };
    const resProd = createMockRes();
    requireAdminAuth(reqProd, resProd, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(resProd.statusCode, 503, 'Unconfigured key in production must fail closed with 503');
  } finally {
    env.adminApiKey = origKey;
    env.nodeEnv = origEnv;
  }
});


