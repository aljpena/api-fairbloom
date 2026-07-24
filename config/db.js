const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error(
      "MONGO_URI is not defined. Copy .env.example to .env and fill in your connection string."
    );
    process.exit(1);
  }

  if (uri.startsWith("mongodb+srv://")) {
    console.warn(
      "[FairBloom] Warning: MONGO_URI uses the '+srv' format. " +
        "If you're having connection issues on this network, switch to the " +
        "legacy 'mongodb://' standard connection string (see .env.example)."
    );
  }

  try {
    const conn = await mongoose.connect(uri, {
      // These options are safe defaults for modern Mongoose (v8+),
      // most of the old connection flags are no longer needed,
      // but we set a few explicitly for reliability on flaky networks.
      serverSelectionTimeoutMS: 15000, // fail fast instead of hanging forever
      family: 4, // force IPv4, avoids some ISP IPv6 resolution issues
    });

    console.log(`[FairBloom] MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error("[FairBloom] MongoDB connection error:", err.message);

    if (err.message.includes("querySrv") || err.message.includes("ENOTFOUND")) {
      console.error(
        "\nThis looks like a DNS SRV resolution failure. " +
          "Make sure MONGO_URI in your .env is the LEGACY standard connection " +
          "string (starts with 'mongodb://' and lists explicit hosts), " +
          "not the 'mongodb+srv://' shorthand.\n"
      );
    }

    process.exit(1);
  }
};

// Log runtime connection state changes (useful during development/demo)
mongoose.connection.on("disconnected", () => {
  console.warn("[FairBloom] MongoDB disconnected.");
});

mongoose.connection.on("reconnected", () => {
  console.log("[FairBloom] MongoDB reconnected.");
});

module.exports = connectDB;
