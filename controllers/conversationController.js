const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { getIO } = require("../utils/socket");

/**
 * @route   POST /api/conversations
 * @desc    Start a new conversation with another user, or return the
 *          existing one if these two users already have one going.
 *          Body: { recipientId, listingId? }
 * @access  Private
 */
const startConversation = async (req, res) => {
  const { recipientId, listingId } = req.body;

  if (!recipientId) {
    return res.status(400).json({ message: "recipientId is required" });
  }
  if (recipientId === String(req.user._id)) {
    return res.status(400).json({ message: "You can't start a conversation with yourself" });
  }

  try {
    let conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, recipientId], $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user._id, recipientId],
        relatedListing: listingId || null,
      });
    }

    await conversation.populate("participants", "name role farmLocation buyerCategory");

    res.status(201).json({ conversation });
  } catch (err) {
    console.error("[FairBloom] Start conversation error:", err.message);
    res.status(500).json({ message: "Server error starting conversation" });
  }
};

/**
 * @route   GET /api/conversations
 * @desc    List all conversations the current user is part of,
 *          most recently active first.
 * @access  Private
 */
const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .populate("participants", "name role farmLocation buyerCategory")
      .populate("relatedListing", "flowerVariety type")
      .sort({ lastMessageAt: -1 });

    res.json({ conversations });
  } catch (err) {
    console.error("[FairBloom] Get conversations error:", err.message);
    res.status(500).json({ message: "Server error fetching conversations" });
  }
};

async function assertParticipant(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return { error: 404, message: "Conversation not found" };

  const isParticipant = conversation.participants.some((p) => p.toString() === userId.toString());
  if (!isParticipant) return { error: 403, message: "You're not part of this conversation" };

  return { conversation };
}

/**
 * @route   GET /api/conversations/:id/messages
 * @access  Private (participants only)
 */
const getMessages = async (req, res) => {
  try {
    const { conversation, error, message } = await assertParticipant(req.params.id, req.user._id);
    if (error) return res.status(error).json({ message });

    const messages = await Message.find({ conversation: conversation._id })
      .populate("sender", "name role")
      .sort({ createdAt: 1 });

    res.json({ messages });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ message: "Invalid conversation id" });
    }
    console.error("[FairBloom] Get messages error:", err.message);
    res.status(500).json({ message: "Server error fetching messages" });
  }
};

/**
 * @route   POST /api/conversations/:id/messages
 * @desc    Body: { content }
 * @access  Private (participants only)
 */
const sendMessage = async (req, res) => {
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ message: "Message content is required" });
  }

  try {
    const { conversation, error, message: guardMessage } = await assertParticipant(
      req.params.id,
      req.user._id
    );
    if (error) return res.status(error).json({ message: guardMessage });

    const newMessage = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      content: content.trim(),
    });
    await newMessage.populate("sender", "name role");

    conversation.lastMessage = content.trim();
    conversation.lastMessageAt = new Date();
    await conversation.save();

    const io = getIO();
    if (io) {
      io.to(conversation._id.toString()).emit("receive_message", newMessage);
    }

    res.status(201).json({ message: newMessage });
  } catch (err) {
    console.error("[FairBloom] Send message error:", err.message);
    res.status(500).json({ message: "Server error sending message" });
  }
};

module.exports = { startConversation, getConversations, getMessages, sendMessage };