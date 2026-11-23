// Long-running server (local dev, Render, Railway, a VPS...): the Express app from app.js
// plus Socket.IO for real-time events. On Vercel there is no long-running process, so this
// file just exports the app (app.js connects to MongoDB per request there).
const app = require("./app");

if (process.env.VERCEL) {
  module.exports = app;
} else {
  startServer();
}

function startServer() {
  const http = require("http");
  const jwt = require("jsonwebtoken");
  const { Server } = require("socket.io");
  const mongoose = require("mongoose");

  const connectDB = require("./config/db");
  const { corsOriginValidator } = require("./config/cors");
  const { warmUpEmail } = require("./utils/sendEmail");
  const User = require("./models/User");
  const Conversation = require("./models/Conversation");
  const { setIO } = require("./utils/socket");

  const server = http.createServer(app);

  // ---- Socket.IO (real-time delivery of messages) ----
  const io = new Server(server, {
    cors: {
      origin: corsOriginValidator,
      credentials: true,
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
      if (
        user.passwordChangedAt &&
        decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
      ) {
        return next(new Error("Authentication failed"));
      }
      socket.user = user; // available in every handler below
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`[FairBloom] Socket connected: ${socket.id} (${socket.user.email})`);
    socket.join(`user:${socket.user._id}`);

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
      console.log(
        `[FairBloom] Server running on port ${PORT} (${process.env.NODE_ENV || "development"})`
      );
    });
  });

  // ---- Graceful shutdown (hosts send SIGTERM on redeploy/restart) ----
  const shutdown = (signal) => {
    console.log(`[FairBloom] ${signal} received, shutting down...`);
    io.close();
    server.close(() => {
      mongoose.connection.close(false).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  module.exports = { app, server, io };
}
