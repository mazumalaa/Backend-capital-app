const app = require("./app");
const { connectDB } = require("./app/db");

module.exports = async function handler(req, res) {
  try {
    await connectDB();
    return app(req, res);
  } catch (error) {
    console.error("Could not connect to MongoDB for this request.", {
      name: error.name,
      code: error.code,
    });
    return res.status(503).json({
      code: "503",
      status: "ERROR",
      message: "Database temporarily unavailable. Please try again.",
    });
  }
};
