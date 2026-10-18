// IMPORTS...
const userModel = require("../api/v1/models/users");
const historyModel = require("../api/v1/models/history");
const verifyModel = require("../api/v1/models/verify");
const forgotPassworModel = require("../api/v1/models/forgotPassword");
const imageModel = require("../api/v1/models/image");
const Notification = require("../api/v1/models/notification");
const Contact = require("../api/v1/models/contact");
const ContactRequest = require("../api/v1/models/contactRequest");
const Message = require("../api/v1/models/message");
const Transfer = require("../api/v1/models/transafer");
const Topup = require("../api/v1/models/topup");
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
const validator = require("validator");
const { isStrongPassword, passwordRequirementsMessage } = require("../libs/passwordPolicy");

const OTP_MAX_ATTEMPTS = 5;
const OTP_LIFETIME_MS = 5 * 60 * 1000;
const UNVERIFIED_ACCOUNT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_CLEANUP_INTERVAL_MS = 60 * 1000;
const REGISTRATION_CLEANUP_BATCH_SIZE = 25;
let registrationCleanupStarted = false;
let registrationCleanupTimer;

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
     delete result.unverified_expires_at;
     return result;
}

function serializeImage(image) {
     if (!image) return null;
     return image.toObject();
}

async function createPendingRegistrationNotification(user) {
     const admin = await userModel.findOne({ role: "admin", is_verified: true })
          .select("_id")
          .lean();
     if (!admin) throw new NotFound("Admin account is unavailable");
     return Notification.create({
          recipient_id: admin._id,
          actor_id: user._id,
          type: "user_registration_pending",
          title: "Verifikasi akun baru",
          body: `${user.username || "Pengguna"} (${user.email}) menunggu verifikasi email.`,
     });
}

// ========== AUTH ========== //
async function serviceRegister(req) {
     const { username, email, password, confirmPassword, phone } = req.body || {};
     const normalizedUsername = typeof username === "string" ? username.trim() : undefined;
     const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
     const normalizedPhone = typeof phone === "string" ? phone.trim() : "";

     if (!normalizedEmail || !normalizedPhone) {
          throw new BadRequest("Email dan nomor telepon wajib diisi.");
     }
     if (!validator.isEmail(normalizedEmail)) {
          throw new BadRequest("Masukkan alamat email yang valid.");
     }
     if (typeof password !== "string" || !isStrongPassword(password)) {
          throw new BadRequest(passwordRequirementsMessage);
     }
     if (password !== confirmPassword) {
          throw new BadRequest("Konfirmasi kata sandi tidak cocok.");
     }

     const OTP = generatorOTP();
     const otpExpiresAt = new Date(Date.now() + OTP_LIFETIME_MS);
     const newUser = await userModel.create({
          username: normalizedUsername,
          email: normalizedEmail,
          password,
          phone: normalizedPhone,
          unverified_expires_at: new Date(Date.now() + UNVERIFIED_ACCOUNT_LIFETIME_MS),
     });
     try {
          await verifyModel.create({
               user_id: newUser._id,
               otp: OTP,
               expire_at: otpExpiresAt,
          });
          await forgotPassworModel.create({ user_id: newUser._id, otp: null, expire_at: null });
          await createPendingRegistrationNotification(newUser);
          const delivery = await mail(newUser.email, OTP, "verify");
          const token = createToken({
               _id: newUser._id,
               tokenVersion: newUser.token_version,
               purpose: "email_verification",
          });
          return {
               newUser: publicUser(newUser),
               token,
               emailRecipient: delivery.recipient,
               otpExpiresAt: otpExpiresAt.toISOString(),
          };
     } catch (err) {
          await Promise.all([
               userModel.deleteOne({ _id: newUser._id }),
               verifyModel.deleteOne({ user_id: newUser._id }),
               forgotPassworModel.deleteOne({ user_id: newUser._id }),
               Notification.deleteMany({
                    actor_id: newUser._id,
                    type: "user_registration_pending",
               }),
          ]);
          throw err;
     }
}

