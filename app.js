// EXPRESS-GENERATOR-SET-UP...(IMPORT LIBRARIES)
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const helmet = require('helmet');
const app = express();

// CUSTOM...
const welcome = require("./app/api/v1/routes/welcome");
const { errorMiddleware } = require('./app/middleware/error');
const { notFoundMiddleware } = require('./app/middleware/notFound');
const user = require("./app/api/v1/routes/users")
const webhook = require('./app/api/v1/routes/webhook');
const transfer = require('./app/api/v1/routes/transfer');
const history = require('./app/api/v1/routes/history');
const topup = require('./app/api/v1/routes/topup');
const contact = require('./app/api/v1/routes/contact');
const baseURL = '/api/v1';

// EXPRESS-GENERATOR-SET-UP...(OTHER)
app.use(helmet());
app.use(logger(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// CUSTOM...(OTHER)
app.use(baseURL , welcome);
app.use(baseURL , user);
app.use(baseURL , contact);
app.use(baseURL , webhook);
app.use(baseURL , transfer);
app.use(baseURL , history);
app.use(baseURL , topup);
app.use(errorMiddleware);
app.use(notFoundMiddleware);

// EXPORT...
module.exports = app;
