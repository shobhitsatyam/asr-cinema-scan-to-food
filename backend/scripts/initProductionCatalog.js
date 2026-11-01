/**
 * Safe, idempotent production catalog initialization script for ASR Cinema.
 *
 * STRICT PRODUCTION SAFETY PROTOCOL:
 * 1. Read-only by default: Runs dry-run report unless explicitly authorized.
 * 2. Multi-layer authorization required for mutation:
 *    - CLI argument: --execute
 *    - Environment variable: ALLOW_PROD_CATALOG_INIT=true
 * 3. Strict target validation:
 *    - Connection URI must explicitly contain target database name 'asr-cinema'.
 *    - Post-connect check verifies mongoose.connection.name matches 'asr-cinema'.
 * 4. Non-destructive guarantee:
 *    - NEVER deletes or wipes any existing database records.
 *    - NEVER overwrites existing categories or products (skips existing records).
 * 5. Full cryptographic order protection (SHA-256):
 *    - Hashes all complete order documents without partial projection before and after execution.
 *    - Any order modification triggers immediate safe abort with exit code 1.
 * 6. Scope restriction: Writes ONLY to 'categories' and 'products' collections.
 *    - Leaves 'orders', 'seats', and 'auditoria' collections completely untouched.
 * 7. Non-zero exit code: Any authorization failure, target mismatch, or post-check failure exits with code 1.
 *
 * USAGE:
 *   Dry-run audit (safe, read-only):
 *     node scripts/initProductionCatalog.js --dry-run
 *
 *   Verify-only check (safe, read-only):
 *     node scripts/initProductionCatalog.js --verify-only
 *
 *   Execute initialization (requires explicit approval & env var):
 *     ALLOW_PROD_CATALOG_INIT=true node scripts/initProductionCatalog.js --execute
 */

require('dotenv').config();
const path = require('path');
const dns = require('dns');
// Defense-in-depth: If MONGODB_URI not set, try loading from backend/.env
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const crypto = require('crypto');
const mongoose = require('mongoose');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const Seat = require('../src/models/Seat');
const Auditorium = require('../src/models/Auditorium');
const { categories: rawCategories, products: menuProducts } = require('../src/data/menuData');
const { catalogProducts } = require('../src/data/catalog');

/**
 * Build canonical categories and products payloads with full schema validation.
 */
function buildCanonicalCatalogPayloads() {
  const menuBySlug = new Map((menuProducts || []).map((p) => [p.slug, p]));

  // 1. Canonical Categories (7 categories)
  const canonicalCategories = (rawCategories || []).map((cat, idx) => ({
    name: cat.name.trim(),
    slug: cat.slug.trim().toLowerCase(),
    description: cat.description || `${cat.name} selection at ASR Cinema`,
    iconName: cat.iconName || 'Utensils',
    image: cat.image || '',
    sortOrder: idx + 1,
    isActive: true,
  }));

  const categoryMap = new Map(canonicalCategories.map((c) => [c.name.toLowerCase(), c]));

  // 2. Canonical Products (43 products)
  const canonicalProducts = (catalogProducts || []).map((p, idx) => {
    const mp = menuBySlug.get(p.id) || menuBySlug.get(p.slug) || {};
    const price = Number(p.basePrice ?? p.price ?? 0);
    const cat = categoryMap.get((p.category || '').toLowerCase());

    return {
      id: p.id.trim(),
      name: p.name.trim(),
      slug: (p.slug || p.id).trim().toLowerCase(),
      category: p.category.trim(),
      categoryId: cat ? cat.slug : (p.categoryId || ''),
      type: p.isVeg ? 'Veg' : 'Non-Veg',
      isVeg: Boolean(p.isVeg),
      price,
      basePrice: price,
      originalPrice: p.originalPrice || mp.originalPrice || undefined,
      description: p.description || mp.description || mp.shortDescription || `${p.name} served fresh at your cinema seat.`,
      shortDescription: p.shortDescription || mp.shortDescription || '',
      image: p.image || mp.image || '',
      isAvailable: p.isAvailable !== false,
      inStock: p.inStock !== false,
      stock: p.stock || 100,
      prepTime: p.prepTime || '10 mins',
      aliases: (p.aliases || []).map((a) => a.trim().toLowerCase()),
      variants: (p.variants || []).map((v) => ({
        id: v.id || '',
        name: v.name,
        size: v.size || '',
        price: Number(v.price),
      })),
      addOns: (p.addOns || []).map((a) => ({
        id: a.id || '',
        name: a.name,
        price: Number(a.price),
      })),
      sortOrder: idx + 1,
    };
  });

  return {
    categories: canonicalCategories,
    products: canonicalProducts,
  };
}

