/**
 * Canonical Physical Seat Manifest for ASR Cinemas
 *
 * STATUS: CONFIRMED PHYSICAL LAYOUT
 * Verified against cinema owner architectural seating-layout reference images.
 *
 * AUDITORIUM BREAKDOWN:
 * - Audi 1: 96 seats
 *   - Row A: 01–12 (12 seats), Premium Recliner, ₹350
 *   - Rows B, C, D: 01–14 per row (42 seats), Premium Platinum, ₹250
 *   - Rows E, F: 01–14 per row (28 seats), Premium Gold, ₹200
 *   - Row G: 01–14 (14 seats), Premium Lounger, ₹250
 * - Audi 2: 32 seats
 *   - Rows A, B, C, D: 01–08 per row (32 seats), Premium Recliner, ₹350
 * - Audi 3: 84 seats
 *   - Rows A, B, C: 01–12 per row (36 seats), Premium Platinum, ₹250
 *   - Rows D, E, F: 01–12 per row (36 seats), Premium Gold, ₹200
 *   - Row G: 01–12 (12 seats), Premium Lounger, ₹250
 *
 * TOTAL: Exactly 212 confirmed physical seats. All initialized as active/available.
 */

const MANIFEST_METADATA = {
  version: '2.0.0-confirmed',
  status: 'CONFIRMED_PHYSICAL_LAYOUT',
  isProductionConfirmed: true,
  updatedAt: '2026-10-27T23:30:00Z',
  totalSeats: 212,
  auditoriumCounts: {
    'Audi 1': 96,
    'Audi 2': 32,
    'Audi 3': 84,
  },
  categoryCounts: {
    'Premium Recliner': 44, // 12 in Audi 1 + 32 in Audi 2
    'Premium Platinum': 78, // 42 in Audi 1 + 36 in Audi 3
    'Premium Gold': 64,     // 28 in Audi 1 + 36 in Audi 3
    'Premium Lounger': 26,  // 14 in Audi 1 + 12 in Audi 3
  },
  pricingTiers: {
    'Premium Recliner': 350,
    'Premium Platinum': 250,
    'Premium Gold': 200,
    'Premium Lounger': 250,
  },
  notes: [
    'Confirmed from cinema owner seating layout images.',
    'All 212 physical seats are active and available.',
    'Seat B16 does not exist in Audi 2 (Audi 2 is strictly 4 rows of 8 seats, A01-D08).',
  ],
};

const auditoriums = [
  { id: 'audi-1', name: 'Audi 1', seatCount: 96, status: 'active' },
  { id: 'audi-2', name: 'Audi 2', seatCount: 32, status: 'active' },
  { id: 'audi-3', name: 'Audi 3', seatCount: 84, status: 'active' },
];

/**
 * Generate the authoritative 212 physical seats for ASR Cinemas
 *
 * @returns {Object} { metadata, auditoriums, seats }
 */
