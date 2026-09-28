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

    // Farmer specific
    farmLocation: {
      type: String,
      enum: ["Beckel", "Bahong", "Ambiong", "Bineng", "Tublay", "Sablan", null],
      default: null,
    },

    // Buyer specific
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

    // Submission limit anti fraud control (4-layer defense)
    submissionCount: { type: Number, default: 0 },
    lastSubmissionAt: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Hash password before saving
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
