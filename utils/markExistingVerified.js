require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

(async () => {
  await connectDB();
  // Only touches documents that predate the isEmailVerified field.
  const result = await User.updateMany(
    { isEmailVerified: { $exists: false } },
    { $set: { isEmailVerified: true } }
  );
  console.log(`[FairBloom] Marked ${result.modifiedCount} existing account(s) as verified`);
  await mongoose.connection.close();
  process.exit(0);
})();