function generateSeatManifest() {
  const seats = [];

  // ---------------------------------------------------------
  // 1. AUDITORIUM 1 (96 SEATS)
  // ---------------------------------------------------------
  const audi1Rows = [
    { row: 'A', start: 1, end: 12, section: 'Premium Recliner', price: 350 },
    { row: 'B', start: 1, end: 14, section: 'Premium Platinum', price: 250 },
    { row: 'C', start: 1, end: 14, section: 'Premium Platinum', price: 250 },
    { row: 'D', start: 1, end: 14, section: 'Premium Platinum', price: 250 },
    { row: 'E', start: 1, end: 14, section: 'Premium Gold', price: 200 },
    { row: 'F', start: 1, end: 14, section: 'Premium Gold', price: 200 },
    { row: 'G', start: 1, end: 14, section: 'Premium Lounger', price: 250 },
  ];

  for (const cfg of audi1Rows) {
    for (let num = cfg.start; num <= cfg.end; num++) {
      const seatNumStr = String(num).padStart(2, '0');
      const seatNumber = `${cfg.row}${seatNumStr}`;
      seats.push({
        auditoriumId: 'audi-1',
        auditoriumName: 'Audi 1',
        row: cfg.row,
        number: num,
        seatNumber,
        seatLabel: `Audi 1 · ${seatNumber}`,
        token: `audi1-${cfg.row.toLowerCase()}${seatNumStr}`,
        section: cfg.section,
        price: cfg.price,
        status: 'active',
        isDemo: false,
      });
    }
  }

  // ---------------------------------------------------------
  // 2. AUDITORIUM 2 (32 SEATS - Pairs in Rows A-D: 01-08)
  // ---------------------------------------------------------
  const audi2Rows = [
    { row: 'A', start: 1, end: 8, section: 'Premium Recliner', price: 350 },
    { row: 'B', start: 1, end: 8, section: 'Premium Recliner', price: 350 },
    { row: 'C', start: 1, end: 8, section: 'Premium Recliner', price: 350 },
    { row: 'D', start: 1, end: 8, section: 'Premium Recliner', price: 350 },
  ];

  for (const cfg of audi2Rows) {
    for (let num = cfg.start; num <= cfg.end; num++) {
      const seatNumStr = String(num).padStart(2, '0');
      const seatNumber = `${cfg.row}${seatNumStr}`;
      seats.push({
        auditoriumId: 'audi-2',
        auditoriumName: 'Audi 2',
        row: cfg.row,
        number: num,
        seatNumber,
        seatLabel: `Audi 2 · ${seatNumber}`,
        token: `audi2-${cfg.row.toLowerCase()}${seatNumStr}`,
        section: cfg.section,
        price: cfg.price,
        status: 'active',
        isDemo: false,
      });
    }
  }

  // ---------------------------------------------------------
  // 3. AUDITORIUM 3 (84 SEATS - Rows A-G: 01-12)
  // ---------------------------------------------------------
  const audi3Rows = [
    { row: 'A', start: 1, end: 12, section: 'Premium Platinum', price: 250 },
    { row: 'B', start: 1, end: 12, section: 'Premium Platinum', price: 250 },
    { row: 'C', start: 1, end: 12, section: 'Premium Platinum', price: 250 },
    { row: 'D', start: 1, end: 12, section: 'Premium Gold', price: 200 },
    { row: 'E', start: 1, end: 12, section: 'Premium Gold', price: 200 },
    { row: 'F', start: 1, end: 12, section: 'Premium Gold', price: 200 },
    { row: 'G', start: 1, end: 12, section: 'Premium Lounger', price: 250 },
  ];

  for (const cfg of audi3Rows) {
    for (let num = cfg.start; num <= cfg.end; num++) {
      const seatNumStr = String(num).padStart(2, '0');
      const seatNumber = `${cfg.row}${seatNumStr}`;
      seats.push({
        auditoriumId: 'audi-3',
        auditoriumName: 'Audi 3',
        row: cfg.row,
        number: num,
        seatNumber,
        seatLabel: `Audi 3 · ${seatNumber}`,
        token: `audi3-${cfg.row.toLowerCase()}${seatNumStr}`,
        section: cfg.section,
        price: cfg.price,
        status: 'active',
        isDemo: false,
      });
    }
  }

  return {
    metadata: MANIFEST_METADATA,
    auditoriums,
    seats,
  };
}

/**
 * Validate a seat manifest for data integrity, token uniqueness, and physical seat uniqueness.
 *
 * @param {Object} manifest - Manifest object { auditoriums, seats }
 * @returns {Object} { valid: boolean, errors: string[], summary: Object }
 */
