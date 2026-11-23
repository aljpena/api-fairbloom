const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // null after anonymization
    flowerVariety: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 }, // per dozen (₱)
    volume: { type: Number, required: true, min: 0 }, // dozens
    location: { type: String, trim: true },

    // "deal"   = confirmed by both parties in chat
    // "manual" = one party reported a sale made outside the app
    source: { type: String, enum: ["manual", "deal"], default: "manual" },
    deal: { type: mongoose.Schema.Types.ObjectId, ref: "Deal", default: null },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Layer 3: boundary validation
    flaggedForReview: { type: Boolean, default: false },
    deviationPercent: { type: Number, default: null },

    // Layer 4: admin moderation
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ flowerVariety: 1, createdAt: -1 });
transactionSchema.index({ farmer: 1 });
transactionSchema.index({ buyer: 1 });

// One deal can produce at most one transaction, enforced by the database.
transactionSchema.index(
  { deal: 1 },
  { unique: true, partialFilterExpression: { deal: { $type: "objectId" } } }
);

module.exports = mongoose.model("Transaction", transactionSchema);
