const authService = require("../services/auth.service");
const { setRefreshTokenCookie } = require("../services/token.service");
const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const { generateAccessToken } = require("../config/jwt");
const asyncHandler = require("../utils/asyncHandler");
const { verifyRecaptcha } = require("../utils/recaptcha");
const memcachedService = require("../services/memcached.service");

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
  const { email, password, rememberMe, recaptchaToken, isAdmin } = req.body;
  try {
    if (recaptchaToken && !isAdmin) {
      const isValid = await verifyRecaptcha(recaptchaToken);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: "CAPTCHA verification failed. Please try again.",
        });
      }
    }

    const result = await authService.login(email, password, rememberMe);
    
    if (isAdmin && result.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }
    
    setRefreshTokenCookie(res, result.refreshToken, rememberMe, isAdmin);
    
    let responseData = {
      success: true,
      user: result.user,
      isAdmin: result.user.role === "admin",
    };

    if (isAdmin && result.user.role === "admin") {
      const adminToken = generateAccessToken(result.user._id);
      res.cookie("adminToken", adminToken, {
        httpOnly: true, // Changed from false to true for security
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
        path: "/",
      });
      responseData.accessToken = adminToken;
    } else {
      responseData.accessToken = result.accessToken;
      // Set access token in cookie for regular users too
      res.cookie("accessToken", result.accessToken, {
        httpOnly: true, // Changed from false to true for security
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
        path: "/",
      });
    }
    
    res.json(responseData);
  } catch (error) {
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
  const adminRefreshToken = req.cookies.adminRefreshToken;
  
  // Check for admin refresh token first
  if (adminRefreshToken) {
    try {
      const decoded = jwt.verify(adminRefreshToken, process.env.JWT_REFRESH_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user || user.role !== "admin") {
        return res.status(401).json({ message: "Invalid admin refresh token" });
      }

      const accessToken = generateAccessToken(user._id);
      // Set new admin token in cookie - use the same expiry as the refresh token
      // For admin refresh tokens, we'll use a default 30-day expiry if rememberMe was used
      // This is determined by the fact that adminRefreshToken exists
      res.cookie("adminToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // Default to 30 days for admin tokens
        path: "/",
      });
      res.json({ success: true, accessToken });
      return;
    } catch (error) {
      return res.status(401).json({ message: "Invalid admin refresh token" });
    }
  }
  
  // Fall back to regular refresh token
  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token required" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const accessToken = generateAccessToken(user._id);
    // Set new access token in cookie - use the same expiry as the refresh token
    // Refresh tokens that last 7 days indicate rememberMe was true, 1 day means it was false
    const maxAge = req.cookies.refreshToken ? 7 * 24 * 60 * 60 * 1000 : 1 * 24 * 60 * 60 * 1000;
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: maxAge,
      path: "/",
    });
    res.json({ success: true, accessToken });
  } catch (error) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

const logout = asyncHandler(async (req, res) => {
  // Clear all relevant cookies
  res.clearCookie("refreshToken");
  res.clearCookie("adminToken");
  res.clearCookie("adminRefreshToken");
  res.clearCookie("accessToken");
  res.json({ success: true, message: "Logged out successfully" });
});

const getMe = asyncHandler(async (req, res) => {
  // Try to get from cache first
  const cacheKey = `user_${req.user._id}`;
  const cachedUser = await memcachedService.get(cacheKey);

  if (cachedUser) {
    return res.json({ success: true, user: cachedUser });
  }

  const User = require("../models/User.model");
  const { sanitizeUser } = require("../utils/helpers");
  const user = await User.findById(req.user._id);
  const sanitizedUser = sanitizeUser(user);

  // Cache for 5 minutes
  await memcachedService.set(cacheKey, sanitizedUser, 300);

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