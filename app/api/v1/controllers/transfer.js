const { transaferService, getContactService, searchReceiversService, getReceiverPhoto } = require("../../../services/transafer");

function receiverSummary(user) {
     if (!user) return user;
     return {
          _id: user._id,
          username: user.username,
          phone: user.phone,
     };
}

async function transfer(req,res,next) {
     try{
          const response = await transaferService(req);
          res.status(200).json({
               code :'200',
               status:'OK',
               message:'Transfer successfuly'
          })
     }catch(err){
          next(err);
     }
}

async function getContact(req,res,next) {
     try{
          const response = await getContactService(req);
          res.status(200).json({
               code:'200',
               status:'OK',
               data:receiverSummary(response),
          })
     }catch(err){
          next(err);
     }
}

async function searchReceivers(req, res, next) {
     try {
          const users = await searchReceiversService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               data: users.map(receiverSummary),
          });
     } catch (err) {
          next(err);
     }
}

async function getReceiver(req,res,next) {
     try{
          const response = await getReceiverPhoto(req);
          res.status(200).json({
               code:'200',
               status:'OK',
               data:response,
          })
     }catch(err){
          next(err);
     }
}

module.exports = {transfer, getContact, searchReceivers, getReceiver};