const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, trim: true, maxlength: 1000, default: "" }, // may be empty if there's an image
    image: { type: mongoose.Schema.Types.ObjectId, ref: "File", default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// The app loads the image from here (with the Authorization header)
messageSchema.virtual("imageUrl").get(function () {
  return this.image ? `/api/files/${this.image}` : null;
});

messageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);