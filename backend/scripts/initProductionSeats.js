/**
 * Safe, idempotent production seat initialization script for ASR Cinema.
 *
 * STRICT PRODUCTION SAFETY PROTOCOL:
 * 1. Read-only by default: Runs dry-run report unless explicitly authorized.
 * 2. Multi-layer authorization required for mutation:
 *    - CLI argument: --execute
 *    - Environment variable: ALLOW_PROD_SEAT_INIT=true
 * 3. Strict target validation:
 *    - Connection URI must explicitly contain target database name 'asr-cinema'.
 *    - Post-connect check verifies mongoose.connection.name matches 'asr-cinema'.
 * 4. Preflight collision detection:
 *    - Scans all existing seats before writing anything.
 *    - Conflicting tokens, physical seat numbers, or auditorium mismatches trigger safe abort.
 * 5. Full cryptographic order protection (SHA-256):
 *    - Hashes all complete order documents without partial projection before and after execution.
 *    - Even a 1-byte alteration triggers immediate failure.
 * 6. Scope restriction: Writes ONLY to 'auditoria' and 'seats' collections.
 * 7. Non-zero exit code: Any authorization failure, preflight conflict, or post-check failure exits with code 1.
 *
 * USAGE:
 *   Dry-run audit (safe, read-only):
 *     node scripts/initProductionSeats.js --dry-run
 *
 *   Verify-only check (safe, read-only):
 *     node scripts/initProductionSeats.js --verify-only
 *
 *   Execute initialization (requires explicit approval & env var):
 *     ALLOW_PROD_SEAT_INIT=true node scripts/initProductionSeats.js --execute
 */

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Auditorium = require('../src/models/Auditorium');
const Seat = require('../src/models/Seat');
const Order = require('../src/models/Order');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const { auditoriums, generateSeatManifest, validateSeatManifest } = require('../src/data/seatManifest');

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
 * Preflight collision detection for all existing seats before ANY write.
 * Safely aborts if:
 * 1. An existing seat has a token matching the manifest, but conflicting physical seat / audi / section.
 * 2. An existing seat has (auditoriumName + seatNumber) matching manifest, but different token.
 * 3. An existing seat is unknown/rogue (not in canonical 212 seats).
 * 4. Existing database has internal token or physical seat collisions.
 */
async function verifyExistingSeatsPreflight(manifest) {
  const existingSeats = await Seat.find({}).lean();
  if (!existingSeats || existingSeats.length === 0) {
    return { hasExistingSeats: false, count: 0, conflicts: [] };
  }

  const manifestByToken = new Map();
  const manifestByPhysical = new Map();
  for (const s of manifest.seats) {
    manifestByToken.set(s.token, s);
    manifestByPhysical.set(`${s.auditoriumName}:${s.seatNumber.toUpperCase()}`, s);
  }

  const conflicts = [];
  const seenDbTokens = new Set();
  const seenDbPhysical = new Set();

  for (const dbSeat of existingSeats) {
    const dbToken = String(dbSeat.token || '').trim().toLowerCase();
    const dbPhysical = `${dbSeat.auditoriumName}:${String(dbSeat.seatNumber || '').toUpperCase()}`;

    if (seenDbTokens.has(dbToken)) {
      conflicts.push(`Duplicate token in database: '${dbToken}'`);
    }
    seenDbTokens.add(dbToken);

    if (seenDbPhysical.has(dbPhysical)) {
      conflicts.push(`Duplicate physical seat in database: '${dbPhysical}'`);
    }
    seenDbPhysical.add(dbPhysical);

    const expectedByToken = manifestByToken.get(dbToken);
    if (!expectedByToken) {
      conflicts.push(`Unknown or rogue seat token in database: '${dbToken}' (${dbPhysical})`);
      continue;
    }

    if (dbSeat.auditoriumName !== expectedByToken.auditoriumName) {
      conflicts.push(
        `Auditorium mismatch for token '${dbToken}': DB has '${dbSeat.auditoriumName}', manifest expects '${expectedByToken.auditoriumName}'`
      );
    }
    if (String(dbSeat.seatNumber).toUpperCase() !== String(expectedByToken.seatNumber).toUpperCase()) {
      conflicts.push(
        `Seat number mismatch for token '${dbToken}': DB has '${dbSeat.seatNumber}', manifest expects '${expectedByToken.seatNumber}'`
      );
    }
    if (dbSeat.section && dbSeat.section !== expectedByToken.section) {
      conflicts.push(
        `Section mismatch for token '${dbToken}': DB has '${dbSeat.section}', manifest expects '${expectedByToken.section}'`
      );
    }

    const expectedByPhysical = manifestByPhysical.get(dbPhysical);
    if (expectedByPhysical && expectedByPhysical.token !== dbToken) {
      conflicts.push(
        `Token collision for physical seat '${dbPhysical}': DB has token '${dbToken}', manifest expects '${expectedByPhysical.token}'`
      );
    }
  }

  if (conflicts.length > 0) {
    const errorMsg =
      `Preflight collision check FAILED with ${conflicts.length} conflict(s):\n  - ` + conflicts.join('\n  - ');
    const err = new Error(errorMsg);
    err.name = 'SeatCollisionError';
    err.code = 'SEAT_COLLISION_DETECTED';
    err.conflicts = conflicts;
    throw err;
  }

  return {
    hasExistingSeats: true,
    count: existingSeats.length,
    conflicts: [],
  };
}

