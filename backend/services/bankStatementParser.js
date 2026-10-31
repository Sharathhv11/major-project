/**
 * Bank Statement Parser & Anonymization Engine — FraudShield
 *
 * Implements end-to-end PDF / Scanned Statement extraction for FraudShield:
 * 1. PDF parsing (pdf-parse) with automatic OCR fallback (Tesseract.js)
 * 2. Multi-bank support (Canara Bank, SBI, HDFC, ICICI, Axis, Generic)
 * 3. Direction resolution (Debit vs Credit, user1 as account holder)
 * 4. Counterparty entity resolution & consistent anonymization (user2, user3...)
 * 5. ISO 8601 timestamp and standard channel normalization
 * 6. CSV-compatible dataset output for GCN network analysis
 */

const { PDFParse } = require("pdf-parse");
const Tesseract = require("tesseract.js");

// Standard normalized channels
const CHANNELS = {
  UPI: "UPI",
  NEFT: "NEFT",
  IMPS: "IMPS",
  RTGS: "RTGS",
  ATM: "ATM",
  CARD: "CARD",
  BANK_TRANSFER: "BANK_TRANSFER",
  CASH: "CASH",
  UNKNOWN: "UNKNOWN",
};

// Common exclusion keywords for statement lines that are NOT transactions
const EXCLUSION_PATTERNS = [
  /OPENING\s+BALANCE/i,
  /\bB\/F\b/i,
  /\bBROUGHT\s+FORWARD\b/i,
  /CLOSING\s+BALANCE/i,
  /\bC\/F\b/i,
  /\bCARRIED\s+FORWARD\b/i,
  /\bTOTAL\s*(?:WITHDRAWALS?|DEPOSITS?|CR|DR)?\b/i,
  /STATEMENT\s+OF\s+ACCOUNT/i,
  /ACCOUNT\s+(?:NUMBER|NO|DETAILS)/i,
  /CUSTOMER\s+(?:ID|NAME|INFO)/i,
  /BRANCH\s+NAME/i,
  /IFSC\s+CODE/i,
  /PAGE\s+\d+\s+OF\s+\d+/i,
  /DATE\s+PARTICULARS\s+CHQ/i,
  /TRANS\s+DATE\s+VALUE\s+DATE/i,
];

/**
 * Clean monetary amount string into valid float
 */
function parseAmount(val) {
  if (typeof val === "number") return Math.abs(val);
  if (!val) return 0.0;
  const cleaned = String(val)
    .replace(/[₹$,\s]/g, "")
    .replace(/Cr|Dr/gi, "")
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0.0 : Math.abs(num);
}

/**
 * Detect Indian Bank statement format from raw text
 */
function detectBank(text) {
  const upper = text.toUpperCase();
  if (upper.includes("CANARA BANK") || upper.includes("CNRB")) {
    return "Canara Bank";
  }
  if (upper.includes("STATE BANK OF INDIA") || upper.includes("SBI") || upper.includes("SBIN")) {
    return "State Bank of India (SBI)";
  }
  if (upper.includes("HDFC BANK") || upper.includes("HDFC")) {
    return "HDFC Bank";
  }
  if (upper.includes("ICICI BANK") || upper.includes("ICIC")) {
    return "ICICI Bank";
  }
  if (upper.includes("AXIS BANK") || upper.includes("UTIB")) {
    return "Axis Bank";
  }
  return "Standard Indian Bank Statement";
}

/**
 * Normalize date & optional time to ISO 8601
 * If only date is available, returns YYYY-MM-DD (null time, never invented)
 */
