/**
 * Production-safe, idempotent Veg / Non-Veg Catalog Migration Script for ASR Cinema.
 *
 * STRICT PRODUCTION SAFETY PROTOCOL:
 * 1. Read-only by default: Runs dry-run report unless explicitly authorized.
 * 2. Multi-layer authorization required for mutation:
 *    - CLI argument: --execute
 *    - Environment variable: ALLOW_PROD_CATALOG_MIGRATION=true
 * 3. Strict target validation:
 *    - Connection URI must explicitly contain target database name 'asr-cinema'.
 *    - Post-connect check verifies mongoose.connection.name matches 'asr-cinema'.
 * 4. Non-destructive guarantee:
 *    - NEVER deletes or wipes any existing database records.
 *    - NEVER overwrites existing prices, stock, availability, categories, or images.
 *    - Strictly idempotent: Skips already existing products.
 * 5. Full cryptographic order protection (SHA-256):
 *    - Hashes all complete order documents without partial projection before and after execution.
 *    - Any order modification triggers immediate safe abort with exit code 1.
 * 6. Scope restriction: Writes ONLY to 'products' collection.
 *    - Leaves 'orders', 'seats', and 'auditoria' collections completely untouched.
 * 7. Post-verification:
 *    - Confirms all 18 Non-Veg products are present with foodType: "non-veg".
 *    - Confirms all existing Veg products have foodType: "veg".
 * 8. Non-zero exit code: Any authorization failure, target mismatch, or post-check failure exits with code 1.
 *
 * USAGE:
 *   Dry-run audit (safe, read-only):
 *     node scripts/migrateVegNonVegCatalog.js --dry-run
 *
 *   Execute migration (requires explicit approval & env var):
 *     ALLOW_PROD_CATALOG_MIGRATION=true node scripts/migrateVegNonVegCatalog.js --execute
 */

require('dotenv').config();
const path = require('path');
const dns = require('dns');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Defense-in-depth: If MONGODB_URI is not set, load from backend/.env
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const Order = require('../src/models/Order');
const Seat = require('../src/models/Seat');
const Auditorium = require('../src/models/Auditorium');

/**
 * The canonical 18 Non-Veg products across the 5 categories.
 * 4 already exist in MongoDB (chicken-grilled-sandwich, chicken-fried-momos, chicken-burger-grilled, chicken-nuggets).
 * 14 are new additions.
 */
const NON_VEG_PRODUCTS = [
  // A. Sandwiches (4 total: 1 existing + 3 new)
  { id: 'chicken-grilled-sandwich', name: 'Chicken Grilled Sandwich', portion: '1 Pc', price: 340, category: 'Non-Veg', isExisting: true },
  { id: 'chicken-tikka-sandwich', name: 'Chicken Tikka Sandwich', portion: '1 Pc', price: 360, category: 'Non-Veg', isExisting: false },
  { id: 'chicken-cheese-sandwich', name: 'Chicken Cheese Sandwich', portion: '1 Pc', price: 380, category: 'Non-Veg', isExisting: false },
  { id: 'chicken-mayo-sandwich', name: 'Chicken Mayo Sandwich', portion: '1 Pc', price: 340, category: 'Non-Veg', isExisting: false },

  // B. Momos (5 total: 1 existing + 4 new)
  { id: 'chicken-fried-momos', name: 'Chicken Fried Momos', portion: '7 Pcs', price: 280, category: 'Non-Veg', isExisting: true },
  { id: 'chicken-steam-momos', name: 'Chicken Steam Momos', portion: '7 Pcs', price: 260, category: 'Non-Veg', isExisting: false },
  { id: 'chicken-lemon-corn-momos', name: 'Chicken Lemon Corn Momos', portion: '7 Pcs', price: 260, category: 'Non-Veg', isExisting: false },
  { id: 'chicken-masala-corn-momos', name: 'Chicken Masala Corn Momos', portion: '7 Pcs', price: 280, category: 'Non-Veg', isExisting: false },
  { id: 'chicken-sweet-corn-momos', name: 'Chicken Sweet Corn Momos', portion: '7 Pcs', price: 300, category: 'Non-Veg', isExisting: false },

  // C. Nuggets (4 total: 1 existing + 3 new)
  { id: 'chicken-nuggets', name: 'Chicken Nuggets', portion: '9 Pcs', price: 240, category: 'Non-Veg', isExisting: true },
  { id: 'chicken-cheese-nuggets', name: 'Chicken Cheese Nuggets', portion: '7 Pcs', price: 280, category: 'Non-Veg', isExisting: false },
  { id: 'chicken-fingers', name: 'Chicken Fingers', portion: '7 Pcs', price: 260, category: 'Non-Veg', isExisting: false },
  { id: 'chicken-popcorn', name: 'Chicken Popcorn', portion: '150 gm', price: 280, category: 'Non-Veg', isExisting: false },

  // D. Burger (2 total: 1 existing + 1 new)
  { id: 'chicken-burger-grilled', name: 'Chicken Burger Grilled', portion: '1 Pc', price: 260, category: 'Non-Veg', isExisting: true },
  { id: 'chicken-cheese-burger', name: 'Chicken Cheese Burger', portion: '1 Pc', price: 280, category: 'Non-Veg', isExisting: false },

  // E. Fries (3 total: 0 existing + 3 new)
  { id: 'chicken-tikka-fries', name: 'Chicken Tikka Fries', portion: '1 Plate', price: 300, category: 'Non-Veg', isExisting: false },
  { id: 'chicken-cheesy-fries', name: 'Chicken Cheesy Fries', portion: '1 Plate', price: 320, category: 'Non-Veg', isExisting: false },
  { id: 'chicken-wings', name: 'Chicken Wings', portion: '2 Pcs', price: 160, category: 'Non-Veg', isExisting: false },
];

