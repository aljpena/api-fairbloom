const express = require("express");
const router = express.Router();

const { getPriceForVariety, getAllPrices } = require("../controllers/pricingController");

router.get("/", getAllPrices);
router.get("/:flowerVariety", getPriceForVariety);

module.exports = router;