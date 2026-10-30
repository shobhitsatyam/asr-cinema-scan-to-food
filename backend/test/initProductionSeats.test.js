const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Auditorium = require('../src/models/Auditorium');
const Seat = require('../src/models/Seat');
const Order = require('../src/models/Order');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const { generateSeatManifest } = require('../src/data/seatManifest');
const {
  inspectTarget,
  computeOrdersFingerprint,
  verifyExistingSeatsPreflight,
  auditDatabaseState,
  generateDryRunReport,
  executeProductionSeatInit,
  runProductionInitWorkflow,
} = require('../scripts/initProductionSeats');

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

  // Invalid: Missing database name in URI (which would default to 'test')
  const noDbTarget = inspectTarget('mongodb+srv://admin:pass@cluster0.xyz.mongodb.net/?retryWrites=true');
  assert.equal(noDbTarget.isValid, false);
  assert.match(noDbTarget.reason, /missing/i);

  // Invalid: Unauthorized remote database
  const unauthorizedDb = inspectTarget('mongodb+srv://admin:pass@cluster0.xyz.mongodb.net/some-other-app-db');
  assert.equal(unauthorizedDb.isValid, false);
  assert.match(unauthorizedDb.reason, /not an authorized/i);
});

test('2. computeOrdersFingerprint: SHA-256 detects any modification in full order documents', async () => {
  const origFind = Order.find;
  const mockOrders = [
    {
      _id: 'order-1',
      id: 'ORD-101',
      auditorium: 'Audi 1',
      seat: 'A01',
      total: 600,
      subtotal: 600,
      customer: { name: 'Customer One', phone: '9876543210' },
      items: [{ id: 'popcorn', name: 'Large Popcorn', price: 600, quantity: 1 }],
      status: 'Served',
      createdAt: '2026-10-28T10:00:00.000Z',
    },
    {
      _id: 'order-2',
      id: 'ORD-102',
      auditorium: 'Audi 2',
      seat: 'C04',
      total: 250,
      subtotal: 250,
      customer: { name: 'Customer Two', phone: '9876543211' },
      items: [{ id: 'coke', name: 'Cold Drink', price: 250, quantity: 1 }],
      status: 'Completed',
      createdAt: '2026-10-28T11:00:00.000Z',
    },
  ];

  try {
    Order.find = () => ({
      sort: () => ({
        lean: async () => JSON.parse(JSON.stringify(mockOrders)),
      }),
    });

    const baseline = await computeOrdersFingerprint();
    assert.equal(baseline.count, 2);
    assert.equal(typeof baseline.hash, 'string');
    assert.equal(baseline.hash.length, 64); // SHA-256 hex string

    // Identical data produces identical hash
    const identical = await computeOrdersFingerprint();
    assert.equal(identical.hash, baseline.hash);

    // Tampering test A: Total altered by 1 Rupee
    Order.find = () => ({
      sort: () => ({
        lean: async () => {
          const cloned = JSON.parse(JSON.stringify(mockOrders));
          cloned[0].total = 601;
          return cloned;
        },
      }),
    });
    const tamperedTotal = await computeOrdersFingerprint();
    assert.notEqual(tamperedTotal.hash, baseline.hash, 'Changing total must change SHA-256 fingerprint');

    // Tampering test B: Customer name altered
    Order.find = () => ({
      sort: () => ({
        lean: async () => {
          const cloned = JSON.parse(JSON.stringify(mockOrders));
          cloned[1].customer.name = 'Customer Altered';
          return cloned;
        },
      }),
    });
    const tamperedCustomer = await computeOrdersFingerprint();
    assert.notEqual(tamperedCustomer.hash, baseline.hash, 'Changing customer must change SHA-256 fingerprint');

    // Tampering test C: Order status altered
    Order.find = () => ({
      sort: () => ({
        lean: async () => {
          const cloned = JSON.parse(JSON.stringify(mockOrders));
          cloned[0].status = 'Cancelled';
          return cloned;
        },
      }),
    });
    const tamperedStatus = await computeOrdersFingerprint();
    assert.notEqual(tamperedStatus.hash, baseline.hash, 'Changing status must change SHA-256 fingerprint');
  } finally {
    Order.find = origFind;
  }
});

