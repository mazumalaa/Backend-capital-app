const { Schema, Types, model } = require("mongoose");

const historySchema = new Schema({
  user_id: {
    type: Types.ObjectId,
    ref: "User",
    required: true
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

module.exports = model("History", historySchema);
