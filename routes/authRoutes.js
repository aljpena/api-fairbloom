const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { register, verifyEmail, resendOtp, login, getMe } = require("../controllers/authController");
const {
  registerValidation,
  loginValidation,
  verifyEmailValidation,
  resendOtpValidation,
} = require("../middleware/validators");
const { protect } = require("../middleware/auth");
const { uploadImage } = require("../middleware/upload");

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

// Registration now accepts file uploads from anyone, so it gets its own limit.
// Generous on purpose: UAT participants may share one wifi connection.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many sign-up attempts. Please try again later." },
});

// uploadImage must run BEFORE the validators so the form fields are parsed first.
router.post("/register", registerLimiter, uploadImage("document"), registerValidation, register);
router.post("/verify-email", otpLimiter, verifyEmailValidation, verifyEmail);
router.post("/resend-otp", otpLimiter, resendOtpValidation, resendOtp);
router.post("/login", loginValidation, login);
router.get("/me", protect, getMe);

module.exports = router;
