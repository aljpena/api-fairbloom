// Shared CORS rules for the HTTP API and Socket.IO.

// Allowed origins (admin panel, mobile app dev server), comma separated.
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const isDev = process.env.NODE_ENV !== "production";

// In development, also accept localhost and private-LAN origins on any port,
// so a changing Wi-Fi IP or dev-server port doesn't break CORS.
const devOriginPattern =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

if (!isDev && !allowedOrigins.length) {
  console.warn(
    "[FairBloom] Warning: CLIENT_ORIGIN is empty, so CORS allows every origin. " +
      "Set it to the admin web URL(s) in production."
  );
}

const corsOriginValidator = (origin, callback) => {
  if (!origin) return callback(null, true);

  if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  if (isDev && devOriginPattern.test(origin)) {
    return callback(null, true);
  }

  console.warn(`[FairBloom] CORS blocked origin: ${origin}`);

  return callback(new Error("Origin not allowed by CORS"));
};

module.exports = { allowedOrigins, isDev, corsOriginValidator };
