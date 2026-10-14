const { randomInt } = require("crypto");

function generatorOTP() {
     let OTP = '';
     for(let i = 1; i <= 6; i++) {
          const data = randomInt(0, 10);
          OTP += data;
     }
     return OTP;
}

module.exports = generatorOTP;