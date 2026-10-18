const {
  listUnreadCounts,
  getAdminContact,
  listAdminReports,
  getMessages,
  sendMessage,
  markConversationRead,
} = require("../../../services/chat");

async function getUnreadCountsController(req, res, next) {
  try {
    const unread = await listUnreadCounts(req);
    res.status(200).json({ code: "200", status: "OK", data: unread });
  } catch (error) {
    next(error);
  }
}

async function getMessagesController(req, res, next) {
  try {
    const messages = await getMessages(req);
    res.status(200).json({ code: "200", status: "OK", data: messages });
  } catch (error) {
    next(error);
  }
}

async function getAdminContactController(req, res, next) {
  try {
    const admin = await getAdminContact();
    res.status(200).json({ code: "200", status: "OK", data: admin });
  } catch (error) {
    next(error);
  }
}

async function listAdminReportsController(req, res, next) {
  try {
    const reports = await listAdminReports(req);
    res.status(200).json({
      code: "200",
      status: "OK",
      data: reports.reports,
      page: {
        total_page: Math.ceil(reports.total / reports.limit),
        total_items: reports.total,
        page: reports.page,
        limit: reports.limit,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function sendMessageController(req, res, next) {
  try {
    const message = await sendMessage(req);
    res.status(201).json({ code: "201", status: "OK", data: message });
  } catch (error) {
    next(error);
  }
}

async function markConversationReadController(req, res, next) {
  try {
    const result = await markConversationRead(req);
    res.status(200).json({ code: "200", status: "OK", data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUnreadCountsController,
  getAdminContactController,
  listAdminReportsController,
  getMessagesController,
  sendMessageController,
  markConversationReadController,
};
