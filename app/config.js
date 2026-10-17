// IMPORT...
const dotenv = require("dotenv");
dotenv.config();

// EEXPORT...
module.exports = {
     PORT:process.env.PORT,
     JWT_SECRET_KEY:process.env.JWT_SECRET_KEY,
     EMAIL:process.env.EMAIL,
     DB_CONNECTION:process.env.DB_CONNECTION,
     DB_NAME:"capital",
     GOOGLE_APP_PASSWORD:process.env.GOOGLE_APP_PASSWORD,
     MIDTRANS_SERVER_KEY:process.env.MIDTRANS_SERVER_KEY,
     MIDTRANS_CLIENT_KEY:process.env.MIDTRANS_CLIENT_KEY,
     MIDTRANS_IS_PRODUCTION:process.env.MIDTRANS_IS_PRODUCTION === "true",
     CLOUDINARY_CLOUD_NAME:process.env.CLOUDINARY_CLOUD_NAME,
     CLOUDINARY_API_KEY:process.env.CLOUDINARY_API_KEY,
     CLOUDINARY_API_SECRET:process.env.CLOUDINARY_API_SECRET,
}