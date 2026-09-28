const { validationResult } = require("express-validator");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");

/**
 * @route   POST /api/auth/register
 * @desc    Register a new farmer or buyer account
 * @access  Public
 */
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    name,
    email,
    phone,
    password,
    role,
    farmLocation,
    buyerCategory,
    businessLocation,
  } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const user = await User.create({
      name,
      email,
      phone,
      password,
      role,
      farmLocation: role === "farmer" ? farmLocation : null,
      buyerCategory: role === "buyer" ? buyerCategory : null,
      businessLocation: role === "buyer" ? businessLocation : null,
    });

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        farmLocation: user.farmLocation,
        buyerCategory: user.buyerCategory,
        businessLocation: user.businessLocation,
      },
    });
  } catch (err) {
    console.error("[FairBloom] Register error:", err.message);
    res.status(500).json({ message: "Server error during registration" });
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate a user (farmer, buyer, or admin) and return a JWT
 * @access  Public
 */
const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        farmLocation: user.farmLocation,
        buyerCategory: user.buyerCategory,
        businessLocation: user.businessLocation,
      },
    });
  } catch (err) {
    console.error("[FairBloom] Login error:", err.message);
    res.status(500).json({ message: "Server error during login" });
  }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get the currently authenticated user's profile
 * @access  Private (requires valid JWT)
 */
const getMe = async (req, res) => {
  res.json({ user: req.user });
};

module.exports = { register, login, getMe };
