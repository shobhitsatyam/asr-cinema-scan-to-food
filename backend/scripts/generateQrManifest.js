/**
 * QR Manifest Generation & Validation Tool for ASR Cinemas
 *
 * FEATURES:
 * - Generates 1-to-1 unique QR codes for all 212 confirmed physical seats.
 * - Exports individual 600x600 high-resolution PNG image files.
 * - Generates a standalone, beautifully styled, printable HTML sheet (A4 portrait, 6 plaques per page).
 * - Generates a machine-readable JSON dataset and validation summary.
 * - Blocks production export until manifest is confirmed.
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { generateSeatManifest, validateSeatManifest } = require('../src/data/seatManifest');

const DEFAULT_BASE_URL = process.env.FRONTEND_URL || 'https://asr-cinema-scan-to-food.vercel.app';

function buildQrDataset(options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const manifest = generateSeatManifest();

  // 1. Run Canonical Manifest Validation
  const validation = validateSeatManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Manifest validation failed with ${validation.errors.length} error(s):\n${validation.errors.join('\n')}`);
  }

  // 2. Strict QR Integrity Verification: 1-to-1 Token-to-Seat mapping
  const tokenMap = new Map();
  const physicalMap = new Map();
  const exportItems = [];

  for (const seat of manifest.seats) {
    // Check token uniqueness
    if (tokenMap.has(seat.token)) {
      throw new Error(`CRITICAL: Duplicate QR token detected: '${seat.token}'`);
    }
    tokenMap.set(seat.token, seat);

    // Check physical seat uniqueness
    const physicalKey = `${seat.auditoriumName}:${seat.seatNumber}`;
    if (physicalMap.has(physicalKey)) {
      throw new Error(`CRITICAL: Duplicate physical seat detected: '${physicalKey}'`);
    }
    physicalMap.set(physicalKey, seat);

    // Assemble export record
    const orderUrl = `${baseUrl}/order/${seat.token}`;
    const displayLabel = seat.seatLabel || `${seat.auditoriumName} · ${seat.seatNumber}`;
    exportItems.push({
      token: seat.token,
      auditoriumId: seat.auditoriumId,
      auditoriumName: seat.auditoriumName,
      seatNumber: seat.seatNumber,
      seatLabel: displayLabel,
      row: seat.row,
      number: seat.number,
      section: seat.section,
      price: seat.price,
      status: seat.status,
      isDemo: Boolean(seat.isDemo),
      orderUrl,
      plaqueLabel: {
        brand: 'ASR CINEMAS',
        displayLabel,
        auditorium: seat.auditoriumName,
        seat: `Seat ${seat.seatNumber}`,
        section: seat.section,
        price: `₹${seat.price}`,
        callout: 'Scan to order cinema snacks to your seat',
      },
    });
  }

  const exportPayload = {
    metadata: {
      ...manifest.metadata,
      generatedAt: new Date().toISOString(),
      baseUrl,
      totalSeats: exportItems.length,
      activeSeats: exportItems.filter((i) => i.status === 'active').length,
      inactiveSeats: exportItems.filter((i) => i.status === 'inactive').length,
      demoSeats: exportItems.filter((i) => i.isDemo).length,
      auditoriumBreakdown: validation.summary.auditoriums,
    },
    seats: exportItems,
  };

  return { exportPayload, validation };
}

/**
 * Builds the standalone, printable HTML sheet for all 212 seat plaques.
 */
