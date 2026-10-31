/**
 * Bank Statement Parser & Anonymization Test Suite — FraudShield
 *
 * Verifies:
 * 1. Multi-bank statement extraction (Canara Bank, etc.)
 * 2. Proper transaction direction identification (Debit: user1->userX, Credit: userX->user1)
 * 3. Consistent anonymized entity IDs (user2, user3...) across recurring counterparties
 * 4. Exclusion of opening balances, closing balances, and summary totals
 * 5. ISO 8601 timestamp normalization (preserving null time when only date is present)
 * 6. Channel normalization (UPI, NEFT, IMPS, CARD, ATM)
 * 7. End-to-end integration with GCN network analysis schema
 *
 * Usage: node tests/bankStatementParser.test.js
 */

const assert = require("assert");
const {
  detectBank,
  normalizeTimestamp,
  normalizeChannel,
  extractTransactionsFromText,
  getPreconfiguredSampleStatement,
} = require("../services/bankStatementParser");
const { extractBankStatementTransactions } = require("../controllers/fraudController");

async function runTests() {
  console.log("📄 Running FraudShield Bank Statement Parser Tests...\n");
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

  // 1. Bank format detection
  await test("Detects Canara Bank statement headers accurately", async () => {
    const text = "CANARA BANK\nStatement of Account CNRB0001234";
    assert.strictEqual(detectBank(text), "Canara Bank");
  });

  // 2. Timestamp normalization
  await test("Normalizes dates to ISO 8601 without inventing timestamps", async () => {
    assert.strictEqual(normalizeTimestamp("20/10/2026"), "2026-10-20");
    assert.strictEqual(normalizeTimestamp("20-10-2026", "19:19:49"), "2026-10-20T19:19:49");
    assert.strictEqual(normalizeTimestamp("2026-10-20", "20:23:50"), "2026-10-20T20:23:50");
    assert.strictEqual(normalizeTimestamp("05-Oct-2026"), "2026-10-05");
  });

  // 3. Channel normalization
  await test("Normalizes transaction channels into standardized enum", async () => {
    assert.strictEqual(normalizeChannel("UPI/DR/511134339652/BHARATH/K/YESB"), "UPI");
    assert.strictEqual(normalizeChannel("NEFT-CR-AXIS00099128-TECH CORP"), "NEFT");
    assert.strictEqual(normalizeChannel("POS 4129XXXXXXXX1234 AMAZON INDIA"), "CARD");
    assert.strictEqual(normalizeChannel("ATM-CASH WDL-CANARA ATM INDIRANAGAR"), "ATM");
  });

  // 4. Direction & Anonymization in Canara Bank Statement
  await test("Resolves user1 as account holder, sets proper direction, and anonymizes counterparties", async () => {
    const rawStatement = `
CANARA BANK
Account Statement
Account No: 123456789012
Customer Name: STATEMENT HOLDER

TRANS DATE  VALUE DATE  REF / CHQ NO    PARTICULARS                             WITHDRAWAL (DR)  DEPOSIT (CR)   BALANCE
-----------------------------------------------------------------------------------------------------------------------
01/10/2026  01/10/2026  B/F             OPENING BALANCE                                                         15000.00
02/10/2026  02/10/2026  511134339652    UPI/DR/511134339652/BHARATH/K/YESB/     180.00                          14820.00
03/10/2026  03/10/2026  511145998123    UPI/CR/511145998123/PRIYA/S/HDFC/                        200.00         15020.00
05/10/2026  05/10/2026  511199442233    UPI/DR/511199442233/BHARATH/K/YESB/     350.00                          14670.00
-----------------------------------------------------------------------------------------------------------------------
                                        TOTAL WITHDRAWALS:                      530.00           200.00         14670.00
    `;

    const parsed = extractTransactionsFromText(rawStatement);

    // Opening balance and Total rows must be excluded
    assert.strictEqual(parsed.transactions.length, 3, "Should exclude opening balance and totals");

    // Tx 1: Debit from user1 to BHARATH (user2)
    const tx1 = parsed.transactions[0];
    assert.strictEqual(tx1.direction, "DEBIT");
    assert.strictEqual(tx1.source_id, "user1");
    assert.strictEqual(tx1.target_id, "user2");
    assert.strictEqual(tx1.amount, 180.0);
    assert.strictEqual(tx1.channel, "UPI");

    // Tx 2: Credit from PRIYA (user3) to user1
    const tx2 = parsed.transactions[1];
    assert.strictEqual(tx2.direction, "CREDIT");
    assert.strictEqual(tx2.source_id, "user3");
    assert.strictEqual(tx2.target_id, "user1");
    assert.strictEqual(tx2.amount, 200.0);
    assert.strictEqual(tx2.channel, "UPI");

    // Tx 3: Recurring Debit to BHARATH -> MUST reuse user2!
    const tx3 = parsed.transactions[2];
    assert.strictEqual(tx3.direction, "DEBIT");
    assert.strictEqual(tx3.source_id, "user1");
    assert.strictEqual(tx3.target_id, "user2", "Must reuse same anonymous ID for recurring counterparty");
    assert.strictEqual(tx3.amount, 350.0);

    // CSV Output schema check: source_id,target_id,amount,timestamp,channel
    assert.ok(parsed.csvData.startsWith("source_id,target_id,amount,timestamp,channel"));
    assert.ok(parsed.csvData.includes("user1,user2,180.00,2026-10-02,UPI"));
    assert.ok(parsed.csvData.includes("user3,user1,200.00,2026-10-03,UPI"));
    assert.ok(parsed.csvData.includes("user1,user2,350.00,2026-10-05,UPI"));
  });

  // 5. Preconfigured sample statements
  await test("Provides preconfigured sample statements for instant testing and review", async () => {
    const canaraSample = getPreconfiguredSampleStatement("canara");
    assert.strictEqual(canaraSample.success, true);
    assert.strictEqual(canaraSample.metadata.bankDetected, "Canara Bank");
    assert.ok(canaraSample.transactions.length >= 7);

    const muleSample = getPreconfiguredSampleStatement("mule");
    assert.strictEqual(muleSample.success, true);
    assert.ok(muleSample.transactions.length >= 4);
    assert.strictEqual(muleSample.metadata.accountHolderId, "user1");
  });

  // 6. Controller handling of extract-statement endpoint
  await test("extractBankStatementTransactions controller returns parsed statement JSON", async () => {
    let statusCode = null;
    let jsonResult = null;

    const req = {
      body: { sampleType: "canara" },
    };
    const res = {
      status(c) {
        statusCode = c;
        return this;
      },
      json(data) {
        jsonResult = data;
      },
    };

    await extractBankStatementTransactions(req, res, () => {});

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonResult.success, true);
    assert.strictEqual(jsonResult.metadata.accountHolderId, "user1");
    assert.ok(Array.isArray(jsonResult.transactions));
    assert.ok(jsonResult.csvData.length > 0);
  });

  console.log("\n--------------------------------------------------");
  console.log(`Bank Statement Parser Tests: ${passed} passed, ${failed} failed`);
  console.log("--------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

