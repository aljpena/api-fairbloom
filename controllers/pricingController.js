const { getVwap, getVwapMap } = require("../utils/priceIndex");
const { DEFAULT_WINDOW_DAYS } = require("../utils/vwap");
const { VARIETIES } = require("../config/varieties");

const getDays = (req) => {
  const n = Number(req.query.days);
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : DEFAULT_WINDOW_DAYS;
};

/** @route GET /api/pricing/varieties  (public) */
const getVarieties = (req, res) => {
  res.json({ varieties: VARIETIES });
};

/** @route GET /api/pricing/:flowerVariety  (public) */
const getPriceForVariety = async (req, res) => {
  try {
    const { flowerVariety } = req.params;
    const days = getDays(req);
    const row = await getVwap(flowerVariety, days);

    res.json({
      flowerVariety,
      windowDays: days,
      vwap: row ? row.vwap : null,
      totalVolume: row ? row.totalVolume : 0,
      totalValue: row ? row.totalValue : 0,
      transactionCount: row ? row.transactionCount : 0,
    });
  } catch (err) {
    console.error("[FairBloom] Get price error:", err.message);
    res.status(500).json({ message: "Server error computing price index" });
  }
};

/** @route GET /api/pricing  (public) */
const getAllPrices = async (req, res) => {
  try {
    const days = getDays(req);
    const map = await getVwapMap(days);

    const index = [...map.values()].sort((a, b) => a.flowerVariety.localeCompare(b.flowerVariety));
    res.json({ windowDays: days, index });
  } catch (err) {
    console.error("[FairBloom] Get all prices error:", err.message);
    res.status(500).json({ message: "Server error computing price index" });
  }
};

module.exports = { getPriceForVariety, getAllPrices, getVarieties };