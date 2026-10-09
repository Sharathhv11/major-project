const { validationResult } = require("express-validator");
const { processAssistantChat } = require("../services/assistantService");

/**
 * Handle incoming conversational assistant chat messages
 * POST /api/assistant/chat
 */
const chatWithAssistant = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { message, mode, detectionContext, conversationId, history } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required and must be a non-empty string",
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message cannot exceed 2000 characters",
      });
    }

    const result = await processAssistantChat({
      message,
      mode,
      detectionContext,
      conversationId,
      history,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("❌ Assistant controller error:", error?.message || error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing your request. Please try again.",
      urgency: "low",
    });
  }
};

module.exports = {
  chatWithAssistant,
};
