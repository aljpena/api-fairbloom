const express = require("express");
const router = express.Router();

const {
  submitTransaction,
  getTransactions,
  getPendingTransactions,
  reviewTransaction,
} = require("../controllers/transactionController");
const { transactionValidation } = require("../middleware/validators");
const { protect, authorize } = require("../middleware/auth");

router.post("/", protect, authorize("farmer", "buyer"), transactionValidation, submitTransaction);
router.get("/", protect, getTransactions);

// Admin moderation — must come before "/:id/review" would clash with anything else,
// and "pending" here is a fixed path segment, not a dynamic :id, so no route conflict.
router.get("/pending", protect, authorize("admin"), getPendingTransactions);
router.patch("/:id/review", protect, authorize("admin"), reviewTransaction);

module.exports = router;