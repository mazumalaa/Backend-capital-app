// IMPORTS...
const userModel = require("../api/v1/models/users");
const historyModel = require("../api/v1/models/history");
const verifyModel = require("../api/v1/models/verify");
const forgotPassworModel = require("../api/v1/models/forgotPassword");
const imageModel = require("../api/v1/models/image");
const { BadRequest } = require("../errors/badRequest");
const { Conflict } = require("../errors/conflict");
const generatorOTP = require("../libs/otpGenerator");
const bcryptjs = require("bcryptjs")
const { createToken } = require("../libs/jwt");
const { mail } = require("../libs/nodemiler");
const { Unauthorized } = require("../errors/unauthorized");
const { NotFound } = require("../errors/notFound");
const { uploadImage, deleteImage: deleteCloudinaryImage } = require("../libs/cloudinary");
const { deleteImage: deleteLegacyGridFSImage } = require("../libs/gridfs");
const mongoose = require("mongoose");

const OTP_MAX_ATTEMPTS = 5;
const OTP_LIFETIME_MS = 5 * 60 * 1000;

async function validateOtp(model, filter, otp) {
     if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
          throw new BadRequest("Invalid or expired OTP");
     }

     const record = await model.findOneAndUpdate(
          {
               ...filter,
               otp: { $ne: null },
               expire_at: { $gt: new Date() },
               $or: [
                    { attempts: { $lt: OTP_MAX_ATTEMPTS } },
                    { attempts: { $exists: false } },
               ],
          },
          { $inc: { attempts: 1 } },
          { new: true }
     );
     if (!record) throw new BadRequest("Invalid or expired OTP");

     const isHashedOtp = typeof record.otp === "string" && record.otp.startsWith("$2");
     const matches = isHashedOtp
          ? await bcryptjs.compare(otp, record.otp)
          : otp === record.otp;
     if (!matches) throw new BadRequest("Invalid or expired OTP");

     return record;
}

async function consumeOtp(model, record, session) {
     const consumed = await model.findOneAndUpdate(
          {
               _id: record._id,
               otp: record.otp,
               expire_at: { $gt: new Date() },
          },
          { $set: { otp: null, expire_at: null, attempts: 0 } },
          { new: true, session }
     );
     if (!consumed) throw new BadRequest("Invalid or expired OTP");
}

function publicUser(user) {
     if (!user) return user;
     const result = user.toObject ? user.toObject() : { ...user };
     if (Object.prototype.hasOwnProperty.call(result, "pin")) {
          result.has_pin = Boolean(result.pin);
     }
     delete result.password;
     delete result.pin;
     return result;
}

function serializeImage(image) {
     if (!image) return null;
     return image.toObject();
}

// ========== AUTH ========== //
async function serviceRegister(req) {
     const { username, email, password, confirmPassword, phone } = req.body;
     const user = await userModel.findOne({ email });
     if (user) throw new Conflict("invalid credentials");
     if (password != confirmPassword) throw new BadRequest("Password confirmation does not match");
     const OTP = generatorOTP();
     const newUser = await userModel.create({ username, email, password, phone });
     await verifyModel.create({ user_id: newUser._id, otp: OTP, expire_at: new Date(Date.now() + 5 * 60 * 1000) });
     await forgotPassworModel.create({ user_id: newUser._id, otp: null, expire_at: null });
     let delivery;
     try {
          delivery = await mail(newUser.email, OTP, "verify");
     } catch (err) {
          await Promise.all([
               userModel.deleteOne({ _id: newUser._id }),
               verifyModel.deleteOne({ user_id: newUser._id }),
               forgotPassworModel.deleteOne({ user_id: newUser._id }),
          ]);
          throw err;
     }
     const token = createToken({ _id: newUser._id, tokenVersion: newUser.token_version });
     return { newUser: publicUser(newUser), token, emailRecipient: delivery.recipient };
}

