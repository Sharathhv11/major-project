const { validationResult } = require("express-validator");

// ==========================================================================
// @desc    Analyze a message for fraud using the ML model
// @route   POST /api/fraud/analyze
// @access  Private
// ==========================================================================
const analyzeMessage = async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
    }

    const { text } = req.body;

    // Validate text presence and type
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Text message is required and must be a non-empty string",
      });
    }

    const trimmedText = text.trim();

    // Read config from environment
    const FRAUD_MODEL_URL =
      process.env.FRAUD_MODEL_URL || "http://127.0.0.1:8000";
    const FRAUD_SCORE_THRESHOLD = parseFloat(
      process.env.FRAUD_SCORE_THRESHOLD || "0.70"
    );

    console.log(`🔍 Analyzing message for fraud: "${trimmedText.length > 60 ? trimmedText.substring(0, 60) + '...' : trimmedText}"`);

    // Attempt to call the FastAPI ML model
    let mlResult = null;
    let mlAvailable = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const mlResponse = await fetch(`${FRAUD_MODEL_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmedText }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!mlResponse.ok) {
        const errorBody = await mlResponse.text().catch(() => "Unknown error");
        console.error(
          `⚠️ ML model returned HTTP ${mlResponse.status}: ${errorBody}`
        );
      } else {
        const mlData = await mlResponse.json();

        // Validate expected fields from FastAPI PredictResponse
        if (
          mlData &&
          typeof mlData.fraud_probability === "number" &&
          typeof mlData.prediction === "string"
        ) {
          mlResult = {
            fraudScore: mlData.fraud_probability,
            prediction: mlData.prediction,
            confidence: mlData.confidence,
            inferenceTimeMs: mlData.inference_time_ms,
            isFraud:
              mlData.fraud_probability >= FRAUD_SCORE_THRESHOLD ||
              mlData.prediction === "FRAUD",
            riskLevel:
              mlData.risk_level ||
              (mlData.fraud_probability >= FRAUD_SCORE_THRESHOLD
                ? "FRAUD"
                : "LEGITIMATE"),
            normalizedText: mlData.normalized_text || null,
          };
          mlAvailable = true;
          console.log(`🎯 ML Prediction: ${mlResult.prediction} [Risk: ${mlResult.riskLevel}] (score: ${(mlResult.fraudScore * 100).toFixed(1)}%, threshold: ${(FRAUD_SCORE_THRESHOLD * 100).toFixed(0)}%) -> isFraud: ${mlResult.isFraud}`);
        } else {
          console.error(
            "⚠️ ML model returned unexpected response format:",
            JSON.stringify(mlData)
          );
        }
      }
    } catch (mlError) {
      if (mlError.name === "AbortError") {
        console.error("⚠️ ML model request timed out after 5 seconds");
      } else {
        console.error(
          "⚠️ ML model unavailable:",
          mlError.message || mlError.code
        );
      }
      // mlResult stays null, mlAvailable stays false — fallback to rules only
    }

    // Truncate text in response to avoid leaking full message content in logs
    const safeText =
      trimmedText.length > 200
        ? trimmedText.substring(0, 200) + "..."
        : trimmedText;

    res.status(200).json({
      success: true,
      data: {
        text: safeText,
        mlResult,
        threshold: FRAUD_SCORE_THRESHOLD,
        mlAvailable,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  analyzeMessage,
};