/**
 * Read-only audit of current database state across all collections.
 * Never performs write or mutation operations.
 */
async function auditDatabaseState() {
  const ordersFingerprint = await computeOrdersFingerprint();
  const categoriesCount = await Category.countDocuments();
  const productsCount = await Product.countDocuments();
  const auditoriaCount = await Auditorium.countDocuments();
  const totalSeats = await Seat.countDocuments();
  const activeSeats = await Seat.countDocuments({ status: 'active' });

  const audiCounts = {};
  for (const audi of auditoriums) {
    audiCounts[audi.name] = await Seat.countDocuments({ auditoriumName: audi.name });
  }

  const sampleTokens = ['audi1-a01', 'audi2-a01', 'audi3-a01'];
  const sampleSeats = await Seat.find({ token: { $in: sampleTokens } }).lean();

  return {
    ordersCount: ordersFingerprint.count,
    ordersHash: ordersFingerprint.hash,
    categoriesCount,
    productsCount,
    auditoriaCount,
    totalSeats,
    activeSeats,
    audiCounts,
    sampleSeats: (sampleSeats || []).map((s) => ({
      token: s.token,
      auditorium: s.auditoriumName,
      seat: s.seatNumber,
      section: s.section,
      price: s.price,
      status: s.status,
    })),
  };
}

/**
 * Generate dry-run report analyzing manifest and planned database changes.
 */
async function generateDryRunReport(dbAudit) {
  const manifest = generateSeatManifest();
  const validation = validateSeatManifest(manifest);

  const plannedAuditoriaUpserts = auditoriums.map((a) => ({
    name: a.name,
    seatCount: a.seatCount,
    status: 'active',
  }));

  const plannedSeatUpsertsCount = manifest.seats.length;
  const audiSeatBreakdown = validation.summary.auditoriums;
  const categoryBreakdown = validation.summary.categories;

  return {
    manifestValid: validation.valid,
    manifestErrors: validation.errors,
    currentDbState: dbAudit,
    plannedChanges: {
      auditoriaToUpsert: plannedAuditoriaUpserts.length,
      seatsToUpsert: plannedSeatUpsertsCount,
      audiSeatBreakdown,
      categoryBreakdown,
      untouchedCollections: [
        {
          collection: 'orders',
          currentCount: dbAudit.ordersCount,
          fingerprint: dbAudit.ordersHash ? dbAudit.ordersHash.slice(0, 16) + '...' : 'none',
          action: 'PRESERVE (0 writes)',
        },
        { collection: 'categories', currentCount: dbAudit.categoriesCount, action: 'PRESERVE (0 writes)' },
        { collection: 'products', currentCount: dbAudit.productsCount, action: 'PRESERVE (0 writes)' },
      ],
      targetCollections: [
        { collection: 'auditoria', currentCount: dbAudit.auditoriaCount, expectedAfter: 3 },
        { collection: 'seats', currentCount: dbAudit.totalSeats, expectedAfter: 212 },
      ],
    },
  };
}

