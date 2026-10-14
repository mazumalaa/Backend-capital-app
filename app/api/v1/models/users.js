// IMPORTS...
const mongoose = require("mongoose");
const validator = require("validator");
const bcryptjs = require("bcryptjs");
const { Schema, model } = mongoose;

// SCHEMA...
const userSchema = new Schema({
     username: {
          type: String,
          default:null,
     },
     email: {
          type: String,
          required: [true, "User email required"],
          unique: true,
          validate: {
               validator: (value) => {
                    return validator.isEmail(value);
               },
               message: "Email address is invalid"
          },
     },
     password: {
          type: String,
          required: [true, "User password required"],
          validate: {
               validator: (value) => {
                    return validator.isStrongPassword(value, {
                         minLength: 8,
                         minLowercase: 1,
                         minUppercase: 1,
                         minNumbers: 1,
                         minSymbols: 1,
                    })
               },
               message: "Password must be at least 8 characters and include lowercase, uppercase, number, and symbol characters"
          }
     },
     phone: {
          type: String,
          unique: true,
          required: [true, "User phone required"],
          validate: {
               validator: (value) => {
                    return validator.isMobilePhone(value, 'id-ID');
               },
               message: "Phone number is invalid"
          }
     },
      balance:{
          type:Number,
          default:0,
     },
     role: {
          type: String,
          enum: ["user", "admin"],
          default: "user",
     },
     pin: {
          type: String,
          default:null,
     },
     birthday:{
          type:Date,
          default:null,
     },
     is_verified: {
          type: Boolean,
          default: false,
     },
     token_version: {
          type: Number,
          default: 0,
     },
}, {
     timestamps: true,
})

userSchema.pre("save", async function () {
     if (this.isModified("password")) this.password = await bcryptjs.hash(String(this.password), 12);
     if (this.isModified("pin") && this.pin !== null) this.pin = await bcryptjs.hash(String(this.pin), 12);
})

// EXPORTS...
module.exports = model('User', userSchema);