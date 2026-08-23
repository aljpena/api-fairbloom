const { validationResult } = require("express-validator");
const Listing = require("../models/Listing");

/**
 * @route   POST /api/listings
 * @desc    Create a listing. Farmers create "sell" listings, buyers
 *          create "request" listings — enforced against req.user.role.
 * @access  Private (farmer, buyer)
 */
const createListing = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { type, flowerVariety, quantity, pricePerUnit, location, description } = req.body;

  // A farmer can only post "sell" listings; a buyer can only post "request" listings.
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
 * @desc    Browse/search/filter listings.
 *          Query params: type, flowerVariety, location, status, page, limit
 * @access  Public
 */
const getListings = async (req, res) => {
  try {
    const { type, flowerVariety, location, status = "active", page = 1, limit = 20 } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (location) filter.location = location;
    if (status) filter.status = status;
    if (flowerVariety) {
      filter.flowerVariety = { $regex: flowerVariety, $options: "i" };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [listings, total] = await Promise.all([
      Listing.find(filter)
        .populate("postedBy", "name role farmLocation buyerCategory businessLocation")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Listing.countDocuments(filter),
    ]);

    res.json({
      listings,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
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
    const listing = await Listing.findById(req.params.id).populate(
      "postedBy",
      "name role farmLocation buyerCategory businessLocation phone"
    );

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    res.json({ listing });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(400).json({ message: "Invalid listing id" });
    }
    console.error("[FairBloom] Get listing error:", err.message);
    res.status(500).json({ message: "Server error fetching listing" });
  }
};

/**
 * @route   PATCH /api/listings/:id
 * @desc    Update your own listing (e.g. change status, quantity, price)
 * @access  Private (owner only)
 */
const updateListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    if (listing.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You can only edit your own listings" });
    }

    const allowedFields = ["quantity", "pricePerUnit", "description", "status"];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    await listing.save();
    res.json({ listing });
  } catch (err) {
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

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    if (listing.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You can only delete your own listings" });
    }

    await listing.deleteOne();
    res.json({ message: "Listing deleted" });
  } catch (err) {
    console.error("[FairBloom] Delete listing error:", err.message);
    res.status(500).json({ message: "Server error deleting listing" });
  }
};

module.exports = { createListing, getListings, getListingById, updateListing, deleteListing };