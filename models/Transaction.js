const mongoose = require("mongoose");

/**
 * Each submitted transaction (price + volume) feeds the Real-Time Pricing
 * Index. VWAP = Sum(price * volume) / Sum(volume), computed per flower
 * variety over a window in the pricing service.
 */
const transactionSchema = new mongoose.Schema(
  {
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    flowerVariety: { type: String, required: true, trim: true },

    price: { type: Number, required: true, min: 0 }, // price per dozen
    volume: { type: Number, required: true, min: 0 }, // dozens sold

    location: { type: String, trim: true },

    // Layer 3 defense: automated boundary validation against rolling VWAP
    flaggedForReview: { type: Boolean, default: false },
    deviationPercent: { type: Number, default: null },

    // Layer 4 defense: admin moderation
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved", // auto-approved unless flagged
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ flowerVariety: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