async function serviceLogin(req) {
     const { email, password } = req.body;
     const user = await userModel.findOne({ email })
     if (!user) throw new Unauthorized("Invalid email or password");
     if (!user.is_verified) throw new Unauthorized("account has not been verified");
     if (!await bcryptjs.compare(password, user.password)) throw new Unauthorized("Invalid email or password");
     const token = createToken({ _id: user._id, tokenVersion: user.token_version || 0 })
     return token;
}

async function resendOtpService(req) {
     const verify = await verifyModel.findOne({ user_id: req.user._id });
     const user = await userModel.findById(req.user._id);
     if (!verify) throw new NotFound("User not found");
     if (!user) throw new NotFound("User not found");
     let OTP;
     do {
          OTP = generatorOTP();
     } while (verify.otp && await bcryptjs.compare(OTP, verify.otp));
     verify.otp = OTP;
     verify.expire_at = new Date(Date.now() + 5 * 60 * 1000);
     verify.attempts = 0;
     await verify.save();
     const delivery = await mail(user.email, OTP, "verify");
     return { recipient: delivery.recipient };
}

async function verifyOtpService(req) {
     const { otp } = req.body;
     const verify = await validateOtp(verifyModel, { user_id: req.user._id }, otp);
     const session = await mongoose.startSession();
     try {
          await session.withTransaction(async () => {
               await consumeOtp(verifyModel, verify, session);
               const user = await userModel.findByIdAndUpdate(
                    req.user._id,
                    { is_verified: true },
                    { new: true, session }
               );
               if (!user) throw new NotFound("User not found");
          });
     } finally {
          await session.endSession();
     }
     return;
}

// ========== PROFILE ========== //
async function getProfileService(req) {
     const user = await userModel.findById(req.user._id).select("-password");
     if (!user) throw new NotFound("User not found");
     return user;
}

async function updateProfileService(req) {
     const { username, phone, birthday } = req.body;
     const user = await userModel.findByIdAndUpdate(
          req.user._id,
          { username, phone, birthday },
          { new: true, runValidators: true, upsert: false }
     ).select("-password");
     if (!user) throw new NotFound("User not found");
     return user;
}

async function getPhotoService(req) {
     const userPhoto = await imageModel.findOne({ user_id: req.user._id });
     return serializeImage(userPhoto);
}

async function uploadPhotoService(req) {
     if (!req.file) throw new BadRequest("No file uploaded");
     const exist = await imageModel.findOne({ user_id: req.user._id });
     if (exist) throw new Conflict("Photo already uploaded");

     const uploadedImage = await uploadImage(req.file, req.user._id);
     try {
          const image = await imageModel.create({
               user_id: req.user._id,
               filename: req.file.originalname,
               cloudinary_public_id: uploadedImage.publicId,
               content_type: req.file.mimetype,
               url: uploadedImage.url,
          });
          return serializeImage(image);
     } catch (error) {
          await deleteCloudinaryImage(uploadedImage.publicId);
          throw error;
     }
}

async function updatePhotoService(req) {
     if (!req.file) throw new BadRequest("No file uploaded");
     const image = await imageModel.findOne({ user_id: req.user._id });
     if (!image) throw new NotFound("Photo not found");

     const oldFileId = image.file_id;
     const oldPublicId = image.cloudinary_public_id;
     const uploadedImage = await uploadImage(req.file, req.user._id);
     image.filename = req.file.originalname;
     image.file_id = undefined;
     image.cloudinary_public_id = uploadedImage.publicId;
     image.content_type = req.file.mimetype;
     image.url = uploadedImage.url;
     try {
          await image.save();
     } catch (error) {
          await deleteCloudinaryImage(uploadedImage.publicId);
          throw error;
     }
     if (oldPublicId) {
          try {
               await deleteCloudinaryImage(oldPublicId);
          } catch (error) {
               console.error("Failed to remove replaced Cloudinary profile image:", error.message);
          }
     }
     if (oldFileId) {
          try {
               await deleteLegacyGridFSImage(oldFileId);
          } catch (error) {
               console.error("Failed to remove replaced legacy GridFS profile image:", error.message);
          }
     }
     return serializeImage(image);
}

