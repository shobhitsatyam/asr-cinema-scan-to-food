/**
 * Safe local development seed script for ASR Cinema Catalog (Categories & Products).
 *
 * SAFETY GUARDS:
 * 1. Strictly refuses execution if NODE_ENV === 'production'.
 * 2. Requires explicit ALLOW_SEED=true environment variable.
 * 3. Uses upsert by unique ID to prevent destructive wiping.
 *
 * Usage:
 *   ALLOW_SEED=true node scripts/seedCatalog.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const { categories } = require('../src/data/menuData');
const { catalogProducts } = require('../src/data/catalog');

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/asr-cinema';

/**
 * Perform read-only verification of categories and products in the target database.
 * Never executes write, update, or mutation operations.
 */
async function verifyDatabaseCatalog() {
  const totalCategories = await Category.countDocuments();
  const activeCategories = await Category.countDocuments({ isActive: true });
  const totalProducts = await Product.countDocuments();
  const availableProducts = await Product.countDocuments({ isAvailable: true });
  const inStockProducts = await Product.countDocuments({ inStock: true });

  const dbCategories = await Category.find({}, { slug: 1, name: 1, _id: 0 }).lean();
  const dbCatSlugs = new Set((dbCategories || []).map((c) => c.slug));
  const missingCategories = categories
    .filter((c) => !dbCatSlugs.has(c.slug))
    .map((c) => c.slug);

  const dbProducts = await Product.find({}, { id: 1, name: 1, price: 1, _id: 0 }).lean();
  const dbProdIds = new Set((dbProducts || []).map((p) => p.id));
  const missingProducts = catalogProducts
    .filter((p) => !dbProdIds.has(p.id))
    .map((p) => p.id);

  const sampleIds = ['large-popcorn', 'regular-cold-drink', 'water-bottle', 'french-fry'];
  const samples = await Product.find(
    { id: { $in: sampleIds } },
    { id: 1, name: 1, price: 1, category: 1, isAvailable: 1, inStock: 1, _id: 0 }
  ).lean();

  const isComplete =
    missingCategories.length === 0 &&
    missingProducts.length === 0 &&
    totalCategories >= categories.length &&
    totalProducts >= catalogProducts.length;

  return {
    totalCategories,
    activeCategories,
    totalProducts,
    availableProducts,
    inStockProducts,
    missingCategories,
    missingProducts,
    samples: samples || [],
    isComplete,
  };
}

/**
 * Safely parse target host and database name from connection URI without connecting.
 */
function inspectMongoTarget(rawUri = '') {
  const uri = String(rawUri || '').trim();
  if (!uri) return { host: '', dbName: '', isLocal: false, isExplicitStaging: false, isProduction: false };

  const withoutProto = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const [beforeQuery] = withoutProto.split('?');
  const slashIdx = beforeQuery.indexOf('/');
  const authAndHost = slashIdx !== -1 ? beforeQuery.slice(0, slashIdx) : beforeQuery;
  const pathPart = slashIdx !== -1 ? beforeQuery.slice(slashIdx + 1) : '';

  const atIdx = authAndHost.lastIndexOf('@');
  const host = atIdx !== -1 ? authAndHost.slice(atIdx + 1) : authAndHost;
  const dbName = pathPart.split('/')[0] || '';

  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const isExplicitStaging =
    dbName.toLowerCase().includes('staging') ||
    dbName.toLowerCase().includes('dev') ||
    dbName.toLowerCase().includes('test');
  const isProduction =
    (dbName === 'asr-cinema' && !isLocal) ||
    process.env.NODE_ENV === 'production';

  return { host, dbName, isLocal, isExplicitStaging, isProduction };
}

