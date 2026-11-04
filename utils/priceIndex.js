const Transaction = require("../models/Transaction");
const { vwapFromTotals, DEFAULT_WINDOW_DAYS } = require("./vwap");

const windowStart = (days = DEFAULT_WINDOW_DAYS) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

// Groups case-insensitively, so old test data like "roses" and "Roses" merge.
const groupStage = {
  $group: {
    _id: { $toLower: "$flowerVariety" },
    flowerVariety: { $first: "$flowerVariety" },
    totalValue: { $sum: { $multiply: ["$price", "$volume"] } },
    totalVolume: { $sum: "$volume" },
    transactionCount: { $sum: 1 },
  },
};

const shape = (row) => ({
  flowerVariety: row.flowerVariety,
  vwap: vwapFromTotals(row.totalValue, row.totalVolume),
  totalVolume: row.totalVolume,
  totalValue: Math.round(row.totalValue * 100) / 100,
  transactionCount: row.transactionCount,
});

/** Map of lowercased variety -> index row, for every variety with approved trades in the window. */
async function getVwapMap(days = DEFAULT_WINDOW_DAYS) {
  const rows = await Transaction.aggregate([
    { $match: { status: "approved", createdAt: { $gte: windowStart(days) } } },
    groupStage,
  ]);
  const map = new Map();
  rows.forEach((r) => map.set(r._id, shape(r)));
  return map;
}

/** Index row for one variety, or null if it has no approved trades in the window. */
async function getVwap(variety, days = DEFAULT_WINDOW_DAYS) {
  const v = String(variety).trim().toLowerCase();
  const rows = await Transaction.aggregate([
    { $match: { status: "approved", createdAt: { $gte: windowStart(days) } } },
    { $addFields: { _v: { $toLower: "$flowerVariety" } } },
    { $match: { _v: v } },
    groupStage,
  ]);
  return rows.length ? shape(rows[0]) : null;
}

module.exports = { getVwapMap, getVwap };