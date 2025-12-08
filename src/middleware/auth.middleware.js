const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const { verifyToken } = require("../config/jwt");

const authenticate = async (req, res, next) => {
  try {
    // Check for accessToken in cookies or adminToken for admin users
    const token = req.cookies.adminToken || req.cookies.accessToken || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = verifyToken(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if account is deactivated
    if (user.isDeactivated) {
      return res.status(403).json({ 
        message: "Account is deactivated. Please contact support to reactivate." 
      });
    }

    // Check if account deletion is scheduled (but allow access during grace period)
    // This is handled in login, but we allow authenticated requests during grace period
    // The scheduled job will handle actual deletion

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    return res.status(401).json({ message: "Invalid token" });
  }
};

const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin privileges required.",
    });
  }
  next();
};

module.exports = { authenticate, authorizeAdmin };