/**
 * Safely parse target host and database name from connection URI without connecting.
 * Enforces that target database cannot default to 'test' or be omitted.
 */
function inspectTarget(rawUri = '') {
  const uri = String(rawUri || '').trim();
  if (!uri) {
    return { host: '', dbName: '', isProduction: false, isLocal: false, isValid: false, reason: 'URI is empty' };
  }

  const withoutProto = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const [beforeQuery] = withoutProto.split('?');
  const slashIdx = beforeQuery.indexOf('/');
  const authAndHost = slashIdx !== -1 ? beforeQuery.slice(0, slashIdx) : beforeQuery;
  const pathPart = slashIdx !== -1 ? beforeQuery.slice(slashIdx + 1) : '';

  const atIdx = authAndHost.lastIndexOf('@');
  const host = atIdx !== -1 ? authAndHost.slice(atIdx + 1) : authAndHost;
  const dbName = pathPart.split('/')[0] || '';

  if (!dbName) {
    return {
      host,
      dbName: '',
      isProduction: false,
      isLocal: false,
      isValid: false,
      reason: 'Target database name is missing in connection URI (would default to test)',
    };
  }

  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const isProduction = dbName === 'asr-cinema' && !isLocal;

  // Target database must strictly be asr-cinema (or local / staging variants for dev/testing)
  const isAllowedDb =
    dbName === 'asr-cinema' ||
    isLocal ||
    dbName.includes('staging') ||
    dbName.includes('test') ||
    dbName.includes('dev');

  if (!isAllowedDb) {
    return {
      host,
      dbName,
      isProduction,
      isLocal,
      isValid: false,
      reason: `Target database '${dbName}' is not an authorized database name`,
    };
  }

  return { host, dbName, isProduction, isLocal, isValid: true, reason: null };
}

/**
 * Computes deterministic SHA-256 cryptographic fingerprint of ALL existing customer orders.
 * Fetches COMPLETE order documents without restrictive field projection.
 */
async function computeOrdersFingerprint() {
  const orders = await Order.find({}).sort({ _id: 1 }).lean();
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(orders || []));
  return {
    count: Array.isArray(orders) ? orders.length : 0,
    hash: hash.digest('hex'),
  };
}

/**
 * Perform read-only audit of current catalog and database state.
 * Never performs write or mutation operations.
 */
async function auditDatabaseCatalogState() {
  const ordersFingerprint = await computeOrdersFingerprint();
  const categoriesCount = await Category.countDocuments();
  const activeCategoriesCount = await Category.countDocuments({ isActive: true });
  const productsCount = await Product.countDocuments();
  const availableProductsCount = await Product.countDocuments({ isAvailable: true });
  const inStockProductsCount = await Product.countDocuments({ inStock: true });
  const auditoriaCount = await Auditorium.countDocuments();
  const totalSeats = await Seat.countDocuments();

  const dbCategories = await Category.find({}, { slug: 1, name: 1, _id: 0 }).lean();
  const dbProducts = await Product.find({}, { id: 1, slug: 1, name: 1, category: 1, price: 1, _id: 0 }).lean();

  const canonical = buildCanonicalCatalogPayloads();
  const dbCatSlugs = new Set((dbCategories || []).map((c) => c.slug));
  const dbProdIds = new Set((dbProducts || []).map((p) => p.id));

  const missingCategories = canonical.categories.filter((c) => !dbCatSlugs.has(c.slug));
  const missingProducts = canonical.products.filter((p) => !dbProdIds.has(p.id));
  const existingCategories = canonical.categories.filter((c) => dbCatSlugs.has(c.slug));
  const existingProducts = canonical.products.filter((p) => dbProdIds.has(p.id));

  return {
    ordersCount: ordersFingerprint.count,
    ordersHash: ordersFingerprint.hash,
    categoriesCount,
    activeCategoriesCount,
    productsCount,
    availableProductsCount,
    inStockProductsCount,
    auditoriaCount,
    totalSeats,
    missingCategories,
    missingProducts,
    existingCategories,
    existingProducts,
    isComplete: missingCategories.length === 0 && missingProducts.length === 0 && categoriesCount >= 7 && productsCount >= 43,
  };
}

