// IMPORTS...
const upload = require("../../../libs/multer");
const {
     authMiddleware,
     verificationAuthMiddleware,
     roleMiddleware,
} = require("../../../middleware/auth");
const { 
     register, 
     login, resendOTP, 
     verifyOTP, 
     forgotPassword, 
     resetPassword, 
     getProfile, 
     updatePin,
     emailOTP,
     updateEmail,
     getUsers,
     updateProfile,
     uploadPhoto,
     updatePhoto,
     getPhoto,
     confirmPin,
     pinConfirm,
     insertUser,
     editUser,
     removeUser,
     removeUsers,
     getImage
} = require("../controllers/users");
const router = require("express").Router();
const { rateLimit } = require("express-rate-limit");

const authRateLimit = (limit, message) => rateLimit({
     windowMs: 15 * 60 * 1000,
     limit,
     standardHeaders: "draft-8",
     legacyHeaders: false,
     message: { code: "429", message },
});

// ========== AUTH =========== //
router.post("/auth/register", authRateLimit(5, "Too many registration attempts. Try again later."), register);
router.post("/auth/login", authRateLimit(10, "Too many login attempts. Try again later."), login);
router.post("/auth/otp/send", authRateLimit(5, "Too many OTP requests. Try again later."), verificationAuthMiddleware, resendOTP);
router.post("/auth/otp/verify", authRateLimit(10, "Too many OTP attempts. Try again later."), verificationAuthMiddleware, verifyOTP);

// ========== USERS ========== //
router.get("/users" , authMiddleware , roleMiddleware("admin") , getUsers);
router.post("/user" , authMiddleware , roleMiddleware("admin") , insertUser);
router.put("/user/:user_id" , authMiddleware , roleMiddleware("admin") , editUser);
router.delete("/user/:user_id" , authMiddleware , roleMiddleware("admin") , removeUser);
router.delete("/users", authMiddleware, roleMiddleware("admin"), removeUsers);

// ========== EMAIL ========== // 
router.post("/profile/email/otp", authRateLimit(5, "Too many OTP requests. Try again later."), authMiddleware, roleMiddleware("admin", "user"), emailOTP);
router.put("/profile/email", authRateLimit(10, "Too many verification attempts. Try again later."), authMiddleware, roleMiddleware("admin", "user"), updateEmail);

// ========== PIN ========== //
router.post("/profile/pin/confirmation", authRateLimit(10, "Too many PIN attempts. Try again later."), authMiddleware, roleMiddleware("admin", "user"), pinConfirm);
router.put("/profile/pin", authRateLimit(10, "Too many PIN attempts. Try again later."), authMiddleware, roleMiddleware("admin", "user"), updatePin);

// ========= PHOTO ========= //
router.get("/images/:file_id", getImage);
router.get("/profile/photo" , authMiddleware , roleMiddleware("admin" , "user") , getPhoto);
router.post("/profile/photo" , authMiddleware , roleMiddleware("admin" , "user") , upload.single("photo") , uploadPhoto);
router.put("/profile/photo" , authMiddleware , roleMiddleware("admin" , "user") , upload.single("photo") , updatePhoto);

// ========== PROFILE ========== //
router.get("/profile", authMiddleware , roleMiddleware("admin" , "user") , getProfile);
router.put("/profile/:_id" , authMiddleware , roleMiddleware("admin" , "user") , updateProfile);

// ========== FORGOT-PASSWORD ========== //
router.post("/forgot/otp", authRateLimit(5, "Too many password reset requests. Try again later."), forgotPassword);
router.put("/forgot", authRateLimit(10, "Too many password reset attempts. Try again later."), resetPassword);

// EXPORTS...
module.exports = router;