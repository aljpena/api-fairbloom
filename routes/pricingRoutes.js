const express = require("express");
const router = express.Router();

const {
  getPriceForVariety,
  getAllPrices,
  getVarieties,
} = require("../controllers/pricingController");

router.get("/", getAllPrices);
router.get("/varieties", getVarieties);
router.get("/:flowerVariety", getPriceForVariety);

module.exports = router;
