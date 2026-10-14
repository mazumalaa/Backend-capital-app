// IMPORTS...
const { Unauthorized } = require("../errors/unauthorized");
const { verifyToken } = require("../libs/jwt");
const userModel = require("../api/v1/models/users");
const { Forbidden } = require("../errors/forbidden");
const { BadRequest } = require("../errors/badRequest");

async function authMiddleware(req, res, next) {
     try {
          const { authorization } = req.headers;
          const [scheme, credentials] = (authorization || "").split(" ");
          if (scheme !== "Bearer" || !credentials) {
               throw new Unauthorized("Invalid authentication");
          }
          const token = await verifyToken(credentials);
          const user = await userModel.findById(token._id);
          if (!user) throw new Unauthorized("User not found");
          if ((token.tokenVersion || 0) !== (user.token_version || 0)) {
               throw new Unauthorized("Session expired. Please sign in again.");
          }
          req.user = user;
          return next();
     } catch (err) {
          return next(err);
     }
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

module.exports = { authMiddleware, roleMiddleware, verifiedMiddleware };