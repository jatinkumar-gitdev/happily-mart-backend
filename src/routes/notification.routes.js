const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const { authenticate } = require("../middleware/auth.middleware");

// All routes require authentication
router.use(authenticate);

// Push subscription management
router.post("/subscribe", notificationController.subscribe);
router.post("/unsubscribe", notificationController.unsubscribe);

// Notification CRUD
router.get("/", notificationController.getNotifications);
router.put("/read-all", notificationController.markAllAsRead);
router.put("/:id/read", notificationController.markAsRead);
router.delete("/:id", notificationController.deleteNotification);

module.exports = router;