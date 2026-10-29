/**
 * Safe, repeatable seed & verification script for real auditorium and seat mapping.
 *
 * STRICT SAFETY RULES:
 * - NEVER runs in production (aborts if NODE_ENV === 'production').
 * - Requires explicit execution flag ALLOW_SEED=true to perform mutations.
 * - Supports safe read-only inspection via --verify-only (requires no ALLOW_SEED flag).
 * - Idempotent upsert logic (safe to run multiple times without duplicates).
 */

const mongoose = require('mongoose');
const env = require('../src/config/env');
const { connectDatabase } = require('../src/config/db');
const Auditorium = require('../src/models/Auditorium');
const Seat = require('../src/models/Seat');
const { auditoriums, generateSeatManifest } = require('../src/data/seatManifest');

async function verifyDatabaseSeats() {
  const audiCounts = {};
  for (const audi of auditoriums) {
    const count = await Seat.countDocuments({ auditoriumName: audi.name });
    audiCounts[audi.name] = count;
  }
  const totalSeats = await Seat.countDocuments();
  const activeSeats = await Seat.countDocuments({ status: 'active' });

  const sampleTokens = ['audi1-a01', 'audi2-a01', 'audi3-a01'];
  const samples = await Seat.find({ token: { $in: sampleTokens } }).lean();

  return {
    totalSeats,
    activeSeats,
    audiCounts,
    samples: samples.map((s) => ({
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
    process.env.NODE_ENV === 'production' ||
    env.nodeEnv === 'production';

  return { host, dbName, isLocal, isExplicitStaging, isProduction };
}

async function runSeedOrVerify(customUri = null) {
  const isVerifyOnly = process.argv.includes('--verify-only');
  const uriToUse = customUri || env.mongoUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/asr-cinema';
  const target = inspectMongoTarget(uriToUse);

  // 1. REJECT PRODUCTION IN EVERY EXECUTION MODE (including --verify-only)
  // Before connecting or executing any database queries
  if (target.isProduction || env.nodeEnv === 'production' || process.env.NODE_ENV === 'production') {
    console.error('\n🚨 CRITICAL SAFETY INTERLOCK ACTIVATED');
    console.error(`Target database '${target.dbName}' on remote cluster '${target.host}' is identified as the LIVE PRODUCTION database.`);
    console.error('This database contains active customer orders.');
    console.error('Execution against production is STRICTLY FORBIDDEN in ALL modes, including --verify-only.');
    console.error('To run against staging, configure MONGODB_URI to point to a designated staging database (e.g. /asr-cinema-staging) or local database.');
    process.exit(1);
  }

  // 2. In seed mode (write mode), must be explicit staging or local, AND require ALLOW_SEED=true
  if (!isVerifyOnly) {
    if (!target.isLocal && !target.isExplicitStaging) {
      console.error('\n🚨 SAFETY INTERLOCK: Target database cannot be positively identified as staging or dev.');
      console.error(`Target: ${target.host} / ${target.dbName}`);
      console.error('Database name must contain "staging", "dev", or "test", or be a local database (127.0.0.1).');
      console.error('Aborting without modifying any data.');
      process.exit(1);
    }

    if (process.env.ALLOW_SEED !== 'true') {
      console.error('SAFETY NOTICE: Seed script requires ALLOW_SEED=true environment variable.');
      console.error('Example: ALLOW_SEED=true node scripts/seedSeats.js');
      console.error('To run safe read-only check: node scripts/seedSeats.js --verify-only');
      process.exit(1);
    }
  }

  console.log(isVerifyOnly ? 'Starting read-only database verification...' : 'Starting safe staging seat seeding...');
  const isConnected = await connectDatabase();
  if (!isConnected) {
    console.error('Failed to connect to database. Aborting.');
    process.exit(1);
  }

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

  try {
    if (isVerifyOnly) {
      console.log('\n--- TARGET DATABASE VERIFICATION REPORT ---');
      const stats = await verifyDatabaseSeats();
      console.log(`Total seats in database: ${stats.totalSeats}`);
      console.log(`Active seats: ${stats.activeSeats}`);
      console.log(`Auditorium breakdown:`, stats.audiCounts);
      console.log(`Sample tokens in database:`, stats.samples);

      const isManifestComplete =
        stats.totalSeats === 212 &&
        stats.audiCounts['Audi 1'] === 96 &&
        stats.audiCounts['Audi 2'] === 32 &&
        stats.audiCounts['Audi 3'] === 84;

      if (isManifestComplete) {
        console.log('\n✔ All 212 confirmed physical seats are present in the target database.');
      } else {
        console.log(`\n⚠ Database currently contains ${stats.totalSeats}/212 seats. Seeding is required.`);
      }
      return;
    }

    const { seats } = generateSeatManifest();
    const audiDocMap = new Map();

    // 1. Idempotent Upsert for Auditoriums
    for (const audi of auditoriums) {
      const doc = await Auditorium.findOneAndUpdate(
        { name: audi.name },
        { name: audi.name, seatCount: audi.seatCount, status: 'active' },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      audiDocMap.set(audi.name, doc._id);
      console.log(`Auditorium upserted: ${audi.name} (ID: ${doc._id}, seats: ${audi.seatCount})`);
    }

    // 2. Idempotent Upsert for all 212 Seats
    let seatsUpserted = 0;
    for (const seat of seats) {
      const audiId = audiDocMap.get(seat.auditoriumName);
      if (!audiId) continue;

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

    console.log(`\nSeat seeding complete! Total seats upserted: ${seatsUpserted}`);

    // 3. Post-Seed Verification
    const stats = await verifyDatabaseSeats();
    console.log(`Verification: Total seats in DB = ${stats.totalSeats} (Target: 212)`);
    console.log(`Auditorium breakdown:`, stats.audiCounts);
    console.log(`Sample tokens:`, stats.samples);

    if (stats.totalSeats === 212) {
      console.log('\n✔ Seeding successful: Exactly 212 physical seats verified in database.');
    } else {
      console.error(`\n❌ Seeding count mismatch: Expected 212 seats, found ${stats.totalSeats}.`);
    }
  } catch (error) {
    console.error('Error during seat seeding/verification:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected cleanly.');
  }
}

if (require.main === module) {
  runSeedOrVerify();
}

module.exports = {
  runSeedOrVerify,
  verifyDatabaseSeats,
  inspectMongoTarget,
};
