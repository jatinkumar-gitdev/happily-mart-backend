const { body } = require("express-validator");

const signupValidator = [
  body("email").isEmail().normalizeEmail().withMessage("Invalid email address"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("name").notEmpty().trim().withMessage("Name is required"),
  body("phone").notEmpty().withMessage("Phone is required"),
  body("countryCode").notEmpty().withMessage("Country code is required"),
];

const loginValidator = [
  body("email").isEmail().normalizeEmail().withMessage("Invalid email address"),
  body("password").notEmpty().withMessage("Password is required"),
];

const sendOTPValidator = [
  body("email").isEmail().normalizeEmail().withMessage("Invalid email address"),
];

const verifyOTPValidator = [
  body("email").isEmail().normalizeEmail().withMessage("Invalid email address"),
  body("otp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
];

const forgotPasswordValidator = [
  body("email").isEmail().normalizeEmail().withMessage("Invalid email address"),
];

const resetPasswordValidator = [
  body("token").notEmpty().withMessage("Token is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
];

module.exports = {
  signupValidator,
  loginValidator,
  sendOTPValidator,
  verifyOTPValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
};

