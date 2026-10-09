const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { chatWithAssistant } = require("../controllers/assistantController");

// Validation rules for assistant chat endpoint
const assistantChatValidation = [
  body("message")
    .trim()
    .notEmpty()
    .withMessage("Message is required")
    .isString()
    .withMessage("Message must be a string")
    .isLength({ max: 2000 })
    .withMessage("Message cannot exceed 2000 characters"),
  body("mode")
    .optional()
    .isIn(["detection_explanation", "general_help"])
    .withMessage("Invalid mode. Allowed: detection_explanation, general_help"),
  body("conversationId")
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage("Conversation ID must not exceed 100 characters"),
  body("history")
    .optional()
    .isArray({ max: 20 })
    .withMessage("History must be an array with at most 20 entries"),
  body("detectionContext")
    .optional()
    .isObject()
    .withMessage("Detection context must be an object if provided"),
];

// POST /api/assistant/chat
router.post("/chat", assistantChatValidation, chatWithAssistant);

module.exports = router;
