/**
 * Backend Fraud Controller Test Suite
 *
 * Verifies Node.js /api/fraud/analyze request handling, FastAPI proxying,
 * threshold logic (0.75), and graceful handling of model unavailability.
 *
 * Usage: node tests/fraudController.test.js
 */

const assert = require("assert");
const { analyzeMessage } = require("../controllers/fraudController");

async function runTests() {
  console.log("🛡️ Running FraudShield Backend Controller Tests...\n");
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     ${err.message}`);
      failed++;
    }
  }

  // 1. Validation error on empty text
  await test("Rejects missing or empty text with 400 Bad Request", async () => {
    let statusCode = null;
    let jsonResponse = null;

    const req = {
      body: { text: "   " },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonResponse = payload;
      },
    };

    await analyzeMessage(req, res, () => {});
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResponse.success, false);
    assert.ok(jsonResponse.message.includes("required"));
  });

  // 2. Validation error on non-string text
  await test("Rejects non-string text with 400 Bad Request", async () => {
    let statusCode = null;
    let jsonResponse = null;

    const req = {
      body: { text: 12345 },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonResponse = payload;
      },
    };

    await analyzeMessage(req, res, () => {});
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResponse.success, false);
  });

  // 3. Handles ML service unavailability gracefully (Requirement 6)
  await test("Handles ML service failure gracefully reporting mlAvailable: false", async () => {
    let statusCode = null;
    let jsonResponse = null;

    // Point to non-existent port to simulate model service downtime
    const originalUrl = process.env.FRAUD_MODEL_URL;
    process.env.FRAUD_MODEL_URL = "http://127.0.0.1:59999";

    const req = {
      body: { text: "Never share UPI Pin, CVV, OTP with anyone." },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonResponse = payload;
      },
    };

    await analyzeMessage(req, res, () => {});
    process.env.FRAUD_MODEL_URL = originalUrl;

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonResponse.success, true);
    assert.strictEqual(jsonResponse.data.mlAvailable, false);
    assert.strictEqual(jsonResponse.data.mlResult, null);
    assert.strictEqual(jsonResponse.data.threshold, 0.75);
  });

  // 4. Default threshold is aligned to 0.75
  await test("Default FRAUD_SCORE_THRESHOLD is configured to 0.75", async () => {
    const originalThreshold = process.env.FRAUD_SCORE_THRESHOLD;
    delete process.env.FRAUD_SCORE_THRESHOLD;

    let jsonResponse = null;
    const req = { body: { text: "Sample text" } };
    const res = {
      status() { return this; },
      json(payload) { jsonResponse = payload; },
    };

    await analyzeMessage(req, res, () => {});
    if (originalThreshold !== undefined) {
      process.env.FRAUD_SCORE_THRESHOLD = originalThreshold;
    }

    assert.strictEqual(jsonResponse.data.threshold, 0.75);
  });

  console.log("\n" + "-".repeat(50));
  console.log(`Backend Controller Test Results: ${passed} passed, ${failed} failed`);
  console.log("-".repeat(50) + "\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
