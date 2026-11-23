const express = require("express");
const rateLimit = require("express-rate-limit");
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
const requireApproved = require("../middleware/requireApproved");
const { uploadImage } = require("../middleware/upload");

// Per-user cap on image uploads (text messages aren't counted) so nobody can fill the database.
const imageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => String(req.user._id),
  skip: (req) => !req.is("multipart/form-data"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "You're sending photos too quickly. Please wait a few minutes." },
});

router.post("/", protect, requireApproved, startConversation);
router.get("/", protect, getConversations);
router.get("/:id/messages", protect, getMessages);
router.post(
  "/:id/messages",
  protect,
  requireApproved,
  imageLimiter,
  uploadImage("image"),
  sendMessage
);

router.get("/:id/deals", protect, getConversationDeals);
router.post(
  "/:id/deals",
  protect,
  authorize("farmer", "buyer"),
  requireApproved,
  dealValidation,
  proposeDeal
);

module.exports = router;
