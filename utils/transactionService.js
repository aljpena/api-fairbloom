const Transaction = require("../models/Transaction");
const { getVwap } = require("./priceIndex");
const { DEFAULT_WINDOW_DAYS } = require("./vwap");

const dailyLimit = () => Number(process.env.MAX_DAILY_SUBMISSIONS) || 10;
const deviationThreshold = () => Number(process.env.PRICE_DEVIATION_THRESHOLD_PERCENT) || 30;

// "Same day" is judged in Philippine time, so the cap resets at midnight
// in Manila even if the server runs in UTC.
const dayKey = (date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const isNewDay = (lastDate) => !lastDate || dayKey(lastDate) !== dayKey(new Date());
const { notify, notifyAdmins } = require("./notify");

/** Layer 2. True if the user may still submit today. Resets the counter on a new day (caller saves). */
function checkDailyQuota(user) {
  if (isNewDay(user.lastSubmissionAt)) user.submissionCount = 0;
  return user.submissionCount < dailyLimit();
}

function consumeQuota(user) {
  if (isNewDay(user.lastSubmissionAt)) user.submissionCount = 0;
  user.submissionCount += 1;
  user.lastSubmissionAt = new Date();
}

/**
 * Layer 3 + save. Compares the price to the rolling VWAP (same window the
 * public index uses); outliers are saved as "pending" and stay out of the index.
 */
async function createTransaction({
  flowerVariety,
  price,
  volume,
  location,
  submittedBy,
  source = "manual",
  deal = null,
  farmer = null,
  buyer = null,
}) {
  const row = await getVwap(flowerVariety, DEFAULT_WINDOW_DAYS);
  const currentVWAP = row ? row.vwap : null;
  const threshold = deviationThreshold();

  let deviationPercent = null;
  let flaggedForReview = false;
  let status = "approved";

  if (currentVWAP !== null) {
    deviationPercent = Math.round((Math.abs(price - currentVWAP) / currentVWAP) * 10000) / 100;
    if (deviationPercent > threshold) {
      flaggedForReview = true;
      status = "pending";
    }
  }

  const transaction = await Transaction.create({
    submittedBy,
    flowerVariety,
    price,
    volume,
    location,
    source,
    deal,
    farmer,
    buyer,
    deviationPercent,
    flaggedForReview,
    status,
  });

  if (flaggedForReview) {
    notifyAdmins({
      type: "transaction_flagged",
      title: "Transaction needs review",
      body: `${flowerVariety} at ₱${price} is ${deviationPercent}% away from the current index`,
      transaction: transaction._id,
    });

    const parties = [...new Set([farmer, buyer, submittedBy].filter(Boolean).map(String))];
    notify(parties, {
      type: "transaction_held",
      title: "Price under review",
      body: `Your ${flowerVariety} sale was held for admin review because the price is far from the current index.`,
      transaction: transaction._id,
    });
  }

  return {
    transaction,
    priceCheck: { currentVWAP, deviationPercent, threshold, flagged: flaggedForReview },
  };
}

module.exports = { checkDailyQuota, consumeQuota, dailyLimit, createTransaction };
