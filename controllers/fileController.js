const File = require("../models/File");
const Conversation = require("../models/Conversation");

// .lean() returns the image as a BSON Binary, so convert it to a Buffer before sending.
const toBytes = (data) => Buffer.from(data.buffer);

/**
 * @route   GET /api/files/:id
 * @desc    Chat image: participants of that conversation only.
 *          Verification document: the owner and admins only.
 *          Anyone else gets 404, so file ids can't be probed.
 * @access  Private
 */
const getFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id).select("+data").lean();
    if (!file || !file.data) return res.status(404).json({ message: "File not found" });

    const me = String(req.user._id);
    let allowed = false;

    if (file.kind === "verification") {
      allowed = req.user.role === "admin" || String(file.owner) === me;
    } else if (file.kind === "chat") {
      const convo = await Conversation.findById(file.conversation).select("participants");
      allowed = !!convo && convo.participants.some((p) => String(p) === me);
    }
    // Listing photos aren't served here; they use the public route below.

    if (!allowed) return res.status(404).json({ message: "File not found" });

    const bytes = toBytes(file.data);
    res.set({
      "Content-Type": file.contentType,
      "Content-Length": bytes.length,
      "Content-Disposition": "inline",
      // ID photos are never cached; chat images never change, so they can be.
      "Cache-Control": file.kind === "verification" ? "no-store" : "private, max-age=86400",
    });
    res.send(bytes);
  } catch (err) {
    if (res.headersSent) return;
    if (err.name === "CastError") return res.status(404).json({ message: "File not found" });
    console.error("[FairBloom] Get file error:", err.message);
    res.status(500).json({ message: "Server error fetching file" });
  }
};

/**
 * @route   GET /api/files/listing/:id
 * @desc    Listing photos are public, like the listings themselves. No login needed.
 *          Only files of kind "listing" are served here, so private images
 *          (chat, ID documents) can never be reached through this route.
 * @access  Public
 */
const getListingImage = async (req, res) => {
  try {
    const file = await File.findOne({ _id: req.params.id, kind: "listing" }).select("+data").lean();
    if (!file || !file.data) return res.status(404).json({ message: "File not found" });

    const bytes = toBytes(file.data);
    res.set({
      "Content-Type": file.contentType,
      "Content-Length": bytes.length,
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=86400",
      // Lets the web admin panel (a different origin) show these images
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.send(bytes);
  } catch (err) {
    if (res.headersSent) return;
    if (err.name === "CastError") return res.status(404).json({ message: "File not found" });
    console.error("[FairBloom] Get listing image error:", err.message);
    res.status(500).json({ message: "Server error fetching file" });
  }
};

module.exports = { getFile, getListingImage };
