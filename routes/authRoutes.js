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

// Extra throttle on the OTP endpoints. The limit is generous on purpose:
// during UAT many participants may share one IP (a barangay hall's wifi).
// The real brute-force protection is the 5-attempts-per-code cap in the controller.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

router.post("/register", registerValidation, register);
router.post("/verify-email", otpLimiter, verifyEmailValidation, verifyEmail);
router.post("/resend-otp", otpLimiter, resendOtpValidation, resendOtp);
router.post("/login", loginValidation, login);
router.get("/me", protect, getMe);

module.exports = router;