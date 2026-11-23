const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["chat", "verification", "listing"], required: true },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },
    contentType: { type: String, default: "image/jpeg" },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true, select: false }, // only loaded when served
  },
  { timestamps: true }
);

module.exports = mongoose.model("File", fileSchema);
