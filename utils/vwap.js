/**
 * Volume-Weighted Average Price
 *
 *   VWAP = Sum(price_i * volume_i) / Sum(volume_i)
 *
 * Each transaction's price is "weighted" by how much volume it
 * represents. A single tiny fraudulent submission (e.g. price=1,
 * volume=0.01) barely moves the result, because it contributes almost
 * nothing to Sum(volume) — this is the manuscript's Layer 1 defense
 * against data manipulation, and it falls directly out of the formula
 * itself, no extra code needed for that part.
 *
 * @param {Array<{price: number, volume: number}>} transactions
 * @returns {{ vwap: number|null, totalVolume: number, totalValue: number, transactionCount: number }}
 *   vwap is null when there's no volume to divide by (e.g. no transactions).
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
    vwap: vwap !== null ? Math.round(vwap * 100) / 100 : null, // round to 2 decimals (₱ centavos)
    totalVolume,
    totalValue,
    transactionCount: transactions.length,
  };
}

module.exports = { calculateVWAP };