function normalizeTimestamp(dateStr, timeStr) {
  if (!dateStr) return new Date().toISOString().split("T")[0];

  let year = "";
  let month = "";
  let day = "";

  const cleanDate = dateStr.trim();

  // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = cleanDate.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    day = dmyMatch[1].padStart(2, "0");
    month = dmyMatch[2].padStart(2, "0");
    year = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
  }

  // 2. YYYY-MM-DD
  const ymdMatch = cleanDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    year = ymdMatch[1];
    month = ymdMatch[2].padStart(2, "0");
    day = ymdMatch[3].padStart(2, "0");
  }

  // 3. DD-Mon-YYYY (e.g. 20-Oct-2026 or 20 Oct 2026)
  const monthNames = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const dMonYMatch = cleanDate.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})$/);
  if (dMonYMatch) {
    day = dMonYMatch[1].padStart(2, "0");
    const mStr = dMonYMatch[2].toLowerCase();
    month = monthNames[mStr] || "01";
    year = dMonYMatch[3].length === 2 ? `20${dMonYMatch[3]}` : dMonYMatch[3];
  }

  if (!year || !month || !day) {
    return cleanDate;
  }

  const isoDate = `${year}-${month}-${day}`;

  if (timeStr && timeStr.trim()) {
    const cleanTime = timeStr.trim();
    // Validate HH:mm:ss or HH:mm
    const timeMatch = cleanTime.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
      const hh = timeMatch[1].padStart(2, "0");
      const mm = timeMatch[2];
      const ss = timeMatch[3] ? timeMatch[3] : "00";
      return `${isoDate}T${hh}:${mm}:${ss}`;
    }
  }

  // Null time: return date only
  return isoDate;
}

/**
 * Normalize transaction channel from narration
 */
function normalizeChannel(description) {
  const desc = (description || "").toUpperCase();

  if (desc.includes("UPI") || desc.includes("VPA")) return CHANNELS.UPI;
  if (desc.includes("NEFT")) return CHANNELS.NEFT;
  if (desc.includes("IMPS")) return CHANNELS.IMPS;
  if (desc.includes("RTGS")) return CHANNELS.RTGS;
  if (desc.includes("ATM") || desc.includes("NFS") || desc.includes("CASH WDL")) return CHANNELS.ATM;
  if (desc.includes("POS") || desc.includes("CARD") || desc.includes("VISA") || desc.includes("MASTERCARD") || desc.includes("RUPAY")) return CHANNELS.CARD;
  if (desc.includes("TRANSFER") || desc.includes("TRF") || desc.includes("CHQ") || desc.includes("CLG") || desc.includes("NETBANKING") || desc.includes("INB")) return CHANNELS.BANK_TRANSFER;
  if (desc.includes("CASH DEP") || desc.includes("CDM") || desc.includes("BY CASH")) return CHANNELS.CASH;

  return CHANNELS.UNKNOWN;
}

/**
 * Extract counterparty name/handle from transaction narration
 */