test('3. verifyExistingSeatsPreflight: detects seat collisions and aborts before any writes', async () => {
  const origFind = Seat.find;
  const manifest = generateSeatManifest();

  try {
    // Scenario A: Empty database passes preflight cleanly
    Seat.find = () => ({ lean: async () => [] });
    const emptyResult = await verifyExistingSeatsPreflight(manifest);
    assert.equal(emptyResult.hasExistingSeats, false);
    assert.equal(emptyResult.count, 0);

    // Scenario B: Perfectly matching existing seats pass preflight cleanly (idempotent)
    Seat.find = () => ({
      lean: async () => [
        { auditoriumName: 'Audi 1', seatNumber: 'A01', token: 'audi1-a01', section: 'Premium Recliner' },
        { auditoriumName: 'Audi 2', seatNumber: 'A01', token: 'audi2-a01', section: 'Premium Recliner' },
      ],
    });
    const validResult = await verifyExistingSeatsPreflight(manifest);
    assert.equal(validResult.hasExistingSeats, true);
    assert.equal(validResult.count, 2);

    // Scenario C: Conflicting auditorium mapping for token causes safe abort
    Seat.find = () => ({
      lean: async () => [
        { auditoriumName: 'Audi 2', seatNumber: 'A01', token: 'audi1-a01', section: 'Premium Recliner' },
      ],
    });
    await assert.rejects(
      async () => {
        await verifyExistingSeatsPreflight(manifest);
      },
      (err) => {
        assert.equal(err.code, 'SEAT_COLLISION_DETECTED');
        assert.ok(err.conflicts.some((c) => c.includes("Auditorium mismatch for token 'audi1-a01'")));
        return true;
      }
    );

    // Scenario D: Conflicting physical seat number for token causes safe abort
    Seat.find = () => ({
      lean: async () => [
        { auditoriumName: 'Audi 1', seatNumber: 'B99', token: 'audi1-a01', section: 'Premium Recliner' },
      ],
    });
    await assert.rejects(
      async () => {
        await verifyExistingSeatsPreflight(manifest);
      },
      (err) => {
        assert.equal(err.code, 'SEAT_COLLISION_DETECTED');
        assert.ok(err.conflicts.some((c) => c.includes("Seat number mismatch for token 'audi1-a01'")));
        return true;
      }
    );

    // Scenario E: Token collision for physical seat causes safe abort
    Seat.find = () => ({
      lean: async () => [
        { auditoriumName: 'Audi 1', seatNumber: 'A01', token: 'audi1-a01-wrong-token', section: 'Premium Recliner' },
      ],
    });
    await assert.rejects(
      async () => {
        await verifyExistingSeatsPreflight(manifest);
      },
      (err) => {
        assert.equal(err.code, 'SEAT_COLLISION_DETECTED');
        return true;
      }
    );

    // Scenario F: Unknown / rogue seat token causes safe abort
    Seat.find = () => ({
      lean: async () => [
        { auditoriumName: 'Audi 9', seatNumber: 'Z99', token: 'audi9-z99', section: 'Standard' },
      ],
    });
    await assert.rejects(
      async () => {
        await verifyExistingSeatsPreflight(manifest);
      },
      (err) => {
        assert.equal(err.code, 'SEAT_COLLISION_DETECTED');
        assert.ok(err.conflicts.some((c) => c.includes("Unknown or rogue seat token in database: 'audi9-z99'")));
        return true;
      }
    );
  } finally {
    Seat.find = origFind;
  }
});

