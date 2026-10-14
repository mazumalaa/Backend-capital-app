// IMPORTS...
const mongoose = require("mongoose");
const { DB_CONNECTION } = require("../config");

async function connectDB() {
  if (!DB_CONNECTION) {
    throw new Error("DB_CONNECTION is missing. Check the backend .env file.");
  }

  await mongoose.connect(DB_CONNECTION, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log("Connected to MongoDB");
}

// EXPORT...
module.exports = { connectDB };