// ========== USERS ========== //
async function getUserService(req) {
     const { is_verified, keyword } = req.query;
     const page = req.query.page || 1;
     const requestedLimit = req.query.limit || 20;
     const user_id = req.user._id;
     const filter = {};

     // Exclude current user
     if (user_id) {
          filter._id = { $ne: user_id };
     }

     // Keyword-based search (username, email, phone)
     if (keyword) {
          const escapedKeyword = String(keyword).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          filter.$or = [
               { username: { $regex: escapedKeyword, $options: "i" } },
               { email: { $regex: escapedKeyword, $options: "i" } },
               { phone: { $regex: escapedKeyword, $options: "i" } }
          ];
     }

     // Filter by verification status
     if (is_verified !== undefined) {
          filter.is_verified = is_verified === "true";
     }

     // Pagination
     const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
     const limitNumber = Math.min(100, Math.max(1, Number.parseInt(requestedLimit, 10) || 20));
     const skip = (pageNumber - 1) * limitNumber;

     const total = await userModel.countDocuments(filter);
     const users = await userModel
          .find(filter)
          .select("-password -pin")
          .skip(skip)
          .limit(limitNumber);

     return { page: pageNumber, limit: limitNumber, skip, total, users };
}


async function createUser(req) {
     const { username, password, email, phone, role } = req.body;
     const condition = {};
     if (email) condition.email = email;
     if (phone) condition.phone = phone;
     if (!email || !phone) throw new BadRequest("Email and phone are required");
     const user = await userModel.findOne(condition);
     if (user) throw new Conflict("User already exists");
     const newUser = await userModel.create({ username, email, phone, role, password });
     return newUser;
}

async function updateUser(req) {
     const { user_id } = req.params;
     const { username, email, phone, role, password } = req.body;
     const user = await userModel.findById(user_id);
     if (!user) throw new NotFound("User not found");
     if (username !== undefined) user.username = username;
     if (phone !== undefined) user.phone = phone;
     if (email !== undefined) user.email = email;
     if (password !== undefined) {
          user.password = password;
          user.token_version = (user.token_version || 0) + 1;
     }
     if (role !== undefined) user.role = role;
     await user.save();
     return user;
}

async function deleteUser(req) {
     const { user_id } = req.params;

     const user = await userModel.findById(user_id);
     if (!user) throw new NotFound("User not found");

     // Remove the profile image from its storage provider.
     const image = await imageModel.findOne({ user_id });
     if (image?.cloudinary_public_id) await deleteCloudinaryImage(image.cloudinary_public_id);
     if (image?.file_id) await deleteLegacyGridFSImage(image.file_id);

     // Hapus semua yang berhubungan dengan user
     await Promise.all([
          verifyModel.deleteOne({ user_id }),
          forgotPassworModel.deleteOne({ user_id }),
          imageModel.deleteOne({ user_id }),
          historyModel.deleteMany({ user_id }) // pastikan history pakai field `user_id`
     ]);

     // Hapus user terakhir
     await userModel.findByIdAndDelete(user_id);

     return;
}


// ========== FORGOT-PASSWORD ========== //
async function forgotPasswordService(req) {
     const { email } = req.body;
     const user = await userModel.findOne({ email });
     if (!user) return;
     const OTP = generatorOTP();
     let resetRecord = await forgotPassworModel.findOne({ user_id: user._id });
     if (!resetRecord) {
          resetRecord = new forgotPassworModel({ user_id: user._id });
     }
     resetRecord.otp = OTP;
     resetRecord.expire_at = new Date(Date.now() + OTP_LIFETIME_MS);
     resetRecord.attempts = 0;
     await resetRecord.save();
     await mail(user.email, OTP, "reset");
     return;
}

