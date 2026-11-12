const File = require("../models/File");
const Conversation = require("../models/Conversation");

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
    if (!file) return res.status(404).json({ message: "File not found" });

    const me = String(req.user._id);
    let allowed = false;

    if (file.kind === "verification") {
      allowed = req.user.role === "admin" || String(file.owner) === me;
    } else {
      const convo = await Conversation.findById(file.conversation).select("participants");
      allowed = !!convo && convo.participants.some((p) => String(p) === me);
    }

    if (!allowed) return res.status(404).json({ message: "File not found" });

    const data = Buffer.isBuffer(file.data) ? file.data : file.data?.value?.(true);
    if (!Buffer.isBuffer(data)) {
      console.error("[FairBloom] Get file error: Stored file data is not a buffer");
      return res.status(500).json({ message: "Server error fetching file" });
    }

    res.set({
      "Content-Type": file.contentType,
      "Content-Length": data.length,
      "Content-Disposition": "inline",
      // ID photos are never cached; chat images never change, so they can be.
      "Cache-Control": file.kind === "verification" ? "no-store" : "private, max-age=86400",
    });
    res.send(data);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ message: "File not found" });
    console.error("[FairBloom] Get file error:", err.message);
    res.status(500).json({ message: "Server error fetching file" });
  }
};

module.exports = { getFile };