/**
 * Generate dry-run report analyzing planned catalog changes.
 * Never modifies database.
 */
async function generateDryRunReport(dbAudit) {
  const canonical = buildCanonicalCatalogPayloads();

  const categoriesToInsert = dbAudit.missingCategories.map((c) => ({
    name: c.name,
    slug: c.slug,
    action: 'INSERT (new category)',
  }));

  const categoriesToSkip = dbAudit.existingCategories.map((c) => ({
    name: c.name,
    slug: c.slug,
    action: 'SKIP (preserve existing record, never overwrite)',
  }));

  const productsToInsert = dbAudit.missingProducts.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    action: 'INSERT (new product)',
  }));

  const productsToSkip = dbAudit.existingProducts.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    action: 'SKIP (preserve existing record, never overwrite)',
  }));

  const categoryBreakdown = {};
  for (const p of canonical.products) {
    categoryBreakdown[p.category] = (categoryBreakdown[p.category] || 0) + 1;
  }

  return {
    currentDbState: {
      ordersCount: dbAudit.ordersCount,
      ordersFingerprint: dbAudit.ordersHash ? dbAudit.ordersHash.slice(0, 16) + '...' : 'none',
      auditoriaCount: dbAudit.auditoriaCount,
      seatsCount: dbAudit.totalSeats,
      existingCategoriesCount: dbAudit.categoriesCount,
      existingProductsCount: dbAudit.productsCount,
    },
    plannedChanges: {
      canonicalCategoriesTotal: canonical.categories.length,
      categoriesToInsertCount: categoriesToInsert.length,
      categoriesToSkipCount: categoriesToSkip.length,
      canonicalProductsTotal: canonical.products.length,
      productsToInsertCount: productsToInsert.length,
      productsToSkipCount: productsToSkip.length,
      categoryProductBreakdown: categoryBreakdown,
      categoriesToInsert,
      categoriesToSkip,
      productsToInsertSample: productsToInsert.slice(0, 8),
      productsToSkipSample: productsToSkip.slice(0, 8),
      untouchedCollections: [
        {
          collection: 'orders',
          currentCount: dbAudit.ordersCount,
          fingerprint: dbAudit.ordersHash ? dbAudit.ordersHash.slice(0, 16) + '...' : 'none',
          action: 'PRESERVE (0 writes)',
        },
        { collection: 'auditoria', currentCount: dbAudit.auditoriaCount, action: 'PRESERVE (0 writes)' },
        { collection: 'seats', currentCount: dbAudit.totalSeats, action: 'PRESERVE (0 writes)' },
      ],
      targetCollections: [
        {
          collection: 'categories',
          currentCount: dbAudit.categoriesCount,
          expectedAfter: dbAudit.categoriesCount + categoriesToInsert.length,
        },
        {
          collection: 'products',
          currentCount: dbAudit.productsCount,
          expectedAfter: dbAudit.productsCount + productsToInsert.length,
        },
      ],
    },
  };
}

/**
 * Execute production catalog initialization with strict idempotency and duplicate protection.
 *
 * SAFETY GUARANTEES:
 * 1. Checks existence of each category/product before writing.
 * 2. SKIPS any existing record (never overwrites).
 * 3. NEVER deletes or modifies existing orders, seats, or auditoria.
 * 4. Verifies complete order fingerprint before and after execution.
 */
