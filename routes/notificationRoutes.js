const express = require("express");
const router = express.Router();

const {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  registerPushToken,
  removePushToken,
} = require("../controllers/notificationController");
const { pushTokenValidation } = require("../middleware/validators");
const { protect } = require("../middleware/auth");

router.use(protect);

// Fixed paths first, then the dynamic one
router.get("/", listNotifications);
router.get("/unread-count", unreadCount);
router.patch("/read-all", markAllRead);
router.post("/push-token", pushTokenValidation, registerPushToken);
router.delete("/push-token", removePushToken);
router.patch("/:id/read", markRead);

module.exports = router;
