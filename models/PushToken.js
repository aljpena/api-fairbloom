const mongoose = require("mongoose");

const pushTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true }, // one device = one token
    platform: { type: String, enum: ["android", "ios"] },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PushToken", pushTokenSchema);