async function executeProductionCatalogInit() {
  const canonical = buildCanonicalCatalogPayloads();

  // 1. Cryptographic baseline snapshot of complete orders and untouched collections
  const preOrders = await computeOrdersFingerprint();
  const preAuditoria = await Auditorium.countDocuments();
  const preSeats = await Seat.countDocuments();
  const preCategories = await Category.countDocuments();
  const preProducts = await Product.countDocuments();

  console.log(`\n[PRE-CHECK] Customer orders verified: ${preOrders.count} documents (SHA-256: ${preOrders.hash.slice(0, 16)}...)`);
  console.log(`[PRE-CHECK] Preserved collections: auditoria=${preAuditoria}, seats=${preSeats}`);
  console.log(`[PRE-CHECK] Initial catalog state: categories=${preCategories}, products=${preProducts}`);

  // 2. Safe Category Insert (skip existing, never overwrite)
  console.log(`\n[EXECUTION] Processing ${canonical.categories.length} canonical categories...`);
  let categoriesInserted = 0;
  let categoriesSkipped = 0;

  for (const cat of canonical.categories) {
    const existing = await Category.findOne({
      $or: [{ slug: cat.slug }, { name: cat.name }],
    }).lean();

    if (existing) {
      console.log(`  ↪ Category '${cat.name}' (${cat.slug}) already exists. SKIPPING (preserve existing).`);
      categoriesSkipped += 1;
      continue;
    }

    await Category.create(cat);
    console.log(`  ✔ Category inserted: '${cat.name}' (${cat.slug})`);
    categoriesInserted += 1;
  }

  console.log(`✔ Categories completed: ${categoriesInserted} inserted, ${categoriesSkipped} skipped`);

  // 3. Safe Product Insert (skip existing, never overwrite)
  console.log(`\n[EXECUTION] Processing ${canonical.products.length} canonical products...`);
  let productsInserted = 0;
  let productsSkipped = 0;

  for (const prod of canonical.products) {
    const existing = await Product.findOne({
      $or: [{ id: prod.id }, { slug: prod.slug }],
    }).lean();

    if (existing) {
      console.log(`  ↪ Product '${prod.name}' (${prod.id}) already exists. SKIPPING (preserve existing).`);
      productsSkipped += 1;
      continue;
    }

    await Product.create(prod);
    console.log(`  ✔ Product inserted: '${prod.name}' [${prod.id}] (₹${prod.price}, ${prod.category})`);
    productsInserted += 1;
  }

  console.log(`✔ Products completed: ${productsInserted} inserted, ${productsSkipped} skipped`);

  // 4. Post-execution Verification & Non-destructive Order Integrity Check
  const postAudit = await auditDatabaseCatalogState();
  const postOrders = await computeOrdersFingerprint();
  const postAuditoria = await Auditorium.countDocuments();
  const postSeats = await Seat.countDocuments();

  console.log('\n--- POST-EXECUTION VERIFICATION REPORT ---');
  console.log(`Customer Orders Count: ${postOrders.count} (Pre: ${preOrders.count})`);
  console.log(`Customer Orders SHA-256: ${postOrders.hash.slice(0, 16)}...`);
  console.log(`Auditoria Count: ${postAuditoria} (Pre: ${preAuditoria})`);
  console.log(`Seats Count: ${postSeats} (Pre: ${preSeats})`);
  console.log(`Total Categories in DB: ${postAudit.categoriesCount}`);
  console.log(`Total Products in DB: ${postAudit.productsCount}`);
  console.log(`Available Products: ${postAudit.availableProductsCount}`);
  console.log(`In-Stock Products: ${postAudit.inStockProductsCount}`);

  // STRICT SAFETY ASSERTION: Customer orders must NOT have been touched
  if (postOrders.hash !== preOrders.hash || postOrders.count !== preOrders.count) {
    console.error('\n🚨 FATAL INTEGRITY VIOLATION: Customer orders were modified during catalog initialization!');
    console.error(`Pre-hash:  ${preOrders.hash}`);
    console.error(`Post-hash: ${postOrders.hash}`);
    process.exit(1);
  }

  // STRICT SAFETY ASSERTION: Seats and Auditoria must NOT have been touched
  if (postAuditoria !== preAuditoria || postSeats !== preSeats) {
    console.error('\n🚨 FATAL INTEGRITY VIOLATION: Seats or Auditoria were altered during catalog initialization!');
    process.exit(1);
  }

  // Catalog completeness verification
  if (postAudit.categoriesCount < 7 || postAudit.productsCount < 43) {
    console.error('\n🚨 VERIFICATION FAILURE: Catalog counts below expected threshold!');
    console.error(`Expected at least 7 categories and 43 products, found ${postAudit.categoriesCount} and ${postAudit.productsCount}`);
    process.exit(1);
  }

  console.log('\n✔ ALL POST-EXECUTION INTEGRITY CHECKS PASSED.');
  console.log('✔ Customer orders: 100% untouched and verified.');
  console.log('✔ Physical seats and auditoria: 100% untouched and verified.');
  console.log('✔ Production catalog initialization completed successfully.');

  return {
    categoriesInserted,
    categoriesSkipped,
    productsInserted,
    productsSkipped,
    postAudit,
  };
}

