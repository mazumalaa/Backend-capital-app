const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const Notification = require("../app/api/v1/models/notification");
const ContactRequest = require("../app/api/v1/models/contactRequest");
const Contact = require("../app/api/v1/models/contact");
const User = require("../app/api/v1/models/users");
const { NotFound } = require("../app/errors/notFound");
const {
  MAX_BROADCAST_TITLE,
  MAX_BROADCAST_BODY,
  normalizeText,
  createBroadcast,
  listBroadcastHistory,
  requestContact,
  respondToContactRequest,
} = require("../app/services/notifications");

test("notification titles and broadcast messages are trimmed and length limited", () => {
  assert.equal(normalizeText("  Pengumuman  ", "Title", MAX_BROADCAST_TITLE), "Pengumuman");
  assert.throws(() => normalizeText(" ", "Title", MAX_BROADCAST_TITLE), {
    status: 400,
    message: "Title is required",
  });
  assert.throws(() => normalizeText("x".repeat(MAX_BROADCAST_TITLE + 1), "Title", MAX_BROADCAST_TITLE), {
    status: 400,
    message: `Title cannot exceed ${MAX_BROADCAST_TITLE} characters`,
  });
  assert.throws(() => normalizeText("x".repeat(MAX_BROADCAST_BODY + 1), "Message", MAX_BROADCAST_BODY), {
    status: 400,
    message: `Message cannot exceed ${MAX_BROADCAST_BODY} characters`,
  });
});

test("admin broadcasts are stored for every user recipient", async () => {
  const originalFind = User.find;
  const originalInsertMany = Notification.insertMany;
  const users = Array.from({ length: 501 }, () => ({ _id: new mongoose.Types.ObjectId() }));
  const insertedBatches = [];
  let cursorClosed = false;

  try {
    User.find = query => {
      assert.deepEqual(query, { role: "user" });
      return {
        select(value) {
          assert.equal(value, "_id");
          return this;
        },
        lean() {
          return this;
        },
        cursor(options) {
          assert.deepEqual(options, { batchSize: 500 });
          return {
            async *[Symbol.asyncIterator]() {
              for (const user of users) yield user;
            },
            async close() {
              cursorClosed = true;
            },
          };
        },
      };
    };
    Notification.insertMany = async documents => {
      insertedBatches.push(documents);
      return documents;
    };
    const result = await createBroadcast({
      body: { title: "Maintenance", body: "Scheduled maintenance tonight." },
      user: { _id: new mongoose.Types.ObjectId() },
    });

    const inserted = insertedBatches.flat();
    assert.equal(result.recipients, users.length);
    assert.deepEqual(insertedBatches.map(batch => batch.length), [500, 1]);
    assert.deepEqual(inserted.map(item => item.recipient_id), users.map(user => user._id));
    assert.ok(inserted.every(item => item.type === "admin_broadcast"));
    assert.ok(inserted.every(item => item.broadcast_id.equals(inserted[0].broadcast_id)));
    assert.equal(cursorClosed, true);
  } finally {
    User.find = originalFind;
    Notification.insertMany = originalInsertMany;
  }
});

test("registration notifications are supported for the admin activity inbox", () => {
  const allowedTypes = Notification.schema.path("type").enumValues;
  assert.ok(allowedTypes.includes("user_registration_pending"));
  assert.ok(allowedTypes.includes("user_registered"));
});

test("contact request creation rejects self-requests and duplicate pending requests", async () => {
  const originalUserFindOne = User.findOne;
  const originalContactExists = Contact.exists;
  const originalRequestFindOne = ContactRequest.findOne;
  const userId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();
  const recipient = { _id: recipientId, username: "Rani" };
  const req = { user: { _id: userId, username: "Ari" }, body: { recipientId: String(recipientId) } };

  try {
    await assert.rejects(
      requestContact({ user: { _id: userId }, body: { recipientId: String(userId) } }),
      { status: 400, message: "You cannot request yourself as a contact" }
    );

    User.findOne = query => {
      assert.equal(query.is_verified, true);
      assert.equal(query.role, "user");
      return { select: async () => recipient };
    };
    Contact.exists = async () => null;
    ContactRequest.findOne = async () => ({ status: "pending" });
    await assert.rejects(
      requestContact(req),
      { status: 400, message: "A contact request is already pending" }
    );
  } finally {
    User.findOne = originalUserFindOne;
    Contact.exists = originalContactExists;
    ContactRequest.findOne = originalRequestFindOne;
  }
});

test("contact requests cannot target admin accounts", async () => {
  const originalFindOne = User.findOne;
  const recipientId = new mongoose.Types.ObjectId();
  let query;

  try {
    User.findOne = value => {
      query = value;
      return { select: async () => null };
    };
    await assert.rejects(
      requestContact({
        user: { _id: new mongoose.Types.ObjectId() },
        body: { recipientId: String(recipientId) },
      }),
      error => error instanceof NotFound && error.message === "User not found"
    );
    assert.deepEqual(query, {
      _id: recipientId,
      role: "user",
      is_verified: true,
    });
  } finally {
    User.findOne = originalFindOne;
  }
});

