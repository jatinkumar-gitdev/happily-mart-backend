const express = require("express");
const {
  getUserDeals,
  getDealById,
  updateDealStatus,
  getDealStats,
  getAllDeals,
  getDealAnalytics,
  getDealNotifications,
  markNotificationAsRead,
} = require("../controllers/deal.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeAdmin } = require("../middleware/auth.middleware");
const { generalLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// User routes (protected)
router.get("/", authenticate, generalLimiter, getUserDeals);
router.get("/stats", authenticate, generalLimiter, getDealStats);
router.get("/:id", authenticate, generalLimiter, getDealById);
router.put("/:id/status", authenticate, generalLimiter, updateDealStatus);
router.get("/notifications", authenticate, generalLimiter, getDealNotifications);
router.put("/notifications/:notificationId/read", authenticate, generalLimiter, markNotificationAsRead);

// Admin routes (protected and admin-only)
router.get("/admin/all", authenticate, authorizeAdmin, generalLimiter, getAllDeals);
router.get("/admin/analytics", authenticate, authorizeAdmin, generalLimiter, getDealAnalytics);

module.exports = router;