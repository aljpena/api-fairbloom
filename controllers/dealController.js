const { validationResult } = require("express-validator");
const Conversation = require("../models/Conversation");
const Deal = require("../models/Deal");
const User = require("../models/User");
const { getIO } = require("../utils/socket");
const { checkDailyQuota, consumeQuota, createTransaction } = require("../utils/transactionService");
const { notify } = require("../utils/notify");

const emitDeal = (deal) => {
  const io = getIO();
  if (io) io.to(String(deal.conversation)).emit("deal_updated", deal);
};

// Keeps the conversation list preview current ("Deal proposed: ...").
const touchConversation = (conversationId, text) =>
  Conversation.updateOne({ _id: conversationId }, { lastMessage: text, lastMessageAt: new Date() });

const describe = (d) => `${d.volume} dz ${d.flowerVariety} @ ₱${d.price}`;

/**
 * @route   POST /api/conversations/:id/deals
 * @desc    Propose a deal. Body: { flowerVariety, price, volume, location?, listingId? }
 * @access  Private (participants; one must be a farmer and the other a buyer)
 */
const proposeDeal = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { flowerVariety, price, volume, location, listingId } = req.body;

  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    const me = String(req.user._id);
    if (!conversation.participants.some((p) => String(p) === me)) {
      return res.status(403).json({ message: "You're not part of this conversation" });
    }

    const users = await User.find({ _id: { $in: conversation.participants } });
    const farmer = users.find((u) => u.role === "farmer");
    const buyer = users.find((u) => u.role === "buyer");
    if (users.length !== 2 || !farmer || !buyer) {
      return res.status(400).json({ message: "Deals can only be made between a farmer and a buyer" });
    }

    const other = String(farmer._id) === me ? buyer : farmer;

    const deal = await Deal.create({
      conversation: conversation._id,
      listing: listingId || conversation.relatedListing || null,
      proposedBy: req.user._id,
      respondent: other._id,
      farmer: farmer._id,
      buyer: buyer._id,
      flowerVariety,
      price,
      volume,
      location: location || farmer.farmLocation,
    });

    await touchConversation(conversation._id, `Deal proposed: ${describe(deal)}`);
    emitDeal(deal);

    notify(other._id, {
      type: "deal_proposed",
      title: "New deal proposal",
      body: `${req.user.name} sent you a deal proposal`,
      conversation: conversation._id,
      deal: deal._id,
    });

    res.status(201).json({ deal });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "There's already an open proposal in this conversation. Accept, decline, or cancel it first.",
      });
    }
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid id" });
    console.error("[FairBloom] Propose deal error:", err.message);
    res.status(500).json({ message: "Server error proposing deal" });
  }
};

/**
 * @route   GET /api/conversations/:id/deals
 * @access  Private (participants only)
 */
const getConversationDeals = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    const me = String(req.user._id);
    if (!conversation.participants.some((p) => String(p) === me)) {
      return res.status(403).json({ message: "You're not part of this conversation" });
    }

    const deals = await Deal.find({ conversation: conversation._id }).sort({ createdAt: -1 });
    res.json({ deals });
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid id" });
    console.error("[FairBloom] Get deals error:", err.message);
    res.status(500).json({ message: "Server error fetching deals" });
  }
};

/**
 * Accepting is the important step: it turns the deal into ONE transaction.
 *  1. Both parties must be under their daily cap.
 *  2. The deal is claimed atomically (so a double-tap can't create two transactions).
 *  3. The transaction is created through the normal fraud pipeline.
 */
async function acceptDeal(req, res, deal) {
  const [farmer, buyer] = await Promise.all([User.findById(deal.farmer), User.findById(deal.buyer)]);

  if (!farmer || !buyer || !farmer.isActive || !buyer.isActive) {
    return res.status(400).json({ message: "One of the accounts in this deal is unavailable" });
  }
  if (!checkDailyQuota(farmer) || !checkDailyQuota(buyer)) {
    return res.status(429).json({
      message: "You or the other party has reached the daily submission limit. Please try again tomorrow.",
    });
  }

  const claimed = await Deal.findOneAndUpdate(
    { _id: deal._id, status: "proposed" },
    { status: "accepted", respondedAt: new Date() },
    { new: true }
  );
  if (!claimed) return res.status(409).json({ message: "This proposal was already handled" });

  let result;
  try {
    result = await createTransaction({
      flowerVariety: deal.flowerVariety,
      price: deal.price,
      volume: deal.volume,
      location: deal.location,
      submittedBy: req.user._id,
      source: "deal",
      deal: deal._id,
      farmer: deal.farmer,
      buyer: deal.buyer,
    });
  } catch (err) {
    // Roll the claim back so the deal can be accepted again.
    await Deal.updateOne({ _id: deal._id }, { $set: { status: "proposed" }, $unset: { respondedAt: 1 } });
    throw err;
  }

  claimed.transaction = result.transaction._id;
  await claimed.save();

  consumeQuota(farmer);
  consumeQuota(buyer);
  await Promise.all([farmer.save(), buyer.save()]);

  await touchConversation(deal.conversation, `Deal accepted: ${describe(deal)}`);
  emitDeal(claimed);

  notify(deal.proposedBy, {
    type: "deal_accepted",
    title: "Deal accepted",
    body: `${req.user.name} accepted your proposal`,
    conversation: deal.conversation,
    deal: deal._id,
    transaction: result.transaction._id,
  });

  res.json({ deal: claimed, transaction: result.transaction, priceCheck: result.priceCheck });
}

/**
 * @route   PATCH /api/deals/:id
 * @desc    Body: { action: "accept" | "decline" | "cancel" }
 *          accept/decline: the other party only. cancel: the proposer only.
 * @access  Private (farmer, buyer)
 */
const respondToDeal = async (req, res) => {
  const { action } = req.body;
  if (!["accept", "decline", "cancel"].includes(action)) {
    return res.status(400).json({ message: "action must be 'accept', 'decline' or 'cancel'" });
  }

  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ message: "Deal not found" });

    const me = String(req.user._id);
    if (![deal.farmer, deal.buyer].some((id) => String(id) === me)) {
      return res.status(403).json({ message: "You're not part of this deal" });
    }
    if (action === "cancel" && String(deal.proposedBy) !== me) {
      return res.status(403).json({ message: "Only the person who proposed can cancel" });
    }
    if (action !== "cancel" && String(deal.respondent) !== me) {
      return res.status(403).json({ message: "Only the other party can accept or decline" });
    }
    if (deal.status !== "proposed") {
      return res.status(409).json({ message: `This proposal is already '${deal.status}'` });
    }

    if (action === "accept") return await acceptDeal(req, res, deal);

    const newStatus = action === "decline" ? "declined" : "cancelled";
    const updated = await Deal.findOneAndUpdate(
      { _id: deal._id, status: "proposed" },
      { status: newStatus, respondedAt: new Date() },
      { new: true }
    );
    if (!updated) return res.status(409).json({ message: "This proposal was already handled" });

    await touchConversation(deal.conversation, `Deal ${newStatus}: ${describe(deal)}`);
    emitDeal(updated);

    notify(action === "decline" ? deal.proposedBy : deal.respondent, {
      type: `deal_${newStatus}`,
      title: `Deal ${newStatus}`,
      body: `${req.user.name} ${newStatus} the proposal`,
      conversation: deal.conversation,
      deal: deal._id,
    });

    res.json({ deal: updated });
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid deal id" });
    console.error("[FairBloom] Respond to deal error:", err.message);
    res.status(500).json({ message: "Server error updating deal" });
  }
};

module.exports = { proposeDeal, getConversationDeals, respondToDeal };