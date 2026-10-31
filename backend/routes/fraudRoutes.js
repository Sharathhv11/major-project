const express = require("express");
const router = express.Router();

const multer = require("multer");

const {
  analyzeMessage,
  analyzeNetworkTransactions,
  extractBankStatementTransactions,
} = require("../controllers/fraudController");
const { protect } = require("../middlewares/authMiddleware");
const { body } = require("express-validator");

// In-memory storage: PDF files are processed in-memory and discarded immediately for privacy
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.mimetype.startsWith("image/") ||
      file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF bank statements or scanned images are supported."), false);
    }
  },
});

// ---------------------------------------------------------------------------
// Validation rules for analyze endpoint
// ---------------------------------------------------------------------------
const analyzeValidation = [
  body("text")
    .trim()
    .notEmpty()
    .withMessage("Text message is required")
    .isString()
    .withMessage("Text message must be a string")
    .isLength({ max: 2000 })
    .withMessage("Text message cannot exceed 2000 characters"),
];

// ---------------------------------------------------------------------------
// Fraud analysis route (open to mobile client for real-time background protection)
// ---------------------------------------------------------------------------
router.post("/analyze", analyzeValidation, analyzeMessage);

// ---------------------------------------------------------------------------
// Transaction Network Fraud Analysis route (GCN multi-hop graph processing)
// ---------------------------------------------------------------------------
router.post("/analyze-network", analyzeNetworkTransactions);

// ---------------------------------------------------------------------------
// Bank Statement PDF Import & Extraction route (Privacy-preserving parser)
// ---------------------------------------------------------------------------
router.post(
  "/extract-statement",
  upload.single("statement"),
  extractBankStatementTransactions
);

module.exports = router;
