const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true,
  },
  actor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    immutable: true,
  },
  contact_request_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ContactRequest",
    default: null,
    immutable: true,
  },
  broadcast_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    immutable: true,
  },
  type: {
    type: String,
    enum: [
      "admin_broadcast",
      "contact_request",
      "contact_request_result",
      "user_registration_pending",
      "user_registered",
    ],
    required: true,
    immutable: true,
  },
  title: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true,
    immutable: true,
  },
  body: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true,
    immutable: true,
  },
  read_at: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

notificationSchema.index({ recipient_id: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ recipient_id: 1, read_at: 1 });
notificationSchema.index({ actor_id: 1, type: 1, broadcast_id: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
