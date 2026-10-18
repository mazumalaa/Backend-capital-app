const mongoose = require("mongoose");

const contactRequestSchema = new mongoose.Schema({
  requester_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  recipient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
  responded_at: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

contactRequestSchema.index(
  { requester_id: 1, recipient_id: 1 },
  { unique: true }
);
contactRequestSchema.index({ recipient_id: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("ContactRequest", contactRequestSchema);
