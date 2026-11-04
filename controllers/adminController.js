const { validationResult } = require("express-validator");
const User = require("../models/User");
const Listing = require("../models/Listing");
const Deal = require("../models/Deal");
const Transaction = require("../models/Transaction");
const escapeRegex = require("../utils/escapeRegex");
const { disconnectUser } = require("../utils/socket");
const { createBackup, serialize, stamp } = require("../utils/backupService");
const { eraseUser } = require("../utils/eraseService");

/**
 * @route   GET /api/admin/users
 * @desc    Query: role, status (active|inactive), verified (true|false),
 *          search (name or email), page, limit
 * @access  Private (admin only)
 */
const listUsers = async (req, res) => {
  try {
    const { role, status, verified, search } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const filter = {};
    if (["farmer", "buyer", "admin"].includes(role)) filter.role = role;
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
    if (verified === "true") filter.isEmailVerified = true;
    if (verified === "false") filter.isEmailVerified = false;
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({ users, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("[FairBloom] List users error:", err.message);
    res.status(500).json({ message: "Server error fetching users" });
  }
};

/**
 * @route   GET /api/admin/users/:id
 * @desc    One user plus a snapshot of their activity
 * @access  Private (admin only)
 */
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const involved = [{ submittedBy: user._id }, { farmer: user._id }, { buyer: user._id }];

    const [activeListings, byStatus] = await Promise.all([
      Listing.countDocuments({ postedBy: user._id, status: "active" }),
      Transaction.aggregate([
        { $match: { $or: involved } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const transactions = {};
    byStatus.forEach((s) => {
      transactions[s._id] = s.count;
    });

    res.json({ user, activity: { activeListings, transactions } });
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid user id" });
    console.error("[FairBloom] Get user error:", err.message);
    res.status(500).json({ message: "Server error fetching user" });
  }
};

/**
 * @route   PATCH /api/admin/users/:id/status
 * @desc    Body: { isActive: true | false }
 * @access  Private (admin only)
 */
const setUserStatus = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { isActive } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: "You can't change your own account status" });
    }
    if (user.role === "admin") {
      return res.status(403).json({ message: "Admin accounts can't be deactivated here" });
    }
    if (user.isActive === isActive) {
      return res.json({ user, message: `Account is already ${isActive ? "active" : "deactivated"}` });
    }

    if (isActive) {
      user.isActive = true;
      user.deactivatedAt = undefined;
      user.deactivatedBy = undefined;
      await user.save();
      return res.json({ user, message: "Account reactivated" });
    }

    user.isActive = false;
    user.deactivatedAt = new Date();
    user.deactivatedBy = req.user._id;
    await user.save();

    const [listings, deals] = await Promise.all([
      Listing.updateMany({ postedBy: user._id, status: "active" }, { status: "cancelled" }),
      Deal.updateMany(
        { status: "proposed", $or: [{ proposedBy: user._id }, { respondent: user._id }] },
        { status: "cancelled", respondedAt: new Date() }
      ),
    ]);

    disconnectUser(user._id);

    res.json({
      user,
      message: "Account deactivated",
      cleanup: {
        listingsCancelled: listings.modifiedCount,
        openDealsCancelled: deals.modifiedCount,
      },
    });
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid user id" });
    console.error("[FairBloom] Set user status error:", err.message);
    res.status(500).json({ message: "Server error updating account status" });
  }
};

/**
 * @route   GET /api/admin/backup
 * @desc    Downloads a full backup file. Contains personal data and password
 *          hashes, so it's admin-only, never cached, and (in production)
 *          refuses to run unless BACKUP_PASSPHRASE is set.
 * @access  Private (admin only)
 */
const downloadBackup = async (req, res) => {
  if (process.env.NODE_ENV === "production" && !process.env.BACKUP_PASSPHRASE) {
    return res.status(400).json({ message: "Set BACKUP_PASSPHRASE before downloading backups in production." });
  }

  try {
    const backup = await createBackup();
    const { buffer, encrypted } = serialize(backup);

    res.set({
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="fairbloom-backup-${stamp()}.json"`,
      "Cache-Control": "no-store",
      "X-Backup-Encrypted": String(encrypted),
    });
    res.send(buffer);
  } catch (err) {
    console.error("[FairBloom] Backup download error:", err.message);
    res.status(500).json({ message: "Server error creating backup" });
  }
};

/**
 * @route   POST /api/admin/users/:id/erase
 * @desc    Permanently erases a participant (research withdrawal).
 *          Body: { confirmEmail, transactions: "anonymize" | "delete" }
 *          There's no default for `transactions`: the admin must choose.
 * @access  Private (admin only)
 */
const eraseUserByAdmin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { confirmEmail, transactions } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: "You can't erase your own account" });
    }
    if (user.role === "admin") {
      return res.status(403).json({ message: "Admin accounts can't be erased here" });
    }
    if (confirmEmail !== user.email) {
      return res.status(400).json({ message: "confirmEmail doesn't match this user's email" });
    }

    const report = await eraseUser(user._id, { transactions, source: "admin" });
    res.json({ message: "Participant permanently erased", report });
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid user id" });
    console.error("[FairBloom] Erase user error:", err.message);
    res.status(500).json({ message: "Server error erasing participant" });
  }
};

module.exports = { listUsers, getUser, setUserStatus, downloadBackup, eraseUserByAdmin };