const express = require("express");
const router = express.Router();

const {
  startConversation,
  getConversations,
  getMessages,
  sendMessage,
} = require("../controllers/conversationController");
const { proposeDeal, getConversationDeals } = require("../controllers/dealController");
const { dealValidation } = require("../middleware/validators");
const { protect, authorize } = require("../middleware/auth");

router.post("/", protect, startConversation);
router.get("/", protect, getConversations);
router.get("/:id/messages", protect, getMessages);
router.post("/:id/messages", protect, sendMessage);

router.get("/:id/deals", protect, getConversationDeals);
router.post("/:id/deals", protect, authorize("farmer", "buyer"), dealValidation, proposeDeal);

module.exports = router;