function extractCounterparty(description, channel) {
  const desc = (description || "").trim();
  const descUpper = desc.toUpperCase();

  // 1. Canara Bank & Standard UPI formats:
  // e.g. "UPI/DR/511134339652/BHARATH/K/YESB/PAYMENT" -> "BHARATH K"
  // e.g. "UPI/CR/511145998123/PRIYA/S/HDFC/TRANSFER" -> "PRIYA S"
  const canaraUpiMatch = desc.match(/UPI\/(?:DR|CR)\/\d+\/([A-Z0-9_\s]+)\/([A-Z0-9_\s]+)/i);
  if (canaraUpiMatch) {
    const rawName = `${canaraUpiMatch[1].replace(/_/g, " ")} ${canaraUpiMatch[2].replace(/_/g, " ")}`.trim();
    return cleanParticipantName(rawName);
  }

  // UPI variant: "UPI/DR/511134339652/SWIGGY/FOOD"
  const upiSegmentMatch = desc.match(/UPI\/(?:DR|CR|P2P|P2M)\/(?:[^\/]+\/)?([A-Za-z0-9_\s]+)(?:\/|$)/i);
  if (upiSegmentMatch && upiSegmentMatch[1] && upiSegmentMatch[1].length > 2 && !/^\d+$/.test(upiSegmentMatch[1])) {
    return cleanParticipantName(upiSegmentMatch[1]);
  }

  // UPI VPA: "user@okhdfcbank"
  const vpaMatch = desc.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9_-]+)/);
  if (vpaMatch) {
    return vpaMatch[1].toLowerCase();
  }

  // 2. NEFT / IMPS transfers
  // e.g. "NEFT-CR-AXIS00099128-TECH CORP-SALARY" -> "TECH CORP"
  const neftMatch = desc.match(/(?:NEFT|IMPS)[-/](?:CR|DR)?[-/]?[A-Z0-9]+[-/]([A-Za-z0-9\s]+?)(?:[-/]|$)/i);
  if (neftMatch && neftMatch[1] && !/^\d+$/.test(neftMatch[1])) {
    return cleanParticipantName(neftMatch[1]);
  }

  // 3. POS / Card Merchant purchases
  // e.g. "POS 4129XXXXXXXX1234 AMAZON INDIA" -> "AMAZON INDIA"
  const posMatch = desc.match(/POS(?:\s+\d+X+\d+)?\s+([A-Za-z0-9\s.&'-]{3,30})/i);
  if (posMatch) {
    return cleanParticipantName(posMatch[1]);
  }

  // 4. ATM Cash withdrawals
  if (descUpper.includes("ATM")) {
    const atmMatch = desc.match(/ATM[-/\s]+(?:CASH\s+WDL[-/\s]+)?([A-Za-z0-9\s]+)/i);
    return atmMatch ? `ATM ${cleanParticipantName(atmMatch[1])}` : "ATM CASH WITHDRAWAL";
  }

  // 5. Popular merchants & utilities in description
  const knownMerchants = [
    "AMAZON", "FLIPKART", "SWIGGY", "ZOMATO", "BESCOM", "AIRTEL", "JIO",
    "APARTMENT RENT", "NETFLIX", "SPOTIFY", "UBER", "OLA", "IRCTC", "CRED"
  ];
  for (const m of knownMerchants) {
    if (descUpper.includes(m)) {
      return m;
    }
  }

  // 6. Generic Narration: remove common noise numbers and take leading words
  const cleaned = desc
    .replace(/[0-9]{6,}/g, "") // remove long reference numbers
    .replace(/\b(?:TRANSFER|TRF|PAYMENT|DEPOSIT|WITHDRAWAL|WDL|CR|DR|BY|TO|FROM)\b/gi, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .trim();

  const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 0) {
    return cleanParticipantName(words.slice(0, 3).join(" "));
  }

  return null;
}

/**
 * Remove special characters and clean participant display names
 */
function cleanParticipantName(name) {
  if (!name) return "";
  return name
    .replace(/[/_\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Core Parser: Extracts structured transactions from bank statement text
 * Returns anonymized transactions according to schema:
 * source_id, target_id, amount, timestamp, channel
 */
function extractTransactionsFromText(rawText) {
  if (!rawText || !rawText.trim()) {
    return { transactions: [], csvData: "", entityMapping: [] };
  }

  const lines = rawText.split(/\r?\n/);
  const detectedBank = detectBank(rawText);

  // Counterparty tracking & consistent anonymization
  // user1 is strictly the account holder
  const accountHolderId = "user1";
  const counterpartyMap = new Map(); // cleanKey -> "user2", "user3", etc.
  let nextCounterpartyIndex = 2;

  function getAnonymousId(participantKey, defaultLabel) {
    if (!participantKey) {
      const anonId = `user${nextCounterpartyIndex++}`;
      return { id: anonId, label: defaultLabel || `Unknown Entity (${anonId})` };
    }

    const normKey = participantKey.trim().toUpperCase();
    if (!counterpartyMap.has(normKey)) {
      const anonId = `user${nextCounterpartyIndex++}`;
      counterpartyMap.set(normKey, {
        id: anonId,
        label: participantKey,
      });
    }
    return counterpartyMap.get(normKey);
  }

  const transactions = [];
  let prevBalance = null;

  // Regex for Date at the start of a transaction row
  // Matches: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD-Mon-YYYY
  const dateRowRegex = /^\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/\s][A-Za-z]{3}[-/\s]\d{2,4})\b/;

  // Regex to detect amounts with commas and decimals
  const amountPattern = /\b\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?\b/g;

  // Multi-line accumulation buffer
  let currentTx = null;

  function commitTransaction(tx) {
    if (!tx || !tx.date) return;

    // Check if line is an opening balance or header row
    const fullText = `${tx.description} ${tx.rawLine}`.toUpperCase();
    for (const pat of EXCLUSION_PATTERNS) {
      if (pat.test(fullText)) return;
    }

    let debit = tx.debit;
    let credit = tx.credit;
    let balance = tx.balance;

    // Resolve direction if amounts were in one combined column or ambiguous
    let direction = tx.direction || null;

    if (!direction) {
      if (debit > 0 && credit === 0) {
        direction = "DEBIT";
      } else if (credit > 0 && debit === 0) {
        direction = "CREDIT";
      } else if (balance !== null && prevBalance !== null) {
        // Cross-verify with balance change
        const diff = balance - prevBalance;
        if (diff > 0) {
          direction = "CREDIT";
          if (!credit) credit = diff;
        } else if (diff < 0) {
          direction = "DEBIT";
          if (!debit) debit = Math.abs(diff);
        }
      }
    }

    // Default direction based on description indicators (/DR/, /CR/, WDL, DEP)
    if (!direction) {
      if (/\b(?:DR|WITHDRAWAL|WDL|DEBIT)\b/i.test(tx.description)) {
        direction = "DEBIT";
      } else if (/\b(?:CR|DEPOSIT|DEP|CREDIT)\b/i.test(tx.description)) {
        direction = "CREDIT";
      } else {
        direction = "DEBIT"; // fallback
      }
    }

    const finalAmount = direction === "DEBIT" ? (debit || credit || 0.0) : (credit || debit || 0.0);
    if (finalAmount <= 0) return;

    if (balance !== null) prevBalance = balance;

    const channel = normalizeChannel(tx.description);
    const counterpartyRaw = extractCounterparty(tx.description, channel);
    const anonEntity = getAnonymousId(
      counterpartyRaw,
      channel === CHANNELS.ATM ? "ATM Cash Dispenser" : "Transaction Counterparty"
    );

    // Determine graph direction strictly according to requirement:
    // Debit: user1 is source, counterparty is target (user1 -> userX)
    // Credit: counterparty is source, user1 is target (userX -> user1)
    let sourceId, targetId;
    if (direction === "DEBIT") {
      sourceId = accountHolderId;
      targetId = anonEntity.id;
    } else {
      sourceId = anonEntity.id;
      targetId = accountHolderId;
    }

    const isoTimestamp = normalizeTimestamp(tx.date, tx.time);

    transactions.push({
      id: `TX-${transactions.length + 101}`,
      date: tx.date,
      timestamp: isoTimestamp,
      description: tx.description.replace(/\s+/g, " ").trim(),
      referenceNo: tx.refNo || "",
      amount: parseFloat(finalAmount.toFixed(2)),
      amountFormatted: `₹${finalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      debit: direction === "DEBIT" ? finalAmount : null,
      credit: direction === "CREDIT" ? finalAmount : null,
      balance: balance !== null ? parseFloat(balance.toFixed(2)) : null,
      channel,
      direction,
      source_id: sourceId,
      target_id: targetId,
      counterpartyId: anonEntity.id,
      counterpartyLabel: anonEntity.label,
    });
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx].trim();
    if (!rawLine) continue;

    // Check if line starts with a date
    const dateMatch = rawLine.match(dateRowRegex);
    if (dateMatch) {
      // Commit previous transaction before starting new one
      if (currentTx) {
        commitTransaction(currentTx);
      }

      const txDate = dateMatch[1];
      let remainder = rawLine.substring(dateMatch[0].length).trim();

      // Look for optional second date (Value date right after transaction date)
      const valDateMatch = remainder.match(dateRowRegex);
      if (valDateMatch) {
        remainder = remainder.substring(valDateMatch[0].length).trim();
      }

      // Look for optional time (HH:mm:ss or HH:mm)
      const timeMatch = remainder.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
      const txTime = timeMatch ? timeMatch[1] : null;

      // Extract all trailing numeric amounts with decimals (e.g. 180.00, 14,820.50, 75000.00)
      const amountPattern = /\b\d+(?:,\d{2,3})*(?:\.\d{2})\b/g;
      const amounts = [...remainder.matchAll(amountPattern)]
        .map((m) => parseAmount(m[0]))
        .filter((a) => a > 0);

      // Determine DR/CR indicator
      let debit = 0.0;
      let credit = 0.0;
      let balance = null;
      let direction = null;

      if (/UPI\/DR\//i.test(remainder) || /\b(?:DR|\(DR\)|WITHDRAWAL|WDL)\b/i.test(remainder)) {
        direction = "DEBIT";
      } else if (/UPI\/CR\//i.test(remainder) || /\b(?:CR|\(CR\)|DEPOSIT|DEP)\b/i.test(remainder)) {
        direction = "CREDIT";
      }

      if (amounts.length >= 3) {
        // [Debit, Credit, Balance]
        if (direction === "DEBIT") {
          debit = amounts[0];
          balance = amounts[amounts.length - 1];
        } else if (direction === "CREDIT") {
          credit = amounts[0];
          balance = amounts[amounts.length - 1];
        } else {
          debit = amounts[0];
          credit = amounts[1];
          balance = amounts[2];
        }
      } else if (amounts.length === 2) {
        // [Amount, Balance]
        balance = amounts[1];
        if (direction === "CREDIT") {
          credit = amounts[0];
        } else {
          debit = amounts[0];
        }
      } else if (amounts.length === 1) {
        if (direction === "CREDIT") {
          credit = amounts[0];
        } else {
          debit = amounts[0];
        }
      }

      // Extract Reference number if present (e.g. 12 digits or alphanumeric)
      const refMatch = remainder.match(/\b(?:\d{9,16}|[A-Z]{3,4}\d{6,12})\b/);
      const refNo = refMatch ? refMatch[0] : "";

      // Clean narration by removing amounts and reference numbers
      let description = remainder;
      if (refNo) description = description.replace(refNo, " ");
      description = description.replace(amountPattern, " ").replace(/\s+/g, " ").trim();

      currentTx = {
        date: txDate,
        time: txTime,
        description,
        refNo,
        debit,
        credit,
        balance,
        direction,
        rawLine,
      };
    } else if (currentTx) {
      // Check if line is a table border/separator or total footer
      const isSeparator = /^[-=_*]{3,}$/.test(rawLine);
      const isExclusion = EXCLUSION_PATTERNS.some((pat) => pat.test(rawLine));
      if (isSeparator || isExclusion) {
        commitTransaction(currentTx);
        currentTx = null;
      } else {
        // Continuation line of multi-line transaction particulars
        currentTx.description += ` ${rawLine}`;
      }
    }
  }

  // Commit last accumulated transaction
  if (currentTx) {
    commitTransaction(currentTx);
  }

  // Build canonical CSV dataset for network analysis
  // Schema: source_id,target_id,amount,timestamp,channel
  const csvHeader = "source_id,target_id,amount,timestamp,channel";
  const csvRows = transactions.map(
    (tx) => `${tx.source_id},${tx.target_id},${tx.amount.toFixed(2)},${tx.timestamp},${tx.channel}`
  );
  const csvData = [csvHeader, ...csvRows].join("\n");

  // Summary of resolved entities for frontend review
  const entityMapping = [
    {
      anonymousId: "user1",
      role: "Account Holder (Verified User)",
      isSelf: true,
      transactionCount: transactions.length,
    },
  ];

  for (const [key, val] of counterpartyMap.entries()) {
    const txCount = transactions.filter(
      (t) => t.source_id === val.id || t.target_id === val.id
    ).length;
    entityMapping.push({
      anonymousId: val.id,
      entityLabel: val.label,
      role: "Counterparty Participant",
      isSelf: false,
      transactionCount: txCount,
    });
  }

  return {
    detectedBank,
    transactions,
    csvData,
    entityMapping,
    totalCount: transactions.length,
  };
}

/**
 * High-level Parse Function
 * Handles Buffer (PDF or Image), extracts text via PDFParse or Tesseract OCR,
 * and produces normalized anonymous transaction dataset.
 */
async function parseBankStatementBuffer(buffer, filename = "statement.pdf") {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty statement buffer provided.");
  }

  let extractedText = "";
  let method = "PDF_STREAM";

  try {
    // 1. Try native PDF text extraction first
    const parser = new PDFParse({ data: buffer });
    await parser.load();
    const parsedData = await parser.getText();
    await parser.destroy();

    extractedText = (parsedData && parsedData.text) ? parsedData.text : "";
  } catch (pdfErr) {
    console.warn("⚠️ Standard PDF parsing did not succeed:", pdfErr.message);
  }

  // 2. If PDF parsing didn't find text, check if buffer is readable UTF-8 text stream
  if (!extractedText || extractedText.trim().length < 60) {
    try {
      const rawUtf8 = buffer.toString("utf-8");
      if (rawUtf8 && rawUtf8.trim().length >= 60 && !rawUtf8.includes("\x00")) {
        extractedText = rawUtf8;
        method = "TEXT_STREAM";
      }
    } catch (utfErr) {
      // ignore
    }
  }

  // 3. Fallback to OCR if still empty
  if (!extractedText || extractedText.trim().length < 60) {
    console.log("🔍 Triggering OCR engine for scanned statement...");
    try {
      const ocrResult = await Tesseract.recognize(buffer, "eng");
      if (ocrResult && ocrResult.data && ocrResult.data.text) {
        extractedText = ocrResult.data.text;
        method = "OCR_TESSERACT";
      }
    } catch (ocrErr) {
      console.warn("⚠️ OCR engine unavailable or offline:", ocrErr.message);
    }
  }

  if (!extractedText || extractedText.trim().length < 20) {
    throw new Error(
      "Unable to extract text from bank statement. Please verify the PDF is readable and contains a valid transaction ledger."
    );
  }

  const result = extractTransactionsFromText(extractedText);

  return {
    success: true,
    metadata: {
      filename,
      extractionMethod: method,
      bankDetected: result.detectedBank,
      totalTransactions: result.totalCount,
      accountHolderId: "user1",
      extractedAt: new Date().toISOString(),
    },
    transactions: result.transactions,
    csvData: result.csvData,
    entityMapping: result.entityMapping,
  };
}

/**
 * Built-in Sample Bank Statement Generator for instantaneous testing / demos
 */
function getPreconfiguredSampleStatement(sampleType = "canara") {
  let sampleText = "";
  let filename = "canara_bank_statement_personal.pdf";

  if (sampleType === "fraud_mule" || sampleType === "mule") {
    filename = "canara_bank_statement_mule_drain.pdf";
    sampleText = `
CANARA BANK
Account Statement
Account No: 109283746501
Customer Name: STATEMENT HOLDER
Branch: INDIRANAGAR BENGALURU
IFSC: CNRB0001092
Statement Period: 10/10/2026 to 11/10/2026

TRANS DATE  VALUE DATE  REF / CHQ NO    PARTICULARS                             WITHDRAWAL (DR)  DEPOSIT (CR)   BALANCE
-----------------------------------------------------------------------------------------------------------------------
10/10/2026  10/10/2026  B/F             OPENING BALANCE                                                         500.00
10/10/2026  10/10/2026  991002150001    UPI/CR/991002150001/UNKNOWN/SRC991/                     95000.00       95500.00
10/10/2026  10/10/2026  992005400002    UPI/CR/992005400002/UNKNOWN/SRC992/                     85000.00       180500.00
10/10/2026  10/10/2026  993011000003    UPI/DR/993011000003/CRYPTO/EXCHANGE/    92000.00                        88500.00
10/10/2026  10/10/2026  994012300004    UPI/DR/994012300004/MULE/BENEFICIARY/   86000.00                        2500.00
10/10/2026  10/10/2026  995014000005    ATM-CASH WDL-CANARA ATM INDIRANAGAR     1500.00                         1000.00
-----------------------------------------------------------------------------------------------------------------------
    `;
  } else {
    // Normal personal Canara Bank Statement
    filename = "canara_bank_statement_personal.pdf";
    sampleText = `
CANARA BANK
Account Statement
Account No: 123456789012
Customer Name: STATEMENT HOLDER
Customer ID: 98765432
Branch: BENGALURU MAIN
IFSC: CNRB0001234
Period: 01/10/2026 to 25/10/2026

TRANS DATE  VALUE DATE  REF / CHQ NO    PARTICULARS                             WITHDRAWAL (DR)  DEPOSIT (CR)   BALANCE
-----------------------------------------------------------------------------------------------------------------------
01/10/2026  01/10/2026  B/F             OPENING BALANCE                                                         15000.00
02/10/2026  02/10/2026  511134339652    UPI/DR/511134339652/BHARATH/K/YESB/     180.00                          14820.00
03/10/2026  03/10/2026  511145998123    UPI/CR/511145998123/PRIYA/S/HDFC/                        200.00         15020.00
05/10/2026  05/10/2026  AXIS00099128    NEFT-CR-AXIS00099128-TECH CORP-SALARY                    85000.00       100020.00
07/10/2026  07/10/2026  POS99120384     POS 4129XXXXXXXX1234 AMAZON INDIA       2150.00                         97870.00
10/10/2026  10/10/2026  511188331122    UPI/DR/511188331122/SWIGGY/FOOD/        480.00                          97390.00
12/10/2026  12/10/2026  511199442233    UPI/DR/511199442233/BHARATH/K/YESB/     350.00                          97040.00
14/10/2026  14/10/2026  BESCOM00112     UPI/DR/778811223344/BESCOM/ELECTRICITY/ 1850.00                         95190.00
16/10/2026  16/10/2026  AIRTEL99182     UPI/DR/334455667788/AIRTEL/BROADBAND/   999.00                          94191.00
18/10/2026  18/10/2026  NEFT0044123     NEFT-DR-HDFC000123-APARTMENT RENT       15000.00                        79191.00
20/10/2026  20/10/2026  511166778899    UPI/DR/511166778899/ZOMATO/DINING/      320.00                          78871.00
-----------------------------------------------------------------------------------------------------------------------
    `;
  }

  const result = extractTransactionsFromText(sampleText);
  return {
    success: true,
    metadata: {
      filename,
      extractionMethod: "TEXT_PRESET",
      bankDetected: result.detectedBank,
      totalTransactions: result.totalCount,
      accountHolderId: "user1",
      extractedAt: new Date().toISOString(),
    },
    transactions: result.transactions,
    csvData: result.csvData,
    entityMapping: result.entityMapping,
  };
}

module.exports = {
  CHANNELS,
  detectBank,
  normalizeTimestamp,
  normalizeChannel,
  extractCounterparty,
  extractTransactionsFromText,
  parseBankStatementBuffer,
  getPreconfiguredSampleStatement,
};
