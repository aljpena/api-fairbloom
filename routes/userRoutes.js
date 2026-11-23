const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const {
  updateProfile,
  changePassword,
  eraseMyAccount,
  submitVerificationDocument,
} = require("../controllers/userController");
const {
  profileValidation,
  passwordChangeValidation,
  selfEraseValidation,
} = require("../middleware/validators");
const { protect } = require("../middleware/auth");
const { uploadImage } = require("../middleware/upload");

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

router.patch("/me", protect, profileValidation, updateProfile);
router.patch("/me/password", protect, passwordLimiter, passwordChangeValidation, changePassword);
router.post("/me/erase", protect, passwordLimiter, selfEraseValidation, eraseMyAccount);
router.post(
  "/me/verification-document",
  protect,
  passwordLimiter,
  uploadImage("document"),
  submitVerificationDocument
);

module.exports = router;
