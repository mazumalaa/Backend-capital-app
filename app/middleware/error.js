// MIDDLEWARE ERROR...
const { passwordRequirementsMessage } = require("../libs/passwordPolicy");

async function errorMiddleware(err, req, res, next) {
     if (res.headersSent) return next(err);
     const isDuplicateKey = err.code === 11000;
     const isValidationError = err.name === "ValidationError";
     let status = err.status || 500;
     if (isValidationError) status = 400;
     else if (isDuplicateKey) status = 409;
     else if (err.code === "LIMIT_FILE_SIZE") status = 413;
     else if (err.name === "MulterError") status = 400;

     const validationMessages = new Set();
     for (const path of Object.keys(err.errors || {})) {
          if (path === "password") {
               validationMessages.add(passwordRequirementsMessage);
          } else if (path === "email") {
               validationMessages.add("Masukkan alamat email yang valid.");
          } else if (path === "phone") {
               validationMessages.add("Masukkan nomor telepon Indonesia yang valid.");
          } else {
               validationMessages.add("Periksa kembali data yang Anda masukkan.");
          }
     }
     const message = status >= 500
          ? "Layanan sedang mengalami gangguan. Silakan coba beberapa saat lagi."
          : isDuplicateKey
               ? "Email atau nomor telepon sudah terdaftar."
               : isValidationError
                    ? [...validationMessages].join(" ") || "Periksa kembali data yang Anda masukkan."
                    : err.message || "Permintaan tidak dapat diproses.";
     if (status >= 500) console.error("Unhandled request error:", err);
     return res.status(status).json({
          code: `${status}`,
          message,
     });
}

// EXPORTS...
module.exports = {errorMiddleware};