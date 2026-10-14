const { processWebhook } = require("../../../services/webhook");
async function handleWebhook(req, res, next) {
     try {
          const result = await processWebhook(req);
          res.status(200).json({
               code: '200',
               message: 'Webhook processed',
               data: result
          });
     } catch (err) {
          next(err);
     }
}

module.exports = {handleWebhook}