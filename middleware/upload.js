const multer = require("multer");

const MAX_MB = 8; // phone photos are often 3 to 8 MB; they're shrunk after upload

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1, fields: 20, fieldSize: 10 * 1024 },
  fileFilter: (req, file, cb) => {
    // Quick first check only. The real validation is decoding in processImage().
    if (/^image\/(jpeg|png|webp)$/i.test(file.mimetype)) return cb(null, true);
    const err = new Error("Only JPEG, PNG or WebP images are allowed");
    err.code = "BAD_FILE_TYPE";
    cb(err);
  },
});

/** Accepts one optional image in `field`. Turns upload errors into clean 400 responses. */
const uploadImage = (field) => (req, res, next) => {
  upload.single(field)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `Image is too large (max ${MAX_MB} MB)`
          : err.code === "LIMIT_UNEXPECTED_FILE"
          ? `Unexpected file field. Send the image in the '${field}' field`
          : err.message;
      return res.status(400).json({ message });
    }
    if (err.code === "BAD_FILE_TYPE") return res.status(400).json({ message: err.message });
    next(err);
  });
};

module.exports = { uploadImage };