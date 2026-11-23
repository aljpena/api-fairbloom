const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],

    // Optional: which listing sparked this conversation (e.g. buyer clicked
    // "negotiate" on a farmer's rose listing). Not required — two people
    // can also just message each other directly.
    relatedListing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", default: null },

    // Denormalized preview fields so the conversation list screen doesn't
    // need to fetch the whole message history just to show a preview.
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);
