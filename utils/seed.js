require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

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
      isEmailVerified: true,
      verificationStatus: "approved",
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
