module.exports = {
  USER_ROLES: {
    USER: "user",
    ADMIN: "admin",
  },
  OTP_EXPIRY: 10 * 60 * 1000, // 10 minutes
  RESET_TOKEN_EXPIRY: 60 * 60 * 1000, // 1 hour
  PASSWORD_MIN_LENGTH: 6,
};
