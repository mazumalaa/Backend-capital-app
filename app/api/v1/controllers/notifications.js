const {
  createBroadcast,
  listBroadcastHistory,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  requestContact,
  respondToContactRequest,
} = require("../../../services/notifications");
const { deleteUnverifiedRegistration } = require("../../../services/users");

async function createBroadcastController(req, res, next) {
  try {
    const result = await createBroadcast(req);
    res.status(201).json({ code: "201", status: "OK", data: result });
  } catch (error) {
    next(error);
  }
}

async function listNotificationsController(req, res, next) {
  try {
    const notifications = await listNotifications(req);
    res.status(200).json({ code: "200", status: "OK", data: notifications });
  } catch (error) {
    next(error);
  }
}

async function listBroadcastHistoryController(req, res, next) {
  try {
    const broadcasts = await listBroadcastHistory(req);
    res.status(200).json({ code: "200", status: "OK", data: broadcasts });
  } catch (error) {
    next(error);
  }
}

async function countUnreadNotificationsController(req, res, next) {
  try {
    const count = await countUnreadNotifications(req);
    res.status(200).json({ code: "200", status: "OK", data: { count } });
  } catch (error) {
    next(error);
  }
}

async function markNotificationReadController(req, res, next) {
  try {
    const result = await markNotificationRead(req);
    res.status(200).json({ code: "200", status: "OK", data: result });
  } catch (error) {
    next(error);
  }
}

async function markAllNotificationsReadController(req, res, next) {
  try {
    const result = await markAllNotificationsRead(req);
    res.status(200).json({ code: "200", status: "OK", data: result });
  } catch (error) {
    next(error);
  }
}

async function deleteUnverifiedRegistrationController(req, res, next) {
  try {
    const result = await deleteUnverifiedRegistration(req);
    res.status(200).json({
      code: "200",
      status: "OK",
      message: "Unverified registration deleted",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function requestContactController(req, res, next) {
  try {
    const contactRequest = await requestContact(req);
    res.status(201).json({ code: "201", status: "OK", data: contactRequest });
  } catch (error) {
    next(error);
  }
}

async function respondToContactRequestController(req, res, next) {
  try {
    const result = await respondToContactRequest(req);
    res.status(200).json({ code: "200", status: "OK", data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createBroadcastController,
  listNotificationsController,
  listBroadcastHistoryController,
  countUnreadNotificationsController,
  markNotificationReadController,
  markAllNotificationsReadController,
  deleteUnverifiedRegistrationController,
  requestContactController,
  respondToContactRequestController,
};
