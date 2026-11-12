const { body } = require("express-validator");
const { VARIETIES, canonicalVariety } = require("../config/varieties");

const LOCATIONS = ["Beckel", "Bahong", "Ambiong", "Bineng", "Tublay", "Sablan", "Baguio City", "La Trinidad"];

// Normalizes to the canonical spelling, then requires it to be on the list.
const varietyField = () =>
  body("flowerVariety")
    .customSanitizer(canonicalVariety)
    .isIn(VARIETIES)
    .withMessage(`Flower variety must be one of: ${VARIETIES.join(", ")}`);

const registerValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").isIn(["farmer", "buyer"]).withMessage("Role must be either 'farmer' or 'buyer'"),

  body("farmLocation")
    .if(body("role").equals("farmer"))
    .isIn(["Beckel", "Bahong", "Ambiong", "Bineng", "Tublay", "Sablan"])
    .withMessage("A valid farm location is required for farmer accounts"),

  body("buyerCategory")
    .if(body("role").equals("buyer"))
    .isIn(["Retail Florist", "Funeral Home", "Church/Institution"])
    .withMessage("A valid buyer category is required for buyer accounts"),
  body("businessLocation")
    .if(body("role").equals("buyer"))
    .isIn(["Baguio City", "La Trinidad"])
    .withMessage("A valid business location is required for buyer accounts"),
];

const loginValidation = [
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

const verifyEmailValidation = [
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("otp").trim().matches(/^\d{6}$/).withMessage("Code must be exactly 6 digits"),
];

const resendOtpValidation = [
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
];

const listingValidation = [
  body("type").isIn(["sell", "request"]).withMessage("Type must be 'sell' or 'request'"),
  varietyField(),
  body("quantity").isFloat({ min: 1 }).withMessage("Quantity must be at least 1"),
  body("pricePerUnit")
    .if(body("type").equals("sell"))
    .isFloat({ min: 0.01 })
    .withMessage("Asking price per dozen is required and must be greater than 0"),
  body("pricePerUnit")
    .if(body("type").equals("request"))
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage("Price per unit must be a positive number"),
  body("location").isIn(LOCATIONS).withMessage("A valid location is required"),
  body("description").optional().isLength({ max: 500 }).withMessage("Description too long (max 500 chars)"),
];

const transactionValidation = [
  varietyField(),
  body("price").isFloat({ min: 0.01 }).withMessage("Price must be greater than 0"),
  body("volume").isFloat({ min: 0.01 }).withMessage("Volume must be greater than 0"),
  body("location").optional().trim(),
];

const dealValidation = [
  varietyField(),
  body("price").isFloat({ min: 0.01 }).withMessage("Price must be greater than 0"),
  body("volume").isFloat({ min: 0.01 }).withMessage("Volume must be greater than 0"),
  body("location").optional({ nullable: true }).isIn(LOCATIONS).withMessage("Invalid location"),
  body("listingId").optional({ nullable: true }).isMongoId().withMessage("Invalid listing id"),
];

const profileValidation = [
  body("name").optional().trim().notEmpty().withMessage("Name can't be empty"),
  body("phone")
    .optional({ values: "falsy" })
    .trim()
    .matches(/^[0-9+\-\s()]{7,20}$/)
    .withMessage("Enter a valid phone number"),
  body("farmLocation")
    .optional()
    .isIn(["Beckel", "Bahong", "Ambiong", "Bineng", "Tublay", "Sablan"])
    .withMessage("Invalid farm location"),
  body("buyerCategory")
    .optional()
    .isIn(["Retail Florist", "Funeral Home", "Church/Institution"])
    .withMessage("Invalid buyer category"),
  body("businessLocation")
    .optional()
    .isIn(["Baguio City", "La Trinidad"])
    .withMessage("Invalid business location"),
];

const passwordChangeValidation = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters")
    .custom((value, { req }) => value !== req.body.currentPassword)
    .withMessage("New password must be different from the current one"),
];

const userStatusValidation = [
  body("isActive").isBoolean({ strict: true }).withMessage("isActive must be true or false"),
];

const adminEraseValidation = [
  body("confirmEmail").isEmail().withMessage("confirmEmail must be the user's email").normalizeEmail(),
  body("transactions")
    .isIn(["anonymize", "delete"])
    .withMessage("transactions must be 'anonymize' or 'delete'"),
];

const selfEraseValidation = [body("password").notEmpty().withMessage("Password is required")];

const verificationDecisionValidation = [
  body("decision").isIn(["approve", "reject"]).withMessage("decision must be 'approve' or 'reject'"),
  body("reason")
    .if(body("decision").equals("reject"))
    .trim()
    .notEmpty()
    .withMessage("Please give a reason so the user can fix the problem")
    .isLength({ max: 300 })
    .withMessage("Reason is too long (max 300 characters)"),
];

const pushTokenValidation = [
  body("token")
    .trim()
    .matches(/^(Exponent|Expo)PushToken\[.+\]$/)
    .withMessage("Invalid Expo push token"),
  body("platform").optional().isIn(["android", "ios"]).withMessage("platform must be 'android' or 'ios'"),
];

module.exports = {
  registerValidation,
  loginValidation,
  verifyEmailValidation,
  resendOtpValidation,
  listingValidation,
  transactionValidation,
  dealValidation,
  profileValidation,
  passwordChangeValidation,
  userStatusValidation,
  adminEraseValidation,
  selfEraseValidation,
  verificationDecisionValidation,
  pushTokenValidation,
};