test('4. runProductionInitWorkflow rejects execute mode when ALLOW_PROD_SEAT_INIT is not set', async () => {
  const origAllow = process.env.ALLOW_PROD_SEAT_INIT;
  delete process.env.ALLOW_PROD_SEAT_INIT;

  try {
    await assert.rejects(
      async () => {
        await runProductionInitWorkflow('mongodb://127.0.0.1:27017/asr-cinema', {
          isExecute: true,
          isDryRun: false,
          isVerifyOnly: false,
          allowProdInit: false,
        });
      },
      (err) => {
        assert.equal(err.code, 'MISSING_AUTHORIZATION');
        assert.match(err.message, /ALLOW_PROD_SEAT_INIT=true/);
        return true;
      }
    );
  } finally {
    if (origAllow !== undefined) process.env.ALLOW_PROD_SEAT_INIT = origAllow;
  }
});

test('5. runProductionInitWorkflow rejects database name mismatch post-connect', async () => {
  const origConnect = mongoose.connect;
  const origDisconnect = mongoose.disconnect;

  let disconnected = false;

  try {
    // Simulate mongoose connection having name 'wrong-db'
    mongoose.connect = async () => {};
    mongoose.disconnect = async () => {
      disconnected = true;
    };
    Object.defineProperty(mongoose.connection, 'name', { value: 'wrong-db', configurable: true });

    await assert.rejects(
      async () => {
        await runProductionInitWorkflow('mongodb+srv://admin:pass@cluster0.xyz.mongodb.net/asr-cinema', {
          isDryRun: true,
          isExecute: false,
          isVerifyOnly: false,
        });
      },
      (err) => {
        assert.equal(err.code, 'DATABASE_MISMATCH');
        return true;
      }
    );

    assert.equal(disconnected, true, 'Must immediately disconnect if database name does not match');
  } finally {
    mongoose.connect = origConnect;
    mongoose.disconnect = origDisconnect;
    Object.defineProperty(mongoose.connection, 'name', { value: '', configurable: true });
  }
});

test('6. runProductionInitWorkflow in dry-run mode performs zero writes to any collection', async () => {
  const origConnect = mongoose.connect;
  const origDisconnect = mongoose.disconnect;
  const origOrderFind = Order.find;
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origAudiCount = Auditorium.countDocuments;
  const origSeatCount = Seat.countDocuments;
  const origSeatFind = Seat.find;

  // Intercept any write calls across all collections
  let writeAttempted = false;
  const writeGuard = (method) => () => {
    writeAttempted = true;
    throw new Error(`Forbidden write during dry-run: ${method}`);
  };

  const origAudiUpsert = Auditorium.findOneAndUpdate;
  const origSeatUpsert = Seat.findOneAndUpdate;
  const origOrderUpdate = Order.updateOne;

  try {
    mongoose.connect = async () => {};
    mongoose.disconnect = async () => {};
    Object.defineProperty(mongoose.connection, 'name', { value: 'asr-cinema', configurable: true });

    Auditorium.findOneAndUpdate = writeGuard('Auditorium.findOneAndUpdate');
    Seat.findOneAndUpdate = writeGuard('Seat.findOneAndUpdate');
    Order.updateOne = writeGuard('Order.updateOne');

    Order.find = () => ({
      sort: () => ({
        lean: async () => [{ _id: 'o1', total: 100 }],
      }),
    });
    Category.countDocuments = async () => 7;
    Product.countDocuments = async () => 43;
    Auditorium.countDocuments = async () => 0;
    Seat.countDocuments = async () => 0;
    Seat.find = () => ({ lean: async () => [] });

    const outcome = await runProductionInitWorkflow('mongodb://127.0.0.1:27017/asr-cinema', {
      isDryRun: true,
      isExecute: false,
      isVerifyOnly: false,
    });

    assert.equal(writeAttempted, false, 'Dry-run must never attempt database writes');
    assert.equal(outcome.mode, 'dry-run');
    assert.ok(outcome.report);
    assert.equal(outcome.report.manifestValid, true);
    assert.equal(outcome.report.plannedChanges.seatsToUpsert, 212);
  } finally {
    mongoose.connect = origConnect;
    mongoose.disconnect = origDisconnect;
    Auditorium.findOneAndUpdate = origAudiUpsert;
    Seat.findOneAndUpdate = origSeatUpsert;
    Order.updateOne = origOrderUpdate;
    Order.find = origOrderFind;
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Auditorium.countDocuments = origAudiCount;
    Seat.countDocuments = origSeatCount;
    Seat.find = origSeatFind;
    Object.defineProperty(mongoose.connection, 'name', { value: '', configurable: true });
  }
});

