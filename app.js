// The Express app (HTTP API only). server.js wraps it with an HTTP server and Socket.IO
// for long-running hosts; on Vercel this module is used directly as a serverless function.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { ensureDB } = require("./config/db");
const { isDev, corsOriginValidator } = require("./config/cors");

// Fail fast on missing secrets instead of crashing on the first login.
if (!process.env.JWT_SECRET) {
  console.error("[FairBloom] JWT_SECRET is not set. Refusing to start.");
  process.exit(1);
}

const app = express();

// Behind a reverse proxy / load balancer (Vercel, Render, Railway, Nginx...),
// set TRUST_PROXY=1 so rate limiting and logs see the real client IP.
const trustProxy = process.env.TRUST_PROXY || (process.env.VERCEL ? "1" : "");
if (trustProxy) {
  app.set(
    "trust proxy",
    trustProxy === "true" ? true : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy
  );
}

// ---- Core middleware ----
app.use(helmet());
app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(isDev ? "dev" : "combined"));

// Basic rate limiting (protects auth + submission endpoints from abuse)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

// ---- Health check ----
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "FairBloom API", time: new Date().toISOString() });
});

// ---- Serverless: connect to MongoDB on the first request and reuse the connection ----
// (server.js connects once at startup instead.)
if (process.env.VERCEL) {
  app.use("/api", async (req, res, next) => {
    try {
      await ensureDB();
      next();
    } catch (err) {
      console.error("[FairBloom] MongoDB connection error:", err.message);
      res.status(503).json({ message: "Database unavailable, please try again shortly." });
    }
  });
}

// ---- Routes ----
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/listings", require("./routes/listingRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/pricing", require("./routes/pricingRoutes"));
app.use("/api/conversations", require("./routes/conversationRoutes"));
app.use("/api/deals", require("./routes/dealRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/files", require("./routes/fileRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));

// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ---- Global error handler ----
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  // Don't leak internal error details (DB errors, stack info) to clients in production.
  const message =
    status >= 500 && !isDev ? "Internal server error" : err.message || "Internal server error";
  res.status(status).json({ message });
});

module.exports = app;
