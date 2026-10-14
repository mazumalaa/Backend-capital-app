// IMPORTS...
const userModel = require("../api/v1/models/users");
const topupModel = require("../api/v1/models/topup");
const snap = require('../libs/midtrans');
const { BadRequest } = require("../errors/badRequest");
const { verifyPin } = require("./users");
const { randomBytes } = require("crypto");

async function createTopup(req) {
     const amount = Number(req.body.amount);
     if (!Number.isSafeInteger(amount) || amount < 5000) {
          throw new BadRequest("Invalid top-up nominal. Minimum Rp5,000");
     }
     const orderID = `TOP-UP-${Date.now()}-${randomBytes(4).toString("hex")}`;
     const user = await userModel.findById(req.user._id);
     if (!user) throw new BadRequest("User tidak ditemukan");
     await verifyPin(user, req.body.pin);
     const paramater = {
          transaction_details: {
               order_id: orderID,
               gross_amount: amount
          },
          customer_details: {
               first_name: user.name,
               email: user.email
          },
          item_details: [
               {
                    id: 'topup_' + amount,
                    price: amount,
                    quantity: 1,
                    name: 'TOP-UP Saldo Capital'
               }
          ]
     }
     const topup = await topupModel.create({
          user_id: user._id,
          order_id: orderID,
          amount: amount,
          status: 'pending'
     });

     try {
          const transaction = await snap.createTransaction(paramater);
          return { ...transaction, order_id: orderID };
     } catch (error) {
          await topupModel.findByIdAndUpdate(topup._id, { status: "failed" });
          throw error;
     }
}

module.exports = { createTopup }