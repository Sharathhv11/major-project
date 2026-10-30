const express = require("express");
const router = express.Router();

const { analyzeMessage, analyzeNetworkTransactions } = require("../controllers/fraudController");
const { protect } = require("../middlewares/authMiddleware");
const { body } = require("express-validator");

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

module.exports = router;
