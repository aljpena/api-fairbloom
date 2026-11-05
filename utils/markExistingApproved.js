require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

(async () => {
  await connectDB();
  const result = await User.updateMany(
    { verificationStatus: { $exists: false } },
    { $set: { verificationStatus: "approved" } }
  );
  console.log(`[FairBloom] Marked ${result.modifiedCount} existing account(s) as approved`);
  await mongoose.connection.close();
  process.exit(0);
})();