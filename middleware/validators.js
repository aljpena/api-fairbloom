const { body } = require("express-validator");

const registerValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("role")
    .isIn(["farmer", "buyer"])
    .withMessage("Role must be either 'farmer' or 'buyer'"),

  // Conditional: farmer must supply a valid farmLocation
  body("farmLocation")
    .if(body("role").equals("farmer"))
    .isIn(["Beckel", "Bahong", "Ambiong", "Bineng", "Tublay", "Sablan"])
    .withMessage("A valid farm location is required for farmer accounts"),

  // Conditional: buyer must supply buyerCategory and businessLocation
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

const listingValidation = [
  body("type").isIn(["sell", "request"]).withMessage("Type must be 'sell' or 'request'"),
  body("flowerVariety").trim().notEmpty().withMessage("Flower variety is required"),
  body("quantity").isFloat({ min: 1 }).withMessage("Quantity must be at least 1"),
  body("pricePerUnit")
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage("Price per unit must be a positive number"),
  body("location")
    .isIn(["Beckel", "Bahong", "Ambiong", "Bineng", "Tublay", "Sablan", "Baguio City", "La Trinidad"])
    .withMessage("A valid location is required"),
  body("description").optional().isLength({ max: 500 }).withMessage("Description too long (max 500 chars)"),
];

const transactionValidation = [
  body("flowerVariety").trim().notEmpty().withMessage("Flower variety is required"),
  body("price").isFloat({ min: 0.01 }).withMessage("Price must be greater than 0"),
  body("volume").isFloat({ min: 0.01 }).withMessage("Volume must be greater than 0"),
  body("location").optional().trim(),
];

const verifyEmailValidation = [
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("otp").trim().matches(/^\d{6}$/).withMessage("Code must be exactly 6 digits"),
];

const resendOtpValidation = [
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
];

module.exports = {
  registerValidation,
  loginValidation,
  listingValidation,
  transactionValidation,
  verifyEmailValidation,
  resendOtpValidation,
};

