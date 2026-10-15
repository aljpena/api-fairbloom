const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },

    role: {
      type: String,
      enum: ["farmer", "buyer", "admin"],
      required: true,
    },

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

    // Submission-limit anti-fraud control
    submissionCount: { type: Number, default: 0 },
    lastSubmissionAt: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);