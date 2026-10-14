// IMPORTS...
const router = require('express').Router();
const { handleWebhook } = require('../controllers/webhook');

router.post('/webhook' , handleWebhook);

// EXPORTS...
module.exports =  router;