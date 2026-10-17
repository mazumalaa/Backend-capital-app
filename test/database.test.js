const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");

process.env.DB_CONNECTION = "mongodb://127.0.0.1:27017/test";

const { connectDB } = require("../app/db");

test("MongoDB connection selects the Capital database explicitly", async () => {
     const originalConnect = mongoose.connect;
     let connectionOptions;

     mongoose.connect = async (_connectionString, options) => {
          connectionOptions = options;
          return mongoose;
     };

     try {
          await connectDB();
          assert.equal(connectionOptions.dbName, "capital");
     } finally {
          mongoose.connect = originalConnect;
     }
});
