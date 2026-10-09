/**
 * Backend Assistant Service & Recovery Flow Tests
 *
 * Tests:
 * 1. validateDetectionContext with valid, malformed, and out-of-range inputs
 * 2. processAssistantChat in detection_explanation mode
 * 3. processAssistantChat in general_help mode without detection context
 * 4. Recovery triage: user clicked a link
 * 5. Recovery triage: user exposed credentials / OTP
 * 6. Recovery triage: user sent money (1930 Helpline & cybercrime.gov.in)
 * 7. Safety guardrail: user shares OTP / password in text
 * 8. Follow-up conversation context & conversationId retention
 */

const {
  processAssistantChat,
  validateDetectionContext,
  HELPLINE_INFO,
} = require("../services/assistantService");

describe("Backend Assistant Service Suite", () => {
  // Test 1: validateDetectionContext
  test("validateDetectionContext normalizes and sanitizes detection metadata", () => {
    const raw = {
      detectionId: "det_101",
      source: "WHATSAPP",
      classification: "FRAUD",
      riskScore: 0.85,
      reasons: ["Suspicious domain", "Urgency tactic"],
      safePreview: "Your bank account has been suspended...",
    };

    const validated = validateDetectionContext(raw);
    expect(validated).not.toBeNull();
    expect(validated.detectionId).toBe("det_101");
    expect(validated.source).toBe("WHATSAPP");
    expect(validated.classification).toBe("FRAUD");
    expect(validated.riskScore).toBe(0.85);
    expect(validated.reasons).toHaveLength(2);
    expect(validated.safePreview).toBe("Your bank account has been suspended...");
  });

  test("validateDetectionContext clamps riskScore to [0, 1] range", () => {
    const overScore = validateDetectionContext({ riskScore: 1.5 });
    expect(overScore.riskScore).toBe(1);

    const underScore = validateDetectionContext({ riskScore: -0.2 });
    expect(underScore.riskScore).toBe(0);
  });

  test("validateDetectionContext handles null, undefined, or non-object safely", () => {
    expect(validateDetectionContext(null)).toBeNull();
    expect(validateDetectionContext(undefined)).toBeNull();
    expect(validateDetectionContext("not an object")).toBeNull();
  });

  // Test 2: Detection-specific explanation mode
  test("processAssistantChat generates empathetic explanation with valid context", async () => {
    const context = {
      detectionId: "det_102",
      source: "SMS",
      classification: "FRAUD",
      riskScore: 0.91,
      reasons: ["Fake KYC portal URL detected"],
      safePreview: "Dear customer update KYC immediately",
    };

    const result = await processAssistantChat({
      message: "Why is this link suspicious?",
      mode: "detection_explanation",
      detectionContext: context,
    });

    expect(result).toHaveProperty("response");
    expect(result.response).toBeTruthy();
    expect(result.mode).toBe("detection_explanation");
    expect(result.suggestedFollowUps).toBeInstanceOf(Array);
    expect(result.actionChecklist).toBeInstanceOf(Array);
  });

  // Test 3: General help mode without detection context
  test("processAssistantChat operates seamlessly in general_help mode without detection context", async () => {
    const result = await processAssistantChat({
      message: "How can I check if a message is genuine?",
      mode: "general_help",
    });

    expect(result.mode).toBe("general_help");
    expect(result.response).toBeTruthy();
    expect(result.response.toLowerCase()).toContain("official");
    expect(result.suggestedFollowUps.length).toBeGreaterThan(0);
  });

  // Test 4: Guided recovery flow — clicked link
  test("guided recovery advises safe browser checks when link was clicked", async () => {
    const result = await processAssistantChat({
      message: "I clicked a suspicious link from an unknown number.",
      mode: "general_help",
    });

    expect(result.response).toContain("Clicking a link by itself");
    expect(result.suggestedFollowUps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("did not enter"),
      ]),
    );
    expect(result.actionChecklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Close the webpage"),
      ]),
    );
  });

  // Test 5: Guided recovery flow — shared OTP or credentials
  test("guided recovery escalates urgency when OTP or password was shared", async () => {
    const result = await processAssistantChat({
      message: "I shared an OTP with someone claiming to be bank support.",
      mode: "general_help",
    });

    expect(result.urgency).toBe("immediate");
    expect(result.actionChecklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining("bank"),
        expect.stringContaining("Change your account password"),
      ]),
    );
  });

  // Test 6: Guided recovery flow — money transferred
  test("guided recovery prioritizes 1930 Helpline and cybercrime.gov.in for transferred funds", async () => {
    const result = await processAssistantChat({
      message: "I sent money to a scammer through UPI.",
      mode: "general_help",
    });

    expect(result.urgency).toBe("immediate");
    expect(result.actionChecklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining(HELPLINE_INFO.phone),
        expect.stringContaining(HELPLINE_INFO.portal),
      ]),
    );
  });

  // Test 7: Safety guardrail — warns when secret pattern is present
  test("safety guardrail prevents disclosing secrets like OTP or passwords", async () => {
    const result = await processAssistantChat({
      message: "My otp is 849201 and password is secret",
      mode: "general_help",
    });

    expect(result.response).toContain("Never send your real OTP");
    expect(result.urgency).toBe("immediate");
  });

  // Test 8: Follow-up conversation context retention
  test("preserves existing conversationId across requests", async () => {
    const existingId = "conv_test_session_999";
    const result = await processAssistantChat({
      message: "What do I do next?",
      conversationId: existingId,
      mode: "general_help",
    });

    expect(result.conversationId).toBe(existingId);
  });
});
