const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const { categories } = require('../src/data/menuData');
const { catalogProducts } = require('../src/data/catalog');
const { verifyDatabaseCatalog } = require('../scripts/seedCatalog');

test('1. verifyDatabaseCatalog returns complete status when all canonical items are present', async () => {
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origCatFind = Category.find;
  const origProdFind = Product.find;

  try {
    Category.countDocuments = async (filter = {}) => {
      if (filter.isActive) return categories.length;
      return categories.length;
    };

    Product.countDocuments = async (filter = {}) => {
      if (filter.isAvailable) return catalogProducts.length;
      if (filter.inStock) return catalogProducts.length;
      return catalogProducts.length;
    };

    Category.find = () => ({
      lean: async () => categories.map((c) => ({ slug: c.slug, name: c.name })),
    });

    Product.find = (query) => ({
      lean: async () => {
        if (query && query.id && query.id.$in) {
          return catalogProducts
            .filter((p) => query.id.$in.includes(p.id))
            .map((p) => ({
              id: p.id,
              name: p.name,
              price: p.basePrice,
              category: p.category,
              isAvailable: true,
              inStock: true,
            }));
        }
        return catalogProducts.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.basePrice,
        }));
      },
    });

    const report = await verifyDatabaseCatalog();

    assert.equal(report.isComplete, true);
    assert.equal(report.totalCategories, categories.length);
    assert.equal(report.activeCategories, categories.length);
    assert.equal(report.totalProducts, catalogProducts.length);
    assert.equal(report.availableProducts, catalogProducts.length);
    assert.equal(report.inStockProducts, catalogProducts.length);
    assert.equal(report.missingCategories.length, 0);
    assert.equal(report.missingProducts.length, 0);
    assert.ok(report.samples.length > 0);
  } finally {
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Category.find = origCatFind;
    Product.find = origProdFind;
  }
});

test('2. verifyDatabaseCatalog detects missing categories and products and reports isComplete: false', async () => {
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origCatFind = Category.find;
  const origProdFind = Product.find;

  try {
    // Only 2 categories and 3 products present in DB
    const presentCats = categories.slice(0, 2);
    const presentProds = catalogProducts.slice(0, 3);

    Category.countDocuments = async () => presentCats.length;
    Product.countDocuments = async () => presentProds.length;

    Category.find = () => ({
      lean: async () => presentCats.map((c) => ({ slug: c.slug, name: c.name })),
    });

    Product.find = (query) => ({
      lean: async () => {
        if (query && query.id && query.id.$in) {
          return presentProds
            .filter((p) => query.id.$in.includes(p.id))
            .map((p) => ({ id: p.id, name: p.name, price: p.basePrice }));
        }
        return presentProds.map((p) => ({ id: p.id, name: p.name, price: p.basePrice }));
      },
    });

    const report = await verifyDatabaseCatalog();

    assert.equal(report.isComplete, false);
    assert.equal(report.totalCategories, 2);
    assert.equal(report.totalProducts, 3);
    assert.equal(report.missingCategories.length, categories.length - 2);
    assert.equal(report.missingProducts.length, catalogProducts.length - 3);

    // Assert that the missing list contains an expected missing category and product
    const expectedMissingCat = categories[3].slug;
    const expectedMissingProd = catalogProducts[5].id;
    assert.ok(report.missingCategories.includes(expectedMissingCat));
    assert.ok(report.missingProducts.includes(expectedMissingProd));
  } finally {
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Category.find = origCatFind;
    Product.find = origProdFind;
  }
});

test('3. verifyDatabaseCatalog performs zero write operations', async () => {
  const origCatUpdate = Category.updateOne;
  const origProdUpdate = Product.updateOne;
  const origCatCreate = Category.create;
  const origProdCreate = Product.create;
  const origCatFindOneAndUpdate = Category.findOneAndUpdate;
  const origProdFindOneAndUpdate = Product.findOneAndUpdate;
  const origCatDelete = Category.deleteMany;
  const origProdDelete = Product.deleteMany;
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origCatFind = Category.find;
  const origProdFind = Product.find;

  let writeAttempted = false;
  const writeGuard = (methodName) => () => {
    writeAttempted = true;
    throw new Error(`Forbidden write operation '${methodName}' called in verify mode!`);
  };

  try {
    Category.updateOne = writeGuard('Category.updateOne');
    Product.updateOne = writeGuard('Product.updateOne');
    Category.create = writeGuard('Category.create');
    Product.create = writeGuard('Product.create');
    Category.findOneAndUpdate = writeGuard('Category.findOneAndUpdate');
    Product.findOneAndUpdate = writeGuard('Product.findOneAndUpdate');
    Category.deleteMany = writeGuard('Category.deleteMany');
    Product.deleteMany = writeGuard('Product.deleteMany');

    Category.countDocuments = async () => 0;
    Product.countDocuments = async () => 0;
    Category.find = () => ({ lean: async () => [] });
    Product.find = () => ({ lean: async () => [] });

    const report = await verifyDatabaseCatalog();

    assert.equal(writeAttempted, false, 'No updateOne, create, or mutation operation must be executed');
    assert.equal(report.isComplete, false);
    assert.equal(report.totalCategories, 0);
    assert.equal(report.totalProducts, 0);
  } finally {
    Category.updateOne = origCatUpdate;
    Product.updateOne = origProdUpdate;
    Category.create = origCatCreate;
    Product.create = origProdCreate;
    Category.findOneAndUpdate = origCatFindOneAndUpdate;
    Product.findOneAndUpdate = origProdFindOneAndUpdate;
    Category.deleteMany = origCatDelete;
    Product.deleteMany = origProdDelete;
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Category.find = origCatFind;
    Product.find = origProdFind;
  }
});