async function serviceLogin(req) {
     const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
     const { password } = req.body || {};
     const user = await userModel.findOne({ email })
          .select("_id email password is_verified token_version +unverified_expires_at")
          .lean();
     if (!user) throw new Unauthorized("Invalid email or password");
     if (!await bcryptjs.compare(password, user.password)) throw new Unauthorized("Invalid email or password");
     if (!user.is_verified) {
          if (!user.unverified_expires_at || user.unverified_expires_at <= new Date()) {
               throw new Unauthorized("Registration expired. Please register again");
          }
          const verification = await verifyModel.findOne({ user_id: user._id })
               .select("expire_at")
               .lean();
          return {
               token: createToken({
                    _id: user._id,
                    tokenVersion: user.token_version || 0,
                    purpose: "email_verification",
               }),
               verificationRequired: true,
               otpExpiresAt: verification?.expire_at?.toISOString() || null,
               emailRecipient: `${user.email.split("@")[0].slice(0, 1)}***@${user.email.split("@")[1]}`,
          };
     }
     const token = createToken({ _id: user._id, tokenVersion: user.token_version || 0 });
     return token;
}

async function resendOtpService(req) {
     let [verify, user] = await Promise.all([
          verifyModel.findOne({ user_id: req.user._id }),
          userModel.findById(req.user._id)
               .select("_id email is_verified unverified_expires_at")
               .lean(),
     ]);
     if (!user) throw new NotFound("User not found");
     if (
          user.is_verified
          || !user.unverified_expires_at
          || user.unverified_expires_at <= new Date()
     ) {
          throw new NotFound("Registration expired. Please register again");
     }
     if (!verify) {
          verify = new verifyModel({ user_id: user._id });
     }
     let OTP;
     do {
          OTP = generatorOTP();
     } while (verify.otp && await bcryptjs.compare(OTP, verify.otp));
     verify.otp = OTP;
     verify.expire_at = new Date(Date.now() + OTP_LIFETIME_MS);
     verify.attempts = 0;
     await verify.save();
     const delivery = await mail(user.email, OTP, "verify");
     return {
          recipient: delivery.recipient,
          expiresAt: verify.expire_at.toISOString(),
     };
}

async function verifyOtpService(req) {
     const { otp } = req.body;
     const verify = await validateOtp(verifyModel, { user_id: req.user._id }, otp);
     const session = await mongoose.startSession();
     try {
          await session.withTransaction(async () => {
               await consumeOtp(verifyModel, verify, session);
               const user = await userModel.findOneAndUpdate(
                    {
                         _id: req.user._id,
                         role: "user",
                         is_verified: false,
                         unverified_expires_at: { $gt: new Date() },
                    },
                    {
                         $set: { is_verified: true },
                         $unset: { unverified_expires_at: 1 },
                    },
                    { new: true, session }
               );
               if (!user) throw new NotFound("Registration expired. Please register again");
               const admin = await userModel.findOne({ role: "admin" })
                    .select("_id")
                    .session(session);
               if (admin) {
                    await Notification.deleteMany({
                         recipient_id: admin._id,
                         actor_id: user._id,
                         type: "user_registration_pending",
                    }, { session });
                    await Notification.create([{
                         recipient_id: admin._id,
                         actor_id: user._id,
                         type: "user_registered",
                         title: "Sistem info",
                         body: `Registrasi ${user.username || "pengguna"} berhasil diselesaikan.`,
                    }], { session });
               }
          });
     } finally {
          await session.endSession();
     }
     return {
          token: createToken({
               _id: req.user._id,
               tokenVersion: req.user.token_version || 0,
          }),
     };
}

// ========== PROFILE ========== //
async function getProfileService(req) {
     const user = await userModel.findById(req.user._id).select("-password").lean();
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
     const filter = { role: "user" };

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

     const [total, users] = await Promise.all([
          userModel.countDocuments(filter),
          userModel
               .find(filter)
               .select("-password -pin")
               .sort({ _id: 1 })
               .skip(skip)
               .limit(limitNumber)
               .lean(),
     ]);

     return { page: pageNumber, limit: limitNumber, skip, total, users };
}


async function createUser(req) {
     const { username, password, role } = req.body || {};
     const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
     const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
     if (!email || !phone) throw new BadRequest("Email and phone are required");
     const newUser = await userModel.create({ username, email, phone, role, password });
     return newUser;
}

async function updateUser(req) {
     const { user_id } = req.params;
     const { username, email, phone, role, password } = req.body || {};
     const user = await userModel.findById(user_id);
     if (!user) throw new NotFound("User not found");
     if (username !== undefined) user.username = username;
     if (phone !== undefined) user.phone = phone;
     if (email !== undefined) user.email = typeof email === "string" ? email.trim().toLowerCase() : email;
     if (password !== undefined) {
          user.password = password;
          user.token_version = (user.token_version || 0) + 1;
     }
     if (role !== undefined) user.role = role;
     await user.save();
     return user;
}

