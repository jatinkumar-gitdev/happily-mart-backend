const { generateOTP } = require("../utils/helpers");
const { OTP_EXPIRY } = require("../utils/constants");

const createOTP = () => {
  return generateOTP();
};

const setOTPExpiry = () => {
  return new Date(Date.now() + OTP_EXPIRY);
};

const isOTPValid = (otp, userOTP, expiry) => {
  if (otp !== userOTP) return false;
  if (new Date() > expiry) return false;
  return true;
};

module.exports = {
  createOTP,
  setOTPExpiry,
  isOTPValid,
};

