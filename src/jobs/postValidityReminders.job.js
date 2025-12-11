const cron = require("node-cron");
const Post = require("../models/Post.model");
const User = require("../models/User.model");
const { sendValidityReminderNotification } = require("../services/notification.service");

// Send validity reminders for posts that are about to expire
const schedulePostValidityReminders = () => {
  // Run every day at 10 AM
  cron.schedule("0 10 * * *", async () => {
    console.log("Running post validity reminder job...");
    
    try {
      const now = new Date();
      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(now.getDate() + 2);
      
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(now.getDate() + 3);
      
      // Find posts that are expiring in 2-3 days and haven't been reminded yet
      const posts = await Post.find({
        isActive: true,
        postStatus: "Active",
        validityReminderSent: false,
        expiresAt: {
          $gte: twoDaysFromNow,
          $lte: threeDaysFromNow
        }
      }).populate("author", "name email");
      
      console.log(`Found ${posts.length} posts expiring soon`);
      
      for (const post of posts) {
        try {
          // Calculate days remaining
          const daysRemaining = Math.ceil((post.expiresAt - now) / (1000 * 60 * 60 * 24));
          
          // Send notification to post creator
          if (post.author) {
            await sendValidityReminderNotification(
              post.author._id,
              post._id,
              post.title,
              daysRemaining
            );
            
            // Mark reminder as sent
            await Post.findByIdAndUpdate(post._id, {
              validityReminderSent: true
            });
          }
        } catch (error) {
          console.error(`Error sending validity reminder for post ${post._id}:`, error);
        }
      }
      
      // Also check for posts expiring and mark them as expired (send notification per post)
      const newlyExpired = await Post.find({
        isActive: true,
        isExpired: false,
        expiresAt: { $lt: now }
      }).populate("author", "name email");

      for (const post of newlyExpired) {
        try {
          // Mark post as expired and inactive
          await Post.findByIdAndUpdate(post._id, {
            isExpired: true,
            postStatus: "Expired",
            isActive: false,
          });

          // Notify creator that post expired and can be revived
          if (post.author) {
            try {
              const { sendNotification } = require("../services/notification.service");
              const title = "Post Expired";
              const message = `Your post "${post.title}" has expired and is now faded. You can revive it by extending validity.`;
              const data = { postId: post._id, notificationType: "post_expired" };
              await sendNotification(post.author._id, { type: "post_expired", title, message, data, priority: "high" });
            } catch (notifErr) {
              console.error(`Failed to send expiry notification for post ${post._id}:`, notifErr);
            }
          }
        } catch (err) {
          console.error(`Failed to mark post ${post._id} as expired:`, err);
        }
      }

      console.log(`Marked ${newlyExpired.length} posts as expired and notified creators.`);
      console.log(`Post validity reminder job completed. Sent reminders for ${posts.length} posts.`);
    } catch (error) {
      console.error("Error in post validity reminder job:", error);
    }
  });
};

module.exports = { schedulePostValidityReminders };