async function runSeedOrVerifyCatalog(customUri = null) {
  const isVerify = process.argv.includes('--verify-only');
  const uriToUse = customUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/asr-cinema';
  const target = inspectMongoTarget(uriToUse);

  // 1. REJECT PRODUCTION IN EVERY EXECUTION MODE (including --verify-only)
  // Before connecting or executing any database queries
  if (target.isProduction || process.env.NODE_ENV === 'production') {
    console.error('\n🚨 CRITICAL SAFETY INTERLOCK ACTIVATED');
    console.error(`Target database '${target.dbName}' on remote cluster '${target.host}' is identified as the LIVE PRODUCTION database.`);
    console.error('This database contains active customer orders.');
    console.error('Execution against production is STRICTLY FORBIDDEN in ALL modes, including --verify-only.');
    console.error('To run against staging, configure MONGODB_URI to point to a designated staging database (e.g. /asr-cinema-staging) or local database.');
    process.exit(1);
  }

  // 2. In seed mode (write mode), must be explicit staging or local, AND require ALLOW_SEED=true
  if (!isVerify) {
    if (!target.isLocal && !target.isExplicitStaging) {
      console.error('\n🚨 SAFETY INTERLOCK: Target database cannot be positively identified as staging or dev.');
      console.error(`Target: ${target.host} / ${target.dbName}`);
      console.error('Database name must contain "staging", "dev", or "test", or be a local database (127.0.0.1).');
      console.error('Aborting without modifying any data.');
      process.exit(1);
    }

    if (process.env.ALLOW_SEED !== 'true') {
      console.error('SAFETY NOTICE: Seed script requires ALLOW_SEED=true environment variable.');
      console.error('Example: ALLOW_SEED=true node scripts/seedCatalog.js');
      console.error('To run safe read-only check: node scripts/seedCatalog.js --verify-only');
      process.exit(1);
    }
  }

  console.log(isVerify ? 'Starting read-only catalog verification...' : 'Connecting to MongoDB for catalog seeding...');
  await mongoose.connect(uriToUse);

  // Secondary defense-in-depth post-connect check:
  const dbName = mongoose.connection.name || '';
  const host = mongoose.connection.host || '';
  const isLocalDb = host === 'localhost' || host === '127.0.0.1';

  if (dbName === 'asr-cinema' && !isLocalDb) {
    console.error('\n🚨 CRITICAL SAFETY INTERLOCK: Remote production database confirmed post-connect.');
    console.error('Aborting immediately before executing any queries.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Connected to database: ${mongoose.connection.name}`);

  try {
    if (isVerify) {
      console.log('\n--- TARGET DATABASE CATALOG VERIFICATION REPORT ---');
      const stats = await verifyDatabaseCatalog();
      console.log(`Total categories in database: ${stats.totalCategories} (Canonical: ${categories.length})`);
      console.log(`Active categories: ${stats.activeCategories}`);
      console.log(`Total products in database: ${stats.totalProducts} (Canonical: ${catalogProducts.length})`);
      console.log(`Available products: ${stats.availableProducts}`);
      console.log(`In-stock products: ${stats.inStockProducts}`);
      if (stats.missingCategories.length > 0) {
        console.log(`Missing categories:`, stats.missingCategories);
      }
      if (stats.missingProducts.length > 0) {
        console.log(`Missing products:`, stats.missingProducts);
      }
      console.log(`Sample catalog products in database:`, stats.samples);

      if (stats.isComplete) {
        console.log('\n✔ All canonical categories and products are verified in the target database.');
      } else {
        console.log(`\n⚠ Database catalog is incomplete (${stats.totalCategories}/${categories.length} categories, ${stats.totalProducts}/${catalogProducts.length} products). Seeding is required.`);
      }
      return;
    }

    // 1. Seed Categories safely using upsert
    console.log(`Processing ${categories.length} categories...`);
    let categoriesUpserted = 0;

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      await Category.updateOne(
        { slug: cat.slug },
        {
          $set: {
            name: cat.name,
            slug: cat.slug,
            description: cat.description || `${cat.name} selection at ASR Cinema`,
            sortOrder: i + 1,
            isActive: true,
          },
        },
        { upsert: true }
      );
      categoriesUpserted++;
    }
    console.log(`✓ Categories seeded/verified: ${categoriesUpserted}`);

    // 2. Seed Products safely using upsert
    console.log(`Processing ${catalogProducts.length} catalog products...`);
    let productsUpserted = 0;

    for (let i = 0; i < catalogProducts.length; i++) {
      const p = catalogProducts[i];
      const price = Number(p.basePrice || p.price || 0);

      await Product.updateOne(
        { id: p.id },
        {
          $set: {
            id: p.id,
            name: p.name,
            slug: p.slug || p.id,
            category: p.category,
            type: p.isVeg ? 'Veg' : 'Non-Veg',
            isVeg: Boolean(p.isVeg),
            price,
            basePrice: price,
            description: p.description || p.shortDescription || `${p.name} served fresh at your seat.`,
            shortDescription: p.shortDescription || '',
            image: p.image || '',
            isAvailable: p.isAvailable !== false,
            inStock: p.inStock !== false,
            stock: p.stock || 100,
            prepTime: p.prepTime || '10 mins',
            aliases: p.aliases || [],
            variants: p.variants || [],
            addOns: p.addOns || [],
            sortOrder: i + 1,
          },
        },
        { upsert: true }
      );
      productsUpserted++;
    }
    console.log(`✓ Products seeded/verified: ${productsUpserted}`);

    const totalCats = await Category.countDocuments();
    const totalProds = await Product.countDocuments();

    console.log(`Database state: ${totalCats} categories, ${totalProds} products in collection.`);
    console.log('Seeding completed safely.');
  } catch (error) {
    console.error('Error during catalog seeding/verification:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected cleanly.');
  }
}

if (require.main === module) {
  runSeedOrVerifyCatalog().catch((err) => {
    console.error('Catalog operation failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  runSeedOrVerifyCatalog,
  verifyDatabaseCatalog,
  inspectMongoTarget,
};
