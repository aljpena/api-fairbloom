const { validationResult } = require("express-validator");
const Notification = require("../models/Notification");
const PushToken = require("../models/PushToken");

/**
 * @route   GET /api/notifications
 * @desc    Query: unread=true, page, limit. Newest activity first.
 */
const listNotifications = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    const filter = { user: req.user._id };
    if (req.query.unread === "true") filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: req.user._id, isRead: false }),
    ]);

    res.json({ notifications, unreadCount, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("[FairBloom] List notifications error:", err.message);
    res.status(500).json({ message: "Server error fetching notifications" });
  }
};

/** @route GET /api/notifications/unread-count (for the badge) */
const unreadCount = async (req, res) => {
  try {
    res.json({ unreadCount: await Notification.countDocuments({ user: req.user._id, isRead: false }) });
  } catch (err) {
    console.error("[FairBloom] Unread count error:", err.message);
    res.status(500).json({ message: "Server error fetching unread count" });
  }
};

/** @route PATCH /api/notifications/:id/read */
const markRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true, timestamps: false }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json({ notification });
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid notification id" });
    console.error("[FairBloom] Mark read error:", err.message);
    res.status(500).json({ message: "Server error updating notification" });
  }
};

/** @route PATCH /api/notifications/read-all */
const markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() },
      { timestamps: false }
    );
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    console.error("[FairBloom] Mark all read error:", err.message);
    res.status(500).json({ message: "Server error updating notifications" });
  }
};

/**
 * @route   POST /api/notifications/push-token
 * @desc    Body: { token, platform? }. Call after login. If another account
 *          used this phone before, the token moves to the current user.
 */
const registerPushToken = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    await PushToken.findOneAndUpdate(
      { token: req.body.token },
      { user: req.user._id, platform: req.body.platform, lastSeenAt: new Date() },
      { upsert: true }
    );
    res.json({ message: "Push token registered" });
  } catch (err) {
    console.error("[FairBloom] Register push token error:", err.message);
    res.status(500).json({ message: "Server error registering push token" });
  }
};

/** @route DELETE /api/notifications/push-token  Body: { token }. Call on logout. */
const removePushToken = async (req, res) => {
  try {
    await PushToken.deleteOne({ token: String(req.body.token || ""), user: req.user._id });
    res.json({ message: "Push token removed" });
  } catch (err) {
    console.error("[FairBloom] Remove push token error:", err.message);
    res.status(500).json({ message: "Server error removing push token" });
  }
};

module.exports = { listNotifications, unreadCount, markRead, markAllRead, registerPushToken, removePushToken };