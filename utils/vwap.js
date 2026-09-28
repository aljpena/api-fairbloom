/**
 * Volume-Weighted Average Price
 *
 *   VWAP = Sum(price_i * volume_i) / Sum(volume_i)
 *
 *
 * @param {Array<{price: number, volume: number}>} transactions
 * @returns {{ vwap: number|null, totalVolume: number, totalValue: number, transactionCount: number }}
 *   vwap is null when there's no volume to divide by (no transactions).
 */
function calculateVWAP(transactions) {
  let totalValue = 0; // Sum(price * volume)
  let totalVolume = 0; // Sum(volume)

  for (const t of transactions) {
    totalValue += t.price * t.volume;
    totalVolume += t.volume;
  }

  const vwap = totalVolume > 0 ? totalValue / totalVolume : null;

  return {
    vwap: vwap !== null ? Math.round(vwap * 100) / 100 : null, // round to 2 decimals
    totalVolume,
    totalValue,
    transactionCount: transactions.length,
  };
}

module.exports = { calculateVWAP };