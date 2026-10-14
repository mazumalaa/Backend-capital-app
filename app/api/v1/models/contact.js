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

module.exports = model("Contact" , contactSchema);
