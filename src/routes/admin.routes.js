const express = require("express");
const {
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser,
  getAllPosts,
  getPostById,
  updatePostStatus,
  getAllDeals,
  getDealById,
  updateDealStatus,
  closeDeal,
  getDealAnalytics,
  getRecentActivity,
  getPostAnalytics
} = require("../controllers/admin.controller");
const { authenticate, authorizeAdmin } = require("../middleware/auth.middleware");
const { generalLimiter } = require("../middleware/rateLimiter");
const dealRoutes = require("./deal.routes");

const router = express.Router();

// All admin routes require authentication and admin authorization
router.use(authenticate, authorizeAdmin, generalLimiter);

// User management
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.put("/users/:id", updateUser);
router.put("/users/:id/deactivate", deactivateUser);

// Post management
router.get("/posts", getAllPosts);
router.get("/posts/:id", getPostById);
router.put("/posts/:id/status", updatePostStatus);

// Deals management
router.get("/deals", getAllDeals);
router.get("/deals/:id", getDealById);
router.put("/deals/:id/status", updateDealStatus);
router.delete("/deals/:id", closeDeal);

// Analytics
router.get("/analytics/deals", getDealAnalytics);
router.get("/analytics/activity", getRecentActivity);
router.get("/posts/analytics", getPostAnalytics);

module.exports = router;