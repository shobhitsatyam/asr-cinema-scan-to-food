const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { requireAdminAuth } = require('../src/middleware/adminAuth');

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

test('1. requireAdminAuth middleware: unauthenticated request is rejected with 401 when key is configured', () => {
  const origKey = env.adminApiKey;
  const origProcKey = process.env.ADMIN_API_KEY;

  try {
    env.adminApiKey = 'test-secret-key-123';
    delete process.env.ADMIN_API_KEY;

    let nextCalled = false;
    const req = { headers: {} };
    const res = createMockRes();

    requireAdminAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'next() must NOT be called for unauthenticated request');
    assert.equal(res.statusCode, 401, 'Must reject with 401 Unauthorized');
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Unauthorized/i);
  } finally {
    env.adminApiKey = origKey;
    if (origProcKey !== undefined) process.env.ADMIN_API_KEY = origProcKey;
    else delete process.env.ADMIN_API_KEY;
  }
});

test('2. requireAdminAuth middleware: invalid-key request is rejected with 401 when key is configured', () => {
  const origKey = env.adminApiKey;
  const origProcKey = process.env.ADMIN_API_KEY;

  try {
    env.adminApiKey = 'test-secret-key-123';
    delete process.env.ADMIN_API_KEY;

    // Test with wrong x-admin-key
    let nextCalled = false;
    const reqWrongKey = { headers: { 'x-admin-key': 'wrong-admin-key' } };
    const resWrongKey = createMockRes();
    requireAdminAuth(reqWrongKey, resWrongKey, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(resWrongKey.statusCode, 401);
    assert.equal(resWrongKey.body.success, false);

    // Test with wrong Bearer token
    nextCalled = false;
    const reqWrongBearer = { headers: { authorization: 'Bearer wrong-token' } };
    const resWrongBearer = createMockRes();
    requireAdminAuth(reqWrongBearer, resWrongBearer, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(resWrongBearer.statusCode, 401);
    assert.equal(resWrongBearer.body.success, false);
  } finally {
    env.adminApiKey = origKey;
    if (origProcKey !== undefined) process.env.ADMIN_API_KEY = origProcKey;
    else delete process.env.ADMIN_API_KEY;
  }
});

test('3. requireAdminAuth middleware: valid-key request is authorized with matching x-admin-key or Bearer token', () => {
  const origKey = env.adminApiKey;
  const origProcKey = process.env.ADMIN_API_KEY;

  try {
    env.adminApiKey = 'test-secret-key-123';
    delete process.env.ADMIN_API_KEY;

    // A. Valid x-admin-key
    let nextCalled = false;
    const reqValidHeader = { headers: { 'x-admin-key': 'test-secret-key-123' } };
    const resValidHeader = createMockRes();
    requireAdminAuth(reqValidHeader, resValidHeader, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Valid x-admin-key must authorize');

    // B. Valid Authorization Bearer
    nextCalled = false;
    const reqValidBearer = { headers: { authorization: 'Bearer test-secret-key-123' } };
    const resValidBearer = createMockRes();
    requireAdminAuth(reqValidBearer, resValidBearer, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Valid Bearer token must authorize');

    // C. Valid Bearer with case-insensitive 'bearer' and whitespace trimming
    nextCalled = false;
    const reqCaseBearer = { headers: { authorization: 'bearer   test-secret-key-123   ' } };
    const resCaseBearer = createMockRes();
    requireAdminAuth(reqCaseBearer, resCaseBearer, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Bearer with variable casing and whitespace must authorize');
  } finally {
    env.adminApiKey = origKey;
    if (origProcKey !== undefined) process.env.ADMIN_API_KEY = origProcKey;
    else delete process.env.ADMIN_API_KEY;
  }
});

test('4. requireAdminAuth middleware: unconfigured key in production fails closed with 503', () => {
  const origKey = env.adminApiKey;
  const origEnv = env.nodeEnv;
  const origProcKey = process.env.ADMIN_API_KEY;
  const origProcEnv = process.env.NODE_ENV;

  try {
    env.adminApiKey = '';
    delete process.env.ADMIN_API_KEY;
    env.nodeEnv = 'production';
    process.env.NODE_ENV = 'production';

    let nextCalled = false;
    const reqProd = { headers: {} };
    const resProd = createMockRes();
    requireAdminAuth(reqProd, resProd, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(resProd.statusCode, 503, 'Unconfigured key in production must fail closed with 503');
    assert.equal(resProd.body.success, false);
    assert.match(resProd.body.message, /Admin operations are unavailable/i);
  } finally {
    env.adminApiKey = origKey;
    env.nodeEnv = origEnv;
    if (origProcKey !== undefined) process.env.ADMIN_API_KEY = origProcKey;
    else delete process.env.ADMIN_API_KEY;
    if (origProcEnv !== undefined) process.env.NODE_ENV = origProcEnv;
    else delete process.env.NODE_ENV;
  }
});

test('5. HTTP Route Regression: GET /api/orders rejects unauthenticated and invalid requests and authorizes valid requests', async () => {
  const origKey = env.adminApiKey;
  const origEnv = env.nodeEnv;
  const origProcKey = process.env.ADMIN_API_KEY;
  const origProcEnv = process.env.NODE_ENV;

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Phase A: Configured key in environment
    env.adminApiKey = 'test-audit-admin-key-2026';
    process.env.ADMIN_API_KEY = 'test-audit-admin-key-2026';

    // 1. Unauthenticated request -> must return 401
    const resUnauth = await fetch(`${baseUrl}/api/orders`);
    assert.equal(resUnauth.status, 401, 'Unauthenticated GET /api/orders must return 401');
    const bodyUnauth = await resUnauth.json();
    assert.equal(bodyUnauth.success, false);
    assert.match(bodyUnauth.message, /Unauthorized/i);

    // 2. Invalid x-admin-key -> must return 401
    const resInvalidKey = await fetch(`${baseUrl}/api/orders`, {
      headers: { 'x-admin-key': 'wrong-key-value' },
    });
    assert.equal(resInvalidKey.status, 401, 'Invalid x-admin-key must return 401');
    const bodyInvalidKey = await resInvalidKey.json();
    assert.equal(bodyInvalidKey.success, false);

    // 3. Invalid Authorization Bearer -> must return 401
    const resInvalidBearer = await fetch(`${baseUrl}/api/orders`, {
      headers: { authorization: 'Bearer forged-bearer-key' },
    });
    assert.equal(resInvalidBearer.status, 401, 'Invalid Bearer token must return 401');
    const bodyInvalidBearer = await resInvalidBearer.json();
    assert.equal(bodyInvalidBearer.success, false);

    // 4. Valid x-admin-key -> must return 200 with orders array
    const resValidKey = await fetch(`${baseUrl}/api/orders`, {
      headers: { 'x-admin-key': 'test-audit-admin-key-2026' },
    });
    assert.equal(resValidKey.status, 200, 'Valid x-admin-key must return 200');
    const bodyValidKey = await resValidKey.json();
    assert.equal(bodyValidKey.success, true);
    assert.ok(Array.isArray(bodyValidKey.orders), 'Response must contain orders array');

    // 5. Valid Authorization Bearer -> must return 200 with orders array
    const resValidBearer = await fetch(`${baseUrl}/api/orders`, {
      headers: { authorization: 'Bearer test-audit-admin-key-2026' },
    });
    assert.equal(resValidBearer.status, 200, 'Valid Bearer token must return 200');
    const bodyValidBearer = await resValidBearer.json();
    assert.equal(bodyValidBearer.success, true);
    assert.ok(Array.isArray(bodyValidBearer.orders), 'Response must contain orders array');

    // Phase B: Unconfigured key in production environment -> Fail Closed (503)
    env.adminApiKey = '';
    delete process.env.ADMIN_API_KEY;
    env.nodeEnv = 'production';
    process.env.NODE_ENV = 'production';

    const resProdUnconfigured = await fetch(`${baseUrl}/api/orders`);
    assert.equal(resProdUnconfigured.status, 503, 'Unconfigured key in production must fail closed with 503');
    const bodyProdUnconfigured = await resProdUnconfigured.json();
    assert.equal(bodyProdUnconfigured.success, false);
    assert.match(bodyProdUnconfigured.message, /Admin operations are unavailable/i);
  } finally {
    server.close();
    env.adminApiKey = origKey;
    env.nodeEnv = origEnv;
    if (origProcKey !== undefined) process.env.ADMIN_API_KEY = origProcKey;
    else delete process.env.ADMIN_API_KEY;
    if (origProcEnv !== undefined) process.env.NODE_ENV = origProcEnv;
    else delete process.env.NODE_ENV;
  }
});
