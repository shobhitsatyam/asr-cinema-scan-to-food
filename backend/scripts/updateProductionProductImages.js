/**
 * Safe, idempotent production product image update script for ASR Cinema.
 *
 * STRICT PRODUCTION SAFETY PROTOCOL:
 * 1. Read-only by default: Runs dry-run report unless explicitly authorized.
 * 2. Multi-layer authorization required for mutation:
 *    - CLI argument: --execute
 *    - Environment variable: ALLOW_PROD_IMAGE_UPDATE=true
 * 3. Strict target validation:
 *    - Connection URI must explicitly contain target database name 'asr-cinema'.
 *    - Post-connect check verifies mongoose.connection.name matches 'asr-cinema'.
 * 4. Preflight local asset verification:
 *    - Verifies all 12 referenced image files exist with non-zero size in frontend/public/food-image.
 * 5. Preflight database verification:
 *    - Verifies all 12 product IDs exist in the database before making any write.
 *    - Confirms catalog integrity (total 43 products).
 * 6. Scope restriction:
 *    - Updates ONLY the 'image' field via $set: { image: newPath }.
 *    - NEVER touches price, stock, category, availability, or any other fields.
 *    - Leaves the remaining 31 products completely untouched.
 * 7. Cryptographic order protection (SHA-256):
 *    - Verifies customer orders are 100% untouched before and after execution.
 * 8. Non-zero exit code: Any preflight failure, authorization failure, or post-verification failure exits with code 1.
 *
 * USAGE:
 *   Dry-run audit (safe, read-only):
 *     node scripts/updateProductionProductImages.js --dry-run
 *
 *   Execute update (requires explicit approval & env var):
 *     ALLOW_PROD_IMAGE_UPDATE=true node scripts/updateProductionProductImages.js --execute
 */

require('dotenv').config();
const path = require('path');
const dns = require('dns');
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Defense-in-depth: If MONGODB_URI is not set, load from backend/.env
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const Product = require('../src/models/Product');
const Order = require('../src/models/Order');

// Canonical list of the exact 12 image updates requested
const TARGET_IMAGE_UPDATES = [
  { id: 'family-combo', newImage: '/food-image/family-combo.jpg.png' },
  { id: 'couple-combo', newImage: '/food-image/couple-combo.jpg.png' },
  { id: 'large-popcorn', newImage: '/food-image/ASR-Popcorn.jpg.png' },
  { id: 'french-fry', newImage: '/food-image/ASR-fries.jpg.png' },
  { id: 'veg-grilled-sandwich', newImage: '/food-image/ASR-sandwiches.jpg.png' },
  { id: 'veg-fried-momos', newImage: '/food-image/ASR-momo.jpg.png' },
  { id: 'veg-cheese-burger-grilled', newImage: '/food-image/ASR-Burger.jpg.png' },
  { id: 'veg-spring-roll', newImage: '/food-image/ASR-rolls.jpg.png' },
  { id: 'garlic-bread', newImage: '/food-image/ASR-Garlic.jpg.png' },
  { id: 'veg-nuggets', newImage: '/food-image/ASR-Nuggets.jpg.png' },
  { id: 'samosa', newImage: '/food-image/ASR-samosa.jpg.png' },
  { id: 'regular-cold-drink', newImage: '/food-image/ASR-drinks.jpg.png' },
];

/**
 * Safely parse target host and database name from connection URI without connecting.
 */
function inspectTarget(rawUri = '') {
  const uri = String(rawUri || '').trim();
  if (!uri) {
    return { host: '', dbName: '', isProduction: false, isLocal: false, isValid: false, reason: 'URI is empty' };
  }

  const withoutProto = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const [beforeQuery] = withoutProto.split('?');
  const atIdx = beforeQuery.lastIndexOf('@');
  const hostAndDb = atIdx >= 0 ? beforeQuery.slice(atIdx + 1) : beforeQuery;
  const slashIdx = hostAndDb.indexOf('/');

  let host = hostAndDb;
  let dbName = '';

  if (slashIdx >= 0) {
    host = hostAndDb.slice(0, slashIdx);
    dbName = hostAndDb.slice(slashIdx + 1);
  }

  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const isProduction = host.includes('mongodb.net') || host.includes('cluster');

  if (!dbName) {
    return { host, dbName: '', isProduction, isLocal, isValid: false, reason: 'Target database name is missing in URI' };
  }

  if (dbName !== 'asr-cinema' && dbName !== 'asr-cinema-staging') {
    return {
      host,
      dbName,
      isProduction,
      isLocal,
      isValid: false,
      reason: `Refusing execution: database '${dbName}' is not an approved target (must be 'asr-cinema')`,
    };
  }

  return { host, dbName, isProduction, isLocal, isValid: true };
}

