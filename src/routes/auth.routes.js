const express = require("express");
const {
  signup,
  sendOTP,
  verifyOTP,
  login,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  getMe,
} = require("../controllers/auth.controller");
const {
  signupValidator,
  loginValidator,
  sendOTPValidator,
  verifyOTPValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} = require("../validators/auth.validator");
const validate = require("../middleware/validation.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const { authLimiter, signupLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.post("/signup", signupValidator, validate, signupLimiter, signup);
router.post("/send-otp", sendOTPValidator, validate, authLimiter, sendOTP);
router.post(
  "/verify-otp",
  verifyOTPValidator,
  validate,
  authLimiter,
  verifyOTP
);
router.post("/login", loginValidator, validate, authLimiter, login);
router.post(
  "/forgot-password",
  forgotPasswordValidator,
  validate,
  authLimiter,
  forgotPassword
);
router.post(
  "/reset-password",
  resetPasswordValidator,
  validate,
  authLimiter,
  resetPassword
);
router.post("/refresh-token", refreshToken);
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, getMe);

module.exports = router;
