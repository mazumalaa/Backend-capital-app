const mongoose = require("mongoose");
const {Schema, model, Types} = mongoose;

const contactSchema = new Schema({
  user_id: {
    type: mongoose.Types.ObjectId,
    ref: "User"
  },
  contact_user_id: {
    type: mongoose.Types.ObjectId,
    ref: "User"
  },
  alias: {
    type: String,
    default: ""
  }
});

contactSchema.index({ user_id: 1, _id: 1 });
contactSchema.index({ user_id: 1, contact_user_id: 1 });
contactSchema.index({ contact_user_id: 1 });

module.exports = model("Contact" , contactSchema);
