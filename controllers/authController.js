const crypto = require("crypto");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { sendOtpEmail } = require("../utils/sendEmail");

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

// ---------- OTP helpers ----------

// randomInt is cryptographically secure (Math.random is not).
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// Only a keyed hash is stored, so a database leak doesn't expose live codes.
const hashOtp = (otp) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(otp).digest("hex");

const safeEqual = (a, b) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

// Sets fresh OTP fields on the user doc (caller must save) and returns the plain code.
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
});

// ---------- Controllers ----------

/**
 * @route   POST /api/auth/register
 * @desc    Create an UNVERIFIED account and email a 6-digit code. No token yet.
 * @access  Public
 */
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, phone, password, role, farmLocation, buyerCategory, businessLocation } = req.body;

  try {
    const existing = await User.findOne({ email }).select("+otpLastSentAt");

    // Verified accounts (and admins, always) can't be re-registered.
    if (existing && (existing.isEmailVerified || existing.role === "admin")) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    // An unverified account for this email can be re-registered (e.g. the user
    // mistyped their password or lost the code). Safe because only the owner of
    // the inbox can ever complete verification. The cooldown stops it being
    // used to spam someone else's inbox.
    if (existing) {
      const wait = secondsUntilResend(existing);
      if (wait > 0) {
        return res.status(429).json({
          message: `Please wait ${wait}s before requesting another code`,
          retryAfterSeconds: wait,
        });
      }
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

    const otp = issueOtp(user);
    await user.save();

    res.status(201).json({
      message: "Account created. Enter the 6-digit code we emailed you to verify.",
      email: user.email,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });

    // Send AFTER responding: the SMTP round-trip (1-5s) must not keep the user waiting on the
    // sign-up screen. If it fails, the app's "Resend code" button recovers.
    sendOtpEmail(user.email, user.name, otp, OTP_EXPIRY_MINUTES).catch((mailErr) =>
      console.error("[FairBloom] Send OTP email failed:", mailErr.message),
    );
  } catch (err) {
    console.error("[FairBloom] Register error:", err.message);
    res.status(500).json({ message: "Server error during registration" });
  }
};

/**
 * @route   POST /api/auth/verify-email
 * @desc    Body: { email, otp }. On success marks the account verified and
 *          returns a token, so the user is logged in right away.
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

    // Correct: verify the account and burn the code so it can't be reused.
    user.isEmailVerified = true;
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;
    user.otpLastSentAt = undefined;
    await user.save();

    res.json({ token: generateToken(user), user: publicUser(user) });
  } catch (err) {
    console.error("[FairBloom] Verify email error:", err.message);
    res.status(500).json({ message: "Server error verifying email" });
  }
};

/**
 * @route   POST /api/auth/resend-otp
 * @desc    Body: { email }. Sends a fresh code (60s cooldown). The response
 *          is the same whether or not the email exists, so this endpoint
 *          can't be used to discover registered emails.
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

    res.json(genericReply);

    sendOtpEmail(user.email, user.name, otp, OTP_EXPIRY_MINUTES).catch((mailErr) =>
      console.error("[FairBloom] Resend OTP email failed:", mailErr.message),
    );
  } catch (err) {
    console.error("[FairBloom] Resend OTP error:", err.message);
    res.status(500).json({ message: "Server error resending code" });
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate a verified user and return a JWT
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

    // Checked AFTER the password, so someone without the password can't probe
    // which emails are pending. Admins are exempt (provisioned by the seed script).
    if (!user.isEmailVerified && user.role !== "admin") {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Please verify your email before logging in",
        email: user.email,
      });
    }

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