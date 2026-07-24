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

module.exports = { registerValidation, loginValidation };
