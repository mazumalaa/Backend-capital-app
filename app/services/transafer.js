const Transfer = require("../api/v1/models/transafer");
const History = require("../api/v1/models/history");
const User = require("../api/v1/models/users");
const {NotFound} = require("../errors/notFound");
const {Conflict} = require("../errors/conflict");
const { BadRequest } = require("../errors/badRequest");
const Image = require("../api/v1/models/image");
const mongoose = require("mongoose");
const { verifyPin } = require("./users");

async function getContactService(req) {
     const {phone} = req.query;
     if(!phone) return [];
     const user = await User.findById(req.user._id);
     if(phone == user.phone) throw new Conflict("Invalid receiver");
     const receiver = await User.findOne({ phone, is_verified: true }).select("username phone");
     if(!receiver)  throw new NotFound("User not found");
     return receiver;
}

async function getReceiverPhoto(req) {
     const {user_id} = req.query;
     const photo = await Image.findOne({user_id});
     if (!photo) return null;
     const result = photo.toObject();
     if (result.file_id) {
          result.url = `${req.protocol}://${req.get("host")}/api/v1/images/${result.file_id}`;
     }
     return result;
}

async function transaferService(req) {
     const { phone, pin } = req.body;
     const amount = Number(req.body.amount);
     if (!Number.isSafeInteger(amount) || amount < 5000) {
          throw new BadRequest("Transfer amount must be a whole number of at least Rp. 5,000");
     }
     const sender = await User.findById(req.user._id);
     if (!sender) throw new NotFound("Sender not found");
     await verifyPin(sender, pin);
     const receiver = await User.findOne({ phone, is_verified: true });
     if(!receiver) throw new NotFound("Receiver  not found");
     if(receiver._id.equals(sender._id)) throw new Conflict("Invalid receiver");
     const session = await mongoose.startSession();
     try {
          await session.withTransaction(async () => {
               const debitedSender = await User.findOneAndUpdate(
                    { _id: sender._id, balance: { $gte: amount } },
                    { $inc: { balance: -amount } },
                    { new: true, session }
               );
               if (!debitedSender) throw new BadRequest("Insufficient balance");

               const creditedReceiver = await User.findByIdAndUpdate(
                    receiver._id,
                    { $inc: { balance: amount } },
                    { new: true, session }
               );
               if (!creditedReceiver) throw new NotFound("Receiver not found");

               await Transfer.create([{
                    sender_id: sender._id,
                    receiver_id: receiver._id,
                    amount,
               }], { session });
               await History.insertMany([
                    {
                         user_id: sender._id,
                         type: "transfer",
                         flow: "out",
                         amount,
                         description: `Transfer to ${receiver.phone}`,
                    },
                    {
                         user_id: receiver._id,
                         type: "transfer",
                         flow: "in",
                         amount,
                         description: `Transfer from ${sender.phone}`,
                    },
               ], { session });
          });
     } finally {
          await session.endSession();
     }
     return;
}

module.exports = {transaferService, getContactService, getReceiverPhoto};