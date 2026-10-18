const assert = require("node:assert/strict");
const { test } = require("node:test");
const User = require("../app/api/v1/models/users");
const History = require("../app/api/v1/models/history");
const Contact = require("../app/api/v1/models/contact");
const Topup = require("../app/api/v1/models/topup");
const Transfer = require("../app/api/v1/models/transafer");
const { getUserService } = require("../app/services/users");
const { getAllHistory, getOneHistory } = require("../app/services/history");

function createPagedQuery(result, calls) {
  return {
    select(value) {
      calls.select = value;
      return this;
    },
    sort(value) {
      calls.sort = value;
      return this;
    },
    skip(value) {
      calls.skip = value;
      return this;
    },
    limit(value) {
      calls.limit = value;
      return this;
    },
    lean: async () => result,
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
}

test("admin user list applies bounded server-side pagination", async () => {
  const originalCountDocuments = User.countDocuments;
  const originalFind = User.find;
  const calls = {};
  const user = { _id: "user-id" };

  try {
    User.countDocuments = async filter => {
      calls.filter = filter;
      return 35;
    };
    User.find = filter => {
      calls.findFilter = filter;
      return createPagedQuery([user], calls);
    };

    const result = await getUserService({
      query: { page: "2", limit: "10" },
      user: { _id: "admin-id" },
    });

    assert.equal(result.page, 2);
    assert.equal(result.limit, 10);
    assert.equal(result.total, 35);
    assert.equal(calls.skip, 10);
    assert.equal(calls.limit, 10);
    assert.deepEqual(calls.sort, { _id: 1 });
    assert.deepEqual(calls.select, "-password -pin");
  } finally {
    User.countDocuments = originalCountDocuments;
    User.find = originalFind;
  }
});

test("user and admin history queries apply requested page and limit", async () => {
  const originalCountDocuments = History.countDocuments;
  const originalFind = History.find;
  const calls = [];

  try {
    History.countDocuments = async filter => {
      calls.push({ type: "count", filter });
      return 34;
    };
    History.find = filter => {
      const queryCalls = { type: "find", filter };
      calls.push(queryCalls);
      return createPagedQuery([{ _id: "history-id" }], queryCalls);
    };

    const userResult = await getOneHistory({
      query: { page: "3", limit: "10", type: "transfer" },
      user: { _id: "user-id" },
    });
    const adminResult = await getAllHistory({
      query: { page: "2", limit: "10", type: "topup" },
      user: { role: "admin" },
    });

    assert.equal(userResult.page, 3);
    assert.equal(userResult.limit, 10);
    assert.equal(userResult.total, 34);
    assert.equal(calls.find(call => call.type === "find").skip, 20);
    assert.equal(calls.find(call => call.type === "find").limit, 10);
    assert.equal(adminResult.page, 2);
    assert.equal(adminResult.limit, 10);
    assert.equal(adminResult.total, 34);
    assert.equal(calls.filter(call => call.type === "find")[1].skip, 10);
    assert.equal(calls.filter(call => call.type === "find")[1].limit, 10);
  } finally {
    History.countDocuments = originalCountDocuments;
    History.find = originalFind;
  }
});

test("frequent list and cleanup queries have supporting compound indexes", () => {
  const hasIndex = (model, expected) => model.schema.indexes().some(([fields]) =>
    Object.entries(expected).every(([field, direction]) => fields[field] === direction)
  );

  assert.equal(hasIndex(User, { role: 1, _id: 1 }), true);
  assert.equal(hasIndex(History, { user_id: 1, createdAt: -1, _id: -1 }), true);
  assert.equal(hasIndex(History, { createdAt: -1, _id: -1 }), true);
  assert.equal(hasIndex(Contact, { user_id: 1, _id: 1 }), true);
  assert.equal(hasIndex(Contact, { contact_user_id: 1 }), true);
  assert.equal(hasIndex(Topup, { order_id: 1 }), true);
  assert.equal(hasIndex(Topup, { user_id: 1 }), true);
  assert.equal(hasIndex(Transfer, { sender_id: 1 }), true);
  assert.equal(hasIndex(Transfer, { receiver_id: 1 }), true);
});
