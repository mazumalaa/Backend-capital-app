// IMPORTS...
const bcryptjs = require("bcryptjs");
const mongoose = require("mongoose");
const {Schema, Types, model} = mongoose;

// SCHEMA...
const verifySchema = new Schema({
     user_id:{
          type:Types.ObjectId,
          ref:"User",
          required:true,
     },
     otp:{
          type:String,
          default:null
     },
     attempts:{
          type:Number,
          default:0,
     },
     expire_at:{
          type:Date,
     }
} , {
     timestamps:true,
})

verifySchema.pre("save" , async function () {
     if (this.isModified("otp") && typeof this.otp === "string") {
          this.otp = await bcryptjs.hash(this.otp, 12);
     }
})

verifySchema.index({ user_id: 1 });

// EXPORTS...
module.exports = model("verify" , verifySchema);