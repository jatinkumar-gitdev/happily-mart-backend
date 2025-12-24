const rateLimit = require("express-rate-limit");

// Custom handler to send JSON response on rate limit exceeded
const handleRateLimitExceeded = (req, res) => {
  res.status(429).json({
    success: false,
    message: req.rateLimit.message || "Too many requests, please try again later.",
  });
};

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 requests per windowMs (increased for multi-step forms)
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: handleRateLimitExceeded,
  skip: (req) => {
    // Skip rate limiting for signup during multi-step process
    // Allow more requests for signup endpoint
    return req.path === "/signup";
  },
});

const signupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Allow more requests for signup (multi-step form)
  message: "Too many signup requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: handleRateLimitExceeded,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: handleRateLimitExceeded,
});

// Admin-specific rate limiter with higher limits
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Higher limit for admin users
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: handleRateLimitExceeded,
  skip: (req) => {
    // Skip rate limiting if user is authenticated as admin
    // This is checked by looking at the user object attached to the request
    // by the authentication middleware
    return req.user && req.user.role === "admin";
  },
});

module.exports = {
  authLimiter,
  signupLimiter,
  generalLimiter,
  adminLimiter,
};