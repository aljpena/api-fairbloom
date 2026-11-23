const Transaction = require("../models/Transaction");
const escapeRegex = require("../utils/escapeRegex");
const { notify } = require("../utils/notify");

/**
 * @route   GET /api/transactions
 * @desc    All transactions (admin only)
 */
const getTransactions = async (req, res) => {
  try {
    const { flowerVariety } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const filter = {};
    if (flowerVariety) filter.flowerVariety = { $regex: escapeRegex(flowerVariety), $options: "i" };

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate("submittedBy", "name role")
        .populate("farmer buyer", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    res.json({ transactions, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("[FairBloom] Get transactions error:", err.message);
    res.status(500).json({ message: "Server error fetching transactions" });
  }
};

/**
 * @route   GET /api/transactions/mine
 * @desc    Your own history: deals you were part of, plus any older records.
 */
const getMyTransactions = async (req, res) => {
  try {
    const { flowerVariety, status } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const mine = [{ submittedBy: req.user._id }, { farmer: req.user._id }, { buyer: req.user._id }];

    const filter = { $or: mine };
    if (flowerVariety) filter.flowerVariety = { $regex: escapeRegex(flowerVariety), $options: "i" };
    if (status) filter.status = String(status);

    const [transactions, total, summaryRaw] = await Promise.all([
      Transaction.find(filter)
        .populate("farmer buyer", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Transaction.countDocuments(filter),
      Transaction.aggregate([
        { $match: { $or: mine } },
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
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[FairBloom] Get my transactions error:", err.message);
    res.status(500).json({ message: "Server error fetching your transaction history" });
  }
};

/**
 * @route   GET /api/transactions/pending
 * @access  Private (admin only)
 */
const getPendingTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: "pending" })
      .populate("submittedBy", "name role email")
      .populate("farmer buyer", "name")
      .sort({ createdAt: -1 });

    res.json({ transactions, count: transactions.length });
  } catch (err) {
    console.error("[FairBloom] Get pending transactions error:", err.message);
    res.status(500).json({ message: "Server error fetching pending transactions" });
  }
};

/**
 * @route   PATCH /api/transactions/:id/review
 * @desc    Body: { "decision": "approve" | "reject" }
 * @access  Private (admin only)
 */
const reviewTransaction = async (req, res) => {
  const { decision } = req.body;

  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
  }

  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });

    if (transaction.status !== "pending") {
      return res.status(400).json({
        message: `This transaction is already '${transaction.status}', nothing to review`,
      });
    }

    transaction.status = decision === "approve" ? "approved" : "rejected";
    transaction.reviewedBy = req.user._id;
    await transaction.save();

    const parties = [
      ...new Set(
        [transaction.submittedBy, transaction.farmer, transaction.buyer].filter(Boolean).map(String)
      ),
    ];
    const ok = transaction.status === "approved";
    notify(parties, {
      type: `transaction_${transaction.status}`,
      title: ok ? "Transaction approved" : "Transaction rejected",
      body: ok
        ? `Your ${transaction.flowerVariety} sale was approved and now counts toward the price index.`
        : `Your ${transaction.flowerVariety} sale was rejected by an administrator.`,
      transaction: transaction._id,
    });

    res.json({ transaction });
  } catch (err) {
    if (err.name === "CastError")
      return res.status(400).json({ message: "Invalid transaction id" });
    console.error("[FairBloom] Review transaction error:", err.message);
    res.status(500).json({ message: "Server error reviewing transaction" });
  }
};

module.exports = { getTransactions, getMyTransactions, getPendingTransactions, reviewTransaction };
