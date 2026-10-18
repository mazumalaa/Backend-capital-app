const express = require("express");
const { rateLimit } = require("express-rate-limit");
const {
  createBroadcastController,
  listNotificationsController,
  listBroadcastHistoryController,
  countUnreadNotificationsController,
  deleteUnverifiedRegistrationController,
  markNotificationReadController,
  markAllNotificationsReadController,
  requestContactController,
  respondToContactRequestController,
} = require("../controllers/notifications");
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
const authenticated = [
  authMiddleware,
  verifiedMiddleware,
  roleMiddleware("user", "admin"),
];
const userAccess = [
  authMiddleware,
  verifiedMiddleware,
  roleMiddleware("user"),
];
const notificationAccess = [
  authMiddleware,
  verifiedMiddleware,
  roleMiddleware("user", "admin"),
];
const adminAccess = [
  authMiddleware,
  verifiedMiddleware,
  roleMiddleware("admin"),
];
const broadcastRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { code: "429", message: "Terlalu banyak notifikasi. Coba lagi nanti." },
});
const contactRequestRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { code: "429", message: "Terlalu banyak permintaan kontak. Coba lagi nanti." },
});

router.get("/notifications", ...authenticated, listNotificationsController);
router.get("/notifications/unread", noStore, ...authenticated, countUnreadNotificationsController);
router.get("/notifications/broadcasts", ...adminAccess, listBroadcastHistoryController);
router.delete("/notifications/registrations/:userId", ...adminAccess, deleteUnverifiedRegistrationController);
router.put("/notifications/read-all", ...authenticated, markAllNotificationsReadController);
router.put("/notifications/:notificationId/read", ...authenticated, markNotificationReadController);
router.post("/notifications/broadcast", ...adminAccess, broadcastRateLimit, createBroadcastController);
router.post("/contact-requests", ...userAccess, contactRequestRateLimit, requestContactController);
router.post("/contact-requests/:requestId/respond", ...notificationAccess, respondToContactRequestController);

module.exports = router;
