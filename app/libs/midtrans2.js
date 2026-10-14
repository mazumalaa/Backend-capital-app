// ✅ Ini yang BENAR untuk handle webhook dari Midtrans
const midtransClient = require('midtrans-client');
const { MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY, MIDTRANS_IS_PRODUCTION } = require('../config');

let coreApi = new midtransClient.CoreApi({
    isProduction: MIDTRANS_IS_PRODUCTION,
    serverKey: MIDTRANS_SERVER_KEY,
    clientKey: MIDTRANS_CLIENT_KEY,
});

module.exports = coreApi;
