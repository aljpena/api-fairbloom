const crypto = require("crypto");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const File = require("../models/File");
const generateToken = require("../utils/generateToken");
const { sendOtpEmail } = require("../utils/sendEmail");
const { processImage } = require("../utils/imageService");
const { notifyAdmins } = require("../utils/notify");

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

// ---------- OTP helpers ----------

const generateOtp = () => String(crypto.randomInt(100000, 1000000));

const hashOtp = (otp) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(otp).digest("hex");

const safeEqual = (a, b) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

function issueOtp(user) {
  const otp = generateOtp();
  user.otpHash = hashOtp(otp);
  user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  user.otpAttempts = 0;
  user.otpLastSentAt = new Date();
  return otp;
}

function secondsUntilResend(user) {
  if (!user.otpLastSentAt) return 0;
  const elapsed = (Date.now() - user.otpLastSentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed));
}

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  farmLocation: user.farmLocation,
  buyerCategory: user.buyerCategory,
  businessLocation: user.businessLocation,
  verificationStatus: user.role === "admin" ? "approved" : user.verificationStatus,
});

// ---------- Controllers ----------

/**
 * @route   POST /api/auth/register   (multipart/form-data)
 * @desc    Fields as before, plus a `document` image: Farmer ID (farmers) or
 *          Business Permit (buyers). Creates an UNVERIFIED account and emails a code.
 * @access  Public
 */
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, phone, password, role, farmLocation, buyerCategory, businessLocation } = req.body;

  if (!req.file) {
    const what = role === "farmer" ? "Farmer ID" : "Business Permit";
    return res.status(400).json({ message: `Please attach a photo of your ${what} (form field 'document')` });
  }

  try {
    const existing = await User.findOne({ email }).select("+otpLastSentAt");

    if (existing && (existing.isEmailVerified || existing.role === "admin")) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    if (existing) {
      const wait = secondsUntilResend(existing);
      if (wait > 0) {
        return res.status(429).json({
          message: `Please wait ${wait}s before requesting another code`,
          retryAfterSeconds: wait,
        });
      }
    }

    // Validate and shrink the image BEFORE creating anything.
    let processed;
    try {
      processed = await processImage(req.file.buffer, { maxSize: 2000, quality: 85 });
    } catch (imgErr) {
      return res.status(400).json({ message: imgErr.message });
    }

    const user = existing || new User();
    user.name = name;
    user.email = email;
    user.phone = phone;
    user.password = password;
    user.role = role;
    user.farmLocation = role === "farmer" ? farmLocation : null;
    user.buyerCategory = role === "buyer" ? buyerCategory : null;
    user.businessLocation = role === "buyer" ? businessLocation : null;

    const oldDocId = user.verificationDocument;
    const fileId = new mongoose.Types.ObjectId();
    user.verificationStatus = "pending";
    user.verificationDocument = fileId;
    user.verificationNote = undefined;
    user.verificationReviewedAt = undefined;
    user.verificationReviewedBy = undefined;

    const otp = issueOtp(user);

    await File.create({ _id: fileId, owner: user._id, kind: "verification", ...processed });
    try {
      await user.save();
    } catch (saveErr) {
      await File.deleteOne({ _id: fileId }); // don't leave an orphaned document behind
      throw saveErr;
    }
    if (oldDocId) await File.deleteOne({ _id: oldDocId }); // re-registration replaces the old upload

    try {
      await sendOtpEmail(user.email, user.name, otp, OTP_EXPIRY_MINUTES);
    } catch (mailErr) {
      console.error("[FairBloom] Send OTP email failed:", mailErr.message);
      return res.status(502).json({
        message: "Account created, but we couldn't send the verification email. Please tap 'Resend code'.",
        email: user.email,
      });
    }

    res.status(201).json({
      message:
        "Account created. Enter the 6-digit code we emailed you. An administrator will then review your document.",
      email: user.email,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
  } catch (err) {
    console.error("[FairBloom] Register error:", err.message);
    res.status(500).json({ message: "Server error during registration" });
  }
};

/**
 * @route   POST /api/auth/verify-email
 * @access  Public
 */
const verifyEmail = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email }).select("+otpHash +otpExpiresAt +otpAttempts");

    if (user && user.isEmailVerified) {
      return res.status(400).json({ message: "This email is already verified. Please log in." });
    }
    if (!user || !user.otpHash) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ message: "Too many incorrect attempts. Please request a new code." });
    }
    if (user.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: "This code has expired. Please request a new one." });
    }

    if (!safeEqual(hashOtp(otp), user.otpHash)) {
      user.otpAttempts += 1;
      await user.save();
      return res.status(400).json({
        message: "Incorrect code",
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - user.otpAttempts),
      });
    }

    user.isEmailVerified = true;
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;
    user.otpLastSentAt = undefined;
    await user.save();

    // The email is confirmed, so the document is now ready for an admin to review.
    if (user.role !== "admin") {
      notifyAdmins({
        type: "verification_pending",
        title: "New account to verify",
        body: `${user.name} (${user.role}) is waiting for document review`,
        subject: user._id,
      });
    }

    res.json({ token: generateToken(user), user: publicUser(user) });
  } catch (err) {
    console.error("[FairBloom] Verify email error:", err.message);
    res.status(500).json({ message: "Server error verifying email" });
  }
};

/**
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
const resendOtp = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;
  const genericReply = { message: "If this email is awaiting verification, a new code has been sent." };

  try {
    const user = await User.findOne({ email }).select("+otpLastSentAt");

    if (!user || user.isEmailVerified) {
      return res.json(genericReply);
    }

    const wait = secondsUntilResend(user);
    if (wait > 0) {
      return res.status(429).json({
        message: `Please wait ${wait}s before requesting another code`,
        retryAfterSeconds: wait,
      });
    }

    const otp = issueOtp(user);
    await user.save();

    try {
      await sendOtpEmail(user.email, user.name, otp, OTP_EXPIRY_MINUTES);
    } catch (mailErr) {
      console.error("[FairBloom] Resend OTP email failed:", mailErr.message);
      return res.status(502).json({ message: "We couldn't send the email. Please try again shortly." });
    }

    res.json(genericReply);
  } catch (err) {
    console.error("[FairBloom] Resend OTP error:", err.message);
    res.status(500).json({ message: "Server error resending code" });
  }
};

/**
 * @route   POST /api/auth/login
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

    if (!user.isEmailVerified && user.role !== "admin") {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email before logging in",
        email: user.email,
      });
    }

    // Users awaiting document approval CAN log in (to see their status and upload a new document).
    res.json({ token: generateToken(user), user: publicUser(user) });
  } catch (err) {
    console.error("[FairBloom] Login error:", err.message);
    res.status(500).json({ message: "Server error during login" });
  }
};

/**
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  res.json({ user: req.user });
};

module.exports = { register, verifyEmail, resendOtp, login, getMe };