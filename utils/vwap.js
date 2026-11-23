// Rolling window (in days) used by the public index, the fraud check, and listings.
const DEFAULT_WINDOW_DAYS = 30;

/**
 * VWAP = Sum(price * volume) / Sum(volume)
 * The one place the formula lives; everything else calls this.
 */
function vwapFromTotals(totalValue, totalVolume) {
  if (!(totalVolume > 0)) return null;
  return Math.round((totalValue / totalVolume) * 100) / 100;
}

function calculateVWAP(transactions) {
  let totalValue = 0;
  let totalVolume = 0;

  for (const t of transactions) {
    totalValue += t.price * t.volume;
    totalVolume += t.volume;
  }

  return {
    vwap: vwapFromTotals(totalValue, totalVolume),
    totalVolume,
    totalValue,
    transactionCount: transactions.length,
  };
}

module.exports = { calculateVWAP, vwapFromTotals, DEFAULT_WINDOW_DAYS };
