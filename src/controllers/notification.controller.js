const notificationService = require("../services/notification.service");

// Subscribe to push notifications
const subscribe = async (req, res, next) => {
  try {
    const { subscription } = req.body;
    const userId = req.user._id;
    const userAgent = req.headers["user-agent"];

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        message: "Invalid subscription object",
      });
    }

    const result = await notificationService.saveSubscription(
      userId,
      subscription,
      userAgent
    );

    res.status(200).json({
      success: true,
      message: "Successfully subscribed to push notifications",
      data: { subscriptionId: result._id },
    });
  } catch (error) {
    next(error);
  }
};

// Unsubscribe from push notifications
const unsubscribe = async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    const userId = req.user._id;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        message: "Endpoint is required",
      });
    }

    await notificationService.removeSubscription(userId, endpoint);

    res.status(200).json({
      success: true,
      message: "Successfully unsubscribed from push notifications",
    });
  } catch (error) {
    next(error);
  }
};

// Get user notifications
const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const unreadOnly = req.query.unreadOnly === "true";

    const result = await notificationService.getNotifications(userId, {
      page,
      limit,
      unreadOnly,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Mark notification as read
const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const notification = await notificationService.markAsRead(userId, id);

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    if (error.message === "Notification not found") {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    next(error);
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const result = await notificationService.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Delete a notification
const deleteNotification = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    await notificationService.deleteNotification(userId, id);

    res.status(200).json({
      success: true,
      message: "Notification deleted",
    });
  } catch (error) {
    if (error.message === "Notification not found") {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    next(error);
  }
};

module.exports = {
  subscribe,
  unsubscribe,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
