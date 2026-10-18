const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const User = require("../app/api/v1/models/users");
const History = require("../app/api/v1/models/history");
const Contact = require("../app/api/v1/models/contact");
const ContactRequest = require("../app/api/v1/models/contactRequest");
const Message = require("../app/api/v1/models/message");
const Notification = require("../app/api/v1/models/notification");
const Transfer = require("../app/api/v1/models/transafer");
const Topup = require("../app/api/v1/models/topup");
const Verification = require("../app/api/v1/models/verify");
const ForgotPassword = require("../app/api/v1/models/forgotPassword");
const Image = require("../app/api/v1/models/image");
const { deleteUsers, deleteUnverifiedRegistration } = require("../app/services/users");
const { deleteHistories } = require("../app/services/history");

test("bulk user deletion atomically removes related records without changing other user balances", async () => {
  const userId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const transferId = new mongoose.Types.ObjectId();
  const originalStartSession = mongoose.startSession;
  const originalUserFind = User.find;
  const originalImageFind = Image.find;
  const originalTransferFind = Transfer.find;
  const models = [
    User,
    History,
    Contact,
    ContactRequest,
    Message,
    Notification,
    Transfer,
    Topup,
    Verification,
    ForgotPassword,
    Image,
  ];
  const originalDeleteMany = new Map(models.map(model => [model, model.deleteMany]));
  const calls = [];
  const session = {
    withTransaction: async callback => callback(),
    endSession: async () => {},
  };

  try {
    mongoose.startSession = async () => session;
    User.find = () => ({
      select() { return this; },
      session() { return this; },
      lean: async () => [{ _id: userId, phone: "081234567890" }],
    });
    Image.find = () => ({
      session() { return this; },
      lean: async () => [],
    });
    Transfer.find = () => ({
      select() { return this; },
      session() { return this; },
      lean: async () => [{ _id: transferId }],
    });
    for (const model of models) {
      model.deleteMany = async (filter, options) => {
        calls.push({ model: model.modelName, filter, options });
        return { deletedCount: model === User ? 1 : 0 };
      };
    }

    const result = await deleteUsers({
      body: { userIds: [String(userId)] },
      user: { _id: adminId },
    });

    assert.deepEqual(result, { deleted: 1, imageCleanupFailed: false });
    assert.ok(calls.some(call => call.model === "Contact"));
    assert.ok(calls.some(call => call.model === "ContactRequest"));
    assert.ok(calls.some(call => call.model === "Message"));
    assert.ok(calls.some(call => call.model === "Notification"));
    assert.ok(calls.some(call => call.model === "Transfer"));
    assert.ok(calls.some(call => call.model === "Topup"));
    const historyDeletion = calls.find(call => call.model === "History");
    assert.ok(historyDeletion.filter.$or.some(condition =>
      condition.transaction_id?.$in?.some(id => id.equals(transferId))
    ));
    assert.ok(historyDeletion.filter.$or.some(condition =>
      condition.description?.$in?.includes("Transfer from 081234567890")
    ));
    assert.ok(calls.every(call => call.options.session === session));
  } finally {
    mongoose.startSession = originalStartSession;
    User.find = originalUserFind;
    Image.find = originalImageFind;
    Transfer.find = originalTransferFind;
    for (const model of models) {
      model.deleteMany = originalDeleteMany.get(model);
    }
  }
});

test("bulk user deletion rejects self-deletion before opening a database transaction", async () => {
  const originalStartSession = mongoose.startSession;
  mongoose.startSession = async () => {
    throw new Error("A transaction should not start");
  };

  try {
    await assert.rejects(
      deleteUsers({
        body: { userIds: ["507f1f77bcf86cd799439011"] },
        user: { _id: "507f1f77bcf86cd799439011" },
      }),
      { status: 400, message: "You cannot delete your own account" }
    );
  } finally {
    mongoose.startSession = originalStartSession;
  }
});

test("notification deletion is restricted to a pending unverified registration", async () => {
  const userId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const originalStartSession = mongoose.startSession;
  const originalUserFind = User.find;
  const originalNotificationExists = Notification.exists;
  const session = {
    withTransaction: async callback => callback(),
    endSession: async () => {},
  };
  let filter;

  try {
    mongoose.startSession = async () => session;
    User.find = query => {
      filter = query;
      return {
        select() { return this; },
        session() { return this; },
        lean: async () => [{ _id: userId, phone: "081234567890" }],
      };
    };
    Notification.exists = query => {
      assert.equal(query.recipient_id, adminId);
      assert.ok(query.actor_id.$in[0].equals(userId));
      assert.equal(query.type, "user_registration_pending");
      return { session: async () => null };
    };

    await assert.rejects(
      deleteUnverifiedRegistration({
        params: { userId: String(userId) },
        user: { _id: adminId },
      }),
      { status: 404, message: "Pending registration not found" }
    );
    assert.equal(filter.is_verified, false);
    assert.ok(filter._id.$in[0].equals(userId));
  } finally {
    mongoose.startSession = originalStartSession;
    User.find = originalUserFind;
    Notification.exists = originalNotificationExists;
  }
});

test("bulk history deletion validates IDs and deletes only selected history items", async () => {
  const historyId = new mongoose.Types.ObjectId();
  const originalDeleteMany = History.deleteMany;
  let query;

  try {
    History.deleteMany = async filter => {
      query = filter;
      return { deletedCount: 1 };
    };
    const result = await deleteHistories({ body: { historyIds: [String(historyId)] } });
    assert.deepEqual(result, { deleted: 1 });
    assert.ok(query._id.$in[0].equals(historyId));
    await assert.rejects(
      deleteHistories({ body: { historyIds: ["not-an-object-id"] } }),
      { status: 400, message: "One or more history IDs are invalid" }
    );
  } finally {
    History.deleteMany = originalDeleteMany;
  }
});
