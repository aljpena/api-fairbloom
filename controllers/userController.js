const { validationResult } = require("express-validator");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { disconnectUser } = require("../utils/socket");
const { eraseUser } = require("../utils/eraseService");

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

module.exports = { updateProfile, changePassword, eraseMyAccount };