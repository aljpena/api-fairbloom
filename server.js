require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");

const app = express();
const server = http.createServer(app);

// ---- Allowed origins (admin panel dev server, mobile app dev server) ----
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// ---- Core middleware ----
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : "*",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));


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

// ---- Routes (uncomment as you build each module) ----
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/listings", require("./routes/listingRoutes"));
// app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/pricing", require("./routes/pricingRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
// app.use("/api/messages", require("./routes/messageRoutes"));
// app.use("/api/admin", require("./routes/adminRoutes"));

// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ---- Global error handler ----
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
});

// ---- Socket.IO setup (for real-time peer-to-peer messaging) ----
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : "*",
  },
});

io.on("connection", (socket) => {
  console.log(`[FairBloom] Socket connected: ${socket.id}`);

  socket.on("join_room", (conversationId) => {
    socket.join(conversationId);
  });

  socket.on("send_message", (data) => {
    io.to(data.conversationId).emit("receive_message", data);
  });

  socket.on("disconnect", () => {
    console.log(`[FairBloom] Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

// ---- Start server after DB connects ----
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`[FairBloom] Server running on port ${PORT} (${process.env.NODE_ENV || "development"})`);
  });
});

module.exports = { app, server, io };
