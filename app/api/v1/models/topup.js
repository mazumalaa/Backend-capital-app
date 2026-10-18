const mongoose = require('mongoose');

const topupSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  order_id: String,
  amount: Number,
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
} , {
     timestamps:true,
});

topupSchema.index({ order_id: 1 }, { unique: true, sparse: true });
topupSchema.index({ user_id: 1 });

module.exports = mongoose.model('Topup', topupSchema);
