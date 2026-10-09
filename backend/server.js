const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const errorHandler = require("./middlewares/errorHandler");

// ---------------------------------------------------------------------------
// Load environment variables
// ---------------------------------------------------------------------------
dotenv.config();

// ---------------------------------------------------------------------------
// Connect to MongoDB
// ---------------------------------------------------------------------------
connectDB();

// ---------------------------------------------------------------------------
// Initialize Express app
// ---------------------------------------------------------------------------
const app = express();

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------
app.use(cors());                         // Enable CORS for Android client
app.use(express.json());                 // Parse JSON request bodies
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Health-check route
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🛡️ Fraud Detection API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});




// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/fraud", require("./routes/fraudRoutes"));
app.use("/api/assistant", require("./routes/assistantRoutes"));

// ---------------------------------------------------------------------------
// 404 handler — catch unmatched routes
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🚀 Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}`);
  console.log(`🔐 Auth routes:  http://localhost:${PORT}/api/auth`);
  console.log(`🤖 Fraud routes: http://localhost:${PORT}/api/fraud`);
  console.log(`🧠 ML Model URL: ${process.env.FRAUD_MODEL_URL || "http://127.0.0.1:8000"}\n`);
});