const { runSeedOrVerifyCatalog } = require('../scripts/seedCatalog');

test('4. runSeedOrVerifyCatalog in --verify-only mode does not require ALLOW_SEED=true on non-production db', async () => {
  const origArgv = [...process.argv];
  const origAllowSeed = process.env.ALLOW_SEED;
  const origMongoUri = process.env.MONGODB_URI;
  const origConnect = mongoose.connect;
  const origDisconnect = mongoose.disconnect;
  const origExit = process.exit;
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origCatFind = Category.find;
  const origProdFind = Product.find;

  let exitCalled = false;
  let connectCalled = false;
  let disconnectCalled = false;

  try {
    process.argv = ['node', 'scripts/seedCatalog.js', '--verify-only'];
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/asr-cinema-staging';
    delete process.env.ALLOW_SEED;

    process.exit = (code) => {
      exitCalled = true;
      throw new Error(`process.exit(${code}) called`);
    };

    mongoose.connect = async () => {
      connectCalled = true;
    };
    mongoose.disconnect = async () => {
      disconnectCalled = true;
    };

    Category.countDocuments = async () => categories.length;
    Product.countDocuments = async () => catalogProducts.length;
    Category.find = () => ({ lean: async () => categories.map((c) => ({ slug: c.slug, name: c.name })) });
    Product.find = (query) => ({
      lean: async () => {
        if (query && query.id && query.id.$in) {
          return catalogProducts
            .filter((p) => query.id.$in.includes(p.id))
            .map((p) => ({ id: p.id, name: p.name, price: p.basePrice }));
        }
        return catalogProducts.map((p) => ({ id: p.id, name: p.name, price: p.basePrice }));
      },
    });

    await runSeedOrVerifyCatalog();

    assert.equal(exitCalled, false, 'Should not exit on verify-only even without ALLOW_SEED=true');
    assert.equal(connectCalled, true);
    assert.equal(disconnectCalled, true);
  } finally {
    process.argv = origArgv;
    if (origAllowSeed !== undefined) process.env.ALLOW_SEED = origAllowSeed;
    else delete process.env.ALLOW_SEED;
    if (origMongoUri !== undefined) process.env.MONGODB_URI = origMongoUri;
    else delete process.env.MONGODB_URI;
    mongoose.connect = origConnect;
    mongoose.disconnect = origDisconnect;
    process.exit = origExit;
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Category.find = origCatFind;
    Product.find = origProdFind;
  }
});

test('5. runSeedOrVerifyCatalog without --verify-only and without ALLOW_SEED exits with code 1', async () => {
  const origArgv = [...process.argv];
  const origAllowSeed = process.env.ALLOW_SEED;
  const origMongoUri = process.env.MONGODB_URI;
  const origExit = process.exit;

  let exitCode = null;

  try {
    process.argv = ['node', 'scripts/seedCatalog.js'];
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/asr-cinema-staging';
    delete process.env.ALLOW_SEED;

    process.exit = (code) => {
      exitCode = code;
      throw new Error(`process.exit(${code}) called`);
    };

    await assert.rejects(
      async () => {
        await runSeedOrVerifyCatalog();
      },
      /process\.exit\(1\)/
    );

    assert.equal(exitCode, 1, 'Must exit with code 1 when ALLOW_SEED is missing');
  } finally {
    process.argv = origArgv;
    if (origAllowSeed !== undefined) process.env.ALLOW_SEED = origAllowSeed;
    else delete process.env.ALLOW_SEED;
    if (origMongoUri !== undefined) process.env.MONGODB_URI = origMongoUri;
    else delete process.env.MONGODB_URI;
    process.exit = origExit;
  }
});

test('6. runSeedOrVerifyCatalog without --verify-only in production mode exits with code 1', async () => {
  const origArgv = [...process.argv];
  const origEnv = process.env.NODE_ENV;
  const origAllowSeed = process.env.ALLOW_SEED;
  const origExit = process.exit;

  let exitCode = null;

  try {
    process.argv = ['node', 'scripts/seedCatalog.js'];
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_SEED = 'true';

    process.exit = (code) => {
      exitCode = code;
      throw new Error(`process.exit(${code}) called`);
    };

    await assert.rejects(
      async () => {
        await runSeedOrVerifyCatalog();
      },
      /process\.exit\(1\)/
    );

    assert.equal(exitCode, 1, 'Must exit with code 1 in production mode');
  } finally {
    process.argv = origArgv;
    if (origEnv !== undefined) process.env.NODE_ENV = origEnv;
    else delete process.env.NODE_ENV;
    if (origAllowSeed !== undefined) process.env.ALLOW_SEED = origAllowSeed;
    else delete process.env.ALLOW_SEED;
    process.exit = origExit;
  }
});

