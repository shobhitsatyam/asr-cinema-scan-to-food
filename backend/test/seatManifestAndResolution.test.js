const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Seat = require('../src/models/Seat');
const Order = require('../src/models/Order');
const env = require('../src/config/env');
const { store } = require('../src/data/memoryStore');
const {
  auditoriums,
  generateSeatManifest,
  validateSeatManifest,
} = require('../src/data/seatManifest');
const { buildQrDataset } = require('../scripts/generateQrManifest');
const {
  resolveSeat,
  listSeats,
  listAdminSeats,
  updateSeatStatus,
} = require('../src/controllers/seatController');
const { createOrder } = require('../src/controllers/orderController');

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(key, val) {
      this.headers[key] = val;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

test('1. Canonical seat manifest generates valid confirmed manifest with metadata', () => {
  const manifest = generateSeatManifest();
  assert.ok(manifest);
  assert.ok(Array.isArray(manifest.auditoriums));
  assert.ok(Array.isArray(manifest.seats));
  assert.equal(manifest.metadata.status, 'CONFIRMED_PHYSICAL_LAYOUT');
  assert.equal(manifest.metadata.isProductionConfirmed, true);
  assert.equal(manifest.seats.length, 212);
});

test('2. validateSeatManifest passes on the canonical seat manifest with zero errors', () => {
  const manifest = generateSeatManifest();
  const validation = validateSeatManifest(manifest);

  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.summary.totalSeats, 212);
  assert.equal(validation.summary.totalActive, 212);
  assert.equal(validation.summary.demoSeats, 0);
  assert.deepEqual(validation.summary.auditoriums, {
    'Audi 1': 96,
    'Audi 2': 32,
    'Audi 3': 84,
  });
  assert.deepEqual(validation.summary.categories, {
    'Premium Recliner': 44,
    'Premium Platinum': 78,
    'Premium Gold': 64,
    'Premium Lounger': 26,
  });
});

test('3. validateSeatManifest detects and flags duplicate seat tokens', () => {
  const manifest = generateSeatManifest();
  // Artificially duplicate a token
  manifest.seats.push({
    auditoriumId: 'audi-1',
    auditoriumName: 'Audi 1',
    row: 'A',
    number: 99,
    seatNumber: 'A99',
    token: 'audi1-a01', // duplicate of first seat!
    section: 'Recliner',
    status: 'active',
  });

  const validation = validateSeatManifest(manifest);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("Duplicate token 'audi1-a01'")));
});

test('4. validateSeatManifest detects and flags duplicate physical seats in the same auditorium', () => {
  const manifest = generateSeatManifest();
  // Artificially duplicate a physical seat with a different token
  manifest.seats.push({
    auditoriumId: 'audi-1',
    auditoriumName: 'Audi 1',
    row: 'A',
    number: 1,
    seatNumber: 'A01', // duplicate physical seat in Audi 1!
    token: 'audi1-a01-secondary',
    section: 'Recliner',
    status: 'active',
  });

  const validation = validateSeatManifest(manifest);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("Duplicate physical seat 'A01' in 'Audi 1'")));
});

test('5. validateSeatManifest rejects malformed fields and invalid status', () => {
  const malformedManifest = {
    auditoriums: [{ id: 'audi-1', name: 'Audi 1', seatCount: 1 }],
    seats: [
      {
        auditoriumId: '',
        auditoriumName: 'Audi 1',
        row: '',
        seatNumber: '',
        token: 'UPPERCASE_INVALID',
        status: 'broken', // invalid status
      },
    ],
  };

  const validation = validateSeatManifest(malformedManifest);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes('auditoriumId is missing')));
  assert.ok(validation.errors.some((e) => e.includes('row label is missing')));
  assert.ok(validation.errors.some((e) => e.includes('seatNumber is missing')));
  assert.ok(validation.errors.some((e) => e.includes("invalid status 'broken'")));
  assert.ok(validation.errors.some((e) => e.includes('must be lowercase')));
});

