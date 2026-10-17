const assert = require("node:assert/strict");
const { test } = require("node:test");
const { serviceRegister } = require("../app/services/users");
const { searchReceiversService } = require("../app/services/transafer");
const { errorMiddleware } = require("../app/middleware/error");
const { isStrongPassword, passwordRequirementsMessage } = require("../app/libs/passwordPolicy");
const User = require("../app/api/v1/models/users");

const validRegistration = {
     username: "Test User",
     email: "user@example.com",
     phone: "081234567890",
     password: "Capital123!",
     confirmPassword: "Capital123!",
};

function runMiddleware(error) {
     let status;
     let payload;
     return errorMiddleware(error, {}, {
          status(code) {
               status = code;
               return this;
          },
          json(body) {
               payload = body;
               return body;
          },
     }, nextError => {
          throw nextError;
     }).then(() => ({ status, payload }));
}

test("password policy accepts and rejects the same core requirements", () => {
     assert.equal(isStrongPassword("Capital123!"), true);
     assert.equal(isStrongPassword("capital123!"), false);
     assert.equal(isStrongPassword("Capital123"), false);
     assert.equal(isStrongPassword("Cap1!"), false);
});

test("registration rejects weak passwords as a client validation error", async () => {
     await assert.rejects(
          serviceRegister({
               body: { ...validRegistration, password: "weak", confirmPassword: "weak" },
          }),
          { status: 400, message: passwordRequirementsMessage }
     );
});

test("registration rejects a mismatched password confirmation", async () => {
     await assert.rejects(
          serviceRegister({
               body: { ...validRegistration, confirmPassword: "Different123!" },
          }),
          { status: 400, message: "Konfirmasi kata sandi tidak cocok." }
     );
});

test("Mongoose validation errors return safe field guidance", async () => {
     const response = await runMiddleware({
          name: "ValidationError",
          errors: { password: new Error("sensitive model detail") },
     });

     assert.equal(response.status, 400);
     assert.equal(response.payload.message, passwordRequirementsMessage);
});

test("server errors never expose internal details to API clients", async () => {
     const originalConsoleError = console.error;
     console.error = () => {};
     try {
          const response = await runMiddleware({
               status: 500,
               message: "Internal server error: sensitive database details",
          });
          assert.equal(response.status, 500);
          assert.doesNotMatch(response.payload.message, /internal server error|sensitive database details/i);
     } finally {
          console.error = originalConsoleError;
     }
});

test("duplicate email or phone keys return a safe conflict message", async () => {
     const response = await runMiddleware({ code: 11000 });

     assert.equal(response.status, 409);
     assert.equal(response.payload.message, "Email atau nomor telepon sudah terdaftar.");
});

test("receiver search ignores terms shorter than two characters", async () => {
     await assert.doesNotReject(searchReceiversService({
          query: { keyword: "a" },
          user: { _id: "current-user" },
     }));
});

test("receiver search matches names and phone fragments while prioritizing name prefixes", async () => {
     const originalFind = User.find;
     let query;
     User.find = value => {
          query = value;
          return {
               select() { return this; },
               limit(value) {
                    this.resultLimit = value;
                    return this;
               },
               async lean() {
                    assert.equal(this.resultLimit, 10);
                    return [
                         { username: "The Alina", phone: "081234567890" },
                         { username: "Alina", phone: "082222222222" },
                         { username: "Other", phone: "081112223333" },
                    ];
               },
          };
     };

     try {
          const results = await searchReceiversService({
               query: { keyword: "ali" },
               user: { _id: "current-user" },
          });
          assert.equal(query._id.$ne, "current-user");
          assert.equal(query.is_verified, true);
          assert.equal(query.$or[0].username.test("Alina"), true);
          assert.deepEqual(results.map(user => user.username), ["Alina", "The Alina", "Other"]);

          await searchReceiversService({
               query: { keyword: "1234" },
               user: { _id: "current-user" },
          });
          assert.equal(query.$or[1].phone.test("081234"), true);
     } finally {
          User.find = originalFind;
     }
});

test("receiver search treats search text as literal regex content and bounds its length", async () => {
     const originalFind = User.find;
     let query;
     User.find = value => {
          query = value;
          return {
               select() { return this; },
               limit() { return this; },
               async lean() { return []; },
          };
     };

     try {
          await searchReceiversService({
               query: { keyword: ".*".padEnd(70, "x") },
               user: { _id: "current-user" },
          });
          assert.equal(query.$or[0].username.test(".*" + "x".repeat(48)), true);
          assert.equal(query.$or[0].username.test("anything"), false);
          assert.equal(query.$or[0].username.source.length, 52);
     } finally {
          User.find = originalFind;
     }
});