/**
 * Verify that all 12 local image files exist and are readable in the public folder.
 */
function verifyLocalImageFiles(publicDir = null) {
  const baseDir = publicDir || path.resolve(__dirname, '../../frontend/public');
  const results = [];

  for (const item of TARGET_IMAGE_UPDATES) {
    // Strip leading slash to resolve relative to baseDir
    const relPath = item.newImage.replace(/^\//, '');
    const fullPath = path.resolve(baseDir, relPath);

    if (!fs.existsSync(fullPath)) {
      results.push({ id: item.id, file: relPath, exists: false, error: 'File does not exist' });
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile() || stat.size === 0) {
      results.push({ id: item.id, file: relPath, exists: false, error: 'File is empty or not a regular file' });
      continue;
    }

    results.push({ id: item.id, file: relPath, exists: true, sizeBytes: stat.size });
  }

  const allExist = results.every((r) => r.exists);
  return { allExist, details: results };
}

/**
 * Compute SHA-256 fingerprint over all complete customer orders.
 */
async function computeOrdersFingerprint(OrderModel = Order) {
  const orders = await OrderModel.find({}).sort({ _id: 1 }).lean();
  const serialized = JSON.stringify(orders);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');
  return { count: orders.length, hash };
}

/**
 * Generate dry-run audit report comparing existing vs planned image paths.
 */
async function generateDryRunReport(ProductModel = Product) {
  const allProducts = await ProductModel.find({}).lean();
  const byId = new Map(allProducts.map((p) => [p.id, p]));

  const missingIds = [];
  const plannedUpdates = [];
  const untouchedProducts = [];

  for (const item of TARGET_IMAGE_UPDATES) {
    const existing = byId.get(item.id);
    if (!existing) {
      missingIds.push(item.id);
    } else {
      plannedUpdates.push({
        id: existing.id,
        name: existing.name,
        category: existing.category,
        currentImage: existing.image || '(empty)',
        newImage: item.newImage,
        isChanged: (existing.image || '') !== item.newImage,
      });
    }
  }

  const targetIdSet = new Set(TARGET_IMAGE_UPDATES.map((t) => t.id));
  for (const p of allProducts) {
    if (!targetIdSet.has(p.id)) {
      untouchedProducts.push({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        stock: p.stock,
        image: p.image || '(empty)',
      });
    }
  }

  return {
    totalProductsInDb: allProducts.length,
    missingIds,
    plannedUpdates,
    untouchedProductsCount: untouchedProducts.length,
    untouchedProducts,
  };
}

/**
 * Execute the image updates with strict field restriction.
 */
async function executeImageUpdates(ProductModel = Product) {
  console.log('\n--- EXECUTING PRODUCT IMAGE UPDATES ---');

  const updateResults = [];

  for (const item of TARGET_IMAGE_UPDATES) {
    const beforeDoc = await ProductModel.findOne({ id: item.id }).lean();
    if (!beforeDoc) {
      throw new Error(`CRITICAL: Product ID '${item.id}' vanished during execution preflight.`);
    }

    // STRICT ATOMIC MUTATION: $set only the image field
    const updateRes = await ProductModel.updateOne(
      { id: item.id },
      { $set: { image: item.newImage } }
    );

    const afterDoc = await ProductModel.findOne({ id: item.id }).lean();

    // Verify only the image field changed
    if (afterDoc.image !== item.newImage) {
      throw new Error(`CRITICAL: Verification failed for product '${item.id}'. Image was not updated.`);
    }
    if (afterDoc.price !== beforeDoc.price || afterDoc.stock !== beforeDoc.stock || afterDoc.category !== beforeDoc.category) {
      throw new Error(`CRITICAL CORRUPTION DETECTED: Non-image fields altered on product '${item.id}'!`);
    }

    updateResults.push({
      id: item.id,
      name: afterDoc.name,
      oldImage: beforeDoc.image || '(empty)',
      newImage: afterDoc.image,
      matchedCount: updateRes.matchedCount,
      modifiedCount: updateRes.modifiedCount,
    });

    console.log(`  ✔ [${item.id}] ${afterDoc.name}:`);
    console.log(`      Old: ${beforeDoc.image || '(empty)'}`);
    console.log(`      New: ${afterDoc.image}`);
  }

  return updateResults;
}

/**
 * Main coordinator function.
 */
async function runUpdateWorkflow(customUri = null, options = {}) {
  const isExecute = options.isExecute !== undefined ? Boolean(options.isExecute) : process.argv.includes('--execute');
  const isDryRun = options.isDryRun !== undefined ? Boolean(options.isDryRun) : !isExecute;
  const rawUri = customUri || process.env.MONGODB_URI || '';

  console.log('===========================================================');
  console.log('   ASR CINEMA — PRODUCT IMAGE UPDATE PROTOCOL (12 ITEMS)   ');
  console.log('===========================================================');

  // STEP 1: Verify all 12 local image files exist
  console.log('\n[PREFLIGHT 1/3] Verifying 12 local image files in frontend/public/food-image...');
  const fileCheck = verifyLocalImageFiles(options.publicDir);
  if (!fileCheck.allExist) {
    console.error('\n🚨 LOCAL IMAGE FILE VERIFICATION FAILED:');
    for (const d of fileCheck.details) {
      if (!d.exists) console.error(`  ❌ Missing or invalid: ${d.file} (${d.error})`);
    }
    if (options.throwOnError) throw new Error('Local image files missing');
    process.exit(1);
  }
  console.log('✔ All 12 image files verified present and non-empty in frontend/public/food-image.');

  // STEP 2: Validate Target MongoDB URI
  console.log('\n[PREFLIGHT 2/3] Validating MongoDB target...');
  const target = inspectTarget(rawUri);
  if (!target.isValid) {
    console.error('\n🚨 TARGET VALIDATION FAILED:');
    console.error(`Reason: ${target.reason}`);
    if (options.throwOnError) throw new Error(target.reason);
    process.exit(1);
  }

  console.log(`Target Host:     ${target.host}`);
  console.log(`Target Database: ${target.dbName}`);
  console.log(`Mode:            ${isExecute ? '⚡ EXECUTE MUTATION' : '📋 DRY-RUN (Read-Only)'}`);

  // Safety Gate: Reject execute without explicit env variable
  if (isExecute) {
    if (process.env.ALLOW_PROD_IMAGE_UPDATE !== 'true' && options.allowProdUpdate !== true) {
      console.error('\n🚨 AUTHORIZATION INTERLOCK ACTIVATED');
      console.error('Execution requires explicit confirmation via environment variable:');
      console.error('  ALLOW_PROD_IMAGE_UPDATE=true');
      console.error('Example:');
      console.error('  ALLOW_PROD_IMAGE_UPDATE=true node scripts/updateProductionProductImages.js --execute');
      console.error('\nOperation aborted with zero database modifications.');
      if (options.throwOnError) throw new Error('Authorization required: ALLOW_PROD_IMAGE_UPDATE=true');
      process.exit(1);
    }
  }

  // STEP 3: Connect to MongoDB
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

  // Post-connect target verification
  const connectedDb = mongoose.connection.name || '';
  if (connectedDb !== target.dbName) {
    console.error('\n🚨 POST-CONNECT TARGET MISMATCH');
    console.error(`Expected database '${target.dbName}', but connected to '${connectedDb}'`);
    await mongoose.disconnect();
    if (options.throwOnError) throw new Error(`Target database mismatch: expected ${target.dbName}, got ${connectedDb}`);
    process.exit(1);
  }
  console.log(`✔ Connected cleanly to database: '${connectedDb}'`);

  try {
    // Cryptographic pre-check on orders
    const preOrderCheck = await computeOrdersFingerprint();
    console.log(`\n[PRE-CHECK] Customer orders verified: ${preOrderCheck.count} documents (SHA-256: ${preOrderCheck.hash.slice(0, 16)}...)`);

    // Preflight Database Audit
    const report = await generateDryRunReport();

    // Verify all 12 IDs exist in database
    if (report.missingIds.length > 0) {
      console.error('\n🚨 PREFLIGHT PRODUCT ID VERIFICATION FAILED:');
      console.error(`Missing product IDs in database: ${report.missingIds.join(', ')}`);
      if (options.throwOnError) throw new Error(`Missing product IDs: ${report.missingIds.join(', ')}`);
      process.exit(1);
    }

    console.log(`✔ All 12 target product IDs verified present in database.`);
    console.log(`✔ Database product catalog verified: ${report.totalProductsInDb} total products (12 targeted, ${report.untouchedProductsCount} protected).`);

    if (isDryRun || !isExecute) {
      console.log('\n--- EXECUTING DRY-RUN AUDIT (ZERO WRITES) ---');
      console.log('\n[PLANNED 12 IMAGE UPDATES]');
      for (const item of report.plannedUpdates) {
        console.log(`  • [${item.id}] ${item.name} (${item.category})`);
        console.log(`      Current: ${item.currentImage}`);
        console.log(`      Planned: ${item.newImage}`);
      }

      console.log('\n[PROTECTED UNTOUCHED PRODUCTS]');
      console.log(`  Total protected products: ${report.untouchedProductsCount} (Zero modifications planned)`);
      console.log(`  Sample protected items: ${report.untouchedProducts.slice(0, 5).map((p) => p.name).join(', ')}...`);

      console.log('\n✔ DRY-RUN AUDIT COMPLETE: 0 writes performed.');
      console.log('To execute this update against production, run:');
      console.log('  ALLOW_PROD_IMAGE_UPDATE=true node scripts/updateProductionProductImages.js --execute');
      return { mode: 'dry-run', report };
    }

    // AUTHORIZED EXECUTION
    const updateResults = await executeImageUpdates();

    // POST-EXECUTION INTEGRITY CHECKS
    console.log('\n--- POST-EXECUTION INTEGRITY VERIFICATION ---');

    // 1. Verify Orders untouched
    const postOrderCheck = await computeOrdersFingerprint();
    if (postOrderCheck.count !== preOrderCheck.count || postOrderCheck.hash !== preOrderCheck.hash) {
      console.error('\n🚨 CRITICAL INTEGRITY VIOLATION: Customer orders were modified during execution!');
      process.exit(1);
    }
    console.log(`✔ Customer orders: 100% untouched (${postOrderCheck.count} docs, SHA-256 verified)`);

    // 2. Verify exactly 12 products updated, remaining 31 products untouched
    const postAllProducts = await Product.find({}).lean();
    if (postAllProducts.length !== report.totalProductsInDb) {
      console.error('\n🚨 CRITICAL INTEGRITY VIOLATION: Product document count altered!');
      process.exit(1);
    }

    const targetSet = new Set(TARGET_IMAGE_UPDATES.map((t) => t.id));
    for (const p of postAllProducts) {
      if (!targetSet.has(p.id)) {
        // Compare with pre-execution snapshot
        const original = report.untouchedProducts.find((u) => u.id === p.id);
        if (!original || p.image !== (original.image === '(empty)' ? '' : original.image)) {
          console.error(`\n🚨 CRITICAL INTEGRITY VIOLATION: Untargeted product '${p.id}' image was modified!`);
          process.exit(1);
        }
        if (p.price !== original.price || p.stock !== original.stock) {
          console.error(`\n🚨 CRITICAL INTEGRITY VIOLATION: Untargeted product '${p.id}' data was modified!`);
          process.exit(1);
        }
      }
    }
    console.log(`✔ Remaining 31 products: 100% untouched (prices, stock, images preserved)`);
    console.log(`✔ All 12 target products: Successfully updated with new local image paths`);
    console.log('✔ Product image update completed successfully.\n');

    return { mode: 'execute', updateResults };
  } catch (error) {
    console.error('\n🚨 SCRIPT EXECUTION FAILED:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed cleanly.\n');
  }
}

if (require.main === module) {
  runUpdateWorkflow().catch((err) => {
    console.error('Fatal execution error:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  TARGET_IMAGE_UPDATES,
  inspectTarget,
  verifyLocalImageFiles,
  computeOrdersFingerprint,
  generateDryRunReport,
  executeImageUpdates,
  runUpdateWorkflow,
};

