const Transaction = require("../models/Transaction");
const { calculateVWAP } = require("../utils/vwap");

const DEFAULT_WINDOW_DAYS = 30;

/**
 * @route   GET /api/pricing/:flowerVariety
 * @desc    Get the current VWAP-based price for one flower variety,
 *          computed from approved transactions in a rolling window.
 *          Query param ?days=N overrides the default 30-day window.
 * @access  Public
 */
const getPriceForVariety = async (req, res) => {
  try {
    const { flowerVariety } = req.params;
    const days = Number(req.query.days) || DEFAULT_WINDOW_DAYS;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const transactions = await Transaction.find({
      flowerVariety: { $regex: `^${flowerVariety}$`, $options: "i" }, // exact match, case-insensitive
      status: "approved",
      createdAt: { $gte: since },
    }).select("price volume");

    const result = calculateVWAP(transactions);

    res.json({
      flowerVariety,
      windowDays: days,
      ...result,
    });
  } catch (err) {
    console.error("[FairBloom] Get price error:", err.message);
    res.status(500).json({ message: "Server error computing price index" });
  }
};

/**
 * @route   GET /api/pricing
 * @desc    Get the current VWAP-based price for every flower variety
 *          that has at least one approved transaction in the window.
 * @access  Public
 */
const getAllPrices = async (req, res) => {
  try {
    const days = Number(req.query.days) || DEFAULT_WINDOW_DAYS;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const varieties = await Transaction.distinct("flowerVariety", {
      status: "approved",
      createdAt: { $gte: since },
    });

    const index = await Promise.all(
      varieties.map(async (flowerVariety) => {
        const transactions = await Transaction.find({
          flowerVariety,
          status: "approved",
          createdAt: { $gte: since },
        }).select("price volume");

        return { flowerVariety, ...calculateVWAP(transactions) };
      })
    );

    index.sort((a, b) => a.flowerVariety.localeCompare(b.flowerVariety));

    res.json({ windowDays: days, index });
  } catch (err) {
    console.error("[FairBloom] Get all prices error:", err.message);
    res.status(500).json({ message: "Server error computing price index" });
  }
};

module.exports = { getPriceForVariety, getAllPrices };