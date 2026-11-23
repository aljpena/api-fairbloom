const jwt = require("jsonwebtoken");

/**
 * Signs a JWT containing the user's id and role.
 * Role is embedded so middleware can do role checks without a DB hit
 * on every request.
 */
const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
};

module.exports = generateToken;
