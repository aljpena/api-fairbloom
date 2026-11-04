const express = require("express");
const router = express.Router();

const {
  listUsers,
  getUser,
  setUserStatus,
  downloadBackup,
  eraseUserByAdmin,
} = require("../controllers/adminController");
const { userStatusValidation, adminEraseValidation } = require("../middleware/validators");
const { protect, authorize } = require("../middleware/auth");

// Every route in this file is admin-only.
router.use(protect, authorize("admin"));

router.get("/users", listUsers);
router.get("/users/:id", getUser);
router.patch("/users/:id/status", userStatusValidation, setUserStatus);
router.post("/users/:id/erase", adminEraseValidation, eraseUserByAdmin);

router.get("/backup", downloadBackup);

module.exports = router;