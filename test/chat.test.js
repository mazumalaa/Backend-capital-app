const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const Contact = require("../app/api/v1/models/contact");
const Message = require("../app/api/v1/models/message");
const {
  MAX_MESSAGE_LENGTH,
  parseUserId,
  normalizeMessage,
  assertConversationAccess,
  listAdminReports,
} = require("../app/services/chat");

test("chat messages are trimmed, required, and length limited", () => {
  assert.equal(normalizeMessage("  Hai!  "), "Hai!");
  assert.throws(() => normalizeMessage("  "), { status: 400, message: "Message cannot be empty" });
  assert.throws(
    () => normalizeMessage("x".repeat(MAX_MESSAGE_LENGTH + 1)),
    { status: 400, message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters` }
  );
  assert.equal(normalizeMessage("x".repeat(MAX_MESSAGE_LENGTH)).length, MAX_MESSAGE_LENGTH);
});

test("chat does not disclose conversations for invalid participant identifiers", () => {
  assert.throws(() => parseUserId("not-an-object-id"), {
    status: 404,
    message: "Conversation not found",
  });
});

test("chat access requires a saved contact or an existing conversation", async () => {
  const originalContactExists = Contact.exists;
  const originalMessageExists = Message.exists;
  const userId = new mongoose.Types.ObjectId();
  const contactId = new mongoose.Types.ObjectId();

  try {
    Contact.exists = async () => null;
    Message.exists = async () => null;
    await assert.rejects(
      assertConversationAccess(userId, contactId),
      { status: 404, message: "Conversation not found" }
    );

    Message.exists = async query => {
      assert.equal(query.$or.length, 2);
      return { _id: new mongoose.Types.ObjectId() };
    };
    await assert.doesNotReject(assertConversationAccess(userId, contactId));

    Contact.exists = async query => {
      assert.equal(query.user_id, userId);
      assert.equal(query.contact_user_id, contactId);
      return { _id: new mongoose.Types.ObjectId() };
    };
    await assert.doesNotReject(assertConversationAccess(userId, contactId));
  } finally {
    Contact.exists = originalContactExists;
    Message.exists = originalMessageExists;
  }
});

test("users can open a new conversation with the admin without adding the admin as a contact", async () => {
  await assert.doesNotReject(
    assertConversationAccess(
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
      true
    )
  );
});

test("admin report inbox groups messages into conversations with latest message and unread count", async () => {
  const originalAggregate = Message.aggregate;
  const adminId = new mongoose.Types.ObjectId();
  let pipeline;
  const reports = [{ user: { username: "Ari" }, lastMessage: "Halo", unreadCount: 1 }];

  try {
    Message.aggregate = async value => {
      pipeline = value;
      return [{ reports, metadata: [{ total: 11 }] }];
    };
    assert.deepEqual(await listAdminReports({
      user: { _id: adminId },
      query: { page: "2", limit: "10" },
    }), { reports, page: 2, limit: 10, total: 11 });
    assert.equal(pipeline[0].$match.$or[1].receiver_id, adminId);
    assert.equal(pipeline[4].$lookup.from, "users");
    assert.deepEqual(pipeline.at(-1).$facet.reports, [{ $skip: 10 }, { $limit: 10 }]);

    await listAdminReports({ user: { _id: adminId }, query: {} });
    assert.deepEqual(pipeline.at(-1).$facet.reports, [{ $skip: 0 }, { $limit: 10 }]);

    await listAdminReports({ user: { _id: adminId }, query: { page: "3", limit: "500" } });
    assert.deepEqual(pipeline.at(-1).$facet.reports, [{ $skip: 200 }, { $limit: 100 }]);
  } finally {
    Message.aggregate = originalAggregate;
  }
});

test("chat report and conversation queries have supporting indexes", () => {
  const hasIndex = expected => Message.schema.indexes().some(([fields]) =>
    Object.entries(expected).every(([field, direction]) => fields[field] === direction)
  );

  assert.equal(hasIndex({ sender_id: 1, receiver_id: 1, createdAt: -1 }), true);
  assert.equal(hasIndex({ receiver_id: 1, sender_id: 1, createdAt: -1 }), true);
  assert.equal(hasIndex({ receiver_id: 1, read_at: 1, sender_id: 1 }), true);
  assert.equal(hasIndex({ sender_id: 1, createdAt: -1, _id: -1 }), true);
  assert.equal(hasIndex({ receiver_id: 1, createdAt: -1, _id: -1 }), true);
});