async function deleteUsersByIds(values, actorId, options = {}) {
     if (!Array.isArray(values) || values.length === 0 || values.length > 100) {
          throw new BadRequest("Select between 1 and 100 users to delete");
     }
     if (values.some(value => typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value))) {
          throw new BadRequest("One or more user IDs are invalid");
     }

     const userIds = [...new Set(values.map(value => String(value)))];
     const objectIds = userIds.map(value => new mongoose.Types.ObjectId(value));
     if (actorId && userIds.includes(String(actorId))) {
          throw new BadRequest("You cannot delete your own account");
     }

     const session = await mongoose.startSession();
     let users = [];
     let images = [];
     try {
          await session.withTransaction(async () => {
               const userFilter = {
                    _id: { $in: objectIds },
                    role: "user",
               };
               if (options.pendingRegistrationOnly || options.expiredUnverifiedOnly) {
                    userFilter.is_verified = false;
               }
               if (options.expiredUnverifiedOnly) {
                    userFilter.unverified_expires_at = { $lte: new Date() };
               }
               users = await userModel.find(userFilter).select("_id phone").session(session).lean();
               if (users.length !== userIds.length) {
                    throw new BadRequest(options.pendingRegistrationOnly
                         ? "Only unverified user registrations can be deleted"
                         : "Only existing user accounts can be deleted");
               }
               if (options.pendingRegistrationOnly) {
                    const pendingNotification = await Notification.exists({
                         recipient_id: actorId,
                         actor_id: { $in: objectIds },
                         type: "user_registration_pending",
                    }).session(session);
                    if (!pendingNotification) throw new NotFound("Pending registration not found");
               }

               images = await imageModel.find({
                    user_id: { $in: objectIds },
               }).session(session).lean();
               const transfers = await Transfer.find({
                    $or: [
                         { sender_id: { $in: objectIds } },
                         { receiver_id: { $in: objectIds } },
                    ],
               }).select("_id").session(session).lean();
               const transactionIds = transfers.map(transfer => transfer._id);
               const transferDescriptions = users.flatMap(user => user.phone
                    ? [`Transfer to ${user.phone}`, `Transfer from ${user.phone}`]
                    : []);

               await verifyModel.deleteMany({ user_id: { $in: objectIds } }, { session });
               await forgotPassworModel.deleteMany({ user_id: { $in: objectIds } }, { session });
               await imageModel.deleteMany({ user_id: { $in: objectIds } }, { session });
               await Contact.deleteMany({
                    $or: [
                         { user_id: { $in: objectIds } },
                         { contact_user_id: { $in: objectIds } },
                    ],
               }, { session });
               await ContactRequest.deleteMany({
                    $or: [
                         { requester_id: { $in: objectIds } },
                         { recipient_id: { $in: objectIds } },
                    ],
               }, { session });
               await Message.deleteMany({
                    $or: [
                         { sender_id: { $in: objectIds } },
                         { receiver_id: { $in: objectIds } },
                    ],
               }, { session });
               await Notification.deleteMany({
                    $or: [
                         { recipient_id: { $in: objectIds } },
                         { actor_id: { $in: objectIds } },
                    ],
               }, { session });
               await Transfer.deleteMany({
                    $or: [
                         { sender_id: { $in: objectIds } },
                         { receiver_id: { $in: objectIds } },
                    ],
               }, { session });
               await Topup.deleteMany({ user_id: { $in: objectIds } }, { session });
               await historyModel.deleteMany({
                    $or: [
                         { user_id: { $in: objectIds } },
                         ...(transactionIds.length ? [{ transaction_id: { $in: transactionIds } }] : []),
                         ...(transferDescriptions.length
                              ? [{ type: "transfer", description: { $in: transferDescriptions } }]
                              : []),
                    ],
               }, { session });

               const deletedUsers = await userModel.deleteMany({
                    _id: { $in: objectIds },
                    role: "user",
               }, { session });
               if (deletedUsers.deletedCount !== objectIds.length) {
                    throw new Conflict("User accounts changed while deletion was in progress");
               }
          });
     } finally {
          await session.endSession();
     }

     const imageCleanup = await Promise.allSettled(images.flatMap(image => [
          ...(image.cloudinary_public_id
               ? [Promise.resolve().then(() => deleteCloudinaryImage(image.cloudinary_public_id))]
               : []),
          ...(image.file_id ? [Promise.resolve().then(() => deleteLegacyGridFSImage(image.file_id))] : []),
     ]));
     const failedImageCleanup = imageCleanup.filter(result => result.status === "rejected");
     failedImageCleanup.forEach(result => {
          console.error("Failed to remove profile image after user deletion:", result.reason);
     });
     return {
          deleted: users.length,
          imageCleanupFailed: failedImageCleanup.length > 0,
     };
}

