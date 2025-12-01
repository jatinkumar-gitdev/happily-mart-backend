const crypto = require("crypto");

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateResetToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const generateAlphaNumericOTP = (length = 8) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    otp += chars[idx];
  }
  return otp;
};

const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : user;
  delete userObj.password;
  delete userObj.otp;
  delete userObj.otpExpiry;
  delete userObj.resetPasswordToken;
  delete userObj.resetPasswordExpiry;
  delete userObj.reactivationToken;
  delete userObj.reactivationExpiry;
  delete userObj.emailChangeToken;
  delete userObj.emailChangeExpiry;
  return userObj;
};

module.exports = {
  generateOTP,
  generateResetToken,
  generateAlphaNumericOTP,
  sanitizeUser,
};
