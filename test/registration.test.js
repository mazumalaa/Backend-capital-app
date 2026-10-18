const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
     serviceRegister,
     serviceLogin,
     createPendingRegistrationNotification,
     verifyOtpService,
} = require("../app/services/users");
const { getContactService, searchReceiversService, transaferService } = require("../app/services/transafer");
const { errorMiddleware } = require("../app/middleware/error");
const { authMiddleware, verificationAuthMiddleware } = require("../app/middleware/auth");
const { isStrongPassword, passwordRequirementsMessage } = require("../app/libs/passwordPolicy");
const User = require("../app/api/v1/models/users");
const Verification = require("../app/api/v1/models/verify");
const Notification = require("../app/api/v1/models/notification");
const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const { createToken, verifyToken } = require("../app/libs/jwt");

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

test("login returns a scoped verification token for a valid unverified account", async () => {
     const originalUserFindOne = User.findOne;
     const originalVerificationFindOne = Verification.findOne;
     const userId = new mongoose.Types.ObjectId();
     const expiresAt = new Date(Date.now() + 60_000);
     const passwordHash = await bcryptjs.hash("Capital123!", 4);
     const user = {
          _id: userId,
          email: "ari@example.com",
          password: passwordHash,
          is_verified: false,
          token_version: 2,
          unverified_expires_at: new Date(Date.now() + 60_000),
     };
     const otpExpiry = new Date(Date.now() + 5 * 60_000);

     try {
          User.findOne = query => {
               assert.deepEqual(query, { email: "ari@example.com" });
               return {
                    select(selection) {
                         assert.match(selection, /unverified_expires_at/);
                         return this;
                    },
                    lean: async () => user,
               };
          };
          Verification.findOne = query => {
               assert.deepEqual(query, { user_id: userId });
               return {
                    select(selection) {
                         assert.equal(selection, "expire_at");
                         return this;
                    },
                    lean: async () => ({ expire_at: otpExpiry }),
               };
          };

          const result = await serviceLogin({
               body: { email: " Ari@Example.com ", password: "Capital123!" },
          });
          const token = await verifyToken(result.token);
          assert.equal(token.purpose, "email_verification");
          assert.equal(token._id, String(userId));
          assert.equal(token.tokenVersion, 2);
          assert.equal(result.verificationRequired, true);
          assert.equal(result.otpExpiresAt, otpExpiry.toISOString());
          assert.equal(result.emailRecipient, "a***@example.com");
     } finally {
          User.findOne = originalUserFindOne;
          Verification.findOne = originalVerificationFindOne;
     }
});

test("login rejects expired unverified accounts after validating the password", async () => {
     const originalUserFindOne = User.findOne;
     const passwordHash = await bcryptjs.hash("Capital123!", 4);
     const user = {
          _id: new mongoose.Types.ObjectId(),
          email: "ari@example.com",
          password: passwordHash,
          is_verified: false,
          token_version: 0,
          unverified_expires_at: new Date(Date.now() - 1),
     };
     try {
          User.findOne = () => ({
               select() { return this; },
               lean: async () => user,
          });
          await assert.rejects(
               serviceLogin({ body: { email: user.email, password: "Capital123!" } }),
               { status: 401, message: "Registration expired. Please register again" }
          );
          await assert.rejects(
               serviceLogin({ body: { email: user.email, password: "wrong" } }),
               { status: 401, message: "Invalid email or password" }
          );
     } finally {
          User.findOne = originalUserFindOne;
     }
});

test("verification tokens are limited to the OTP routes and pending accounts", async () => {
     const originalUserFindById = User.findById;
     const userId = new mongoose.Types.ObjectId();
     const token = createToken({
          _id: userId,
          tokenVersion: 0,
          purpose: "email_verification",
     });
     const request = { headers: { authorization: `Bearer ${token}` } };
     const pendingUser = {
          _id: userId,
          token_version: 0,
          role: "user",
          is_verified: false,
          unverified_expires_at: new Date(Date.now() + 60_000),
     };
     const run = middleware => new Promise(resolve => {
          middleware(request, {}, error => resolve(error || null));
     });

     try {
          assert.equal((await run(authMiddleware)).status, 401);
          User.findById = () => {
               const query = Promise.resolve(pendingUser);
               query.select = selection => {
                    assert.equal(selection, "+unverified_expires_at");
                    return query;
               };
               return query;
          };
          assert.equal(await run(verificationAuthMiddleware), null);
          assert.equal(request.user._id, userId);

          request.headers.authorization = `Bearer ${createToken({
               _id: userId,
               tokenVersion: 0,
          })}`;
          assert.equal((await run(authMiddleware)).status, 401);
          request.headers.authorization = `Bearer ${token}`;

          const expiredUser = { ...pendingUser, unverified_expires_at: new Date(Date.now() - 1) };
          User.findById = () => {
               const query = Promise.resolve(expiredUser);
               query.select = () => query;
               return query;
          };
          assert.equal((await run(verificationAuthMiddleware)).status, 401);
     } finally {
          User.findById = originalUserFindById;
     }
});