test('7. executeProductionSeatInit safely upserts 3 auditoriums and 212 seats while preserving orders', async () => {
  const upsertedAuditoria = [];
  const upsertedSeats = [];

  const origOrderFind = Order.find;
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origAudiCount = Auditorium.countDocuments;
  const origAudiUpsert = Auditorium.findOneAndUpdate;
  const origSeatUpsert = Seat.findOneAndUpdate;
  const origSeatCount = Seat.countDocuments;
  const origSeatFind = Seat.find;

  // Guard orders, categories, and products from any writes
  let protectedWriteAttempted = false;
  const protectedGuard = (name) => () => {
    protectedWriteAttempted = true;
    throw new Error(`Forbidden write to protected collection: ${name}`);
  };

  const origOrderUpdate = Order.findOneAndUpdate;
  const origCatUpdate = Category.findOneAndUpdate;
  const origProdUpdate = Product.findOneAndUpdate;

  try {
    Order.findOneAndUpdate = protectedGuard('Order');
    Category.findOneAndUpdate = protectedGuard('Category');
    Product.findOneAndUpdate = protectedGuard('Product');

    let seatCountState = 0;
    let activeSeatState = 0;

    const mockOrders = [{ _id: 'o1', id: 'ORD-1', auditorium: 'Audi 2', seat: 'B16', total: 500 }];
    Order.find = () => ({
      sort: () => ({
        lean: async () => JSON.parse(JSON.stringify(mockOrders)),
      }),
    });

    Category.countDocuments = async () => 7;
    Product.countDocuments = async () => 43;
    Auditorium.countDocuments = async () => 3;

    Auditorium.findOneAndUpdate = async (filter, update) => {
      upsertedAuditoria.push(update);
      return { _id: `audi-id-${update.name.replace(/\s+/g, '-').toLowerCase()}`, name: update.name };
    };

    Seat.findOneAndUpdate = async (filter, update) => {
      upsertedSeats.push(update);
      seatCountState += 1;
      activeSeatState += 1;
      return { _id: `seat-id-${update.token}`, ...update };
    };

    Seat.countDocuments = async (filter = {}) => {
      if (filter.status === 'active') return activeSeatState;
      if (filter.auditoriumName === 'Audi 1') return 96;
      if (filter.auditoriumName === 'Audi 2') return 32;
      if (filter.auditoriumName === 'Audi 3') return 84;
      return seatCountState;
    };

    Seat.find = () => ({
      lean: async () => [],
    });

    const result = await executeProductionSeatInit();

    assert.equal(protectedWriteAttempted, false, 'Protected collections must not receive write calls');
    assert.equal(result.success, true);
    assert.equal(result.seatsUpserted, 212);
    assert.equal(upsertedAuditoria.length, 3);
    assert.equal(upsertedSeats.length, 212);
    assert.equal(result.checks.seatCount212, true);
    assert.equal(result.checks.audi1Count96, true);
    assert.equal(result.checks.audi2Count32, true);
    assert.equal(result.checks.audi3Count84, true);
    assert.equal(result.checks.seatsUpserted212, true);
    assert.equal(result.checks.ordersCountPreserved, true);
    assert.equal(result.checks.ordersFingerprintUnchanged, true);
    assert.equal(result.checks.catalogPreserved, true);
  } finally {
    Order.find = origOrderFind;
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Auditorium.countDocuments = origAudiCount;
    Auditorium.findOneAndUpdate = origAudiUpsert;
    Seat.findOneAndUpdate = origSeatUpsert;
    Seat.countDocuments = origSeatCount;
    Seat.find = origSeatFind;
    Order.findOneAndUpdate = origOrderUpdate;
    Category.findOneAndUpdate = origCatUpdate;
    Product.findOneAndUpdate = origProdUpdate;
  }
});

