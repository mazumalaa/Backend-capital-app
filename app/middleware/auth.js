// IMPORTS...
const { Unauthorized } = require("../errors/unauthorized");
const { verifyToken } = require("../libs/jwt");
const userModel = require("../api/v1/models/users");
const { Forbidden } = require("../errors/forbidden");

async function authenticate(req, next, allowVerificationToken) {
     try {
          const { authorization } = req.headers;
          const [scheme, credentials] = (authorization || "").split(" ");
          if (scheme !== "Bearer" || !credentials) {
               throw new Unauthorized("Invalid authentication");
          }
          const token = await verifyToken(credentials);
          const isVerificationToken = token.purpose === "email_verification";
          if (token.purpose && !isVerificationToken) {
               throw new Unauthorized("Invalid authentication");
          }
          if (isVerificationToken && !allowVerificationToken) {
               throw new Unauthorized("Verification session cannot access this feature");
          }
          if (allowVerificationToken && !isVerificationToken) {
               throw new Unauthorized("Email verification session is required");
          }
          const userQuery = userModel.findById(token._id);
          if (allowVerificationToken) userQuery.select("+unverified_expires_at");
          const user = await userQuery;
          if (!user) throw new Unauthorized("User not found");
          if ((token.tokenVersion || 0) !== (user.token_version || 0)) {
               throw new Unauthorized("Session expired. Please sign in again.");
          }
          if (!allowVerificationToken && !user.is_verified) {
               throw new Unauthorized("Verify your email before using this feature");
          }
          if (allowVerificationToken && (
               user.role !== "user"
               || user.is_verified
               || !user.unverified_expires_at
               || user.unverified_expires_at <= new Date()
          )) {
               throw new Unauthorized("Registration expired. Please register again");
          }
          req.user = user;
          return next();
     } catch (err) {
          return next(err);
     }
}

function authMiddleware(req, res, next) {
     return authenticate(req, next, false);
}

function verificationAuthMiddleware(req, res, next) {
     return authenticate(req, next, true);
}

function roleMiddleware(...role) {
     return async function(req,res,next) {
          try{
               if(!role.includes(req.user?.role || '')) throw new Forbidden("Access denied");
               return next();
          }catch(err){
               return next(err);
          }
     }
}

function verifiedMiddleware(req, res, next) {
     if (!req.user?.is_verified) {
          return next(new Forbidden("Verify your email before using this feature"));
     }
     return next();
}

module.exports = {
     authMiddleware,
     verificationAuthMiddleware,
     roleMiddleware,
     verifiedMiddleware,
};