async function deleteUser(req) {
     return deleteUsersByIds([req.params.user_id], req.user?._id);
}

async function deleteUsers(req) {
     return deleteUsersByIds(req.body?.userIds, req.user?._id);
}

async function deleteUnverifiedRegistration(req) {
     return deleteUsersByIds(
          [req.params.userId],
          req.user?._id,
          { pendingRegistrationOnly: true }
     );
}

async function cleanupExpiredRegistrations() {
     const expiredUsers = await userModel.find({
          role: "user",
          is_verified: false,
          unverified_expires_at: { $lte: new Date() },
     }).select("_id").sort({ unverified_expires_at: 1 }).limit(REGISTRATION_CLEANUP_BATCH_SIZE).lean();
     if (!expiredUsers.length) return 0;

     try {
          const result = await deleteUsersByIds(
               expiredUsers.map(user => String(user._id)),
               null,
               { expiredUnverifiedOnly: true }
          );
          return result.deleted;
     } catch (error) {
          if (error.status === 400) return 0;
          throw error;
     }
}

function scheduleRegistrationCleanup(delay = REGISTRATION_CLEANUP_INTERVAL_MS) {
     registrationCleanupTimer = setTimeout(async () => {
          registrationCleanupTimer = undefined;
          try {
               await cleanupExpiredRegistrations();
          } catch (error) {
               console.error("Could not clean up expired unverified registrations:", error);
          } finally {
               scheduleRegistrationCleanup();
          }
     }, delay);
     registrationCleanupTimer.unref?.();
}

async function startRegistrationCleanup() {
     if (registrationCleanupStarted) return registrationCleanupTimer;
     await userModel.collection.updateMany(
          {
               role: "user",
               is_verified: false,
               unverified_expires_at: null,
               createdAt: { $type: "date" },
          },
          [{
               $set: {
                    unverified_expires_at: {
                         $add: ["$createdAt", UNVERIFIED_ACCOUNT_LIFETIME_MS],
                    },
               },
          }]
     );
     await userModel.collection.createIndex(
          { role: 1, is_verified: 1, unverified_expires_at: 1 },
          { name: "unverified_registration_expiry" }
     );
     registrationCleanupStarted = true;
     scheduleRegistrationCleanup(0);
     return registrationCleanupTimer;
}


// ========== FORGOT-PASSWORD ========== //
async function forgotPasswordService(req) {
     const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
     const user = await userModel.findOne({ email }).select("_id email").lean();
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
     const { otp, password, confirmPassword } = req.body;
     const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
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
     const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
     if (typeof email !== "string" || !email) throw new BadRequest("Email is required");
     if (!validator.isEmail(email)) throw new BadRequest("Masukkan alamat email yang valid.");
     const user = await userModel.findById(req.user._id).select("_id email").lean();
     if (!user) throw new NotFound("User not found");
     const existingUser = await userModel.exists({ email, _id: { $ne: user._id } });
     if (existingUser) {
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
     const { otp } = req.body;
     const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
     const confirmEmail = typeof req.body?.confirmEmail === "string" ? req.body.confirmEmail.trim().toLowerCase() : "";
     const user = await userModel.findById(req.user._id);
     if (!user) throw new NotFound("User not found");
     if (!validator.isEmail(email) || email !== confirmEmail) {
          throw new BadRequest("Email confirmation does not match");
     }
     const existingUser = await userModel.exists({ email, _id: { $ne: user._id } });
     if (existingUser) {
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
     createPendingRegistrationNotification,
     serviceLogin,
     resendOtpService,
     verifyOtpService,
     getUserService,
     createUser,
     updateUser,
     deleteUser,
     deleteUsers,
     deleteUnverifiedRegistration,
     cleanupExpiredRegistrations,
     startRegistrationCleanup,
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