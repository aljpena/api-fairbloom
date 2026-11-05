const express = require("express");
const router = express.Router();

const { respondToDeal } = require("../controllers/dealController");
const { protect, authorize } = require("../middleware/auth");
const requireApproved = require("../middleware/requireApproved");

router.patch("/:id", protect, authorize("farmer", "buyer"), requireApproved, respondToDeal);

module.exports = router;