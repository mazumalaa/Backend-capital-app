const app = require("./app");
const { connectDB } = require("./app/db");

function safeDatabaseErrorMessage(error) {
  return String(error?.message || "Unknown database error")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi, "[MongoDB URI redacted]")
    .replace(/\b(password|passwd|pwd)\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]");
}

module.exports = async function handler(req, res) {
  try {
    await connectDB();
    return app(req, res);
  } catch (error) {
    console.error("Could not connect to MongoDB for this request.", {
      name: error.name,
      code: error.code,
      message: safeDatabaseErrorMessage(error),
    });
    return res.status(503).json({
      code: "503",
      status: "ERROR",
      message: "Database temporarily unavailable. Please try again.",
    });
  }
};
