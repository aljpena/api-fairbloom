const express = require("express");
const router = express.Router();

const { getFile, getListingImage } = require("../controllers/fileController");
const { protect } = require("../middleware/auth");

router.get("/listing/:id", getListingImage); // public
router.get("/:id", protect, getFile);

module.exports = router;