test('8. executeProductionSeatInit aborts immediately if order tampering occurs during execution', async () => {
  const origOrderFind = Order.find;
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origAudiCount = Auditorium.countDocuments;
  const origAudiUpsert = Auditorium.findOneAndUpdate;
  const origSeatUpsert = Seat.findOneAndUpdate;
  const origSeatCount = Seat.countDocuments;
  const origSeatFind = Seat.find;

  try {
    let orderCallCount = 0;
    // Pre-execution returns original order; post-execution returns tampered order
    Order.find = () => ({
      sort: () => ({
        lean: async () => {
          orderCallCount += 1;
          if (orderCallCount === 1) {
            return [{ _id: 'o1', id: 'ORD-1', total: 500 }];
          }
          return [{ _id: 'o1', id: 'ORD-1', total: 99999 }]; // Tampered!
        },
      }),
    });

    Category.countDocuments = async () => 7;
    Product.countDocuments = async () => 43;
    Auditorium.countDocuments = async () => 3;

    Auditorium.findOneAndUpdate = async (filter, update) => ({
      _id: 'audi-id',
      name: update.name,
    });
    Seat.findOneAndUpdate = async (filter, update) => ({
      _id: 'seat-id',
      ...update,
    });
    Seat.find = () => ({ lean: async () => [] });
    Seat.countDocuments = async () => 212;

    await assert.rejects(
      async () => {
        await executeProductionSeatInit();
      },
      /Post-execution verification FAILED/
    );
  } finally {
    Order.find = origOrderFind;
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Auditorium.countDocuments = origAudiCount;
    Auditorium.findOneAndUpdate = origAudiUpsert;
    Seat.findOneAndUpdate = origSeatUpsert;
    Seat.countDocuments = origSeatCount;
    Seat.find = origSeatFind;
  }
});

test('9. Repeated execution (idempotency) succeeds with 0 duplicates and identical SHA-256 order hash', async () => {
  const dbAuditoria = new Map();
  const dbSeats = new Map();

  const origOrderFind = Order.find;
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origAudiCount = Auditorium.countDocuments;
  const origAudiUpsert = Auditorium.findOneAndUpdate;
  const origSeatUpsert = Seat.findOneAndUpdate;
  const origSeatCount = Seat.countDocuments;
  const origSeatFind = Seat.find;

  const mockOrders = [
    { _id: 'order-1', id: 'ORD-1', auditorium: 'Audi 1', seat: 'A01', total: 600, status: 'Served' },
    { _id: 'order-2', id: 'ORD-2', auditorium: 'Audi 3', seat: 'G12', total: 250, status: 'Completed' },
  ];

  try {
    Order.find = () => ({
      sort: () => ({
        lean: async () => JSON.parse(JSON.stringify(mockOrders)),
      }),
    });
    Category.countDocuments = async () => 7;
    Product.countDocuments = async () => 43;

    Auditorium.countDocuments = async () => dbAuditoria.size;
    Auditorium.findOneAndUpdate = async (filter, update) => {
      const existing = dbAuditoria.get(filter.name) || { _id: `id-${filter.name}` };
      const merged = { ...existing, ...update };
      dbAuditoria.set(filter.name, merged);
      return merged;
    };

    Seat.findOneAndUpdate = async (filter, update) => {
      const existing = dbSeats.get(filter.token) || { _id: `id-${filter.token}` };
      const merged = { ...existing, ...update };
      dbSeats.set(filter.token, merged);
      return merged;
    };

    Seat.countDocuments = async (filter = {}) => {
      const allSeats = Array.from(dbSeats.values());
      if (filter.status === 'active') return allSeats.filter((s) => s.status === 'active').length;
      if (filter.auditoriumName) return allSeats.filter((s) => s.auditoriumName === filter.auditoriumName).length;
      return allSeats.length;
    };

    Seat.find = (query = {}) => ({
      lean: async () => {
        let allSeats = Array.from(dbSeats.values());
        if (query.token && query.token.$in) {
          allSeats = allSeats.filter((s) => query.token.$in.includes(s.token));
        }
        return JSON.parse(JSON.stringify(allSeats));
      },
    });

    // Run 1: Initial execution
    const run1 = await executeProductionSeatInit();
    assert.equal(run1.success, true);
    assert.equal(dbAuditoria.size, 3);
    assert.equal(dbSeats.size, 212);
    assert.equal(run1.checks.ordersFingerprintUnchanged, true);

    // Run 2: Repeat execution against now-populated database
    const run2 = await executeProductionSeatInit();
    assert.equal(run2.success, true);
    // Ensure no duplicates were added
    assert.equal(dbAuditoria.size, 3, 'Must still have exactly 3 auditoriums');
    assert.equal(dbSeats.size, 212, 'Must still have exactly 212 seats');
    assert.equal(run2.checks.ordersFingerprintUnchanged, true);
    assert.equal(run2.preOrders.hash, run1.preOrders.hash, 'Order hash must remain identical across runs');
  } finally {
    Order.find = origOrderFind;
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Auditorium.countDocuments = origAudiCount;
    Auditorium.findOneAndUpdate = origAudiUpsert;
    Seat.findOneAndUpdate = origSeatUpsert;
    Seat.countDocuments = origSeatCount;
    Seat.find = origSeatFind;
  }
});