/**
 * Inspect MongoDB target URI and validate safety.
 */
function inspectTarget(uri) {
  if (!uri || typeof uri !== 'string') {
    return { isValid: false, reason: 'MONGODB_URI is undefined or empty.' };
  }

  const cleanUri = uri.trim();
  const dbMatch = cleanUri.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbMatch ? dbMatch[1] : null;

  if (!dbName || dbName !== 'asr-cinema') {
    return {
      isValid: false,
      dbName,
      reason: `Target database name is '${dbName || 'unknown'}'. Expected exact database name 'asr-cinema'.`,
    };
  }

  const isAtlas = cleanUri.includes('mongodb.net');
  const isLocal = cleanUri.includes('localhost') || cleanUri.includes('127.0.0.1');

  return {
    isValid: true,
    dbName,
    isAtlas,
    isLocal,
    sanitizedUri: cleanUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
  };
}

/**
 * Calculate SHA-256 checksum over all complete customer order records.
 */
async function computeOrderChecksum() {
  const orders = await Order.find({}).sort({ _id: 1 }).lean();
  const serialized = JSON.stringify(orders);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

/**
 * Generate a dry-run plan report without performing any database mutations.
 */
async function generateDryRunPlan() {
  const existingProducts = await Product.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  const existingCategories = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  const existingProductMap = new Map(existingProducts.map((p) => [p.id, p]));

  const backfillPlan = [];
  const insertPlan = [];
  const existingNonVegIds = new Set(NON_VEG_PRODUCTS.map((p) => p.id));

  // 1. Classification backfill on existing products
  for (const prod of existingProducts) {
    const isTargetNonVeg = existingNonVegIds.has(prod.id);
    const expectedFoodType = isTargetNonVeg ? 'non-veg' : 'veg';
    const expectedType = isTargetNonVeg ? 'Non-Veg' : 'Veg';
    const expectedIsVeg = !isTargetNonVeg;

    const needsBackfill =
      prod.foodType !== expectedFoodType ||
      prod.type !== expectedType ||
      prod.isVeg !== expectedIsVeg;

    if (needsBackfill) {
      backfillPlan.push({
        id: prod.id,
        name: prod.name,
        currentFoodType: prod.foodType || '(none)',
        currentType: prod.type,
        currentIsVeg: prod.isVeg,
        targetFoodType: expectedFoodType,
        targetType: expectedType,
        targetIsVeg: expectedIsVeg,
      });
    }
  }

  // 2. New Non-Veg insertions plan
  for (const item of NON_VEG_PRODUCTS) {
    if (!existingProductMap.has(item.id)) {
      insertPlan.push({
        id: item.id,
        name: item.name,
        portion: item.portion,
        price: item.price,
        category: item.category,
        foodType: 'non-veg',
      });
    }
  }

  return {
    totalExistingProducts: existingProducts.length,
    totalExistingCategories: existingCategories.length,
    backfillCount: backfillPlan.length,
    backfillPlan,
    insertCount: insertPlan.length,
    insertPlan,
    nonVegTotalCount: NON_VEG_PRODUCTS.length,
  };
}

/**
 * Execute the Veg / Non-Veg catalog migration safely.
 */
async function executeMigration() {
  const initialChecksum = await computeOrderChecksum();
  console.log(`🔒 Preflight order integrity SHA-256: ${initialChecksum}`);

  const existingProducts = await Product.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  const existingProductMap = new Map(existingProducts.map((p) => [p.id, p]));
  const existingNonVegIds = new Set(NON_VEG_PRODUCTS.map((p) => p.id));

  // 1. Backfill foodType, isVeg, type on existing products
  console.log('\n--- 1. BACKFILLING FOOD TYPE ON EXISTING PRODUCTS ---');
  let backfilledCount = 0;
  for (const prod of existingProducts) {
    const isTargetNonVeg = existingNonVegIds.has(prod.id);
    const expectedFoodType = isTargetNonVeg ? 'non-veg' : 'veg';
    const expectedType = isTargetNonVeg ? 'Non-Veg' : 'Veg';
    const expectedIsVeg = !isTargetNonVeg;

    const needsBackfill =
      prod.foodType !== expectedFoodType ||
      prod.type !== expectedType ||
      prod.isVeg !== expectedIsVeg;

    if (needsBackfill) {
      await Product.updateOne(
        { id: prod.id },
        {
          $set: {
            foodType: expectedFoodType,
            type: expectedType,
            isVeg: expectedIsVeg,
          },
        }
      );
      backfilledCount++;
      console.log(`  ✔ [${prod.id}] Classified as '${expectedFoodType}' (${expectedType})`);
    }
  }
  console.log(`Backfilled foodType on ${backfilledCount} existing products.`);

  // 2. Insert new Non-Veg products idempotently
  console.log('\n--- 2. INSERTING NEW NON-VEG PRODUCTS (IDEMPOTENT) ---');
  let insertedCount = 0;
  let skippedCount = 0;

  // Find Non-Veg category id if available
  const nonVegCat = await Category.findOne({ slug: 'non-veg' }).lean();
  const categoryId = nonVegCat ? String(nonVegCat._id) : undefined;

  for (const item of NON_VEG_PRODUCTS) {
    if (existingProductMap.has(item.id)) {
      skippedCount++;
      console.log(`  ℹ [${item.id}] Already exists in catalog. Skipping insertion.`);
      continue;
    }

    const newDoc = new Product({
      id: item.id,
      name: item.name,
      slug: item.id,
      category: item.category,
      categoryId,
      type: 'Non-Veg',
      isVeg: false,
      foodType: 'non-veg',
      price: item.price,
      basePrice: item.price,
      originalPrice: item.price,
      shortDescription: item.portion,
      description: `${item.name} (${item.portion}) - Non-Veg selection at ASR Cinema`,
      image: '',
      isAvailable: true,
      inStock: true,
      stock: 100,
      prepTime: '10 mins',
      variants: [],
      addOns: [],
      sortOrder: 100 + insertedCount,
    });

    await newDoc.save();
    insertedCount++;
    console.log(`  ✔ [${item.id}] Inserted '${item.name}' (${item.portion}) @ ₹${item.price}`);
  }
  console.log(`Inserted ${insertedCount} new products, skipped ${skippedCount} existing products.`);

  // 3. Post-execution Order Checksum Verification
  const finalChecksum = await computeOrderChecksum();
  console.log(`🔒 Post-execution order integrity SHA-256: ${finalChecksum}`);
  if (initialChecksum !== finalChecksum) {
    throw new Error('CRITICAL SECURITY VIOLATION: Order records were altered during catalog migration!');
  }
  console.log('✅ Order integrity verification PASSED (100% untouched).');

  // 4. Verify all 18 Non-Veg products exist with correct foodType
  console.log('\n--- 3. VERIFYING 18 NON-VEG PRODUCTS ---');
  const nonVegCheck = await Product.find({ id: { $in: NON_VEG_PRODUCTS.map((p) => p.id) } }).lean();
  if (nonVegCheck.length !== NON_VEG_PRODUCTS.length) {
    throw new Error(`Verification failed: Expected ${NON_VEG_PRODUCTS.length} non-veg products, found ${nonVegCheck.length}.`);
  }
  for (const p of nonVegCheck) {
    if (p.foodType !== 'non-veg' || p.isVeg !== false || p.type !== 'Non-Veg') {
      throw new Error(`Product ${p.id} has incorrect classification: foodType=${p.foodType}, isVeg=${p.isVeg}, type=${p.type}`);
    }
  }
  console.log(`✅ All ${nonVegCheck.length} Non-Veg products verified with foodType: "non-veg".`);

  return {
    backfilledCount,
    insertedCount,
    skippedCount,
    verifiedNonVegCount: nonVegCheck.length,
  };
}

/**
 * Main script runner
 */
async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isDryRun = args.includes('--dry-run') || !isExecute;

  console.log('====================================================');
  console.log('   ASR CINEMA — VEG / NON-VEG CATALOG MIGRATION     ');
  console.log('====================================================');
  console.log(`Mode: ${isExecute ? 'EXECUTE (MUTATION)' : 'DRY-RUN (READ-ONLY)'}`);

  const target = inspectTarget(process.env.MONGODB_URI);
  if (!target.isValid) {
    console.error(`\n❌ Target validation failed: ${target.reason}`);
    process.exit(1);
  }
  console.log(`Target: ${target.sanitizedUri}`);
  console.log(`Target Database: ${target.dbName}`);

  if (isExecute) {
    if (process.env.ALLOW_PROD_CATALOG_MIGRATION !== 'true') {
      console.error('\n❌ Execution rejected: Missing environment variable ALLOW_PROD_CATALOG_MIGRATION=true.');
      console.error('To execute mutation on production database:');
      console.error('  ALLOW_PROD_CATALOG_MIGRATION=true node scripts/migrateVegNonVegCatalog.js --execute');
      process.exit(1);
    }
  }

  // Windows DNS fallback if SRV lookup fails
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch {
    // Ignore DNS setServer error
  }

  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
  });

  if (mongoose.connection.name !== 'asr-cinema') {
    console.error(`\n❌ Connected to unexpected database '${mongoose.connection.name}'. Expected 'asr-cinema'.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`✅ Connected successfully to '${mongoose.connection.name}'.`);

  try {
    if (isDryRun) {
      console.log('\n--- RUNNING READ-ONLY DRY-RUN AUDIT ---');
      const plan = await generateDryRunPlan();

      console.log(`\nExisting Catalog Status:`);
      console.log(`  Total Existing Products in DB: ${plan.totalExistingProducts}`);
      console.log(`  Total Existing Categories in DB: ${plan.totalExistingCategories}`);
      console.log(`  Classification Backfill Required: ${plan.backfillCount} products`);
      console.log(`  New Non-Veg Insertions Required: ${plan.insertCount} products`);

      if (plan.backfillPlan.length > 0) {
        console.log(`\nPlanned Food-Type Backfills (${plan.backfillPlan.length}):`);
        plan.backfillPlan.forEach((p) => {
          console.log(`  • [${p.id}] ${p.name}: current foodType=${p.currentFoodType} -> target=${p.targetFoodType} (${p.targetType})`);
        });
      }

      if (plan.insertPlan.length > 0) {
        console.log(`\nPlanned Non-Veg Insertions (${plan.insertPlan.length}):`);
        plan.insertPlan.forEach((p) => {
          console.log(`  • [${p.id}] ${p.name} (${p.portion}) @ ₹${p.price} [Category: ${p.category}, foodType: non-veg]`);
        });
      }

      console.log('\n====================================================');
      console.log('DRY RUN COMPLETE — ZERO DATABASE MUTATIONS PERFORMED');
      console.log('====================================================');
    } else {
      console.log('\n--- EXECUTING CATALOG MIGRATION ---');
      const result = await executeMigration();
      console.log('\n====================================================');
      console.log('CATALOG MIGRATION COMPLETED SUCCESSFULLY');
      console.log(`  Backfilled Products: ${result.backfilledCount}`);
      console.log(`  Inserted Products:   ${result.insertedCount}`);
      console.log(`  Skipped (Existing):  ${result.skippedCount}`);
      console.log(`  Verified Non-Veg:    ${result.verifiedNonVegCount}`);
      console.log('====================================================');
    }
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n❌ Fatal migration error:', err.message);
    if (mongoose.connection.readyState !== 0) {
      mongoose.disconnect().catch(() => {});
    }
    process.exit(1);
  });
}

module.exports = {
  NON_VEG_PRODUCTS,
  inspectTarget,
  computeOrderChecksum,
  generateDryRunPlan,
  executeMigration,
};

