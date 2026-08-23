const { validationResult } = require("express-validator");
const Transaction = require("../models/Transaction");
const { calculateVWAP } = require("../utils/vwap");

/**
 * STEP 3 of the pricing index build: anti-fraud boundary validation.
 *
 * Before saving a new transaction, we compute the CURRENT VWAP for that
 * flower variety (from existing approved transactions), then check how
 * far the new price deviates from it. Manuscript's "Layer 3" defense.
 *
 * @route   POST /api/transactions
 * @desc    Submit a completed sale's price + volume
 * @access  Private (farmer, buyer)
 */
const submitTransaction = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { flowerVariety, price, volume, location } = req.body;

  try {
    // 1. Pull existing approved transactions for this variety (same 30-day
    //    window logic as the pricing endpoint, so the check is consistent
    //    with what buyers/farmers actually see as "the current price").
    const existing = await Transaction.find({
      flowerVariety: { $regex: `^${flowerVariety}$`, $options: "i" },
      status: "approved",
    }).select("price volume");

    const { vwap: currentVWAP } = calculateVWAP(existing);

    let deviationPercent = null;
    let flaggedForReview = false;
    let status = "approved";

    // 2. Only run the boundary check if there IS a current VWAP to compare
    //    against. A brand-new flower variety has nothing to compare to yet,
    //    so its first submission is auto-approved and becomes the baseline.
    if (currentVWAP !== null) {
      deviationPercent = Math.round((Math.abs(price - currentVWAP) / currentVWAP) * 100 * 100) / 100;

      const threshold = Number(process.env.PRICE_DEVIATION_THRESHOLD_PERCENT) || 30;

      if (deviationPercent > threshold) {
        flaggedForReview = true;
        status = "pending"; // held for admin review, NOT counted in future VWAP calcs until approved
      }
    }

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

    res.status(201).json({
      transaction,
      // Extra context for the client UI to explain *why* it was flagged, if it was
      priceCheck: {
        currentVWAP,
        deviationPercent,
        threshold: Number(process.env.PRICE_DEVIATION_THRESHOLD_PERCENT) || 30,
        flagged: flaggedForReview,
      },
    });
  } catch (err) {
    console.error("[FairBloom] Submit transaction error:", err.message);
    res.status(500).json({ message: "Server error submitting transaction" });
  }
};

/**
 * @route   GET /api/transactions
 * @desc    List recent transactions, optionally filtered by flower variety
 * @access  Private (any logged-in user — useful for debugging/auditing right now;
 *          we can lock this down further once the pricing index endpoint exists)
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
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error("[FairBloom] Get transactions error:", err.message);
    res.status(500).json({ message: "Server error fetching transactions" });
  }
};

/**
 * STEP 4 of the pricing index build: admin moderation.
 * Manuscript's "Layer 4" defense — a human makes the final call on
 * anything the automated boundary check flagged.
 *
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
 *          Approved transactions become eligible for future VWAP calculations.
 *          Rejected transactions are permanently excluded.
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

module.exports = { submitTransaction, getTransactions, getPendingTransactions, reviewTransaction };