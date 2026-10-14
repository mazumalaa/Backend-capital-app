const { createTopup } = require("../../../services/topUp");
const { syncTopupStatus } = require("../../../services/webhook");

async function topup(req,res,next) {
     try {
          const response = await createTopup(req)
          res.status(200).json({
               code:'200',
               message:"Top-up transaction created",
               token:response.token,
               redirect_url:response.redirect_url,
               order_id: response.order_id,
          })
     }catch(err) {
          next(err);
     }
}

async function syncTopup(req, res, next) {
     try {
          const result = await syncTopupStatus(req);
          res.status(200).json({
               code: "200",
               message: "Top-up status synchronized",
               data: result,
          });
     } catch (err) {
          next(err);
     }
}

module.exports = { topup, syncTopup }