const webpush = require("web-push");
const Notification = require("../models/Notification.model");
const PushSubscription = require("../models/PushSubscription.model");

// Configure web-push with VAPID keys if available
let vapidConfigured = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:support@happilymart.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
    console.log("Web Push VAPID configured successfully");
  } catch (error) {
    console.warn("Failed to configure VAPID:", error.message);
  }
} else {
  console.warn("VAPID keys not configured. Web push notifications will be disabled.");
}

// Save push subscription
const saveSubscription = async (userId, subscription, userAgent) => {
  try {
    const existingSubscription = await PushSubscription.findOne({
      endpoint: subscription.endpoint,
    });

    if (existingSubscription) {
      existingSubscription.userId = userId;
      existingSubscription.keys = subscription.keys;
      existingSubscription.userAgent = userAgent;
      existingSubscription.isActive = true;
      await existingSubscription.save();
      return existingSubscription;
    }

    const newSubscription = await PushSubscription.create({
      userId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent,
      isActive: true,
    });

    return newSubscription;
  } catch (error) {
    console.error("Error saving push subscription:", error);
    throw error;
  }
};

// Remove push subscription
const removeSubscription = async (userId, endpoint) => {
  try {
    await PushSubscription.findOneAndUpdate(
      { userId, endpoint },
      { isActive: false }
    );
    return { success: true };
  } catch (error) {
    console.error("Error removing push subscription:", error);
    throw error;
  }
};

// Send web push notification to a user
const sendWebPush = async (userId, payload) => {
  if (!vapidConfigured) {
    console.log("Web push skipped - VAPID not configured");
    return [];
  }

  try {
    const subscriptions = await PushSubscription.find({
      userId,
      isActive: true,
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            JSON.stringify(payload)
          );
          return { success: true, endpoint: sub.endpoint };
        } catch (error) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            await PushSubscription.findByIdAndUpdate(sub._id, { isActive: false });
          }
          return { success: false, endpoint: sub.endpoint, error: error.message };
        }
      })
    );

    return results;
  } catch (error) {
    console.error("Error sending web push:", error);
    throw error;
  }
};

// Send notification (creates DB record + sends push)
const sendNotification = async (userId, { type, title, message, data, priority = "medium" }) => {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      data,
      priority,
    });

    // Send web push notification
    const pushPayload = {
      title,
      body: message,
      icon: "/logo192.png",
      badge: "/badge.png",
      data: {
        notificationId: notification._id,
        type,
        ...data,
      },
    };

    await sendWebPush(userId, pushPayload);

    console.log(`Notification sent to user ${userId}: ${title}`);
    return notification;
  } catch (error) {
    console.error("Error sending notification:", error);
    throw error;
  }
};

// Send prospect interaction notification to post creator
const sendProspectInteractionNotification = async (creatorId, prospectData, postId, postTitle) => {
  try {
    const prospectName = prospectData.name || "A prospect";
    const prospectAvatar = prospectData.avatar || null;
    const viewedTimeAgo = new Date().toISOString();
    
    const title = "New Prospect Viewed Your Post";
    const message = `${prospectName} viewed your post: "${postTitle}"`;
    const data = { 
      postId, 
      prospectId: prospectData._id,
      prospectName,
      prospectAvatar,
      viewedAt: viewedTimeAgo,
      notificationType: "prospect_view"
    };
    
    await sendNotification(creatorId, {
      type: "prospect_interaction",
      title,
      message,
      data,
      priority: "high"
    });
  } catch (error) {
    console.error("Error sending prospect interaction notification:", error);
  }
};

// Send validity reminder notification to post creator
const sendValidityReminderNotification = async (creatorId, postId, postTitle, daysRemaining) => {
  try {
    const title = "Post Validity Reminder";
    const message = `Your post "${postTitle}" will expire in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}. Renew now to keep it visible.`;
    const data = { postId, notificationType: "validity_reminder" };
    
    await sendNotification(creatorId, {
      type: "validity_reminder",
      title,
      message,
      data,
      priority: "medium"
    });
  } catch (error) {
    console.error("Error sending validity reminder notification:", error);
  }
};

