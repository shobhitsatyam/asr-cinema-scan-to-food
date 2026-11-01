const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const {
  TARGET_IMAGE_UPDATES,
  inspectTarget,
  verifyLocalImageFiles,
  computeOrdersFingerprint,
  generateDryRunReport,
  executeImageUpdates,
  runUpdateWorkflow,
} = require('../scripts/updateProductionProductImages');

test('1. inspectTarget: strict validation of URI, host, and database name', () => {
  // Empty URI
  const emptyRes = inspectTarget('');
  assert.equal(emptyRes.isValid, false);
  assert.equal(emptyRes.reason, 'URI is empty');

  // Wrong database
  const wrongDbRes = inspectTarget('mongodb+srv://admin:pass@cluster0.abc.mongodb.net/wrong-db?retryWrites=true');
  assert.equal(wrongDbRes.isValid, false);
  assert.match(wrongDbRes.reason, /Refusing execution/);

  // Missing database
  const missingDbRes = inspectTarget('mongodb+srv://admin:pass@cluster0.abc.mongodb.net/?retryWrites=true');
  assert.equal(missingDbRes.isValid, false);
  assert.equal(missingDbRes.reason, 'Target database name is missing in URI');

  // Valid target asr-cinema
  const validRes = inspectTarget('mongodb+srv://admin:pass@cluster0.abc.mongodb.net/asr-cinema?retryWrites=true');
  assert.equal(validRes.isValid, true);
  assert.equal(validRes.dbName, 'asr-cinema');
});

test('2. verifyLocalImageFiles: confirms all 12 image files exist in frontend/public', () => {
  const publicDir = path.resolve(__dirname, '../../frontend/public');
  const res = verifyLocalImageFiles(publicDir);

  assert.equal(res.allExist, true, 'All 12 image files must exist in frontend/public');
  assert.equal(res.details.length, 12);
  for (const item of res.details) {
    assert.equal(item.exists, true, `File ${item.file} must exist`);
    assert.ok(item.sizeBytes > 0, `File ${item.file} must not be empty`);
  }
});

test('3. verifyLocalImageFiles: detects missing files in an invalid directory', () => {
  const invalidDir = path.resolve(__dirname, './non-existent-dir');
  const res = verifyLocalImageFiles(invalidDir);
  assert.equal(res.allExist, false);
  assert.ok(res.details.every((d) => !d.exists));
});

test('4. generateDryRunReport: identifies exactly 12 target items and untouched items', async () => {
  // Mock products: 12 target products + 2 untouched products (total 14)
  const mockProducts = TARGET_IMAGE_UPDATES.map((t, idx) => ({
    id: t.id,
    name: `Product ${t.id}`,
    category: 'Test Category',
    price: 100 + idx,
    stock: 50,
    image: `https://unsplash.com/old-${t.id}.jpg`,
  })).concat([
    { id: 'untouched-coffee', name: 'Black Coffee', category: 'Coffee', price: 300, stock: 100, image: '' },
    { id: 'untouched-momos', name: 'Sweet Corn Momo', category: 'Veg', price: 300, stock: 100, image: '' },
  ]);

  const mockProductModel = {
    find: () => ({
      lean: async () => mockProducts,
    }),
  };

  const report = await generateDryRunReport(mockProductModel);
  assert.equal(report.totalProductsInDb, 14);
  assert.equal(report.missingIds.length, 0);
  assert.equal(report.plannedUpdates.length, 12);
  assert.equal(report.untouchedProductsCount, 2);

  // Check first planned update
  const first = report.plannedUpdates[0];
  assert.equal(first.id, TARGET_IMAGE_UPDATES[0].id);
  assert.equal(first.newImage, TARGET_IMAGE_UPDATES[0].newImage);
  assert.equal(first.isChanged, true);
});

test('5. executeImageUpdates: strictly mutates only image and preserves non-image fields', async () => {
  const db = new Map();
  for (const t of TARGET_IMAGE_UPDATES) {
    db.set(t.id, {
      id: t.id,
      name: `Product ${t.id}`,
      category: 'Food',
      price: 250,
      stock: 80,
      image: 'old-image.jpg',
    });
  }

  const mockProductModel = {
    findOne: ({ id }) => ({
      lean: async () => (db.has(id) ? { ...db.get(id) } : null),
    }),
    updateOne: async ({ id }, updateQuery) => {
      // Ensure only $set: { image } is present
      const setKeys = Object.keys(updateQuery.$set || {});
      assert.deepEqual(setKeys, ['image'], 'Mutation must ONLY specify image field');
      const doc = db.get(id);
      doc.image = updateQuery.$set.image;
      db.set(id, doc);
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };

  const results = await executeImageUpdates(mockProductModel);
  assert.equal(results.length, 12);

  for (const t of TARGET_IMAGE_UPDATES) {
    const updated = db.get(t.id);
    assert.equal(updated.image, t.newImage);
    assert.equal(updated.price, 250, 'Price must not change');
    assert.equal(updated.stock, 80, 'Stock must not change');
  }
});

