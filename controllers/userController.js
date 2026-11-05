const { validationResult } = require("express-validator");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { disconnectUser } = require("../utils/socket");
const { eraseUser } = require("../utils/eraseService");
const mongoose = require("mongoose");
const File = require("../models/File");
const { processImage } = require("../utils/imageService");
const { notifyAdmins } = require("../utils/notify");

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  farmLocation: user.farmLocation,
  buyerCategory: user.buyerCategory,
  businessLocation: user.businessLocation,
});

/**
 * @route   PATCH /api/users/me
 * @desc    Edit your own profile. Only fields that apply to your role are
 *          accepted; anything else in the body is ignored.
 * @access  Private
 */
const updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const user = await User.findById(req.user._id);

    const editable = ["name", "phone"];
    if (user.role === "farmer") editable.push("farmLocation");
    if (user.role === "buyer") editable.push("buyerCategory", "businessLocation");

    const provided = editable.filter((f) => req.body[f] !== undefined);
    if (provided.length === 0) {
      return res.status(400).json({ message: `Nothing to update. Editable fields: ${editable.join(", ")}` });
    }

    provided.forEach((f) => {
      user[f] = req.body[f];
    });
    await user.save();

    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("[FairBloom] Update profile error:", err.message);
    res.status(500).json({ message: "Server error updating profile" });
  }
};

/**
 * @route   PATCH /api/users/me/password
 * @desc    Body: { currentPassword, newPassword }. Invalidates all older
 *          tokens and returns a fresh one for this device.
 * @access  Private
 */
const changePassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user._id).select("+password");

    if (!(await user.comparePassword(currentPassword))) {
      // 400 rather than 401, so a client doesn't mistake it for an expired session and log out.
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword; // hashed by the pre-save hook, which also sets passwordChangedAt
    await user.save();

    // Close live sockets; the app reconnects with the new token.
    disconnectUser(user._id);

    res.json({
      message: "Password changed. Other devices have been logged out.",
      token: generateToken(user),
    });
  } catch (err) {
    console.error("[FairBloom] Change password error:", err.message);
    res.status(500).json({ message: "Server error changing password" });
  }
};

/**
 * @route   POST /api/users/me/erase
 * @desc    Delete your own account. Body: { password }.
 *          Your transactions are anonymized (not deleted) so the shared price
 *          index stays accurate for everyone else.
 * @access  Private (farmer, buyer)
 */
const eraseMyAccount = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (req.user.role === "admin") {
    return res.status(403).json({ message: "Admin accounts can't be deleted here" });
  }

  try {
    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.comparePassword(req.body.password))) {
      return res.status(400).json({ message: "Password is incorrect" });
    }

    const report = await eraseUser(user._id, { transactions: "anonymize", source: "self" });
    res.json({ message: "Your account and personal data have been permanently deleted.", report });
  } catch (err) {
    console.error("[FairBloom] Erase account error:", err.message);
    res.status(500).json({ message: "Server error deleting account" });
  }
};

/**
 * @route   POST /api/users/me/verification-document   (multipart, field 'document')
 * @desc    Upload a new Farmer ID / Business Permit photo, e.g. after a rejection.
 *          Puts the account back in the review queue.
 * @access  Private (farmer, buyer)
 */
const submitVerificationDocument = async (req, res) => {
  if (!["farmer", "buyer"].includes(req.user.role)) {
    return res.status(403).json({ message: "Only farmer and buyer accounts are verified" });
  }
  if (!req.file) {
    return res.status(400).json({ message: "Attach a photo in the 'document' field" });
  }

  try {
    const user = await User.findById(req.user._id);
    if (user.verificationStatus === "approved") {
      return res.status(409).json({ message: "Your account is already verified" });
    }

    let processed;
    try {
      processed = await processImage(req.file.buffer, { maxSize: 2000, quality: 85 });
    } catch (imgErr) {
      return res.status(400).json({ message: imgErr.message });
    }

    const fileId = new mongoose.Types.ObjectId();
    await File.create({ _id: fileId, owner: user._id, kind: "verification", ...processed });

    const oldDocId = user.verificationDocument;
    user.verificationDocument = fileId;
    user.verificationStatus = "pending";
    user.verificationNote = undefined;
    user.verificationReviewedAt = undefined;
    user.verificationReviewedBy = undefined;
    try {
      await user.save();
    } catch (saveErr) {
      await File.deleteOne({ _id: fileId });
      throw saveErr;
    }
    if (oldDocId) await File.deleteOne({ _id: oldDocId });

    notifyAdmins({
      type: "verification_pending",
      title: "Document resubmitted",
      body: `${user.name} (${user.role}) uploaded a new document`,
      subject: user._id,
    });

    res.json({ message: "Document received. An administrator will review it.", verificationStatus: "pending" });
  } catch (err) {
    console.error("[FairBloom] Submit verification document error:", err.message);
    res.status(500).json({ message: "Server error uploading document" });
  }
};

module.exports = { updateProfile, changePassword, eraseMyAccount, submitVerificationDocument };