// Send unlock notification to post creator when prospect unlocks contact details
const sendUnlockNotification = async (creatorId, prospectData, postId, postTitle) => {
  try {
    const prospectName = prospectData.name || "A prospect";
    const prospectAvatar = prospectData.avatar || null;
    const unlockedTimeAgo = new Date().toISOString();
    
    const title = "Contact Details Unlocked";
    const message = `${prospectName} unlocked your contact details for: "${postTitle}"`;
    const data = { 
      postId, 
      prospectId: prospectData._id,
      prospectName,
      prospectAvatar,
      unlockedAt: unlockedTimeAgo,
      notificationType: "contact_unlock"
    };
    
    await sendNotification(creatorId, {
      type: "unlock_notification",
      title,
      message,
      data,
      priority: "high"
    });
  } catch (error) {
    console.error("Error sending unlock notification:", error);
  }
};

// Get paginated notifications for a user
const getNotifications = async (userId, { page = 1, limit = 20, unreadOnly = false }) => {
  try {
    const query = { userId };
    if (unreadOnly) {
      query.isRead = false;
    }

    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId, isRead: false }),
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      unreadCount,
    };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    throw error;
  }
};

// Mark notification as read
const markAsRead = async (userId, notificationId) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      throw new Error("Notification not found");
    }

    return notification;
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
};

// Mark all notifications as read
const markAllAsRead = async (userId) => {
  try {
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    return { modifiedCount: result.modifiedCount };
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    throw error;
  }
};

// Delete a notification
const deleteNotification = async (userId, notificationId) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting notification:", error);
    throw error;
  }
};

// Delete old notifications (cleanup job)
const deleteOldNotifications = async (daysOld = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      isRead: true,
    });

    console.log(`Deleted ${result.deletedCount} old notifications`);
    return { deletedCount: result.deletedCount };
  } catch (error) {
    console.error("Error deleting old notifications:", error);
    throw error;
  }
};

// Send prospect contacted notification to creator
const sendProspectContactedNotification = async (creatorId, prospectData, postId, postTitle) => {
  try {
    const prospectName = prospectData.name || "A prospect";
    const prospectAvatar = prospectData.avatar || null;
    const contactedTimeAgo = new Date().toISOString();
    
    const title = "Prospect Contacted You";
    const message = `${prospectName} has made contact regarding: "${postTitle}"`;
    const data = { 
      postId, 
      prospectId: prospectData._id,
      prospectName,
      prospectAvatar,
      contactedAt: contactedTimeAgo,
      notificationType: "prospect_contacted"
    };
    
    await sendNotification(creatorId, {
      type: "prospect_interaction",
      title,
      message,
      data,
      priority: "urgent"
    });
  } catch (error) {
    console.error("Error sending prospect contacted notification:", error);
  }
};

// Send badge earned notification to user
const sendBadgeEarnedNotification = async (userId, badgeLevel, wonDealsCount) => {
  try {
    const badgeTitles = {
      10: "Silver Badge",
      20: "Gold Badge",
      50: "Platinum Badge",
      100: "Diamond Badge",
      150: "Elite Badge"
    };

    const badgeTitle = badgeTitles[badgeLevel] || "Achievement Badge";
    const title = `🏆 ${badgeTitle} Earned!`;
    const message = `Congratulations! You've reached ${wonDealsCount} successful deals!`;
    const data = { 
      badgeLevel,
      wonDealsCount,
      notificationType: "badge_earned"
    };
    
    await sendNotification(userId, {
      type: "system",
      title,
      message,
      data,
      priority: "high"
    });
  } catch (error) {
    console.error("Error sending badge earned notification:", error);
  }
};

module.exports = {
  saveSubscription,
  removeSubscription,
  sendWebPush,
  sendNotification,
  sendProspectInteractionNotification,
  sendValidityReminderNotification,
  sendUnlockNotification,
  sendProspectContactedNotification,
  sendBadgeEarnedNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteOldNotifications,
};