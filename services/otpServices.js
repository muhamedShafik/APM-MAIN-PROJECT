// services/otpService.js
const crypto = require('crypto');
generateOtp = () => {
  const otp = crypto.randomInt(100000, 999999).toString();
  const expires = Date.now() + 2 * 60 * 1000; // 2 minutes
  return { otp, expires };
};
module.exports = generateOtp
