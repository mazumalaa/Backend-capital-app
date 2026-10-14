const topupModel = require("../api/v1/models/topup");
const userModel = require("../api/v1/models/users");
const history = require("../api/v1/models/history");
const { BadRequest } = require("../errors/badRequest");
const coreApi = require("../libs/midtrans2");
const { Rupiah } = require("../libs/rupiahFormat");

async function applyTopupStatus(notification) {
     const { transaction_status, order_id, fraud_status } = notification;
     const isSuccessful = transaction_status === "settlement" ||
          (transaction_status === "capture" && fraud_status === "accept");
     const topup = await topupModel.findOne({ order_id });
     if (!topup) throw new BadRequest("Topup not found");
     if (Number(notification.gross_amount) !== Number(topup.amount)) {
          throw new BadRequest("Top-up amount does not match the Midtrans transaction");
     }

     if (isSuccessful && topup.status === "pending") {
          const session = await topupModel.startSession();
          try {
               await session.withTransaction(async () => {
                    const updatedTopup = await topupModel.findOneAndUpdate(
                         { _id: topup._id, status: "pending" },
                         { $set: { status: "success" } },
                         { new: true, session }
                    );
                    if (!updatedTopup) return;

                    const user = await userModel.findByIdAndUpdate(
                         updatedTopup.user_id,
                         { $inc: { balance: updatedTopup.amount } },
                         { new: true, session }
                    );
                    if (!user) throw new BadRequest("Top-up user not found");

                    await history.create([{
                         user_id: user._id,
                         type: "topup",
                         flow: "in",
                         amount: updatedTopup.amount,
                         description: `Top-up ${Rupiah(updatedTopup.amount)}`
                    }], { session });
               });
          } finally {
               await session.endSession();
          }
     } else if (["cancel", "expire", "deny"].includes(transaction_status)) {
          await topupModel.findOneAndUpdate(
               { _id: topup._id, status: "pending" },
               { $set: { status: "failed" } }
          );
     }

     const currentTopup = await topupModel.findById(topup._id).select("status");
     return {
          status: transaction_status,
          order_id,
          credited: isSuccessful && currentTopup?.status === "success",
     };
}

async function processWebhook(req) {
     const notification = await coreApi.transaction.notification(req.body);
     return applyTopupStatus(notification);
}

async function syncTopupStatus(req) {
     const { order_id } = req.params;
     const topup = await topupModel.findOne({
          order_id,
          user_id: req.user._id,
     });
     if (!topup) throw new BadRequest("Top-up transaction not found");

     const notification = await coreApi.transaction.status(order_id);
     return applyTopupStatus(notification);
}

module.exports = { processWebhook, syncTopupStatus };