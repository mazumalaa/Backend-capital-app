// IMPORTS...
const {
     serviceRegister,
     serviceLogin,
     resendOtpService,
     verifyOtpService,
     forgotPasswordService,
     resetPasswordService,
     getProfileService,
     updatePinService, 
     emailOTPservice,
     updateEmailService,
     getUserService,
     updateProfileService,
     uploadPhotoService,
     updatePhotoService,
     getPhotoService,
     confirmPin,
     createUser,
     updateUser,
     deleteUser,
     deleteUsers: deleteUsersService} = require("../../../services/users");
const mongoose = require("mongoose");
const { findImage, openImageDownload } = require("../../../libs/gridfs");
const { NotFound } = require("../../../errors/notFound");

function safeUser(user) {
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

// ========== AUTH ========= //
async function register(req, res, next) {
     try {
          const response = await serviceRegister(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "Registration successful",
               data: {
                    user: safeUser(response.newUser),
                    token: response.token,
                    emailRecipient: response.emailRecipient,
                    otpExpiresAt: response.otpExpiresAt,
               },
          })
     } catch (err) {
          next(err);
     }
}

async function login(req, res, next) {
     try {
          const response = await serviceLogin(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "Login successful",
               data: typeof response === "string" ? response : response.token,
               verificationRequired: response.verificationRequired === true,
               otpExpiresAt: response.otpExpiresAt || null,
               emailRecipient: response.emailRecipient || null,
          })
     } catch (err) {
          next(err);
     }
}

async function resendOTP(req, res, next) {
     try {
          const response = await resendOtpService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "Email provider accepted the OTP. Check this address's inbox and spam folder.",
               data: response,
          })
     } catch (err) {
          next(err);
     }
}

async function verifyOTP(req, res, next) {
     try {
          const response = await verifyOtpService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "user verification successful",
               data: response,
          })
     } catch (err) {
          next(err);
     }
}

// ========= USERS ========== //
async function getUsers(req, res, next) {
     try{
          const response = await getUserService(req);
          res.status(200).json({
               code:"200",
               status:"OK",
               data:response.users.map(safeUser),
               page:{
                    total_page:Math.ceil(response.total / response.limit),
                    total_items:response.total,
                    page:response.page,
                    limit:response.limit
               }
          })
     }catch(err){
          next(err);
     }
}

async function insertUser(req,res,next) {
     try {
          const response = await createUser(req);
          res.status(200).json({
               code:'200',
               status:"OK",
               message:"Success to create user",
               data:safeUser(response),
          });
     }catch(err){
          next(err);
     }
}
async function editUser(req,res,next) {
     try {
          const response = await updateUser(req);
          res.status(200).json({
               code:'200',
               status:"OK",
               message:"Success to update user",
               data:safeUser(response),
          });
     }catch(err){
          next(err);
     }
}
async function removeUser(req,res,next) {
     try {
          const response = await deleteUser(req);
          res.status(200).json({
               code:'200',
               status:"OK",
               message:"Success to delete user",
               data: response,
          });
     }catch(err){
          next(err);
     }
}

async function removeUsers(req, res, next) {
     try {
          const response = await deleteUsersService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "Users and related data deleted",
               data: response,
          });
     } catch (err) {
          next(err);
     }
}

// ========== FORGOT-PASSWORD ========== //
async function forgotPassword(req, res, next) {
     try {
          await forgotPasswordService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "OTP has been sent to your email",
          });
     } catch (err) {
          next(err);
     }
}

async function resetPassword(req, res, next) {
     try {
          await resetPasswordService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "Reset password successfuly",
          })
     } catch (err) {
          next(err);
     }
}

// ========== EMAIL ========== //
async function emailOTP(req,res,next) {
      try {
          const response = await emailOTPservice(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               data: response,
          })
     } catch (err) {
          next(err);
     }
}

async function  updateEmail(req,res,next) {
       try {
          const response = await updateEmailService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "success update email",
               data: safeUser(response),
          })
     } catch (err) {
          next(err);
     }
}

// ========== PROFILE ========== //
async function getProfile(req, res, next) {
     try {
          const response = await getProfileService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               data: safeUser(response),
          })
     } catch (err) {
          next(err);
     }
}

async function updateProfile(req,res,next) {
       try {
          const response = await updateProfileService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               data: safeUser(response),
          })
     } catch (err) {
          next(err);
     }
}

async function getPhoto(req,res,next) {
     try{
          const response = await getPhotoService(req);
          res.status(200).json({
               code:"200",
               status:"OK",
               data:response,
          })
     }catch(err){
          next(err)
     }
}

async function getImage(req, res, next) {
     try {
          if (!mongoose.Types.ObjectId.isValid(req.params.file_id)) {
               throw new NotFound("Image not found");
          }
          const file = await findImage(req.params.file_id);
          if (!file) throw new NotFound("Image not found");

          res.set("Content-Type", file.contentType || "application/octet-stream");
          res.set("Content-Length", String(file.length));
          res.set("Cache-Control", "public, max-age=86400");
          const download = openImageDownload(req.params.file_id);
          download.on("error", error => {
               if (res.headersSent) res.destroy(error);
               else next(error);
          });
          download.pipe(res);
     } catch (err) {
          next(err);
     }
}

async function uploadPhoto(req,res,next) {
     try {
          const response = await uploadPhotoService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               data: response,
               url: response.url,
          })
     } catch (err) {
          next(err);
     }
}

async function updatePhoto(req,res,next) {
     try {
          const response = await updatePhotoService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message:"Update photo successfully",
               data: response,
               url: response.url,
          })
     } catch (err) {
          next(err);
     }
}

// ========== PIN ========== //
async function pinOTP(req,res,next) {
     try {
          const response = await emailOTPservice(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "OTP has been sent to your email",
               data: response,
          })
     } catch (err) {
          next(err);
     }
}

async function pinConfirm(req, res, next) {
     try {
          await confirmPin(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message:"Confirmation success"
          })
     } catch (err) {
          next(err);
     }
}

async function updatePin(req, res, next) {
     try {
          const response = await updatePinService(req);
          res.status(200).json({
               code: "200",
               status: "OK",
               message: "success update pin",
               data: response,
          })
     } catch (err) {
          next(err);
     }
}

// EXPORTS...
module.exports = {
     register,
     login,
     resendOTP,
     verifyOTP,
     getUsers,
     insertUser,
     editUser,
     removeUser,
     removeUsers,
     forgotPassword,
     resetPassword,
     updatePin,
     getProfile,
     updateProfile,
     emailOTP,
     updateEmail,
     uploadPhoto,
     pinConfirm,
     updatePhoto,
     getPhoto,
     getImage,
};