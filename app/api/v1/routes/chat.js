const express = require("express");
const { rateLimit } = require("express-rate-limit");
const {
  getUnreadCountsController,
  getAdminContactController,
  listAdminReportsController,
  getMessagesController,
  sendMessageController,
  markConversationReadController,
} = require("../controllers/chat");
const {
  authMiddleware,
  roleMiddleware,
  verifiedMiddleware,
} = require("../../../middleware/auth");

const router = express.Router();
const noStore = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  next();
};
const chatAccess = [
  authMiddleware,
  verifiedMiddleware,
  roleMiddleware("user", "admin"),
];
const userChatAccess = [
  authMiddleware,
  verifiedMiddleware,
  roleMiddleware("user"),
];
const adminChatAccess = [
  authMiddleware,
  verifiedMiddleware,
  roleMiddleware("admin"),
];
const sendMessageRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { code: "429", message: "Terlalu banyak pesan. Coba lagi beberapa saat." },
});

router.get("/chat/admin", ...userChatAccess, getAdminContactController);
router.get("/chat/reports", noStore, ...adminChatAccess, listAdminReportsController);
router.get("/chat/unread", noStore, ...chatAccess, getUnreadCountsController);
router.get("/chat/:contactId", noStore, ...chatAccess, getMessagesController);
router.put("/chat/:contactId/read", ...chatAccess, markConversationReadController);
router.post("/chat/:contactId", ...chatAccess, sendMessageRateLimit, sendMessageController);

module.exports = router;
