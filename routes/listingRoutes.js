const express = require("express");
const router = express.Router();

const {
  createListing,
  getListings,
  getListingById,
  updateListing,
  deleteListing,
} = require("../controllers/listingController");
const { listingValidation } = require("../middleware/validators");
const { protect, authorize } = require("../middleware/auth");
const requireApproved = require("../middleware/requireApproved");

router.get("/", getListings);
router.get("/:id", getListingById);

router.post("/", protect, authorize("farmer", "buyer"), requireApproved, listingValidation, createListing);
router.patch("/:id", protect, authorize("farmer", "buyer"), requireApproved, updateListing);
router.delete("/:id", protect, authorize("farmer", "buyer"), requireApproved, deleteListing);

module.exports = router;