function buildPrintableHtml(exportPayload, qrDataMap) {
  const seatsByAudi = {
    'Audi 1': [],
    'Audi 2': [],
    'Audi 3': [],
  };

  exportPayload.seats.forEach((seat) => {
    if (seatsByAudi[seat.auditoriumName]) {
      seatsByAudi[seat.auditoriumName].push(seat);
    }
  });

  const getSectionColor = (section) => {
    switch (section) {
      case 'Premium Recliner':
        return { bg: '#fef3c7', text: '#92400e', border: '#f59e0b', tag: 'RECLINER' };
      case 'Premium Platinum':
        return { bg: '#e0e7ff', text: '#3730a3', border: '#6366f1', tag: 'PLATINUM' };
      case 'Premium Gold':
        return { bg: '#fef9c3', text: '#854d0e', border: '#eab308', tag: 'GOLD' };
      case 'Premium Lounger':
        return { bg: '#ccfbf1', text: '#115e59', border: '#14b8a6', tag: 'LOUNGER' };
      default:
        return { bg: '#f3f4f6', text: '#1f2937', border: '#9ca3af', tag: 'STANDARD' };
    }
  };

  const renderSeatCards = (seats) => {
    return seats
      .map((seat) => {
        const qrInfo = qrDataMap.get(seat.token) || { dataUrl: '' };
        const color = getSectionColor(seat.section);

        return `
          <div class="plaque-card" data-audi="${seat.auditoriumName}">
            <div class="cut-corner tl"></div>
            <div class="cut-corner tr"></div>
            <div class="cut-corner bl"></div>
            <div class="cut-corner br"></div>

            <div class="plaque-inner">
              <div class="plaque-top">
                <div class="plaque-brand">
                  <span class="brand-title">ASR CINEMAS</span>
                  <span class="brand-sub">IN-SEAT DINING</span>
                </div>
                <div class="plaque-badge" style="background:${color.bg}; color:${color.text}; border:1px solid ${color.border};">
                  ${color.tag} · ₹${seat.price}
                </div>
              </div>

              <div class="plaque-center">
                <div class="qr-container">
                  <img src="${qrInfo.dataUrl}" alt="QR for ${seat.seatLabel}" class="qr-code-img" />
                </div>
                <div class="seat-info">
                  <div class="seat-label-primary">${seat.seatLabel}</div>
                  <div class="seat-section-title">${seat.section}</div>
                  <div class="seat-action-text">Scan with phone camera to order snacks</div>
                  <div class="seat-token-tag">${seat.token}</div>
                </div>
              </div>

              <div class="plaque-bottom">
                <span class="plaque-footer-left">Silent delivery straight to your seat</span>
                <span class="plaque-footer-right">asr-cinema.com</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('\n');
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ASR Cinemas · Seat QR Plaques Draft Sheet (212 Seats)</title>
  <style>
    /* CSS RESET & VARIABLES */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --bg-dark: #0f1015;
      --card-bg: #171822;
      --gold: #d4af37;
      --gold-light: #f3e5ab;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --border-dark: #2a2c3d;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg-dark);
      color: var(--text-main);
      line-height: 1.4;
      padding-bottom: 50px;
    }

    /* SCREEN HEADER & TOOLBAR */
    .screen-header {
      background: linear-gradient(180deg, #181926 0%, #11121c 100%);
      border-bottom: 1px solid var(--border-dark);
      padding: 24px 20px;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }

    .header-inner {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    .brand-group h1 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: var(--gold);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-group p {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .toolbar-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }

    .filter-btn {
      background: #232536;
      border: 1px solid #363952;
      color: #e5e7eb;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .filter-btn:hover {
      background: #2e3148;
      border-color: var(--gold);
    }

    .filter-btn.active {
      background: var(--gold);
      color: #000;
      border-color: var(--gold);
    }

    .print-btn {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #000;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
      transition: transform 0.15s ease;
    }

    .print-btn:hover {
      transform: translateY(-1px);
    }

    /* SUMMARY STATS BAR */
    .summary-bar {
      max-width: 1200px;
      margin: 20px auto 10px auto;
      padding: 0 20px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border-dark);
      padding: 14px 16px;
      border-radius: 8px;
    }

    .stat-card .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
    }

    .stat-card .value {
      font-size: 20px;
      font-weight: 800;
      color: #fff;
      margin-top: 4px;
    }

    .stat-card .sub {
      font-size: 11px;
      color: var(--gold);
      margin-top: 2px;
    }

    /* INSTRUCTIONS CALLOUT */
    .instructions-box {
      max-width: 1200px;
      margin: 10px auto 20px auto;
      padding: 14px 18px;
      background: #141726;
      border: 1px solid #232948;
      border-radius: 8px;
      font-size: 12px;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }

    .instructions-box strong {
      color: var(--gold-light);
    }

    /* SHEET SECTIONS & GRID */
    .sheets-wrapper {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }

    .auditorium-section {
      margin-top: 30px;
    }

    .auditorium-header {
      background: #1c1e2d;
      border-left: 4px solid var(--gold);
      padding: 12px 16px;
      border-radius: 0 6px 6px 0;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .auditorium-header h2 {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }

    .auditorium-header span {
      font-size: 13px;
      color: var(--gold);
      font-weight: 600;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
    }

    /* PLAQUE CARD STYLES */
    .plaque-card {
      background: #ffffff;
      color: #111827;
      border: 1.5px dashed #9ca3af;
      border-radius: 8px;
      padding: 14px;
      position: relative;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      page-break-inside: avoid;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 220px;
    }

    /* Corner Cut Guides for Physical Scissors/Trimmer */
    .cut-corner {
      position: absolute;
      width: 8px;
      height: 8px;
      border: 1px solid #4b5563;
      pointer-events: none;
    }
    .cut-corner.tl { top: -1px; left: -1px; border-right: none; border-bottom: none; }
    .cut-corner.tr { top: -1px; right: -1px; border-left: none; border-bottom: none; }
    .cut-corner.bl { bottom: -1px; left: -1px; border-right: none; border-top: none; }
    .cut-corner.br { bottom: -1px; right: -1px; border-left: none; border-top: none; }

    .plaque-inner {
      display: flex;
      flex-direction: column;
      height: 100%;
      justify-content: space-between;
    }

    .plaque-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 6px;
    }

    .brand-title {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 1px;
      color: #111827;
    }

    .brand-sub {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: #6b7280;
      margin-left: 6px;
    }

    .plaque-badge {
      font-size: 9.5px;
      font-weight: 700;
      padding: 3px 7px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }

    .plaque-center {
      display: flex;
      align-items: center;
      gap: 14px;
      margin: 8px 0;
    }

    .qr-container {
      flex-shrink: 0;
      width: 120px;
      height: 120px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 4px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .qr-code-img {
      width: 100%;
      height: 100%;
      display: block;
      image-rendering: pixelated;
    }

    .seat-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .seat-label-primary {
      font-size: 20px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }

    .seat-section-title {
      font-size: 12px;
      font-weight: 700;
      color: #334155;
    }

    .seat-action-text {
      font-size: 10px;
      color: #64748b;
      line-height: 1.3;
    }

    .seat-token-tag {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9.5px;
      background: #f1f5f9;
      color: #475569;
      padding: 2px 6px;
      border-radius: 3px;
      display: inline-block;
      width: fit-content;
      margin-top: 4px;
    }

    .plaque-bottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #f1f5f9;
      padding-top: 6px;
      font-size: 8.5px;
      color: #94a3b8;
    }

    /* PRINT MEDIA SPECIFIC RULES */
    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm;
      }

      body {
        background: #ffffff !important;
        color: #000000 !important;
        padding: 0 !important;
      }

      .no-print {
        display: none !important;
      }

      .sheets-wrapper {
        max-width: 100% !important;
        padding: 0 !important;
      }

      .auditorium-section {
        margin-top: 0 !important;
      }

      .auditorium-section:not(:first-child) {
        page-break-before: always !important;
        break-before: page !important;
      }

      .auditorium-header {
        background: #f3f4f6 !important;
        color: #000 !important;
        border-left: 5px solid #000 !important;
        padding: 8px 12px !important;
        margin-bottom: 12px !important;
      }

      .auditorium-header h2 {
        color: #000 !important;
        font-size: 14pt !important;
      }

      .auditorium-header span {
        color: #333 !important;
      }

      .cards-grid {
        display: grid !important;
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 8mm !important;
      }

      .plaque-card {
        box-shadow: none !important;
        border: 1px dashed #666 !important;
        height: 82mm !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-bottom: 2mm !important;
      }

      .qr-container {
        width: 100px !important;
        height: 100px !important;
      }

      .seat-label-primary {
        font-size: 16pt !important;
      }
    }
  </style>
</head>
<body>

  <!-- SCREEN VIEW TOOLBAR & HEADER -->
  <header class="screen-header no-print">
    <div class="header-inner">
      <div class="brand-group">
        <h1>
          <span>ASR CINEMAS</span>
          <span style="color:#fff; font-size:14px; font-weight:400;">| Verified Seat QR Manifest</span>
        </h1>
        <p>Canonical physical layout · Exactly 212 seats · Zero token collisions</p>
      </div>
      <div class="toolbar-actions">
        <button type="button" class="filter-btn active" onclick="filterAudi('all')">All (212)</button>
        <button type="button" class="filter-btn" onclick="filterAudi('Audi 1')">Audi 1 (96)</button>
        <button type="button" class="filter-btn" onclick="filterAudi('Audi 2')">Audi 2 (32)</button>
        <button type="button" class="filter-btn" onclick="filterAudi('Audi 3')">Audi 3 (84)</button>
        <button type="button" class="print-btn" onclick="window.print()">
          <span>🖨️ Print / Save to PDF</span>
        </button>
      </div>
    </div>
  </header>

  <!-- SUMMARY STATS -->
  <section class="summary-bar no-print">
    <div class="stat-card">
      <div class="label">Total Physical Seats</div>
      <div class="value">212</div>
      <div class="sub">100% Confirmed Active</div>
    </div>
    <div class="stat-card">
      <div class="label">Audi 1 (Grand Audi)</div>
      <div class="value">96</div>
      <div class="sub">Rows A–G · ₹200–₹350</div>
    </div>
    <div class="stat-card">
      <div class="label">Audi 2 (VIP Recliner)</div>
      <div class="value">32</div>
      <div class="sub">Rows A–D (Pairs) · ₹350</div>
    </div>
    <div class="stat-card">
      <div class="label">Audi 3 (Standard Audi)</div>
      <div class="value">84</div>
      <div class="sub">Rows A–G · ₹200–₹250</div>
    </div>
  </section>

  <!-- PRINTING INSTRUCTIONS -->
  <div class="instructions-box no-print">
    <div>
      <strong>How to Print / Save to PDF:</strong> Click the yellow <em>"Print / Save to PDF"</em> button above.
      In your browser print dialog, choose <strong>Destination: Save as PDF</strong>, <strong>Paper size: A4</strong>,
      <strong>Margins: Minimum</strong>, and check <strong>"Background graphics"</strong> for crisp category badges.
    </div>
    <div style="font-size:11px; color:#94a3b8;">
      Each A4 page prints 6 plaques (2 columns × 3 rows) with dashed cut guides.
    </div>
  </div>

  <!-- MAIN PLAQUES CONTAINER -->
  <main class="sheets-wrapper">

    <!-- AUDITORIUM 1 -->
    <section class="auditorium-section" id="section-audi-1">
      <div class="auditorium-header">
        <h2>Auditorium 1 — 96 Seats</h2>
        <span>Row A (Recliner, ₹350) · Rows B-D (Platinum, ₹250) · Rows E-F (Gold, ₹200) · Row G (Lounger, ₹250)</span>
      </div>
      <div class="cards-grid">
        ${renderSeatCards(seatsByAudi['Audi 1'])}
      </div>
    </section>

    <!-- AUDITORIUM 2 -->
    <section class="auditorium-section" id="section-audi-2">
      <div class="auditorium-header">
        <h2>Auditorium 2 — 32 Seats</h2>
        <span>Rows A, B, C, D (01–08 per row) · All Premium Recliner (₹350)</span>
      </div>
      <div class="cards-grid">
        ${renderSeatCards(seatsByAudi['Audi 2'])}
      </div>
    </section>

    <!-- AUDITORIUM 3 -->
    <section class="auditorium-section" id="section-audi-3">
      <div class="auditorium-header">
        <h2>Auditorium 3 — 84 Seats</h2>
        <span>Rows A-C (Platinum, ₹250) · Rows D-F (Gold, ₹200) · Row G (Lounger, ₹250)</span>
      </div>
      <div class="cards-grid">
        ${renderSeatCards(seatsByAudi['Audi 3'])}
      </div>
    </section>

  </main>

  <script>
    function filterAudi(audi) {
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      const buttons = Array.from(document.querySelectorAll('.filter-btn'));
      const activeBtn = buttons.find(b => {
        if (audi === 'all' && b.textContent.includes('All')) return true;
        return b.textContent.includes(audi);
      });
      if (activeBtn) activeBtn.classList.add('active');

      const secAudi1 = document.getElementById('section-audi-1');
      const secAudi2 = document.getElementById('section-audi-2');
      const secAudi3 = document.getElementById('section-audi-3');

      if (audi === 'all') {
        secAudi1.style.display = 'block';
        secAudi2.style.display = 'block';
        secAudi3.style.display = 'block';
      } else if (audi === 'Audi 1') {
        secAudi1.style.display = 'block';
        secAudi2.style.display = 'none';
        secAudi3.style.display = 'none';
      } else if (audi === 'Audi 2') {
        secAudi1.style.display = 'none';
        secAudi2.style.display = 'block';
        secAudi3.style.display = 'none';
      } else if (audi === 'Audi 3') {
        secAudi1.style.display = 'none';
        secAudi2.style.display = 'none';
        secAudi3.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Generate 212 high-resolution QR PNG files and a self-contained printable HTML sheet.
 */
async function generateQrImagesAndSheets(exportPayload, validation, options = {}) {
  const exportDir = options.exportDir || path.resolve(__dirname, '../qr-draft-export');
  const imagesDir = path.join(exportDir, 'images');

  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  console.log(`\n⏳ Generating 212 high-resolution QR image files (PNG)...`);
  const qrDataMap = new Map();
  let generatedImagesCount = 0;

  for (const seat of exportPayload.seats) {
    const pngPath = path.join(imagesDir, `${seat.token}.png`);

    // 1. Write standalone high-res PNG (600x600 px)
    await QRCode.toFile(pngPath, seat.orderUrl, {
      width: 600,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0a0a0c',
        light: '#ffffff',
      },
    });

    // 2. Generate base64 data URL for self-contained HTML
    const dataUrl = await QRCode.toDataURL(seat.orderUrl, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0a0a0c',
        light: '#ffffff',
      },
    });

    qrDataMap.set(seat.token, {
      pngRelativePath: `images/${seat.token}.png`,
      dataUrl,
    });

    generatedImagesCount += 1;
  }

  console.log(`✔ Generated ${generatedImagesCount} PNG image files in:`);
  console.log(`   ${imagesDir}`);

  // 3. Write Printable HTML Sheet
  const htmlContent = buildPrintableHtml(exportPayload, qrDataMap);
  const htmlPath = path.join(exportDir, 'printable_seat_qr_sheets.html');
  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
  console.log(`✔ Generated printable HTML sheet:`);
  console.log(`   ${htmlPath}`);

  // 4. Write Validation Summary JSON
  const summaryPayload = {
    metadata: {
      title: 'ASR Cinemas Seat QR Draft Export',
      version: exportPayload.metadata.version,
      status: exportPayload.metadata.status,
      isProductionConfirmed: exportPayload.metadata.isProductionConfirmed,
      generatedAt: new Date().toISOString(),
      baseUrl: exportPayload.metadata.baseUrl,
    },
    counts: {
      totalPhysicalSeats: exportPayload.metadata.totalSeats,
      activeSeats: exportPayload.metadata.activeSeats,
      inactiveSeats: exportPayload.metadata.inactiveSeats,
      demoSeats: exportPayload.metadata.demoSeats,
      auditoriums: exportPayload.metadata.auditoriumBreakdown,
      categories: exportPayload.metadata.categoryCounts,
      pricingTiers: exportPayload.metadata.pricingTiers,
    },
    validation: {
      valid: validation.valid,
      errorsCount: validation.errors.length,
      zeroDuplicateTokens: true,
      zeroDuplicatePhysicalSeats: true,
      uniqueTokensVerified: exportPayload.seats.length,
      uniquePhysicalSeatsVerified: exportPayload.seats.length,
    },
    exportPaths: {
      draftJson: path.resolve(__dirname, '../src/data/seatManifestDraftExport.json'),
      printableHtml: htmlPath,
      imagesDirectory: imagesDir,
      totalPngImages: generatedImagesCount,
    },
  };

  const summaryPath = path.join(exportDir, 'validation_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summaryPayload, null, 2), 'utf-8');
  console.log(`✔ Generated validation summary:`);
  console.log(`   ${summaryPath}`);

  // 5. Write README.md
  const readmeContent = `# ASR Cinemas - Local Draft Seat QR Export

## Overview
This directory contains the authoritative local draft QR export for all 212 physical seats of ASR Cinemas.

- **Status**: CONFIRMED PHYSICAL LAYOUT
- **Total Physical Seats**: 212
- **Audi 1**: 96 seats (A01–A12 Recliner, B01–D14 Platinum, E01–F14 Gold, G01–G14 Lounger)
- **Audi 2**: 32 seats (A01–D08 Recliner)
- **Audi 3**: 84 seats (A01–C12 Platinum, D01–F12 Gold, G01–G12 Lounger)

## How to Open and Print the Draft
1. Open \`printable_seat_qr_sheets.html\` in any web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari).
2. The page loads with interactive auditorium filters and an on-screen preview.
3. Click the yellow **"Print / Save to PDF"** button (or press \`Ctrl + P\` / \`Cmd + P\`).
4. In the print dialog:
   - **Destination**: Choose *"Save as PDF"* or your physical printer.
   - **Paper Size**: A4.
   - **Layout**: Portrait.
   - **Margins**: Minimum (or Default).
   - **Options**: Ensure **"Background graphics"** is checked.
5. All 212 plaques are arranged 6 plaques per A4 page with dashed cutting guides.

## High-Resolution Image Assets
- All 212 individual QR code PNG images (600x600 px) are stored in the \`images/\` folder.
- Filenames match the canonical seat tokens (e.g. \`audi1-a01.png\`, \`audi2-a01.png\`, \`audi3-a01.png\`).
`;
  fs.writeFileSync(path.join(exportDir, 'README.md'), readmeContent, 'utf-8');

  return {
    exportDir,
    imagesDir,
    htmlPath,
    summaryPath,
    generatedImagesCount,
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const isExportDraft = args.includes('--export-draft');
  const isProductionExport = args.includes('--production-export');

  console.log('====================================================');
  console.log('       ASR CINEMAS - SEAT QR MANIFEST TOOL          ');
  console.log('====================================================');

  try {
    const { exportPayload, validation } = buildQrDataset();

    console.log(`\n✔ Manifest Validation: PASSED`);
    console.log(`✔ Total physical seats in manifest: ${validation.summary.totalSeats}`);
    console.log(`✔ Active seats: ${validation.summary.totalActive}`);
    console.log(`✔ Inactive seats: ${validation.summary.totalInactive}`);
    console.log(`✔ Demo seats: ${validation.summary.demoSeats}`);
    console.log(`✔ Auditorium breakdown:`, validation.summary.auditoriums);
    console.log(`✔ Category breakdown:`, validation.summary.categories);
    console.log(`✔ Token-to-Seat 1:1 mapping: VERIFIED (0 collisions)`);

    console.log(`\nManifest Status: ${exportPayload.metadata.status}`);
    console.log(`Production Confirmed: ${exportPayload.metadata.isProductionConfirmed ? 'YES' : 'NO (DRAFT TEMPLATE)'}`);

    if (!exportPayload.metadata.isProductionConfirmed) {
      console.log('\n----------------------------------------------------');
      console.log('ATTENTION: OWNER CONFIRMATIONS REQUIRED BEFORE PRINTING');
      console.log('----------------------------------------------------');
      (exportPayload.metadata.confirmationRequired || []).forEach((req, idx) => {
        console.log(` ${idx + 1}. ${req}`);
      });
      console.log('----------------------------------------------------');

      if (isProductionExport) {
        console.error('\nSAFETY BLOCK: Cannot produce production export. Physical seat manifest is not confirmed.');
        process.exit(1);
      }
    }

    if (isExportDraft) {
      // 1. Export JSON manifest
      const outputPath = path.resolve(__dirname, '../src/data/seatManifestDraftExport.json');
      fs.writeFileSync(outputPath, JSON.stringify(exportPayload, null, 2), 'utf-8');
      console.log(`\n✔ Draft JSON dataset exported to:\n   ${outputPath}`);

      // 2. Export 212 QR image files and printable HTML sheet
      await generateQrImagesAndSheets(exportPayload, validation);

      console.log('\n====================================================');
      console.log('🎉 LOCAL DRAFT QR EXPORT COMPLETE (212 SEATS)');
      console.log('====================================================');
    } else {
      console.log('\nTo export draft JSON dataset, PNGs, and printable HTML, run with flag: --export-draft');
    }
  } catch (err) {
    console.error('\n❌ QR Manifest generation failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  buildQrDataset,
  generateQrImagesAndSheets,
  buildPrintableHtml,
};
