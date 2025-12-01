const authService = require("../services/auth.service");
const { setRefreshTokenCookie } = require("../services/token.service");
const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const { generateAccessToken } = require("../config/jwt");
const asyncHandler = require("../utils/asyncHandler");
const { verifyRecaptcha } = require("../utils/recaptcha");
const redisService = require("../services/redis.service");

const signup = asyncHandler(async (req, res) => {
  try {
    const { recaptchaToken, ...userData } = req.body;

    // Verify reCAPTCHA if token provided
    if (recaptchaToken) {
      const isValid = await verifyRecaptcha(recaptchaToken);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: "CAPTCHA verification failed. Please try again.",
        });
      }
    }

    const result = await authService.signup(userData);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    if (error.message === "User already exists with this email") {
      return res.status(409).json({
        success: false,
        message: "User already exists with this email. Please login instead.",
      });
    }
    throw error;
  }
});

const sendOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await authService.sendOTP(email);
  res.json({ success: true, ...result });
});

const verifyOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const result = await authService.verifyOTP(email, otp);
  setRefreshTokenCookie(res, result.refreshToken);
  res.json({ success: true, ...result });
});

const login = asyncHandler(async (req, res) => {
  const { email, password, rememberMe, recaptchaToken } = req.body;
  try {
    // Verify reCAPTCHA if token provided
    if (recaptchaToken) {
      const isValid = await verifyRecaptcha(recaptchaToken);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: "CAPTCHA verification failed. Please try again.",
        });
      }
    }

    const result = await authService.login(email, password, rememberMe);
    setRefreshTokenCookie(res, result.refreshToken, rememberMe);
    res.json({ success: true, ...result });
  } catch (error) {
    // Handle specific authentication errors
    if (
      error.message === "Invalid credentials" ||
      error.message === "Password is required" ||
      error.message === "Email and password are required"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }
    if (error.message === "Please verify your email first") {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }
    throw error;
  }
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await authService.forgotPassword(email);
  res.json({ success: true, ...result });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const result = await authService.resetPassword(token, password);
  res.json({ success: true, ...result });
});

const refreshToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token required" });
  }

  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded.userId);

  if (!user) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }

  const accessToken = generateAccessToken(user._id);
  res.json({ success: true, accessToken });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie("refreshToken");
  res.json({ success: true, message: "Logged out successfully" });
});

const getMe = asyncHandler(async (req, res) => {
  // Try to get from cache first
  const cacheKey = `user_${req.user._id}`;
  const cachedUser = await redisService.get(cacheKey);

  if (cachedUser) {
    return res.json({ success: true, user: cachedUser });
  }

  const User = require("../models/User.model");
  const { sanitizeUser } = require("../utils/helpers");
  const user = await User.findById(req.user._id);
  const sanitizedUser = sanitizeUser(user);

  // Cache for 5 minutes
  await redisService.set(cacheKey, sanitizedUser, 300);

  res.json({ success: true, user: sanitizedUser });
});

module.exports = {
  signup,
  sendOTP,
  verifyOTP,
  login,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  getMe,
};
