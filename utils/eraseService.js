const User = require("../models/User");
const Listing = require("../models/Listing");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Deal = require("../models/Deal");
const Transaction = require("../models/Transaction");
const Erasure = require("../models/Erasure");
const File = require("../models/File");
const Notification = require("../models/Notification");
const PushToken = require("../models/PushToken");
const { disconnectUser } = require("./socket");

/**
 * Permanently erases one participant.
 *
 *  Always deleted : the account, their listings, conversations (including the
 *                   other person's messages in them), deals, uploaded files
 *                   (ID photo, chat images), notifications and push tokens.
 *  Transactions   : "anonymize" keeps price/volume/variety/date but removes every
 *                   link to the person, so the price index is unchanged.
 *                   "delete" removes them entirely, so the index changes.
 *
 * Safe to run twice: if it was interrupted, running it again finishes the job.
 */
async function eraseUser(userId, { transactions, source = "admin", skipLedger = false }) {
  if (!["anonymize", "delete"].includes(transactions)) {
    throw new Error("transactions must be 'anonymize' or 'delete'");
  }

  const user = await User.findById(userId);
  if (!user) return null;
  if (user.role === "admin") throw new Error("Admin accounts can't be erased");

  // 1. Lock the account first so nothing new is created during cleanup.
  await User.updateOne({ _id: userId }, { isActive: false });
  disconnectUser(userId);

  // 2. Write the ledger BEFORE deleting, so an interrupted run can be finished later.
  if (!skipLedger) {
    await Erasure.updateOne(
      { userId },
      { $set: { role: user.role, transactions, source, erasedAt: new Date() } },
      { upsert: true }
    );
  }

  const involved = { $or: [{ submittedBy: userId }, { farmer: userId }, { buyer: userId }] };
  const convoIds = (await Conversation.find({ participants: userId }).select("_id").lean()).map(
    (c) => c._id
  );
  const dealIds = (
    await Deal.find({ $or: [{ farmer: userId }, { buyer: userId }] })
      .select("_id")
      .lean()
  ).map((d) => d._id);

  const report = {};
  let deletedTxIds = [];

  // 3. Transactions
  if (transactions === "delete") {
    deletedTxIds = (await Transaction.find(involved).select("_id").lean()).map((t) => t._id);
    report.transactionsDeleted = (await Transaction.deleteMany(involved)).deletedCount;
  } else {
    report.transactionsAnonymized = await Transaction.countDocuments(involved);
    await Transaction.updateMany({ submittedBy: userId }, { $set: { submittedBy: null } });
    await Transaction.updateMany({ farmer: userId }, { $set: { farmer: null } });
    await Transaction.updateMany({ buyer: userId }, { $set: { buyer: null } });
    await Transaction.updateMany({ deal: { $in: dealIds } }, { $set: { deal: null } });
  }

  // 4. Files, notifications and push tokens
  report.filesDeleted = (
    await File.deleteMany({ $or: [{ owner: userId }, { conversation: { $in: convoIds } }] })
  ).deletedCount;
  report.notificationsDeleted = (
    await Notification.deleteMany({
      $or: [
        { user: userId },
        { subject: userId },
        { conversation: { $in: convoIds } },
        { deal: { $in: dealIds } },
        { transaction: { $in: deletedTxIds } },
      ],
    })
  ).deletedCount;
  await PushToken.deleteMany({ user: userId });

  // 5. Deals, messages, conversations, listings, then the account itself
  report.dealsDeleted = (
    await Deal.deleteMany({ $or: [{ _id: { $in: dealIds } }, { conversation: { $in: convoIds } }] })
  ).deletedCount;
  report.messagesDeleted = (
    await Message.deleteMany({ $or: [{ conversation: { $in: convoIds } }, { sender: userId }] })
  ).deletedCount;
  report.conversationsDeleted = (
    await Conversation.deleteMany({ _id: { $in: convoIds } })
  ).deletedCount;
  report.listingsDeleted = (await Listing.deleteMany({ postedBy: userId })).deletedCount;
  await User.deleteOne({ _id: userId });
  report.accountDeleted = true;

  console.log(`[FairBloom] Erased a ${user.role} account (${source}):`, JSON.stringify(report));
  return report;
}

/**
 * Wipes ALL participant data and keeps admin accounts. Use after UAT.
 */
async function purgeAllParticipantData() {
  const [
    users,
    listings,
    transactions,
    conversations,
    messages,
    deals,
    erasures,
    files,
    notifications,
    tokens,
  ] = await Promise.all([
    User.deleteMany({ role: { $ne: "admin" } }),
    Listing.deleteMany({}),
    Transaction.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Deal.deleteMany({}),
    Erasure.deleteMany({}),
    File.deleteMany({}),
    Notification.deleteMany({}),
    PushToken.deleteMany({}),
  ]);

  return {
    users: users.deletedCount,
    listings: listings.deletedCount,
    transactions: transactions.deletedCount,
    conversations: conversations.deletedCount,
    messages: messages.deletedCount,
    deals: deals.deletedCount,
    erasureLedger: erasures.deletedCount,
    files: files.deletedCount,
    notifications: notifications.deletedCount,
    pushTokens: tokens.deletedCount,
  };
}

module.exports = { eraseUser, purgeAllParticipantData };
