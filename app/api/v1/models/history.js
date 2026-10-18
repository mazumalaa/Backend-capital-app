const { Schema, Types, model } = require("mongoose");

const historySchema = new Schema({
  user_id: {
    type: Types.ObjectId,
    ref: "User",
    required: true
  },
  transaction_id: {
    type: Types.ObjectId,
    default: null,
  },
  type: {
    type: String,
    enum: ["topup", "transfer"],
    required: true
  },
  flow: {
    type: String,
    enum: ["in", "out"],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    default: ""
  }
}, {
  timestamps: true
});

historySchema.index({ transaction_id: 1 });
historySchema.index({ user_id: 1, createdAt: -1, _id: -1 });
historySchema.index({ createdAt: -1, _id: -1 });

module.exports = model("History", historySchema);