function validateSeatManifest(manifest) {
  const errors = [];
  const seenTokens = new Map();
  const seenPhysicalSeats = new Set();
  const audiSeatCounts = {};
  const categorySeatCounts = {
    'Premium Recliner': 0,
    'Premium Platinum': 0,
    'Premium Gold': 0,
    'Premium Lounger': 0,
  };

  if (!manifest || !Array.isArray(manifest.seats)) {
    return {
      valid: false,
      errors: ['Invalid manifest: seats array is required.'],
      summary: null,
    };
  }

  (manifest.auditoriums || []).forEach((audi) => {
    audiSeatCounts[audi.name] = 0;
  });

  manifest.seats.forEach((seat, index) => {
    const seatDesc = `Seat at index ${index} (${seat.auditoriumName || 'unknown'} ${seat.seatNumber || 'unknown'})`;

    // 1. Mandatory Fields
    if (!seat.auditoriumId) errors.push(`${seatDesc}: auditoriumId is missing.`);
    if (!seat.auditoriumName) errors.push(`${seatDesc}: auditoriumName is missing.`);
    if (!seat.row) errors.push(`${seatDesc}: row label is missing.`);
    if (!seat.seatNumber) errors.push(`${seatDesc}: seatNumber is missing.`);
    if (!seat.token) errors.push(`${seatDesc}: token is missing.`);
    if (typeof seat.price !== 'number' || seat.price <= 0) {
      errors.push(`${seatDesc}: valid price is required.`);
    }

    // 2. Status Validation
    if (!['active', 'inactive'].includes(seat.status)) {
      errors.push(`${seatDesc}: invalid status '${seat.status}'. Must be 'active' or 'inactive'.`);
    }

    // 3. Category & Price Consistency
    const expectedPrices = {
      'Premium Recliner': 350,
      'Premium Platinum': 250,
      'Premium Gold': 200,
      'Premium Lounger': 250,
    };
    if (expectedPrices[seat.section] !== undefined) {
      if (seat.price !== expectedPrices[seat.section]) {
        errors.push(
          `${seatDesc}: price ₹${seat.price} does not match expected ₹${expectedPrices[seat.section]} for ${seat.section}.`
        );
      }
      categorySeatCounts[seat.section] = (categorySeatCounts[seat.section] || 0) + 1;
    } else {
      errors.push(`${seatDesc}: unknown section '${seat.section}'.`);
    }

    // 4. Token Format Validation (lowercase alphanumeric with hyphens)
    if (seat.token) {
      const normalizedToken = String(seat.token).trim().toLowerCase();
      if (normalizedToken !== seat.token) {
        errors.push(`${seatDesc}: token '${seat.token}' must be lowercase and trimmed.`);
      }
      if (!/^[a-z0-9]+-[a-z0-9]+$/.test(normalizedToken)) {
        errors.push(`${seatDesc}: token '${seat.token}' does not match expected pattern (audiX-seatY).`);
      }

      // Token Uniqueness across entire cinema
      if (seenTokens.has(normalizedToken)) {
        errors.push(
          `Duplicate token '${normalizedToken}' found on ${seatDesc} (previously defined on seat index ${seenTokens.get(
            normalizedToken
          )}).`
        );
      } else {
        seenTokens.set(normalizedToken, index);
      }
    }

    // 5. Physical Seat Uniqueness per Auditorium
    if (seat.auditoriumName && seat.seatNumber) {
      const physicalKey = `${seat.auditoriumName}:${seat.seatNumber.toUpperCase()}`;
      if (seenPhysicalSeats.has(physicalKey)) {
        errors.push(`Duplicate physical seat '${seat.seatNumber}' in '${seat.auditoriumName}'.`);
      } else {
        seenPhysicalSeats.add(physicalKey);
      }

      if (audiSeatCounts[seat.auditoriumName] !== undefined) {
        audiSeatCounts[seat.auditoriumName] += 1;
      }
    }
  });

  // Verify total count strictly equals 212
  if (manifest.seats.length !== 212) {
    errors.push(`Manifest total count ${manifest.seats.length} does not match confirmed 212 seats.`);
  }

  // Verify per-auditorium counts
  if (audiSeatCounts['Audi 1'] !== 96) {
    errors.push(`Audi 1 count ${audiSeatCounts['Audi 1']} does not match confirmed 96 seats.`);
  }
  if (audiSeatCounts['Audi 2'] !== 32) {
    errors.push(`Audi 2 count ${audiSeatCounts['Audi 2']} does not match confirmed 32 seats.`);
  }
  if (audiSeatCounts['Audi 3'] !== 84) {
    errors.push(`Audi 3 count ${audiSeatCounts['Audi 3']} does not match confirmed 84 seats.`);
  }

  const totalActive = manifest.seats.filter((s) => s.status === 'active').length;
  const totalInactive = manifest.seats.filter((s) => s.status === 'inactive').length;
  const demoSeats = manifest.seats.filter((s) => s.isDemo).length;

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      totalSeats: manifest.seats.length,
      totalActive,
      totalInactive,
      demoSeats,
      auditoriums: audiSeatCounts,
      categories: categorySeatCounts,
      isProductionConfirmed: Boolean(manifest.metadata?.isProductionConfirmed),
      manifestStatus: manifest.metadata?.status || 'UNKNOWN',
    },
  };
}

module.exports = {
  MANIFEST_METADATA,
  auditoriums,
  generateSeatManifest,
  validateSeatManifest,
};
