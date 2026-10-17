// IMPORTS...
const router = require('express').Router();
const { authMiddleware, roleMiddleware, verifiedMiddleware } = require('../../../middleware/auth');
const { rateLimit } = require("express-rate-limit");
const {transfer, getContact, searchReceivers, getReceiver} = require('../controllers/transfer');
const transferRateLimit = rateLimit({
     windowMs: 15 * 60 * 1000,
     limit: 20,
     standardHeaders: "draft-8",
     legacyHeaders: false,
     message: { code: "429", message: "Too many transfer attempts. Try again later." },
});

router.get('/receiver/search', authMiddleware, roleMiddleware("user", "admin"), searchReceivers);
router.get('/receiver' , authMiddleware , roleMiddleware("user" , "admin") , getContact);
router.get("/receiver/photo" , authMiddleware , roleMiddleware("user" , "admin") , getReceiver)
router.post('/transfer', transferRateLimit, authMiddleware, verifiedMiddleware, roleMiddleware("user", "admin"), transfer);

// EXPORTS...
module.exports = router;