const express = require("express");
const router = express.Router();

const { respondToDeal } = require("../controllers/dealController");
const { protect, authorize } = require("../middleware/auth");

router.patch("/:id", protect, authorize("farmer", "buyer"), respondToDeal);

module.exports = router;