test('10. Partial failure simulation: network error midway throws, aborts without reporting success, and executes NO deletions', async () => {
  const dbSeats = new Map();
  let deleteAttempted = false;
  const deleteGuard = (model) => () => {
    deleteAttempted = true;
    throw new Error(`Forbidden destructive operation on ${model}`);
  };

  const origOrderFind = Order.find;
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origAudiCount = Auditorium.countDocuments;
  const origAudiUpsert = Auditorium.findOneAndUpdate;
  const origSeatUpsert = Seat.findOneAndUpdate;
  const origSeatCount = Seat.countDocuments;
  const origSeatFind = Seat.find;
  const origSeatDeleteMany = Seat.deleteMany;
  const origOrderDeleteMany = Order.deleteMany;

  try {
    Seat.deleteMany = deleteGuard('Seat');
    Order.deleteMany = deleteGuard('Order');

    const mockOrders = [{ _id: 'o1', id: 'ORD-1', auditorium: 'Audi 1', seat: 'A01', total: 600 }];
    Order.find = () => ({
      sort: () => ({
        lean: async () => JSON.parse(JSON.stringify(mockOrders)),
      }),
    });
    Category.countDocuments = async () => 7;
    Product.countDocuments = async () => 43;
    Auditorium.countDocuments = async () => 3;
    Auditorium.findOneAndUpdate = async (filter, update) => ({
      _id: `id-${update.name}`,
      name: update.name,
    });

    let upsertCount = 0;
    Seat.findOneAndUpdate = async (filter, update) => {
      upsertCount += 1;
      if (upsertCount === 50) {
        // Simulate network / database outage at 50th seat
        throw new Error('MongoNetworkTimeoutError: connection timed out at seat 50');
      }
      dbSeats.set(filter.token, update);
      return { _id: `id-${filter.token}`, ...update };
    };

    Seat.find = () => ({ lean: async () => [] });
    Seat.countDocuments = async () => dbSeats.size;

    await assert.rejects(
      async () => {
        await executeProductionSeatInit();
      },
      /MongoNetworkTimeoutError/
    );

    // Verify exactly 49 seats were saved before failure, failure was not hidden, and NO delete was called
    assert.equal(dbSeats.size, 49);
    assert.equal(deleteAttempted, false, 'No rollback or cleanup should delete documents');
  } finally {
    Order.find = origOrderFind;
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Auditorium.countDocuments = origAudiCount;
    Auditorium.findOneAndUpdate = origAudiUpsert;
    Seat.findOneAndUpdate = origSeatUpsert;
    Seat.countDocuments = origSeatCount;
    Seat.find = origSeatFind;
    Seat.deleteMany = origSeatDeleteMany;
    Order.deleteMany = origOrderDeleteMany;
  }
});

