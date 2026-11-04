const { validationResult } = require("express-validator");
const Listing = require("../models/Listing");
const escapeRegex = require("../utils/escapeRegex");
const { getVwapMap } = require("../utils/priceIndex");
const { DEFAULT_WINDOW_DAYS } = require("../utils/vwap");

// Allow-list: only these sort keys are accepted from the query string.
const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { pricePerUnit: 1, createdAt: -1 },
  price_desc: { pricePerUnit: -1, createdAt: -1 },
  quantity_asc: { quantity: 1, createdAt: -1 },
  quantity_desc: { quantity: -1, createdAt: -1 },
};

/** Adds the current index price (and how the asking price compares) to plain listing objects. */
async function attachMarketPrice(listings) {
  const map = await getVwapMap(DEFAULT_WINDOW_DAYS);

  return listings.map((l) => {
    const row = map.get(String(l.flowerVariety).toLowerCase());
    const vwap = row ? row.vwap : null;

    let priceVsMarketPercent = null;
    if (vwap && l.pricePerUnit != null) {
      priceVsMarketPercent = Math.round(((l.pricePerUnit - vwap) / vwap) * 1000) / 10;
    }

    return {
      ...l,
      marketPrice: row
        ? { vwap, windowDays: DEFAULT_WINDOW_DAYS, transactionCount: row.transactionCount }
        : null,
      priceVsMarketPercent,
    };
  });
}

/**
 * @route   POST /api/listings
 * @access  Private (farmer, buyer)
 */
const createListing = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { type, flowerVariety, quantity, pricePerUnit, location, description } = req.body;

  const expectedType = req.user.role === "farmer" ? "sell" : "request";
  if (type !== expectedType) {
    return res.status(403).json({
      message: `As a ${req.user.role}, you can only create '${expectedType}' listings`,
    });
  }

  try {
    const listing = await Listing.create({
      postedBy: req.user._id,
      type,
      flowerVariety,
      quantity,
      pricePerUnit: pricePerUnit ?? null,
      location,
      description,
    });

    res.status(201).json({ listing });
  } catch (err) {
    console.error("[FairBloom] Create listing error:", err.message);
    res.status(500).json({ message: "Server error creating listing" });
  }
};

/**
 * @route   GET /api/listings
 * @desc    Query: type, flowerVariety, location, status, sort, page, limit
 *          sort = newest | oldest | price_asc | price_desc | quantity_asc | quantity_desc
 *          (price sorts only include listings that state an asking price)
 * @access  Public
 */
const getListings = async (req, res) => {
  try {
    const { type, flowerVariety, location, status = "active", sort = "newest" } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    // String() blocks query-object tricks like ?type[$ne]=sell
    const filter = {};
    if (type) filter.type = String(type);
    if (location) filter.location = String(location);
    if (status) filter.status = String(status);
    if (flowerVariety) filter.flowerVariety = { $regex: escapeRegex(flowerVariety), $options: "i" };

    const sortKey = Object.prototype.hasOwnProperty.call(SORTS, sort) ? sort : "newest";
    if (sortKey === "price_asc" || sortKey === "price_desc") {
      filter.pricePerUnit = { $ne: null };
    }

    const [rows, total] = await Promise.all([
      Listing.find(filter)
        .populate("postedBy", "name role farmLocation buyerCategory businessLocation")
        .sort(SORTS[sortKey])
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Listing.countDocuments(filter),
    ]);

    const listings = await attachMarketPrice(rows);

    res.json({ listings, pagination: { total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("[FairBloom] Get listings error:", err.message);
    res.status(500).json({ message: "Server error fetching listings" });
  }
};

/**
 * @route   GET /api/listings/:id
 * @access  Public
 */
const getListingById = async (req, res) => {
  try {
    const row = await Listing.findById(req.params.id)
      .populate("postedBy", "name role farmLocation buyerCategory businessLocation phone")
      .lean();

    if (!row) return res.status(404).json({ message: "Listing not found" });

    const [listing] = await attachMarketPrice([row]);
    res.json({ listing });
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid listing id" });
    console.error("[FairBloom] Get listing error:", err.message);
    res.status(500).json({ message: "Server error fetching listing" });
  }
};

/**
 * @route   PATCH /api/listings/:id
 * @access  Private (owner only)
 */
const updateListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    if (listing.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You can only edit your own listings" });
    }

    ["quantity", "pricePerUnit", "description", "status"].forEach((field) => {
      if (req.body[field] !== undefined) listing[field] = req.body[field];
    });

    await listing.save();
    res.json({ listing });
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ message: err.message });
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid listing id" });
    console.error("[FairBloom] Update listing error:", err.message);
    res.status(500).json({ message: "Server error updating listing" });
  }
};

/**
 * @route   DELETE /api/listings/:id
 * @access  Private (owner only)
 */
const deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    if (listing.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You can only delete your own listings" });
    }

    await listing.deleteOne();
    res.json({ message: "Listing deleted" });
  } catch (err) {
    if (err.name === "CastError") return res.status(400).json({ message: "Invalid listing id" });
    console.error("[FairBloom] Delete listing error:", err.message);
    res.status(500).json({ message: "Server error deleting listing" });
  }
};

module.exports = { createListing, getListings, getListingById, updateListing, deleteListing };