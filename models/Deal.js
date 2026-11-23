const mongoose = require("mongoose");

const dealSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", default: null },

    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    respondent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    flowerVariety: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0.01 },
    volume: { type: Number, required: true, min: 0.01 },
    location: { type: String, trim: true },

    status: {
      type: String,
      enum: ["proposed", "accepted", "declined", "cancelled"],
      default: "proposed",
    },
    respondedAt: { type: Date },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

dealSchema.index({ conversation: 1, createdAt: -1 });

// At most ONE open proposal per conversation, enforced by the database.
dealSchema.index(
  { conversation: 1 },
  { unique: true, partialFilterExpression: { status: "proposed" } }
);

module.exports = mongoose.model("Deal", dealSchema);
