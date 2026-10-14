// MIDDLEWARE ERROR...
async function errorMiddleware(err, req, res, next) {
     if (res.headersSent) return next(err);
     const status = err.code === "LIMIT_FILE_SIZE"
          ? 413
          : err.name === "MulterError"
               ? 400
               : err.code === 11000
                    ? 409
                    : err.status || 500;
     const message = status >= 500 ? "Internal server error" : err.message || "Request failed";
     if (status >= 500) console.error("Unhandled request error:", err);
     return res.status(status).json({
          code: `${status}`,
          message: message
     })
}

// EXPORTS...
module.exports = {errorMiddleware};