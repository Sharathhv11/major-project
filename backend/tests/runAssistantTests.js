/**
 * Standalone Backend Assistant Test Suite
 *
 * Runs without requiring external test runners (uses standard Node.js assert).
 * Usage: node tests/runAssistantTests.js
 */

const assert = require("assert");
const {
  processAssistantChat,
  validateDetectionContext,
  HELPLINE_INFO,
} = require("../services/assistantService");

async function runTests() {
  console.log("🛡️ Running FraudShield Assistant Verification Suite...\n");
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

  // Test 1: validateDetectionContext
  await test("validateDetectionContext normalizes valid context", () => {
    const raw = {
      detectionId: "det_1",
      source: "SMS",
      classification: "FRAUD",
      riskScore: 0.88,
      reasons: ["Fake KYC portal URL"],
      safePreview: "Update KYC immediately",
    };
    const valid = validateDetectionContext(raw);
    assert.strictEqual(valid.detectionId, "det_1");
    assert.strictEqual(valid.source, "SMS");
    assert.strictEqual(valid.classification, "FRAUD");
    assert.strictEqual(valid.riskScore, 0.88);
    assert.strictEqual(valid.reasons.length, 1);
    assert.strictEqual(valid.safePreview, "Update KYC immediately");
  });

  // Test 2: Out of range clamping
  await test("validateDetectionContext clamps riskScore within [0, 1]", () => {
    const high = validateDetectionContext({ riskScore: 1.8 });
    assert.strictEqual(high.riskScore, 1);
    const low = validateDetectionContext({ riskScore: -0.5 });
    assert.strictEqual(low.riskScore, 0);
  });

  // Test 3: Null/Invalid input
  await test("validateDetectionContext handles null/non-object safely", () => {
    assert.strictEqual(validateDetectionContext(null), null);
    assert.strictEqual(validateDetectionContext("invalid"), null);
  });

  // Test 4: Detection-specific explanation
  await test("processAssistantChat generates detection-aware explanation", async () => {
    const res = await processAssistantChat({
      message: "Why is this link suspicious?",
      mode: "detection_explanation",
      detectionContext: {
        detectionId: "det_2",
        source: "WHATSAPP",
        classification: "FRAUD",
        riskScore: 0.95,
        reasons: ["Phishing domain detected"],
        safePreview: "Click here to claim reward",
      },
    });
    assert.strictEqual(res.mode, "detection_explanation");
    assert.ok(typeof res.response === "string" && res.response.length > 20);
    assert.ok(Array.isArray(res.suggestedFollowUps));
    assert.ok(Array.isArray(res.actionChecklist));
  });

  // Test 5: General Help mode
  await test("processAssistantChat works without detection context in general_help mode", async () => {
    const res = await processAssistantChat({
      message: "How can I check if a message is genuine?",
      mode: "general_help",
    });
    assert.strictEqual(res.mode, "general_help");
    assert.ok(typeof res.response === "string" && res.response.length > 20);
    assert.ok(res.suggestedFollowUps.length > 0);
  });

  // Test 6: Recovery flow - Clicked link
  await test("processAssistantChat provides link triage when user only clicked link", async () => {
    const res = await processAssistantChat({
      message: "I clicked a suspicious link from SMS.",
      mode: "general_help",
    });
    assert.ok(res.response.includes("Clicking a link by itself"));
    assert.ok(res.actionChecklist.some((s) => s.includes("webpage") || s.includes("tab")));
  });

  // Test 7: Recovery flow - Shared OTP
  await test("processAssistantChat marks urgency immediate when OTP was shared", async () => {
    const res = await processAssistantChat({
      message: "I shared an OTP with someone claiming to be bank support.",
      mode: "general_help",
    });
    assert.strictEqual(res.urgency, "immediate");
    assert.ok(res.actionChecklist.some((s) => s.includes("bank") || s.includes("password")));
  });

  // Test 8: Recovery flow - Money transferred
  await test("processAssistantChat prioritizes 1930 helpline for financial fraud", async () => {
    const res = await processAssistantChat({
      message: "I sent money to a scammer via UPI.",
      mode: "general_help",
    });
    assert.strictEqual(res.urgency, "immediate");
    assert.ok(res.actionChecklist.some((s) => s.includes(HELPLINE_INFO.phone)));
    assert.ok(res.actionChecklist.some((s) => s.includes("cybercrime.gov.in")));
  });

  // Test 9: Secret protection guardrail
  await test("safety guardrail intercepts sensitive OTP and password disclosures", async () => {
    const res = await processAssistantChat({
      message: "my otp is 982143 and password is password123",
      mode: "general_help",
    });
    assert.ok(res.response.includes("Never send your real OTP"));
    assert.strictEqual(res.urgency, "immediate");
  });

  // Test 10: Conversation ID retention
  await test("preserves conversation session ID across turns", async () => {
    const testId = "session_xyz_789";
    const res = await processAssistantChat({
      message: "Hello assistant",
      conversationId: testId,
      mode: "general_help",
    });
    assert.strictEqual(res.conversationId, testId);
  });

  console.log(`\n========================================`);
  console.log(`Summary: ${passed} passed, ${failed} failed out of ${passed + failed} tests.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered an error:", err);
  process.exit(1);
});
