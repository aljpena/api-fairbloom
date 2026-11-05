const express = require("express");
const router = express.Router();

const { getFile } = require("../controllers/fileController");
const { protect } = require("../middleware/auth");

router.get("/:id", protect, getFile);

module.exports = router;