test('11. Authorized retry after partial failure: safely resumes from 49 seats to 212 seats with 0 duplicates', async () => {
  // Database starts with the 49 seats that succeeded before failure
  const dbAuditoria = new Map([
    ['Audi 1', { _id: 'audi-id-1', name: 'Audi 1', seatCount: 96 }],
    ['Audi 2', { _id: 'audi-id-2', name: 'Audi 2', seatCount: 32 }],
    ['Audi 3', { _id: 'audi-id-3', name: 'Audi 3', seatCount: 84 }],
  ]);
  const dbSeats = new Map();

  const manifest = generateSeatManifest();
  // Populate first 49 seats into DB
  for (let i = 0; i < 49; i++) {
    const s = manifest.seats[i];
    dbSeats.set(s.token, { ...s });
  }

  const origOrderFind = Order.find;
  const origCatCount = Category.countDocuments;
  const origProdCount = Product.countDocuments;
  const origAudiCount = Auditorium.countDocuments;
  const origAudiUpsert = Auditorium.findOneAndUpdate;
  const origSeatUpsert = Seat.findOneAndUpdate;
  const origSeatCount = Seat.countDocuments;
  const origSeatFind = Seat.find;

  const mockOrders = [
    { _id: 'o1', id: 'ORD-1', auditorium: 'Audi 1', seat: 'A01', total: 600, customer: { name: 'Customer 1' } },
  ];

  try {
    Order.find = () => ({
      sort: () => ({
        lean: async () => JSON.parse(JSON.stringify(mockOrders)),
      }),
    });
    Category.countDocuments = async () => 7;
    Product.countDocuments = async () => 43;

    Auditorium.countDocuments = async () => dbAuditoria.size;
    Auditorium.findOneAndUpdate = async (filter, update) => {
      const existing = dbAuditoria.get(filter.name) || { _id: `id-${filter.name}` };
      const merged = { ...existing, ...update };
      dbAuditoria.set(filter.name, merged);
      return merged;
    };

    Seat.findOneAndUpdate = async (filter, update) => {
      const existing = dbSeats.get(filter.token) || { _id: `id-${filter.token}` };
      const merged = { ...existing, ...update };
      dbSeats.set(filter.token, merged);
      return merged;
    };

    Seat.countDocuments = async (filter = {}) => {
      const allSeats = Array.from(dbSeats.values());
      if (filter.status === 'active') return allSeats.filter((s) => s.status === 'active').length;
      if (filter.auditoriumName) return allSeats.filter((s) => s.auditoriumName === filter.auditoriumName).length;
      return allSeats.length;
    };

    Seat.find = (query = {}) => ({
      lean: async () => {
        let allSeats = Array.from(dbSeats.values());
        if (query.token && query.token.$in) {
          allSeats = allSeats.filter((s) => query.token.$in.includes(s.token));
        }
        return JSON.parse(JSON.stringify(allSeats));
      },
    });

    // Verify initial partial state
    assert.equal(dbSeats.size, 49);

    // Preflight check on partial state must succeed because all 49 seats match canonical manifest
    const preflight = await verifyExistingSeatsPreflight(manifest);
    assert.equal(preflight.hasExistingSeats, true);
    assert.equal(preflight.count, 49);

    // Retry execution
    const retryResult = await executeProductionSeatInit();

    assert.equal(retryResult.success, true);
    assert.equal(retryResult.seatsUpserted, 212);
    assert.equal(dbSeats.size, 212, 'Must have exactly 212 seats (0 duplicates)');
    assert.equal(dbAuditoria.size, 3, 'Must have exactly 3 auditoriums');
    assert.equal(retryResult.checks.ordersFingerprintUnchanged, true);
    assert.equal(retryResult.checks.catalogPreserved, true);
  } finally {
    Order.find = origOrderFind;
    Category.countDocuments = origCatCount;
    Product.countDocuments = origProdCount;
    Auditorium.countDocuments = origAudiCount;
    Auditorium.findOneAndUpdate = origAudiUpsert;
    Seat.findOneAndUpdate = origSeatUpsert;
    Seat.countDocuments = origSeatCount;
    Seat.find = origSeatFind;
  }
});

