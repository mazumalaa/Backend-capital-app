// IMPORTS...
const jwt = require("jsonwebtoken");
const { JWT_SECRET_KEY } = require("../config");

function createToken(payload, expire = "1d") {
     if (!JWT_SECRET_KEY) throw new Error("JWT_SECRET_KEY is not configured");
     return jwt.sign(payload, JWT_SECRET_KEY, {expiresIn:expire})
};

function verifyToken(token) {
     if (!JWT_SECRET_KEY) throw new Error("JWT_SECRET_KEY is not configured");
     return jwt.verify(token, JWT_SECRET_KEY);
};

// EXPORTS...
module.exports = {createToken, verifyToken}