test('7. runSeedOrVerifyCatalog in --verify-only mode rejects remote production database target before connecting', async () => {
  const origArgv = [...process.argv];
  const origMongoUri = process.env.MONGODB_URI;
  const origConnect = mongoose.connect;
  const origExit = process.exit;

  let exitCode = null;
  let connectCalled = false;

  try {
    process.argv = ['node', 'scripts/seedCatalog.js', '--verify-only'];
    process.env.MONGODB_URI = 'mongodb+srv://admin:secretPass@cluster0.xyz.mongodb.net/asr-cinema?retryWrites=true&w=majority';

    process.exit = (code) => {
      exitCode = code;
      throw new Error(`process.exit(${code}) called`);
    };

    mongoose.connect = async () => {
      connectCalled = true;
    };

    await assert.rejects(
      async () => {
        await runSeedOrVerifyCatalog();
      },
      /process\.exit\(1\)/
    );

    assert.equal(exitCode, 1, 'Must exit with code 1 when pointing to remote production DB in verify mode');
    assert.equal(connectCalled, false, 'Must NOT attempt to connect to production database in verify mode');
  } finally {
    process.argv = origArgv;
    if (origMongoUri !== undefined) process.env.MONGODB_URI = origMongoUri;
    else delete process.env.MONGODB_URI;
    mongoose.connect = origConnect;
    process.exit = origExit;
  }
});

const { runSeedOrVerify: runSeedOrVerifySeats } = require('../scripts/seedSeats');

test('8. runSeedOrVerify (seedSeats.js) in --verify-only mode rejects remote production database target before connecting', async () => {
  const origArgv = [...process.argv];
  const origMongoUri = process.env.MONGODB_URI;
  const origExit = process.exit;

  let exitCode = null;

  try {
    process.argv = ['node', 'scripts/seedSeats.js', '--verify-only'];
    process.env.MONGODB_URI = 'mongodb+srv://admin:secretPass@cluster0.xyz.mongodb.net/asr-cinema?retryWrites=true&w=majority';

    process.exit = (code) => {
      exitCode = code;
      throw new Error(`process.exit(${code}) called`);
    };

    await assert.rejects(
      async () => {
        await runSeedOrVerifySeats('mongodb+srv://admin:secretPass@cluster0.xyz.mongodb.net/asr-cinema?retryWrites=true&w=majority');
      },
      /process\.exit\(1\)/
    );

    assert.equal(exitCode, 1, 'Must exit with code 1 when pointing to remote production DB in seat verify mode');
  } finally {
    process.argv = origArgv;
    if (origMongoUri !== undefined) process.env.MONGODB_URI = origMongoUri;
    else delete process.env.MONGODB_URI;
    process.exit = origExit;
  }
});

const { inspectMongoTarget } = require('../scripts/seedCatalog');

test('9. inspectMongoTarget correctly identifies production, staging, local, host, and database name', () => {
  const prodAtlas = inspectMongoTarget('mongodb+srv://admin:secretPass@cluster0.xyz.mongodb.net/asr-cinema?retryWrites=true');
  assert.equal(prodAtlas.host, 'cluster0.xyz.mongodb.net');
  assert.equal(prodAtlas.dbName, 'asr-cinema');
  assert.equal(prodAtlas.isLocal, false);
  assert.equal(prodAtlas.isProduction, true);
  assert.equal(prodAtlas.isExplicitStaging, false);

  const stagingAtlas = inspectMongoTarget('mongodb+srv://admin:secretPass@cluster0.xyz.mongodb.net/asr-cinema-staging?retryWrites=true');
  assert.equal(stagingAtlas.host, 'cluster0.xyz.mongodb.net');
  assert.equal(stagingAtlas.dbName, 'asr-cinema-staging');
  assert.equal(stagingAtlas.isLocal, false);
  assert.equal(stagingAtlas.isProduction, false);
  assert.equal(stagingAtlas.isExplicitStaging, true);

  const localDev = inspectMongoTarget('mongodb://127.0.0.1:27017/asr-cinema');
  assert.equal(localDev.host, '127.0.0.1:27017');
  assert.equal(localDev.dbName, 'asr-cinema');
  assert.equal(localDev.isLocal, true);
  assert.equal(localDev.isProduction, false);

  const localStaging = inspectMongoTarget('mongodb://localhost:27017/asr-cinema-staging');
  assert.equal(localStaging.isLocal, true);
  assert.equal(localStaging.isExplicitStaging, true);
  assert.equal(localStaging.isProduction, false);
});


