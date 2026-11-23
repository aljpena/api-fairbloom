/** Blocks write actions until an admin has approved the user's verification document. */
module.exports = (req, res, next) => {
  const u = req.user;
  if (u.role === "admin" || u.verificationStatus === "approved") return next();

  const status = u.verificationStatus || "pending";
  res.status(403).json({
    code: "VERIFICATION_REQUIRED",
    verificationStatus: status,
    message:
      status === "rejected"
        ? "Your verification document was rejected. Please upload a new one."
        : "Your account is waiting for document verification by an administrator.",
    reason: status === "rejected" ? u.verificationNote || null : null,
  });
};
