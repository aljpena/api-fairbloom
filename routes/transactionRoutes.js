const express = require("express");
const router = express.Router();

const {
  getTransactions,
  getMyTransactions,
  getPendingTransactions,
  reviewTransaction,
} = require("../controllers/transactionController");
const { protect, authorize } = require("../middleware/auth");

// There is no POST here anymore: transactions are created only by accepted deals.

router.get("/mine", protect, authorize("farmer", "buyer"), getMyTransactions);
router.get("/pending", protect, authorize("admin"), getPendingTransactions);
router.get("/", protect, authorize("admin"), getTransactions);

router.patch("/:id/review", protect, authorize("admin"), reviewTransaction);

module.exports = router;