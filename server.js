require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const { warmUpEmail } = require("./utils/sendEmail");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const { setIO } = require("./utils/socket");

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

// ---- Routes ----
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/listings", require("./routes/listingRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/pricing", require("./routes/pricingRoutes"));
app.use("/api/conversations", require("./routes/conversationRoutes"));

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

// ---- Socket.IO (real-time delivery of messages) ----
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : "*",
  },
});
setIO(io);

// Authentication: runs once per connection, before "connection" fires.
// The client must connect like:  io(URL, { auth: { token: "<JWT>" } })
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) return next(new Error("Authentication failed"));

    socket.user = user; // available in every handler below
    next();
  } catch (err) {
    next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  console.log(`[FairBloom] Socket connected: ${socket.id} (${socket.user.email})`);

  // Authorization: only participants may join a conversation's room.
  // The optional `ack` callback tells the client whether joining worked.
  socket.on("join_room", async (conversationId, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    try {
      const conversation = await Conversation.findById(conversationId);
      const isParticipant =
        conversation &&
        conversation.participants.some((p) => p.toString() === socket.user._id.toString());

      if (!isParticipant) {
        return reply({ ok: false, message: "You're not part of this conversation" });
      }

      socket.join(conversationId);
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, message: "Could not join conversation" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[FairBloom] Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

// ---- Start server after DB connects ----
connectDB().then(() => {
  warmUpEmail();
  server.listen(PORT, () => {
    console.log(`[FairBloom] Server running on port ${PORT} (${process.env.NODE_ENV || "development"})`);
  });
});

module.exports = { app, server, io };