test("admin broadcast history only queries broadcasts created by the current admin", async () => {
  const originalAggregate = Notification.aggregate;
  const adminId = new mongoose.Types.ObjectId();
  let pipeline;
  const broadcasts = [{ _id: new mongoose.Types.ObjectId(), title: "Update", recipients: 4 }];

  try {
    Notification.aggregate = async query => {
      pipeline = query;
      return broadcasts;
    };
    const result = await listBroadcastHistory({ user: { _id: adminId } });

    assert.deepEqual(result, broadcasts);
    assert.deepEqual(pipeline[0].$match, {
      actor_id: adminId,
      type: "admin_broadcast",
    });
    assert.equal(pipeline.at(-1).$limit, 100);
  } finally {
    Notification.aggregate = originalAggregate;
  }
});

test("only the intended recipient can respond to a contact request", async () => {
  const originalFindOneAndUpdate = ContactRequest.findOneAndUpdate;
  const originalExists = ContactRequest.exists;
  const requestId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();

  try {
    ContactRequest.findOneAndUpdate = query => ({
      populate: async () => {
        assert.equal(query._id, String(requestId));
        assert.equal(query.recipient_id, recipientId);
        assert.equal(query.status, "pending");
        return null;
      },
    });
    ContactRequest.exists = async query => {
      assert.equal(query.recipient_id, recipientId);
      return null;
    };
    await assert.rejects(
      respondToContactRequest({
        params: { requestId: String(requestId) },
        body: { decision: "accept" },
        user: { _id: recipientId },
      }),
      error => error instanceof NotFound && error.message === "Contact request not found"
    );
  } finally {
    ContactRequest.findOneAndUpdate = originalFindOneAndUpdate;
    ContactRequest.exists = originalExists;
  }
});

test("accepting a request saves both users as contacts and notifies the requester", async () => {
  const originalFindOneAndUpdate = ContactRequest.findOneAndUpdate;
  const originalNotificationUpdateMany = Notification.updateMany;
  const originalContactUpdateOne = Contact.updateOne;
  const originalNotificationCreate = Notification.create;
  const requesterId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();
  const requestId = new mongoose.Types.ObjectId();
  const request = {
    _id: requestId,
    requester_id: { _id: requesterId, username: "Ari", phone: "081234567890", role: "user" },
  };
  const savedContacts = [];
  let resultNotification;

  try {
    ContactRequest.findOneAndUpdate = query => ({
      populate: async (path, fields) => {
        assert.equal(query.recipient_id, recipientId);
        assert.equal(query.status, "pending");
        assert.deepEqual([path, fields], ["requester_id", "username phone role"]);
        return request;
      },
    });
    Notification.updateMany = async () => ({ modifiedCount: 1 });
    Contact.updateOne = async (query, update, options) => {
      savedContacts.push({ query, update, options });
    };
    Notification.create = async document => {
      resultNotification = document;
    };

    const result = await respondToContactRequest({
      params: { requestId: String(requestId) },
      body: { decision: "accept" },
      user: { _id: recipientId, username: "Rani", role: "user" },
    });

    assert.deepEqual(result, { status: "accepted" });
    assert.equal(savedContacts.length, 2);
    assert.equal(savedContacts[0].query.user_id, requesterId);
    assert.equal(savedContacts[0].query.contact_user_id, recipientId);
    assert.equal(savedContacts[0].update.$setOnInsert.alias, "Rani");
    assert.equal(savedContacts[0].options.upsert, true);
    assert.equal(savedContacts[1].query.user_id, recipientId);
    assert.equal(savedContacts[1].query.contact_user_id, requesterId);
    assert.equal(savedContacts[1].update.$setOnInsert.alias, "Ari");
    assert.equal(savedContacts[1].options.upsert, true);
    assert.equal(resultNotification.recipient_id, requesterId);
    assert.equal(resultNotification.type, "contact_request_result");
    assert.match(resultNotification.body, /menyetujui/i);
  } finally {
    ContactRequest.findOneAndUpdate = originalFindOneAndUpdate;
    Notification.updateMany = originalNotificationUpdateMany;
    Contact.updateOne = originalContactUpdateOne;
    Notification.create = originalNotificationCreate;
  }
});

test("admin accounts are not added to either user's contacts from legacy requests", async () => {
  const originalFindOneAndUpdate = ContactRequest.findOneAndUpdate;
  const originalNotificationUpdateMany = Notification.updateMany;
  const originalContactUpdateOne = Contact.updateOne;
  const originalNotificationCreate = Notification.create;
  let contactWrites = 0;
  const requesterId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();

  try {
    ContactRequest.findOneAndUpdate = query => ({
      populate: async () => ({
        _id: new mongoose.Types.ObjectId(),
        requester_id: { _id: requesterId, username: "Ari", role: "user" },
      }),
    });
    Notification.updateMany = async () => ({ modifiedCount: 0 });
    Contact.updateOne = async () => {
      contactWrites += 1;
    };
    Notification.create = async () => ({});

    await respondToContactRequest({
      params: { requestId: String(new mongoose.Types.ObjectId()) },
      body: { decision: "accept" },
      user: { _id: adminId, username: "Admin", role: "admin" },
    });

    assert.equal(contactWrites, 0);
  } finally {
    ContactRequest.findOneAndUpdate = originalFindOneAndUpdate;
    Notification.updateMany = originalNotificationUpdateMany;
    Contact.updateOne = originalContactUpdateOne;
    Notification.create = originalNotificationCreate;
  }
});