test('6. resolveSeat returns full physical details for active database seat', async () => {
  const origFindOne = Seat.findOne;
  const origReadyState = mongoose.connection.readyState;

  try {
    Seat.findOne = () => ({
      lean: async () => ({
        _id: 'db-seat-uuid-1',
        auditoriumName: 'Audi 2',
        auditoriumId: 'audi-2',
        row: 'C',
        number: 4,
        seatNumber: 'C04',
        section: 'Premium Recliner',
        token: 'audi2-c04',
        status: 'active',
        isDemo: false,
      }),
    });

    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    const req = { params: { token: 'audi2-c04' } };
    const res = createMockRes();
    await resolveSeat(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.seat.auditorium, 'Audi 2');
    assert.equal(res.body.seat.seatNumber, 'C04');
    assert.equal(res.body.seat.section, 'Premium Recliner');
    assert.equal(res.body.seat.row, 'C');
    assert.equal(res.body.seat.status, 'active');
  } finally {
    Seat.findOne = origFindOne;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('7. resolveSeat fails closed when seat exists in DB but is inactive', async () => {
  const origFindOne = Seat.findOne;
  const origReadyState = mongoose.connection.readyState;

  try {
    Seat.findOne = () => ({
      lean: async () => ({
        _id: 'db-seat-inactive',
        auditoriumName: 'Audi 1',
        seatNumber: 'B08',
        token: 'audi1-b08',
        status: 'inactive', // Blocked or under repair!
      }),
    });

    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    const req = { params: { token: 'audi1-b08' } };
    const res = createMockRes();
    await resolveSeat(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.seat, null);
    assert.match(res.body.message, /inactive or out of service/i);
  } finally {
    Seat.findOne = origFindOne;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('8. resolveSeat in production fails closed with 404 when seat is not in database', async () => {
  const origFindOne = Seat.findOne;
  const origReadyState = mongoose.connection.readyState;
  const origEnv = env.nodeEnv;
  env.nodeEnv = 'production';

  try {
    Seat.findOne = () => ({
      lean: async () => null, // Not in DB!
    });

    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

    const req = { params: { token: 'audi2-b16' } }; // Even demo token must NOT bypass DB in production!
    const res = createMockRes();
    await resolveSeat(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.seat, null);
    assert.match(res.body.message, /could not be verified/i);
  } finally {
    Seat.findOne = origFindOne;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
    env.nodeEnv = origEnv;
  }
});

test('9. resolveSeat in production fails closed with 503 when MongoDB is unavailable', async () => {
  const origReadyState = mongoose.connection.readyState;
  const origEnv = env.nodeEnv;
  env.nodeEnv = 'production';

  try {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

    const req = { params: { token: 'audi1-a01' } };
    const res = createMockRes();
    await resolveSeat(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.seat, null);
    assert.match(res.body.message, /database service is currently unavailable/i);
  } finally {
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
    env.nodeEnv = origEnv;
  }
});

test('10. createOrder authoritatively enforces server seat identity and ignores client-supplied strings', async () => {
  const origSeats = store.seats;
  try {
    store.seats = [
      {
        auditoriumName: 'Audi 3',
        seatNumber: 'D05',
        token: 'audi3-d05',
        status: 'active',
      },
    ];

    const req = {
      body: {
        seatToken: 'audi3-d05',
        auditorium: 'TAMPERED_AUDI_99', // Malicious client attempt to forge auditorium
        seat: 'TAMPERED_SEAT_999', // Malicious client attempt to forge seat
        items: [{ id: 'water-bottle', quantity: 1 }],
        customer: { name: 'Audit Patron', phone: '9876543210' },
      },
    };
    const res = createMockRes();
    await createOrder(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    // Server must have rejected tampered strings and used authoritative server record:
    assert.equal(res.body.order.auditorium, 'Audi 3', 'Auditorium must come strictly from server record');
    assert.equal(res.body.order.seat, 'D05', 'Seat must come strictly from server record');
  } finally {
    store.seats = origSeats;
  }
});

test('11. createOrder rejects checkout when seat is inactive in server records', async () => {
  const origSeats = store.seats;
  try {
    store.seats = [
      {
        auditoriumName: 'Audi 1',
        seatNumber: 'A01',
        token: 'audi1-a01',
        status: 'inactive', // Inactive seat!
      },
    ];

    const req = {
      body: {
        seatToken: 'audi1-a01',
        items: [{ id: 'water-bottle', quantity: 1 }],
        customer: { name: 'Audit Patron', phone: '9876543210' },
      },
    };
    const res = createMockRes();
    await createOrder(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /currently inactive/i);
  } finally {
    store.seats = origSeats;
  }
});

test('12. listAdminSeats returns auditorium-wise seats and supports filtering', async () => {
  const origSeats = store.seats;
  try {
    store.seats = [
      { _id: 's1', auditoriumName: 'Audi 1', seatNumber: 'A01', token: 'audi1-a01', status: 'active' },
      { _id: 's2', auditoriumName: 'Audi 1', seatNumber: 'A02', token: 'audi1-a02', status: 'inactive' },
      { _id: 's3', auditoriumName: 'Audi 2', seatNumber: 'B16', token: 'audi2-b16', status: 'active' },
    ];

    // 1. Fetch all
    const reqAll = { query: {} };
    const resAll = createMockRes();
    await listAdminSeats(reqAll, resAll);
    assert.equal(resAll.statusCode, 200);
    assert.equal(resAll.body.count, 3);

    // 2. Filter by Audi 1
    const reqAudi1 = { query: { auditorium: 'Audi 1' } };
    const resAudi1 = createMockRes();
    await listAdminSeats(reqAudi1, resAudi1);
    assert.equal(resAudi1.statusCode, 200);
    assert.equal(resAudi1.body.count, 2);
    assert.ok(resAudi1.body.seats.every((s) => s.auditoriumName === 'Audi 1'));
  } finally {
    store.seats = origSeats;
  }
});

test('13. updateSeatStatus updates active/inactive status and validates status input', async () => {
  const origSeats = store.seats;
  try {
    store.seats = [
      { _id: 's-toggle', auditoriumName: 'Audi 2', seatNumber: 'B16', token: 'audi2-b16', status: 'active' },
    ];

    // 1. Invalid status
    const reqInvalid = { params: { id: 's-toggle' }, body: { status: 'invalid_status' } };
    const resInvalid = createMockRes();
    await updateSeatStatus(reqInvalid, resInvalid);
    assert.equal(resInvalid.statusCode, 400);
    assert.match(resInvalid.body.message, /must be either 'active' or 'inactive'/i);

    // 2. Valid status deactivation
    const reqDeactivate = { params: { id: 's-toggle' }, body: { status: 'inactive' } };
    const resDeactivate = createMockRes();
    await updateSeatStatus(reqDeactivate, resDeactivate);
    assert.equal(resDeactivate.statusCode, 200);
    assert.equal(resDeactivate.body.seat.status, 'inactive');

    // 3. Valid status reactivation by token
    const reqActivate = { params: { id: 'audi2-b16' }, body: { status: 'active' } };
    const resActivate = createMockRes();
    await updateSeatStatus(reqActivate, resActivate);
    assert.equal(resActivate.statusCode, 200);
    assert.equal(resActivate.body.seat.status, 'active');
  } finally {
    store.seats = origSeats;
  }
});

test('14. Historical order data preservation: Orders retain frozen auditorium and seat strings', () => {
  const orderDoc = new Order({
    id: '#ASR-HISTORICAL-1',
    trackingToken: 'test-token-12345',
    auditorium: 'Audi 2',
    seat: 'B16',
    customer: { name: 'Historic Guest', phone: '9876543210' },
    items: [{ id: 'water', name: 'Water', quantity: 1, price: 50 }],
    subtotal: 50,
    total: 50,
    time: '10:00 PM',
  });

  assert.equal(orderDoc.auditorium, 'Audi 2');
  assert.equal(orderDoc.seat, 'B16');
  assert.equal(typeof orderDoc.auditorium, 'string');
  assert.equal(typeof orderDoc.seat, 'string');
});

test('15. Exact row ranges, seat numbers, and counts per auditorium match layout', () => {
  const { seats } = generateSeatManifest();
  assert.equal(seats.length, 212);

  // Audi 1: 96 seats
  const audi1 = seats.filter((s) => s.auditoriumName === 'Audi 1');
  assert.equal(audi1.length, 96);
  const audi1ByRow = {};
  audi1.forEach((s) => {
    audi1ByRow[s.row] = audi1ByRow[s.row] || [];
    audi1ByRow[s.row].push(s);
  });
  assert.equal(audi1ByRow['A'].length, 12);
  assert.equal(audi1ByRow['A'][0].seatNumber, 'A01');
  assert.equal(audi1ByRow['A'][11].seatNumber, 'A12');
  ['B', 'C', 'D', 'E', 'F', 'G'].forEach((row) => {
    assert.equal(audi1ByRow[row].length, 14, `Audi 1 Row ${row} count`);
    assert.equal(audi1ByRow[row][0].seatNumber, `${row}01`);
    assert.equal(audi1ByRow[row][13].seatNumber, `${row}14`);
  });

  // Audi 2: 32 seats
  const audi2 = seats.filter((s) => s.auditoriumName === 'Audi 2');
  assert.equal(audi2.length, 32);
  const audi2ByRow = {};
  audi2.forEach((s) => {
    audi2ByRow[s.row] = audi2ByRow[s.row] || [];
    audi2ByRow[s.row].push(s);
  });
  ['A', 'B', 'C', 'D'].forEach((row) => {
    assert.equal(audi2ByRow[row].length, 8, `Audi 2 Row ${row} count`);
    assert.equal(audi2ByRow[row][0].seatNumber, `${row}01`);
    assert.equal(audi2ByRow[row][7].seatNumber, `${row}08`);
  });

  // Audi 3: 84 seats
  const audi3 = seats.filter((s) => s.auditoriumName === 'Audi 3');
  assert.equal(audi3.length, 84);
  const audi3ByRow = {};
  audi3.forEach((s) => {
    audi3ByRow[s.row] = audi3ByRow[s.row] || [];
    audi3ByRow[s.row].push(s);
  });
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach((row) => {
    assert.equal(audi3ByRow[row].length, 12, `Audi 3 Row ${row} count`);
    assert.equal(audi3ByRow[row][0].seatNumber, `${row}01`);
    assert.equal(audi3ByRow[row][11].seatNumber, `${row}12`);
  });
});

test('16. Category and pricing assignments strictly follow confirmed architectural layout', () => {
  const { seats } = generateSeatManifest();

  seats.forEach((seat) => {
    if (seat.section === 'Premium Recliner') {
      assert.equal(seat.price, 350, `Seat ${seat.seatNumber} price`);
    } else if (seat.section === 'Premium Platinum') {
      assert.equal(seat.price, 250, `Seat ${seat.seatNumber} price`);
    } else if (seat.section === 'Premium Gold') {
      assert.equal(seat.price, 200, `Seat ${seat.seatNumber} price`);
    } else if (seat.section === 'Premium Lounger') {
      assert.equal(seat.price, 250, `Seat ${seat.seatNumber} price`);
    } else {
      assert.fail(`Unexpected section: ${seat.section}`);
    }
  });

  const reclinerSeats = seats.filter((s) => s.section === 'Premium Recliner');
  const platinumSeats = seats.filter((s) => s.section === 'Premium Platinum');
  const goldSeats = seats.filter((s) => s.section === 'Premium Gold');
  const loungerSeats = seats.filter((s) => s.section === 'Premium Lounger');

  assert.equal(reclinerSeats.length, 44);
  assert.equal(platinumSeats.length, 78);
  assert.equal(goldSeats.length, 64);
  assert.equal(loungerSeats.length, 26);
});

test('17. Canonical tokens and seat labels are correctly formatted and zero-padded', () => {
  const { seats } = generateSeatManifest();

  seats.forEach((seat) => {
    assert.match(seat.token, /^audi[1-3]-[a-g]\d{2}$/, `Token ${seat.token} format`);
    assert.equal(seat.token, seat.token.toLowerCase(), 'Token must be lowercase');
    assert.match(seat.seatLabel, /^Audi [1-3] · [A-G]\d{2}$/, `Seat label ${seat.seatLabel} format`);
  });
});

test('18. Uniqueness of all 212 tokens and physical seats is guaranteed', () => {
  const { seats } = generateSeatManifest();

  const tokenSet = new Set(seats.map((s) => s.token));
  assert.equal(tokenSet.size, 212, 'Must have exactly 212 unique tokens');

  const physicalKeySet = new Set(seats.map((s) => `${s.auditoriumName}:${s.seatNumber}`));
  assert.equal(physicalKeySet.size, 212, 'Must have exactly 212 unique physical seats');
});

test('19. All 212 manifest seats are initialized as active/available', () => {
  const { seats } = generateSeatManifest();

  assert.ok(seats.every((s) => s.status === 'active'), 'All seats must be active');
  assert.ok(seats.every((s) => s.isDemo === false), 'No seats should have isDemo=true');
});

test('20. Demo-only seat audi2-b16 is excluded from manifest and fails closed in production', async () => {
  const { seats } = generateSeatManifest();

  // 1. audi2-b16 does not exist in confirmed manifest
  const existsInManifest = seats.some((s) => s.token === 'audi2-b16' || (s.auditoriumName === 'Audi 2' && s.seatNumber === 'B16'));
  assert.equal(existsInManifest, false, 'audi2-b16 must NOT exist in the 212 confirmed physical seats');

  // 2. audi2-b16 resolution fails closed in production
  const origEnv = env.nodeEnv;
  const origFindOne = Seat.findOne;
  const origReadyState = mongoose.connection.readyState;

  try {
    env.nodeEnv = 'production';
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    Seat.findOne = () => ({ lean: async () => null });

    const req = { params: { token: 'audi2-b16' } };
    const res = createMockRes();

    await resolveSeat(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.seat, null);
    assert.match(res.body.message, /could not be verified/i);
  } finally {
    env.nodeEnv = origEnv;
    Seat.findOne = origFindOne;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('21. Production seat resolution fails closed with 503 on database disconnection', async () => {
  const origEnv = env.nodeEnv;
  const origReadyState = mongoose.connection.readyState;

  try {
    env.nodeEnv = 'production';
    Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

    const req = { params: { token: 'audi1-a01' } };
    const res = createMockRes();

    await resolveSeat(req, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.seat, null);
    assert.match(res.body.message, /currently unavailable/i);
  } finally {
    env.nodeEnv = origEnv;
    Object.defineProperty(mongoose.connection, 'readyState', { value: origReadyState, configurable: true });
  }
});

test('22. buildQrDataset produces 212 valid QR export items with zero collisions and readable plaque labels', () => {
  const { exportPayload, validation } = buildQrDataset();

  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
  assert.equal(exportPayload.seats.length, 212);
  assert.equal(exportPayload.metadata.totalSeats, 212);
  assert.equal(exportPayload.metadata.activeSeats, 212);
  assert.equal(exportPayload.metadata.status, 'CONFIRMED_PHYSICAL_LAYOUT');
  assert.equal(exportPayload.metadata.isProductionConfirmed, true);

  assert.deepEqual(exportPayload.metadata.auditoriumBreakdown, {
    'Audi 1': 96,
    'Audi 2': 32,
    'Audi 3': 84,
  });

  const tokens = new Set();
  exportPayload.seats.forEach((item) => {
    assert.ok(item.token);
    assert.ok(item.orderUrl.includes(`/order/${item.token}`));
    assert.ok(item.seatLabel);
    assert.match(item.seatLabel, /^Audi [1-3] · [A-G]\d{2}$/);
    assert.ok(item.section);
    assert.ok(item.price > 0);
    assert.ok(item.plaqueLabel);
    assert.equal(item.plaqueLabel.displayLabel, item.seatLabel);
    assert.equal(item.plaqueLabel.section, item.section);

    assert.equal(tokens.has(item.token), false, `Token collision: ${item.token}`);
    tokens.add(item.token);
  });

  assert.equal(tokens.size, 212);
});