/**
 * Execute production seat initialization with idempotency and duplicate protection.
 * Only writes to 'auditoria' and 'seats' collections.
 */
async function executeProductionSeatInit() {
  const manifest = generateSeatManifest();
  const validation = validateSeatManifest(manifest);

  if (!validation.valid) {
    throw new Error(`Manifest pre-validation failed with ${validation.errors.length} error(s):\n${validation.errors.join('\n')}`);
  }

  // 1. Preflight collision & integrity check of existing seats BEFORE any writes
  await verifyExistingSeatsPreflight(manifest);

  // 2. Cryptographic baseline snapshot of complete orders and catalog
  const preOrders = await computeOrdersFingerprint();
  const initialCategoriesCount = await Category.countDocuments();
  const initialProductsCount = await Product.countDocuments();

  console.log(`\n[PRE-CHECK] Customer orders verified: ${preOrders.count} documents (SHA-256: ${preOrders.hash.slice(0, 16)}...)`);
  console.log(`[PRE-CHECK] Menu categories: ${initialCategoriesCount}, products: ${initialProductsCount}`);

  // 3. Idempotent Upsert of Auditoriums (auditoria collection)
  const audiDocMap = new Map();
  for (const audi of auditoriums) {
    const doc = await Auditorium.findOneAndUpdate(
      { name: audi.name },
      { name: audi.name, seatCount: audi.seatCount, status: 'active' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    audiDocMap.set(audi.name, doc._id);
    console.log(`✔ Auditorium verified/upserted: ${audi.name} (ID: ${doc._id}, seats: ${audi.seatCount})`);
  }

  // 4. Idempotent Upsert of 212 Physical Seats (seats collection)
  let seatsUpserted = 0;
  for (const seat of manifest.seats) {
    const audiId = audiDocMap.get(seat.auditoriumName);
    if (!audiId) {
      throw new Error(`Missing auditorium document for '${seat.auditoriumName}'`);
    }

    await Seat.findOneAndUpdate(
      { token: seat.token },
      {
        auditorium: audiId,
        auditoriumId: seat.auditoriumId,
        auditoriumName: seat.auditoriumName,
        row: seat.row,
        number: seat.number,
        seatNumber: seat.seatNumber,
        section: seat.section,
        price: seat.price,
        token: seat.token,
        status: seat.status || 'active',
        isDemo: false,
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    seatsUpserted += 1;
  }

  console.log(`✔ Seats upserted: ${seatsUpserted} documents`);

  // 5. Post-execution Verification
  const postAudit = await auditDatabaseState();
  const postOrders = await computeOrdersFingerprint();

  // Verification assertions
  const isSeatCountValid = postAudit.totalSeats === 212 && postAudit.activeSeats === 212;
  const isAudi1Valid = postAudit.audiCounts['Audi 1'] === 96;
  const isAudi2Valid = postAudit.audiCounts['Audi 2'] === 32;
  const isAudi3Valid = postAudit.audiCounts['Audi 3'] === 84;
  const isSeatsUpsertedValid = seatsUpserted === 212;
  const isOrdersCountPreserved = postOrders.count === preOrders.count;
  const isOrdersHashPreserved = postOrders.hash === preOrders.hash;
  const isCatalogPreserved =
    postAudit.categoriesCount === initialCategoriesCount &&
    postAudit.productsCount === initialProductsCount;

  const checks = {
    seatCount212: isSeatCountValid,
    audi1Count96: isAudi1Valid,
    audi2Count32: isAudi2Valid,
    audi3Count84: isAudi3Valid,
    seatsUpserted212: isSeatsUpsertedValid,
    ordersCountPreserved: isOrdersCountPreserved,
    ordersFingerprintUnchanged: isOrdersHashPreserved,
    catalogPreserved: isCatalogPreserved,
  };

  const success = Object.values(checks).every(Boolean);

  if (!success) {
    const failedChecks = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    throw new Error(`Post-execution verification FAILED on checks: ${failedChecks.join(', ')}`);
  }

  return {
    success: true,
    seatsUpserted,
    preOrders,
    postOrders,
    postAudit,
    checks,
  };
}

/**
 * Main coordinator function.
 */
async function runProductionInitWorkflow(customUri = null, options = {}) {
  const isDryRun =
    options.isDryRun !== undefined
      ? options.isDryRun
      : process.argv.includes('--dry-run') ||
        (!process.argv.includes('--execute') && !process.argv.includes('--verify-only'));
  const isVerifyOnly =
    options.isVerifyOnly !== undefined ? options.isVerifyOnly : process.argv.includes('--verify-only');
  const isExecute = options.isExecute !== undefined ? options.isExecute : process.argv.includes('--execute');

  const uriToUse = customUri || process.env.MONGODB_URI;
  if (!uriToUse) {
    const errorMsg = 'MONGODB_URI environment variable is missing.';
    console.error(`❌ ${errorMsg}`);
    const err = new Error(errorMsg);
    err.code = 'MISSING_URI';
    throw err;
  }

  const target = inspectTarget(uriToUse);
  if (!target.isValid) {
    const errorMsg = `Invalid MongoDB target URI: ${target.reason}`;
    console.error(`❌ ${errorMsg}`);
    const err = new Error(errorMsg);
    err.code = 'INVALID_TARGET_URI';
    throw err;
  }

  console.log('='.repeat(65));
  console.log('ASR CINEMA PRODUCTION SEAT INITIALIZATION WORKFLOW');
  console.log('='.repeat(65));
  console.log(`Target Host:     ${target.host}`);
  console.log(`Target Database: ${target.dbName}`);
  console.log(`Is Production:   ${target.isProduction ? 'YES (Live Database)' : 'NO'}`);
  console.log(
    `Mode:            ${
      isVerifyOnly
        ? 'VERIFY-ONLY (Read-Only)'
        : isExecute
        ? 'EXECUTE (Mutations Allowed)'
        : 'DRY-RUN (Read-Only Audit)'
    }`
  );
  console.log('='.repeat(65));

  // Multi-layer authorization check for execute mode
  if (isExecute) {
    const authFlag = process.env.ALLOW_PROD_SEAT_INIT === 'true' || options.allowProdInit === true;
    if (!authFlag) {
      console.error('\n🚨 SAFETY INTERLOCK: Production execution requires explicit authorization.');
      console.error('Missing required environment variable: ALLOW_PROD_SEAT_INIT=true');
      console.error('Aborting execution without touching database.');
      const err = new Error(
        'MISSING_AUTHORIZATION: Production seat execution requires ALLOW_PROD_SEAT_INIT=true environment variable.'
      );
      err.code = 'MISSING_AUTHORIZATION';
      throw err;
    }
  }

  console.log('\nConnecting to target database...');
  try {
    await mongoose.connect(uriToUse);
  } catch (connErr) {
    if (connErr.message && connErr.message.includes('querySrv ECONNREFUSED')) {
      console.warn('DNS SRV lookup failed on default resolver. Retrying with public DNS resolvers (8.8.8.8, 1.1.1.1)...');
      const dns = require('dns');
      dns.setServers(['8.8.8.8', '1.1.1.1']);
      await mongoose.connect(uriToUse);
    } else {
      throw connErr;
    }
  }

  // Post-connect verification
  const connectedDb = mongoose.connection.name || '';
  if (connectedDb !== target.dbName || (!target.isLocal && connectedDb !== 'asr-cinema')) {
    await mongoose.disconnect();
    const errorMsg = `CRITICAL SAFETY INTERLOCK: Connected database name '${connectedDb}' does not match expected target '${target.dbName}'. Disconnected immediately.`;
    console.error(`\n🚨 ${errorMsg}`);
    const err = new Error(errorMsg);
    err.code = 'DATABASE_MISMATCH';
    throw err;
  }

  console.log(`Connected and verified target database: ${connectedDb}`);

  try {
    const dbAudit = await auditDatabaseState();

    if (isVerifyOnly) {
      console.log('\n--- TARGET DATABASE VERIFICATION REPORT ---');
      console.log(`Auditoria count:    ${dbAudit.auditoriaCount}`);
      console.log(`Total seats:        ${dbAudit.totalSeats} (Target: 212)`);
      console.log(`Active seats:       ${dbAudit.activeSeats} (Target: 212)`);
      console.log(`Auditorium counts: `, dbAudit.audiCounts);
      console.log(`Existing orders:    ${dbAudit.ordersCount}`);
      console.log(`Sample seats:      `, dbAudit.sampleSeats);

      const isComplete =
        dbAudit.totalSeats === 212 &&
        dbAudit.activeSeats === 212 &&
        dbAudit.audiCounts['Audi 1'] === 96 &&
        dbAudit.audiCounts['Audi 2'] === 32 &&
        dbAudit.audiCounts['Audi 3'] === 84;

      if (isComplete) {
        console.log('\n✔ Verification successful: All 212 physical seats are active in the target database.');
      } else {
        console.log(`\n⚠ Verification notice: Target database has ${dbAudit.totalSeats}/212 seats. Initialization is required.`);
      }

      return { mode: 'verify-only', isComplete, audit: dbAudit };
    }

    if (isDryRun && !isExecute) {
      console.log('\n--- DRY-RUN AUDIT REPORT (NO WRITES PERFORMED) ---');
      const dryRunReport = await generateDryRunReport(dbAudit);
      console.log(`Manifest Pre-Validation:  ${dryRunReport.manifestValid ? 'PASSED (0 errors)' : 'FAILED'}`);
      console.log(`Current Seats in DB:      ${dbAudit.totalSeats}`);
      console.log(`Planned Auditoria Upsert: 3 records (Audi 1, Audi 2, Audi 3)`);
      console.log(`Planned Seats Upsert:     212 physical seats`);
      console.log(`  - Audi 1: 96 seats (A01-A12 Recliner, B01-D14 Platinum, E01-F14 Gold, G01-G14 Lounger)`);
      console.log(`  - Audi 2: 32 seats (A01-D08 Recliner)`);
      console.log(`  - Audi 3: 84 seats (A01-C12 Platinum, D01-F12 Gold, G01-G12 Lounger)`);
      console.log('\nPreserved Collections (STRICTLY UNTOUCHED):');
      for (const item of dryRunReport.plannedChanges.untouchedCollections) {
        console.log(`  - ${item.collection}: ${item.currentCount} records (${item.action})`);
      }
      console.log('\n✔ Dry-run audit completed cleanly. Zero mutations were performed.');
      console.log('To execute initialization on production, explicit authorization is required:');
      console.log('  ALLOW_PROD_SEAT_INIT=true node scripts/initProductionSeats.js --execute\n');
      return { mode: 'dry-run', report: dryRunReport };
    }

    // Execute Mode
    console.log('\n--- EXECUTING PRODUCTION SEAT INITIALIZATION ---');
    const result = await executeProductionSeatInit();

    console.log('\n--- POST-EXECUTION VERIFICATION REPORT ---');
    console.log(`Total seats upserted:   ${result.seatsUpserted}`);
    console.log(`Seats in database:      ${result.postAudit.totalSeats} (Target: 212)`);
    console.log(`Active seats:           ${result.postAudit.activeSeats} (Target: 212)`);
    console.log(`Auditorium breakdown:  `, result.postAudit.audiCounts);
    console.log(`Orders preserved:       ${result.postOrders.count} documents (SHA-256 verified)`);
    console.log(`Checks passed:         `, result.checks);
    console.log('\n✔ PRODUCTION INITIALIZATION SUCCESSFUL: Exactly 212 physical seats verified and all existing orders preserved.');

    return { mode: 'execute', result };
  } finally {
    await mongoose.disconnect();
    console.log('Database connection disconnected cleanly.');
  }
}

if (require.main === module) {
  runProductionInitWorkflow()
    .then((result) => {
      if (result && result.mode === 'execute' && result.result && !result.result.success) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Initialization workflow aborted with error:\n', err.message);
      process.exit(1);
    });
}

module.exports = {
  inspectTarget,
  computeOrdersFingerprint,
  verifyExistingSeatsPreflight,
  auditDatabaseState,
  generateDryRunReport,
  executeProductionSeatInit,
  runProductionInitWorkflow,
};
