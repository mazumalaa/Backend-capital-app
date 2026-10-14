const mongoose = require('mongoose');

const topupSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  order_id: String,
  amount: Number,
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
} , {
     timestamps:true,
});

module.exports = mongoose.model('Topup', topupSchema);
