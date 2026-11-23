const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },

    role: { type: String, enum: ["farmer", "buyer", "admin"], required: true },

    // Farmer-specific
    farmLocation: {
      type: String,
      enum: ["Beckel", "Bahong", "Ambiong", "Bineng", "Tublay", "Sablan", null],
      default: null,
    },

    // Buyer-specific
    buyerCategory: {
      type: String,
      enum: ["Retail Florist", "Funeral Home", "Church/Institution", null],
      default: null,
    },
    businessLocation: {
      type: String,
      enum: ["Baguio City", "La Trinidad", null],
      default: null,
    },

    // Email verification (OTP)
    isEmailVerified: { type: Boolean, default: false },
    otpHash: { type: String, select: false },
    otpExpiresAt: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpLastSentAt: { type: Date, select: false },
    // Document verification (Farmer ID for farmers, Business Permit for buyers), reviewed by an admin
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    verificationDocument: { type: mongoose.Schema.Types.ObjectId, ref: "File", default: null },
    verificationNote: { type: String, trim: true, maxlength: 300 }, // rejection reason shown to the user
    verificationReviewedAt: { type: Date },
    verificationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Anti-fraud submission cap
    submissionCount: { type: Number, default: 0 },
    lastSubmissionAt: { type: Date, default: null },

    // Account status (admin-managed)
    isActive: { type: Boolean, default: true },
    deactivatedAt: { type: Date },
    deactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Tokens issued before this moment are rejected (set when the password changes)
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
