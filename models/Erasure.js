const mongoose = require("mongoose");

// One row per erased participant. Holds only the internal user id (no name,
// email or phone), so a restore from an older backup can erase them again.
const erasureSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  role: { type: String },
  transactions: { type: String, enum: ["anonymize", "delete"], required: true },
  source: { type: String, enum: ["admin", "self"] },
  erasedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Erasure", erasureSchema);
