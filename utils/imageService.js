const sharp = require("sharp");

/**
 * Decodes and re-encodes an uploaded image as JPEG. This:
 *  - rejects anything that isn't really an image (the declared type can be faked)
 *  - applies EXIF rotation, then drops all metadata (including GPS location)
 *  - shrinks the image to keep database storage small
 */
async function processImage(buffer, { maxSize = 1280, quality = 75 } = {}) {
  try {
    const data = await sharp(buffer, { limitInputPixels: 40000000 }) // guards against decompression bombs
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // transparent PNGs become white, not black
      .jpeg({ quality })
      .toBuffer();

    return { data, contentType: "image/jpeg", size: data.length };
  } catch {
    const err = new Error("That file isn't a valid image");
    err.status = 400;
    throw err;
  }
}

module.exports = { processImage };
