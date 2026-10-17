const validator = require("validator");

const passwordOptions = Object.freeze({
     minLength: 8,
     minLowercase: 1,
     minUppercase: 1,
     minNumbers: 1,
     minSymbols: 1,
});

const passwordRequirementsMessage =
     "Kata sandi harus minimal 8 karakter dan mencakup huruf kecil, huruf besar, angka, serta simbol.";

function isStrongPassword(password) {
     return typeof password === "string" && validator.isStrongPassword(password, { ...passwordOptions });
}

module.exports = { isStrongPassword, passwordRequirementsMessage };
