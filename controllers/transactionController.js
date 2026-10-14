const { validationResult } = require("express-validator");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { calculateVWAP, DEFAULT_WINDOW_DAYS } = require("../utils/vwap");

/**
 * Returns true if `lastDate` falls on a different calendar day than "now"
 * (or if there's no lastDate at all). Used to decide whether a user's
 * daily submission counter should reset.
 */
function isNewDay(lastDate) {
  if (!lastDate) return true;
  const now = new Date();
  return (
    lastDate.getFullYear() !== now.getFullYear() ||
    lastDate.getMonth() !== now.getMonth() ||
    lastDate.getDate() !== now.getDate()
  );
}

/**
 * Full submission pipeline, in order:
 *   1. Layer 2 — account-bound daily submission limit
 *   2. Layer 3 — automated boundary validation against current VWAP
 *   3. Save, with status determined by step 2
 * (Layer 1 — volume-weighting — lives inside calculateVWAP itself, and
 *  Layer 4 — admin moderation — is the review endpoints further down.)
 *
 * @route   POST /api/transactions
 * @access  Private (farmer, buyer)
 */
const submitTransaction = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { flowerVariety, price, volume, location } = req.body;

  try {
    //Layer 2: account-bound daily submission limit
    const user = await User.findById(req.user._id);
    const dailyLimit = Number(process.env.MAX_DAILY_SUBMISSIONS) || 20;

    if (isNewDay(user.lastSubmissionAt)) {
      user.submissionCount = 0; // new day, new count
    }

    if (user.submissionCount >= dailyLimit) {
      return res.status(429).json({
        message: `Daily submission limit reached (${dailyLimit} per day). Please try again tomorrow.`,
      });
    }

    //Layer 3: automated boundary validation against current VWAP
    const since = new Date();
    since.setDate(since.getDate() - DEFAULT_WINDOW_DAYS);

    const existing = await Transaction.find({
      flowerVariety: { $regex: `^${flowerVariety}$`, $options: "i" },
      status: "approved",
      createdAt: { $gte: since },
    }).select("price volume");

    const { vwap: currentVWAP } = calculateVWAP(existing);

    let deviationPercent = null;
    let flaggedForReview = false;
    let status = "approved";

    if (currentVWAP !== null) {
      deviationPercent = Math.round((Math.abs(price - currentVWAP) / currentVWAP) * 100 * 100) / 100;
      const threshold = Number(process.env.PRICE_DEVIATION_THRESHOLD_PERCENT) || 30;

      if (deviationPercent > threshold) {
        flaggedForReview = true;
        status = "pending";
      }
    }

    // ---- Save the transaction ----
    const transaction = await Transaction.create({
      submittedBy: req.user._id,
      flowerVariety,
      price,
      volume,
      location,
      deviationPercent,
      flaggedForReview,
      status,
    });

    // ---- Update the user's submission counter (counts toward the limit
    //      regardless of whether it got flagged — the limit is about
    //      submission VOLUME from one account, not just "bad" submissions) ----
    user.submissionCount += 1;
    user.lastSubmissionAt = new Date();
    await user.save();

    res.status(201).json({
      transaction,
      priceCheck: {
        currentVWAP,
        deviationPercent,
        threshold: Number(process.env.PRICE_DEVIATION_THRESHOLD_PERCENT) || 30,
        flagged: flaggedForReview,
      },
      submissionsRemainingToday: dailyLimit - user.submissionCount,
    });
  } catch (err) {
    console.error("[FairBloom] Submit transaction error:", err.message);
    res.status(500).json({ message: "Server error submitting transaction" });
  }
};

/**
 * @route   GET /api/transactions
 * @desc    List recent transactions, optionally filtered by flower variety
 * @access  Private
 */
const getTransactions = async (req, res) => {
  try {
    const { flowerVariety, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (flowerVariety) {
      filter.flowerVariety = { $regex: flowerVariety, $options: "i" };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate("submittedBy", "name role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Transaction.countDocuments(filter),
    ]);

    res.json({
      transactions,
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error("[FairBloom] Get transactions error:", err.message);
    res.status(500).json({ message: "Server error fetching transactions" });
  }
};

/**
 * @route   GET /api/transactions/pending
 * @desc    List all transactions currently awaiting admin review
 * @access  Private (admin only)
 */
const getPendingTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: "pending" })
      .populate("submittedBy", "name role email")
      .sort({ createdAt: -1 });

    res.json({ transactions, count: transactions.length });
  } catch (err) {
    console.error("[FairBloom] Get pending transactions error:", err.message);
    res.status(500).json({ message: "Server error fetching pending transactions" });
  }
};

/**
 * @route   PATCH /api/transactions/:id/review
 * @desc    Admin approves or rejects a flagged transaction.
 *          Body: { "decision": "approve" | "reject" }
 * @access  Private (admin only)
 */
const reviewTransaction = async (req, res) => {
  const { decision } = req.body;

  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
  }

  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({
        message: `This transaction is already '${transaction.status}', nothing to review`,
      });
    }

    transaction.status = decision === "approve" ? "approved" : "rejected";
    transaction.reviewedBy = req.user._id;
    await transaction.save();

    res.json({ transaction });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ message: "Invalid transaction id" });
    }
    console.error("[FairBloom] Review transaction error:", err.message);
    res.status(500).json({ message: "Server error reviewing transaction" });
  }
};

/**
 * @route   GET /api/transactions/mine
 * @desc    The logged-in user's own transaction history, newest first,
 *          plus a summary grouped by status.
 *          Query params: flowerVariety, status, page, limit
 * @access  Private (farmer, buyer)
 */
const getMyTransactions = async (req, res) => {
  try {
    const { flowerVariety, status, page = 1, limit = 20 } = req.query;

    // submittedBy is always forced to the logged-in user, so nobody can
    // see anyone else records.
    const filter = { submittedBy: req.user._id };
    if (flowerVariety) filter.flowerVariety = { $regex: flowerVariety, $options: "i" };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total, summaryRaw] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Transaction.countDocuments(filter),
      // Summary covers ALL of the user's transactions (ignores filters),
      // grouped by status: how many, total dozens, total pesos.
      Transaction.aggregate([
        { $match: { submittedBy: req.user._id } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalVolume: { $sum: "$volume" },
            totalValue: { $sum: { $multiply: ["$price", "$volume"] } },
          },
        },
      ]),
    ]);

    const summary = {};
    summaryRaw.forEach((s) => {
      summary[s._id] = {
        count: s.count,
        totalVolume: s.totalVolume,
        totalValue: Math.round(s.totalValue * 100) / 100,
      };
    });

    res.json({
      transactions,
      summary,
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    console.error("[FairBloom] Get my transactions error:", err.message);
    res.status(500).json({ message: "Server error fetching your transaction history" });
  }
};

module.exports = {
  submitTransaction,
  getTransactions,
  getMyTransactions,
  getPendingTransactions,
  reviewTransaction,
};