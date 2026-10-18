const mongoose = require("mongoose");
const Message = require("../api/v1/models/message");
const Contact = require("../api/v1/models/contact");
const User = require("../api/v1/models/users");
const { BadRequest } = require("../errors/badRequest");
const { NotFound } = require("../errors/notFound");

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseUserId(value) {
  if (typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value)) {
    throw new NotFound("Conversation not found");
  }
  return new mongoose.Types.ObjectId(value);
}

function normalizeMessage(value) {
  if (typeof value !== "string") {
    throw new BadRequest("Message text is required");
  }
  const text = value.trim();
  if (!text) throw new BadRequest("Message cannot be empty");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequest(`Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`);
  }
  return text;
}

async function findChatPartner(req) {
  const partnerId = parseUserId(req.params.contactId);
  if (partnerId.equals(req.user._id)) {
    throw new NotFound("Conversation not found");
  }
  const partner = await User.findOne({
    _id: partnerId,
    is_verified: true,
  }).select("_id username phone role");
  if (!partner) throw new NotFound("Conversation not found");
  return partner;
}

async function assertConversationAccess(userId, partnerId, allowNewAdminChat = false) {
  if (allowNewAdminChat) return;

  const isContact = await Contact.exists({
    user_id: userId,
    contact_user_id: partnerId,
  });
  if (isContact) return;

  const hasConversation = await Message.exists({
    $or: [
      { sender_id: userId, receiver_id: partnerId },
      { sender_id: partnerId, receiver_id: userId },
    ],
  });
  if (!hasConversation) throw new NotFound("Conversation not found");
}

async function getAdminContact() {
  const admin = await User.findOne({
    role: "admin",
    is_verified: true,
  }).select("_id username phone");
  if (!admin) throw new NotFound("Admin is not available");
  return admin;
}

async function listAdminReports(req) {
  const requestedPage = Number.parseInt(req.query?.page, 10);
  const requestedLimit = Number.parseInt(req.query?.limit, 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedLimit))
    : 10;
  const [result] = await Message.aggregate([
    {
      $match: {
        $or: [
          { sender_id: req.user._id, receiver_id: { $ne: req.user._id } },
          { receiver_id: req.user._id, sender_id: { $ne: req.user._id } },
        ],
      },
    },
    {
      $addFields: {
        partner_id: {
          $cond: [
            { $eq: ["$sender_id", req.user._id] },
            "$receiver_id",
            "$sender_id",
          ],
        },
      },
    },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: "$partner_id",
        lastMessage: { $first: "$text" },
        lastMessageAt: { $first: "$createdAt" },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$receiver_id", req.user._id] },
                  { $eq: ["$read_at", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    { $match: { "user.role": "user", "user.is_verified": true } },
    { $sort: { lastMessageAt: -1, _id: 1 } },
    {
      $project: {
        _id: 0,
        user: {
          _id: "$user._id",
          username: "$user.username",
          phone: "$user.phone",
        },
        lastMessage: 1,
        lastMessageAt: 1,
        unreadCount: 1,
      },
    },
    {
      $facet: {
        reports: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
        ],
        metadata: [{ $count: "total" }],
      },
    },
  ]);
  const total = result?.metadata?.[0]?.total || 0;
  return {
    reports: result?.reports || [],
    page,
    limit,
    total,
  };
}

async function listUnreadCounts(req) {
  const unread = await Message.aggregate([
    { $match: { receiver_id: req.user._id, read_at: null } },
    { $group: { _id: "$sender_id", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(unread.map(item => [String(item._id), item.count]));
}

async function getMessages(req) {
  const partner = await findChatPartner(req);
  await assertConversationAccess(
    req.user._id,
    partner._id,
    req.user.role === "user" && partner.role === "admin"
  );

  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedLimit))
    : DEFAULT_PAGE_SIZE;
  const filter = {
    $or: [
      { sender_id: req.user._id, receiver_id: partner._id },
      { sender_id: partner._id, receiver_id: req.user._id },
    ],
  };

  if (req.query.before) {
    const before = new Date(req.query.before);
    if (Number.isNaN(before.getTime())) {
      throw new BadRequest("Message cursor is invalid");
    }
    filter.createdAt = { $lt: before };
  }

  const messages = await Message.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean();
  return messages.reverse();
}

async function sendMessage(req) {
  const partner = await findChatPartner(req);
  const text = normalizeMessage(req.body?.text);
  await assertConversationAccess(
    req.user._id,
    partner._id,
    req.user.role === "user" && partner.role === "admin"
  );

  return Message.create({
    sender_id: req.user._id,
    receiver_id: partner._id,
    text,
  });
}

async function markConversationRead(req) {
  const partner = await findChatPartner(req);
  await assertConversationAccess(
    req.user._id,
    partner._id,
    req.user.role === "user" && partner.role === "admin"
  );
  const result = await Message.updateMany({
    sender_id: partner._id,
    receiver_id: req.user._id,
    read_at: null,
  }, {
    $set: { read_at: new Date() },
  });
  return { updated: result.modifiedCount };
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  parseUserId,
  normalizeMessage,
  assertConversationAccess,
  listUnreadCounts,
  getAdminContact,
  listAdminReports,
  getMessages,
  sendMessage,
  markConversationRead,
};
