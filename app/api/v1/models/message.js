const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true,
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true,
  },
  text: {
    type: String,
    required: true,
    minlength: 1,
    maxlength: 2000,
    trim: true,
  },
  read_at: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

messageSchema.index({ sender_id: 1, receiver_id: 1, createdAt: -1 });
messageSchema.index({ receiver_id: 1, sender_id: 1, createdAt: -1 });
messageSchema.index({ receiver_id: 1, read_at: 1, sender_id: 1 });
messageSchema.index({ sender_id: 1, createdAt: -1, _id: -1 });
messageSchema.index({ receiver_id: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model("Message", messageSchema);
