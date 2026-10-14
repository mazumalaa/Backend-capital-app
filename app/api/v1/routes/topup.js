// IMPORTS...
const router = require('express').Router();
const { authMiddleware, roleMiddleware, verifiedMiddleware } = require('../../../middleware/auth');
const { rateLimit } = require("express-rate-limit");
const { topup, syncTopup } = require('../controllers/topup');
const transactionRateLimit = rateLimit({
     windowMs: 15 * 60 * 1000,
     limit: 20,
     standardHeaders: "draft-8",
     legacyHeaders: false,
     message: { code: "429", message: "Too many payment attempts. Try again later." },
});

router.post('/topup', transactionRateLimit, authMiddleware, verifiedMiddleware, roleMiddleware("user", "admin"), topup);
router.post('/topup/:order_id/sync', transactionRateLimit, authMiddleware, verifiedMiddleware, roleMiddleware("user", "admin"), syncTopup);

// EXPORTS...
module.exports = router;