test("successful user verification creates an activity notification for the admin", async () => {
     const originalStartSession = mongoose.startSession;
     const originalVerifyFindOneAndUpdate = Verification.findOneAndUpdate;
     const originalUserFindOneAndUpdate = User.findOneAndUpdate;
     const originalUserFindOne = User.findOne;
     const originalNotificationCreate = Notification.create;
     const originalNotificationDeleteMany = Notification.deleteMany;
     const session = {
          withTransaction: async callback => callback(),
          endSession: async () => {},
     };
     const user = { _id: new mongoose.Types.ObjectId(), username: "Ari" };
     const admin = { _id: new mongoose.Types.ObjectId() };
     let notification;
     let notificationOptions;
     let verificationUpdateCount = 0;

     try {
          mongoose.startSession = async () => session;
          Verification.findOneAndUpdate = async () => {
               verificationUpdateCount += 1;
               return verificationUpdateCount === 1
                    ? { _id: new mongoose.Types.ObjectId(), otp: "123456" }
                    : {};
          };
          User.findOneAndUpdate = async (query, update, options) => {
               assert.equal(query.is_verified, false);
               assert.ok(query.unverified_expires_at.$gt instanceof Date);
               assert.deepEqual(update.$set, { is_verified: true });
               assert.equal(update.$unset.unverified_expires_at, 1);
               assert.equal(options.session, session);
               return user;
          };
          User.findOne = () => ({
               select() {
                    return this;
               },
               session: async value => {
                    assert.equal(value, session);
                    return admin;
               },
          });
          Notification.create = async (documents, options) => {
               assert.equal(documents[0].type, "user_registered");
               notification = documents[0];
               notificationOptions = options;
          };
          Notification.deleteMany = async (query, options) => {
               assert.equal(query.actor_id, user._id);
               assert.equal(query.type, "user_registration_pending");
               assert.equal(options.session, session);
          };

          const result = await verifyOtpService({
               body: { otp: "123456" },
               user: { _id: user._id },
          });
          assert.ok(result.token);
          assert.equal(notification.recipient_id, admin._id);
          assert.equal(notification.actor_id, user._id);
          assert.equal(notification.type, "user_registered");
          assert.equal(notification.title, "Sistem info");
          assert.match(notification.body, /Ari/);
          assert.equal(notificationOptions.session, session);
     } finally {
          mongoose.startSession = originalStartSession;
          Verification.findOneAndUpdate = originalVerifyFindOneAndUpdate;
          User.findOneAndUpdate = originalUserFindOneAndUpdate;
          User.findOne = originalUserFindOne;
          Notification.create = originalNotificationCreate;
          Notification.deleteMany = originalNotificationDeleteMany;
     }
});

test("new registrations create an admin notification while verification is pending", async () => {
     const originalUserFindOne = User.findOne;
     const originalNotificationCreate = Notification.create;
     const admin = { _id: new mongoose.Types.ObjectId() };
     const user = {
          _id: new mongoose.Types.ObjectId(),
          username: "Ari",
          email: "ari@example.com",
     };
     let createdNotification;

     try {
          User.findOne = query => {
               assert.deepEqual(query, { role: "admin", is_verified: true });
               return {
                    select() { return this; },
                    lean: async () => admin,
               };
          };
          Notification.create = async notification => {
               createdNotification = notification;
          };

          await createPendingRegistrationNotification(user);

          assert.equal(createdNotification.recipient_id, admin._id);
          assert.equal(createdNotification.actor_id, user._id);
          assert.equal(createdNotification.type, "user_registration_pending");
          assert.match(createdNotification.body, /Ari/);
          assert.match(createdNotification.body, /ari@example\.com/);
     } finally {
          User.findOne = originalUserFindOne;
          Notification.create = originalNotificationCreate;
     }
});

test("unverified accounts have a private 24-hour expiration field", () => {
     const expiresAt = User.schema.path("unverified_expires_at");
     assert.equal(expiresAt.instance, "Date");
     assert.equal(expiresAt.options.select, false);
     assert.ok(User.schema.indexes().some(([keys]) =>
          keys.role === 1 && keys.is_verified === 1 && keys.unverified_expires_at === 1
     ));
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
          assert.equal(query.role, "user");
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

test("phone lookup only returns verified user accounts", async () => {
     const originalFindById = User.findById;
     const originalFindOne = User.findOne;
     const ownerId = "current-user";
     let query;

     try {
          User.findById = async () => ({ phone: "080000000000" });
          User.findOne = value => {
               query = value;
               return { select: async () => null };
          };
          await assert.rejects(
               getContactService({
                    query: { phone: "081234567890" },
                    user: { _id: ownerId },
               }),
               { status: 404, message: "User not found" }
          );
          assert.deepEqual(query, {
               phone: "081234567890",
               is_verified: true,
               role: "user",
          });
     } finally {
          User.findById = originalFindById;
          User.findOne = originalFindOne;
     }
});

test("transfer rejects phone numbers that do not belong to a user account", async () => {
     const bcryptjs = require("bcryptjs");
     const originalFindById = User.findById;
     const originalFindOne = User.findOne;
     let query;

     try {
          User.findById = async () => ({
               _id: "sender",
               phone: "080000000000",
               pin: await bcryptjs.hash("123456", 4),
          });
          User.findOne = async value => {
               query = value;
               return null;
          };
          await assert.rejects(
               transaferService({
                    body: { phone: "081234567890", pin: "123456", amount: 5000 },
                    user: { _id: "sender" },
               }),
               { status: 404, message: "Receiver  not found" }
          );
          assert.deepEqual(query, {
               phone: "081234567890",
               is_verified: true,
               role: "user",
          });
     } finally {
          User.findById = originalFindById;
          User.findOne = originalFindOne;
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
