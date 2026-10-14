const midtransClient = require('midtrans-client');
const { MIDTRANS_SERVER_KEY, MIDTRANS_IS_PRODUCTION } = require('../config');

let snap = new midtransClient.Snap({
    isProduction: MIDTRANS_IS_PRODUCTION,
    serverKey: MIDTRANS_SERVER_KEY,
});

module.exports = snap;
