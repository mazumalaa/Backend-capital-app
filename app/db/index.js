// IMPORTS...
const mongoose = require("mongoose");
const { DB_CONNECTION } = require("../config");

let connectionPromise;

mongoose.connection.on("disconnected", () => {
  connectionPromise = undefined;
});

async function connectDB() {
  if (!DB_CONNECTION) {
    throw new Error("DB_CONNECTION is missing. Configure it in the deployment environment.");
  }

  if (mongoose.connection.readyState === 1) return;

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(DB_CONNECTION, {
      serverSelectionTimeoutMS: 10000,
    }).then(() => {
      console.log("Connected to MongoDB");
    }).catch(error => {
      connectionPromise = undefined;
      throw error;
    });
  }

  await connectionPromise;
}

// EXPORT...
module.exports = { connectDB };
