const mongoose = require("mongoose");
const Notification = require("../api/v1/models/notification");
const ContactRequest = require("../api/v1/models/contactRequest");
const Contact = require("../api/v1/models/contact");
const User = require("../api/v1/models/users");
const { BadRequest } = require("../errors/badRequest");
const { NotFound } = require("../errors/notFound");

const MAX_BROADCAST_TITLE = 100;
const MAX_BROADCAST_BODY = 1000;
const MAX_NOTIFICATION_PAGE_SIZE = 100;
const BROADCAST_INSERT_BATCH_SIZE = 500;

function normalizeText(value, field, maximum) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequest(`${field} is required`);
  }
  const result = value.trim();
  if (result.length > maximum) {
    throw new BadRequest(`${field} cannot exceed ${maximum} characters`);
  }
  return result;
}

async function createBroadcast(req) {
  const title = normalizeText(req.body?.title, "Title", MAX_BROADCAST_TITLE);
  const body = normalizeText(req.body?.body, "Message", MAX_BROADCAST_BODY);
  const broadcastId = new mongoose.Types.ObjectId();
  const cursor = User.find({ role: "user" })
    .select("_id")
    .lean()
    .cursor({ batchSize: BROADCAST_INSERT_BATCH_SIZE });
  let batch = [];
  let recipients = 0;

  try {
    for await (const user of cursor) {
   batch.push({
     recipient_id: user._id,
     actor_id: req.user._id,
     broadcast_id: broadcastId,
     type: "admin_broadcast",
     title,
     body,
   });
   if (batch.length === BROADCAST_INSERT_BATCH_SIZE) {
     await Notification.insertMany(batch);
     recipients += batch.length;
     batch = [];
   }
    }
    if (batch.length) {
   await Notification.insertMany(batch);
   recipients += batch.length;
    }
  } finally {
    await cursor.close();
  }

  if (!recipients) return { recipients: 0 };
  return { broadcastId: String(broadcastId), recipients };
}

async function listBroadcastHistory(req) {
  return Notification.aggregate([
    {
      $match: {
        actor_id: req.user._id,
        type: "admin_broadcast",
      },
    },
    {
      $group: {
        _id: {
          $ifNull: [
            "$broadcast_id",
            { createdAt: "$createdAt", title: "$title", body: "$body" },
          ],
        },
        title: { $first: "$title" },
        body: { $first: "$body" },
        createdAt: { $first: "$createdAt" },
        recipients: { $sum: 1 },
      },
    },
    { $sort: { createdAt: -1, _id: -1 } },
    { $limit: MAX_NOTIFICATION_PAGE_SIZE },
  ]);
}

async function listNotifications(req) {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_NOTIFICATION_PAGE_SIZE, Math.max(1, requestedLimit))
    : 50;
  return Notification.find({ recipient_id: req.user._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .populate("actor_id", "username")
    .populate("contact_request_id", "status")
    .lean();
}

async function countUnreadNotifications(req) {
  return Notification.countDocuments({
    recipient_id: req.user._id,
    read_at: null,
  });
}

async function markNotificationRead(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.notificationId)) {
    throw new NotFound("Notification not found");
  }
  const notification = await Notification.findOneAndUpdate({
    _id: req.params.notificationId,
    recipient_id: req.user._id,
    read_at: null,
  }, {
    $set: { read_at: new Date() },
  }, {
    new: true,
  });
  if (!notification) {
    const existing = await Notification.exists({
      _id: req.params.notificationId,
      recipient_id: req.user._id,
    });
    if (!existing) throw new NotFound("Notification not found");
  }
  return { read: true };
}

async function markAllNotificationsRead(req) {
  const result = await Notification.updateMany({
    recipient_id: req.user._id,
    read_at: null,
  }, {
    $set: { read_at: new Date() },
  });
  return { updated: result.modifiedCount };
}

function parseRecipientId(value) {
  if (typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value)) {
    throw new BadRequest("Recipient is invalid");
  }
  return new mongoose.Types.ObjectId(value);
}

