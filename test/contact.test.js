const assert = require("node:assert/strict");
const { test } = require("node:test");
const Contact = require("../app/api/v1/models/contact");
const User = require("../app/api/v1/models/users");
const { NotFound } = require("../app/errors/notFound");
const { addContactService, getContactsService } = require("../app/services/contact");

test("adding a contact only resolves verified user accounts", async () => {
  const originalFindOne = User.findOne;
  let query;

  try {
    User.findOne = async value => {
      query = value;
      return null;
    };
    await assert.rejects(
      addContactService({
        body: { phone: "081234567890" },
        user: { _id: "owner-id" },
      }),
      error => error instanceof NotFound
    );
    assert.deepEqual(query, {
      phone: "081234567890",
      role: "user",
      is_verified: true,
    });
  } finally {
    User.findOne = originalFindOne;
  }
});

test("contact lists omit contacts whose account is not a user", async () => {
  const originalFind = Contact.find;
  const originalCountDocuments = Contact.countDocuments;
  let population;
  let pagination;
  const visibleContact = { contact_user_id: { role: "user" } };

  try {
    Contact.countDocuments = async () => 21;
    Contact.find = () => ({
      sort(value) {
        pagination = { sort: value };
        return this;
      },
      skip(value) {
        pagination.skip = value;
        return this;
      },
      limit(value) {
        pagination.limit = value;
        return this;
      },
      populate: async options => {
        population = options;
        return [
          visibleContact,
          { contact_user_id: null },
        ];
      },
    });
    const response = await getContactsService({
      user: { _id: "owner-id" },
      query: { page: "2", limit: "10" },
    });

    assert.deepEqual(population.match, { role: "user" });
    assert.deepEqual(response.contacts, [visibleContact]);
    assert.equal(response.page, 2);
    assert.equal(response.limit, 10);
    assert.equal(response.total, 21);
    assert.deepEqual(pagination, { sort: { _id: 1 }, skip: 10, limit: 10 });
  } finally {
    Contact.find = originalFind;
    Contact.countDocuments = originalCountDocuments;
  }
});
