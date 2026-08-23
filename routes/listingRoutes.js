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

router.get("/", getListings);
router.get("/:id", getListingById);

router.post("/", protect, authorize("farmer", "buyer"), listingValidation, createListing);
router.patch("/:id", protect, authorize("farmer", "buyer"), updateListing);
router.delete("/:id", protect, authorize("farmer", "buyer"), deleteListing);

module.exports = router;