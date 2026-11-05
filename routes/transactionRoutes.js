const express = require("express");
const router = express.Router();

const {
  submitTransaction,
  getTransactions,
  getMyTransactions,
  getPendingTransactions,
  reviewTransaction,
} = require("../controllers/transactionController");
const { transactionValidation } = require("../middleware/validators");
const { protect, authorize } = require("../middleware/auth");
const requireApproved = require("../middleware/requireApproved");

router.post("/", protect, authorize("farmer", "buyer"), requireApproved, transactionValidation, submitTransaction);

router.get("/mine", protect, authorize("farmer", "buyer"), getMyTransactions);
router.get("/pending", protect, authorize("admin"), getPendingTransactions);
router.get("/", protect, authorize("admin"), getTransactions);

router.patch("/:id/review", protect, authorize("admin"), reviewTransaction);

module.exports = router;