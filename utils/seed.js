require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

/**
 * Creates (or updates) the initial admin account.
 * Run with: npm run seed
 *
 * Admin accounts are intentionally NOT exposed through the public
 * /api/auth/register endpoint — they're provisioned here instead,
 * matching the manuscript's design where the researchers act as the
 * system administrators during the study period.
 */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@fairbloom.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const run = async () => {
  await connectDB();

  const existing = await User.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    console.log(`[FairBloom] Admin account already exists: ${ADMIN_EMAIL}`);
  } else {
    await User.create({
      name: "FairBloom Admin",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "admin",
    });
    console.log(`[FairBloom] Admin account created: ${ADMIN_EMAIL}`);
    console.log(`[FairBloom] Default password: ${ADMIN_PASSWORD} (change this after first login)`);
  }

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error("[FairBloom] Seed error:", err.message);
  process.exit(1);
});