async function requestContact(req) {
  const recipientId = parseRecipientId(req.body?.recipientId);
  if (recipientId.equals(req.user._id)) {
    throw new BadRequest("You cannot request yourself as a contact");
  }
  const recipient = await User.findOne({
    _id: recipientId,
    role: "user",
    is_verified: true,
  }).select("_id username");
  if (!recipient) throw new NotFound("User not found");

  const existingContact = await Contact.exists({
    user_id: req.user._id,
    contact_user_id: recipient._id,
  });
  if (existingContact) throw new BadRequest("This user is already in your contacts");

  let contactRequest = await ContactRequest.findOne({
    requester_id: req.user._id,
    recipient_id: recipient._id,
  });
  if (contactRequest?.status === "pending") {
    throw new BadRequest("A contact request is already pending");
  }

  if (contactRequest) {
    await Notification.deleteMany({
      recipient_id: recipient._id,
      contact_request_id: contactRequest._id,
      type: "contact_request",
    });
    contactRequest.status = "pending";
    contactRequest.responded_at = null;
    await contactRequest.save();
  } else {
    contactRequest = await ContactRequest.create({
      requester_id: req.user._id,
      recipient_id: recipient._id,
    });
  }

  await Notification.create({
    recipient_id: recipient._id,
    actor_id: req.user._id,
    contact_request_id: contactRequest._id,
    type: "contact_request",
    title: "Permintaan kontak",
    body: `${req.user.username || "Pengguna"} ingin menyimpan nomor Anda sebagai kontak.`,
  });
  return contactRequest;
}

async function respondToContactRequest(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) {
    throw new NotFound("Contact request not found");
  }
  const decision = req.body?.decision;
  if (decision !== "accept" && decision !== "reject") {
    throw new BadRequest("Decision must be accept or reject");
  }

  const status = decision === "accept" ? "accepted" : "rejected";
  const request = await ContactRequest.findOneAndUpdate({
    _id: req.params.requestId,
    recipient_id: req.user._id,
    status: "pending",
  }, {
    $set: { status, responded_at: new Date() },
  }, {
    new: true,
  }).populate("requester_id", "username phone role");

  if (!request) {
    const existing = await ContactRequest.exists({
      _id: req.params.requestId,
      recipient_id: req.user._id,
    });
    if (!existing) throw new NotFound("Contact request not found");
    throw new BadRequest("This contact request has already been answered");
  }

  await Notification.updateMany({
    recipient_id: req.user._id,
    contact_request_id: request._id,
    read_at: null,
  }, {
    $set: { read_at: new Date() },
  });

  if (decision === "accept" && req.user.role === "user" && request.requester_id.role === "user") {
    await Contact.updateOne({
      user_id: request.requester_id._id,
      contact_user_id: req.user._id,
    }, {
      $setOnInsert: {
        user_id: request.requester_id._id,
        contact_user_id: req.user._id,
        alias: req.user.username || "",
      },
    }, {
      upsert: true,
    });
    await Contact.updateOne({
      user_id: req.user._id,
      contact_user_id: request.requester_id._id,
    }, {
      $setOnInsert: {
        user_id: req.user._id,
        contact_user_id: request.requester_id._id,
        alias: request.requester_id.username || "",
      },
    }, {
      upsert: true,
    });
  }

  await Notification.create({
    recipient_id: request.requester_id._id,
    actor_id: req.user._id,
    contact_request_id: request._id,
    type: "contact_request_result",
    title: decision === "accept" ? "Permintaan kontak diterima" : "Permintaan kontak ditolak",
    body: decision === "accept"
      ? `${req.user.username || "Pengguna"} menyetujui permintaan Anda. Kontak sudah ditambahkan.`
      : `${req.user.username || "Pengguna"} menolak permintaan kontak Anda.`,
  });
  return { status };
}

module.exports = {
  MAX_BROADCAST_TITLE,
  MAX_BROADCAST_BODY,
  normalizeText,
  createBroadcast,
  listBroadcastHistory,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  requestContact,
  respondToContactRequest,
};
