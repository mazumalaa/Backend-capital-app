const mongoose = require("mongoose");
const {Schema, model, Types} = mongoose;

const transferSchema = new Schema({
     sender_id:{type:Types.ObjectId, ref:"User"},
     receiver_id:{type:Types.ObjectId , ref:"User"},
     amount:{type:Number , required:true},
     status:{type:String, enum:["success" , "failed" , "pending"] , default:"success"},
})

module.exports = model("Transfer" , transferSchema);