async function resetPasswordService(req) {
     const { email, otp, password, confirmPassword } = req.body;
     if (typeof email !== "string" || !email) {
          throw new BadRequest("Email is required to reset the password");
     }
     if (typeof password !== "string" || password !== confirmPassword) {
          throw new BadRequest("Password confirmation does not match");
     }
     const user = await userModel.findOne({ email });
     if (!user) throw new BadRequest("Invalid or expired OTP");
     const isMatch = await validateOtp(forgotPassworModel, { user_id: user._id }, otp);
     const session = await mongoose.startSession();
     try {
          await session.withTransaction(async () => {
               await consumeOtp(forgotPassworModel, isMatch, session);
               const account = await userModel.findById(isMatch.user_id).session(session);
               if (!account) throw new NotFound("User not found");
               account.password = password;
               account.token_version = (account.token_version || 0) + 1;
               await account.save({ session });
          });
     } finally {
          await session.endSession();
     }
     return;
}

// ========== UPDATE-EMAIL ========== //
async function emailOTPservice(req) {
     const { email } = req.body;
     if (typeof email !== "string" || !email) throw new BadRequest("Email is required");
     const user = await userModel.findById(req.user._id);
     if (!user) throw new NotFound("User not found");
     const existingUser = await userModel.findOne({ email });
     if (existingUser && !existingUser._id.equals(user._id)) {
          throw new Conflict("Email is already in use");
     }
     const verify = await verifyModel.findOne({ user_id: user._id });
     if (!verify) throw new NotFound("Verification record not found for this user");
     const OTP = generatorOTP();
     verify.otp = OTP;
     verify.expire_at = new Date(Date.now() + OTP_LIFETIME_MS);
     verify.attempts = 0;
     await verify.save();
     await mail(email, OTP, "verify");
     return { recipient: email.replace(/^(.).+(@.+)$/, "$1***$2") };
}

async function updateEmailService(req) {
     const { otp, email, confirmEmail } = req.body;
     const user = await userModel.findById(req.user._id);
     if (!user) throw new NotFound("User not found");
     if (typeof email !== "string" || email !== confirmEmail) {
          throw new BadRequest("Email confirmation does not match");
     }
     const existingUser = await userModel.findOne({ email });
     if (existingUser && !existingUser._id.equals(user._id)) {
          throw new Conflict("Email is already in use");
     }
     const verify = await validateOtp(verifyModel, { user_id: user._id }, otp);
     const session = await mongoose.startSession();
     try {
          await session.withTransaction(async () => {
               await consumeOtp(verifyModel, verify, session);
               user.email = email;
               await user.save({ session });
          });
     } finally {
          await session.endSession();
     }
     return publicUser(user);
}

// ========= UPDATE-PIN ========== //
async function confirmPin(req) {
     const pinConfirmation = req.body.pin;
     const user = await userModel.findById(req.user._id);
     if (!user) throw new NotFound("User not found");
     if (user.pin == null) throw new BadRequest("please create a pin first");
     return verifyPin(user, pinConfirmation);
}

async function verifyPin(user, pin) {
     if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
          throw new BadRequest("PIN must contain six digits");
     }
     if (!user?.pin) throw new BadRequest("Please create a PIN first");
     if (!await bcryptjs.compare(pin, user.pin)) {
          throw new BadRequest("PIN confirmation doesn't match");
     }
}

async function updatePinService(req) {
     const { otp, pin, confirmPin } = req.body;
     const user = await userModel.findById(req.user._id);
     if (!user) throw new NotFound("User not found");
     if (typeof pin !== "string" || !/^\d{6}$/.test(pin) || pin !== confirmPin) {
          throw new BadRequest("PIN must contain six digits and match the confirmation");
     }
     const verify = await validateOtp(verifyModel, { user_id: user._id }, otp);
     const session = await mongoose.startSession();
     try {
          await session.withTransaction(async () => {
               await consumeOtp(verifyModel, verify, session);
               user.pin = pin;
               await user.save({ session });
          });
     } finally {
          await session.endSession();
     }
     return publicUser(user);
}

// EXPORTS...
module.exports = {
     serviceRegister,
     serviceLogin,
     resendOtpService,
     verifyOtpService,
     getUserService,
     createUser,
     updateUser,
     deleteUser,
     forgotPasswordService,
     resetPasswordService,
     getProfileService,
     updateProfileService,
     updateEmailService,
     emailOTPservice,
     updatePinService,
     confirmPin,
     verifyPin,
     uploadPhotoService,
     updatePhotoService,
     getPhotoService,
};