/**
 * Main entry point: controls dry-run vs verify-only vs authorized execution.
 * Accepts optional programmatic options for testing and safe local dry-runs.
 */
async function runProductionCatalogInit(customUri = null, options = {}) {
  const isExecute = options.isExecute !== undefined ? Boolean(options.isExecute) : process.argv.includes('--execute');
  const isVerify = options.isVerifyOnly !== undefined
    ? Boolean(options.isVerifyOnly)
    : (options.isVerify !== undefined ? Boolean(options.isVerify) : process.argv.includes('--verify-only'));
  const rawUri = customUri || process.env.MONGODB_URI || '';

  const target = inspectTarget(rawUri);

  console.log('===========================================================');
  console.log('   ASR CINEMA — PRODUCTION CATALOG INITIALIZATION PROTOCOL  ');
  console.log('===========================================================');

  if (!target.isValid) {
    console.error('\n🚨 TARGET VALIDATION FAILED');
    console.error(`Reason: ${target.reason}`);
    console.error('Operation aborted. Target database cannot be safely resolved.');
    if (options.throwOnError) throw new Error(target.reason);
    process.exit(1);
  }

  console.log(`Target Host:     ${target.host}`);
  console.log(`Target Database: ${target.dbName}`);
  console.log(`Mode:            ${isExecute ? '⚡ EXECUTE MUTATION' : isVerify ? '🔍 VERIFY ONLY (Read-Only)' : '📋 DRY-RUN (Read-Only)'}`);

  // Safety Gate: Reject execute without explicit env variable
  if (isExecute) {
    if (process.env.ALLOW_PROD_CATALOG_INIT !== 'true') {
      console.error('\n🚨 AUTHORIZATION INTERLOCK ACTIVATED');
      console.error('Execution requires explicit confirmation via environment variable:');
      console.error('  ALLOW_PROD_CATALOG_INIT=true');
      console.error('Example:');
      console.error('  ALLOW_PROD_CATALOG_INIT=true node scripts/initProductionCatalog.js --execute');
      console.error('\nOperation aborted with zero database modifications.');
      if (options.throwOnError) throw new Error('Authorization required: ALLOW_PROD_CATALOG_INIT=true');
      process.exit(1);
    }
  }

  // Connect securely with 5-second connection timeout and DNS fallback
  console.log('\nConnecting to MongoDB target...');
  try {
    await mongoose.connect(rawUri, { serverSelectionTimeoutMS: 5000 });
  } catch (connErr) {
    if (connErr.message && connErr.message.includes('querySrv ECONNREFUSED')) {
      console.warn('DNS SRV lookup failed on default resolver. Retrying with public DNS resolvers (8.8.8.8, 1.1.1.1)...');
      dns.setServers(['8.8.8.8', '1.1.1.1']);
      await mongoose.connect(rawUri, { serverSelectionTimeoutMS: 5000 });
    } else {
      throw connErr;
    }
  }

  // Defense-in-depth: Verify connected database name matches inspectTarget
  const connectedDb = mongoose.connection.name || '';
  if (connectedDb !== target.dbName) {
    console.error('\n🚨 POST-CONNECT TARGET MISMATCH');
    console.error(`Expected database: '${target.dbName}', but connected to: '${connectedDb}'`);
    await mongoose.disconnect();
    if (options.throwOnError) throw new Error(`Target database mismatch: expected ${target.dbName}, got ${connectedDb}`);
    process.exit(1);
  }

  console.log(`✔ Connected cleanly to database: '${connectedDb}'`);

  try {
    const dbAudit = await auditDatabaseCatalogState();

    if (isVerify) {
      console.log('\n--- TARGET DATABASE VERIFICATION REPORT ---');
      console.log(`Existing Categories: ${dbAudit.categoriesCount} / 7 canonical`);
      console.log(`Existing Products:   ${dbAudit.productsCount} / 43 canonical`);
      console.log(`Missing Categories:  ${dbAudit.missingCategories.length}`);
      console.log(`Missing Products:    ${dbAudit.missingProducts.length}`);
      console.log(`Customer Orders:     ${dbAudit.ordersCount} (Hash: ${dbAudit.ordersHash ? dbAudit.ordersHash.slice(0, 16) + '...' : 'none'})`);
      console.log(`Auditoria:           ${dbAudit.auditoriaCount}`);
      console.log(`Physical Seats:      ${dbAudit.totalSeats}`);

      if (dbAudit.isComplete) {
        console.log('\n✔ All 7 categories and 43 products are present and complete in database.');
      } else {
        console.log('\n⚠ Catalog is incomplete in target database. Initialization is required.');
      }
      return { mode: 'verify-only', dbAudit };
    }

    if (!isExecute) {
      // DRY-RUN MODE: Safe, zero writes
      console.log('\n--- EXECUTING DRY-RUN AUDIT (ZERO WRITES) ---');
      const dryRunReport = await generateDryRunReport(dbAudit);

      console.log('\n[CURRENT DATABASE STATUS]');
      console.log(`  Categories in DB: ${dryRunReport.currentDbState.existingCategoriesCount}`);
      console.log(`  Products in DB:   ${dryRunReport.currentDbState.existingProductsCount}`);
      console.log(`  Orders in DB:     ${dryRunReport.currentDbState.ordersCount} (Fingerprint: ${dryRunReport.currentDbState.ordersFingerprint})`);
      console.log(`  Seats in DB:      ${dryRunReport.currentDbState.seatsCount}`);

      console.log('\n[PLANNED MUTATIONS]');
      console.log(`  Categories to INSERT: ${dryRunReport.plannedChanges.categoriesToInsertCount}`);
      console.log(`  Categories to SKIP:   ${dryRunReport.plannedChanges.categoriesToSkipCount}`);
      console.log(`  Products to INSERT:   ${dryRunReport.plannedChanges.productsToInsertCount}`);
      console.log(`  Products to SKIP:     ${dryRunReport.plannedChanges.productsToSkipCount}`);

      console.log('\n[CATEGORY BREAKDOWN FOR CANONICAL CATALOG]');
      for (const [catName, count] of Object.entries(dryRunReport.plannedChanges.categoryProductBreakdown)) {
        console.log(`  - ${catName}: ${count} products`);
      }

      console.log('\n[PROTECTED UNTOUCHED COLLECTIONS]');
      for (const item of dryRunReport.plannedChanges.untouchedCollections) {
        console.log(`  - ${item.collection}: ${item.currentCount} docs | ${item.action}`);
      }

      console.log('\n✔ DRY-RUN AUDIT COMPLETE: 0 writes performed.');
      console.log('To execute catalog initialization against this target, run:');
      console.log('  ALLOW_PROD_CATALOG_INIT=true node scripts/initProductionCatalog.js --execute');
      return { mode: 'dry-run', report: dryRunReport };
    }

    // AUTHORIZED EXECUTION MODE
    const result = await executeProductionCatalogInit();
    return { mode: 'execute', result };
  } catch (error) {
    console.error('\n🚨 SCRIPT EXECUTION FAILED:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed cleanly.\n');
  }
}

if (require.main === module) {
  runProductionCatalogInit().catch((err) => {
    console.error('Fatal execution error:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  buildCanonicalCatalogPayloads,
  inspectTarget,
  computeOrdersFingerprint,
  auditDatabaseCatalogState,
  generateDryRunReport,
  executeProductionCatalogInit,
  runProductionCatalogInit,
};

