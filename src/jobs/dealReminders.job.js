const cron = require("node-cron");
const Deal = require("../models/Deal.model");
const Post = require("../models/Post.model");
const User = require("../models/User.model");
const { sendNotification } = require("../services/notification.service");

// Send reminders at 1, 7, 30, and 90 days
const scheduleDealReminders = () => {
  // Run every day at 9 AM
  cron.schedule("0 9 * * *", async () => {
    console.log("Running deal reminder job...");
    
    try {
      const now = new Date();
      
      // Find active deals that need reminders
      const deals = await Deal.find({
        isActive: true,
        status: { $in: ["Contacted", "Ongoing"] },
        expiresAt: { $gte: now }, // Not yet expired
      }).populate("unlocker author", "email");
      
      for (const deal of deals) {
        const daysSinceCreated = Math.floor((now - deal.createdAt) / (1000 * 60 * 60 * 24));
        
        // Check if it's time to send a reminder
        let shouldSendReminder = false;
        let reminderType = "";
        
        // 1-day reminder
        if (daysSinceCreated === 1 && !deal.lastReminderSent) {
          shouldSendReminder = true;
          reminderType = "1-day";
        }
        // 7-day reminder
        else if (daysSinceCreated === 7 && 
                 (!deal.lastReminderSent || 
                  (deal.lastReminderSent && (now - deal.lastReminderSent) / (1000 * 60 * 60 * 24) >= 6))) {
          shouldSendReminder = true;
          reminderType = "7-day";
        }
        // 30-day reminder
        else if (daysSinceCreated === 30 && 
                 (!deal.lastReminderSent || 
                  (deal.lastReminderSent && (now - deal.lastReminderSent) / (1000 * 60 * 60 * 24) >= 23))) {
          shouldSendReminder = true;
          reminderType = "30-day";
        }
        // 90-day reminder before auto-close
        else if (daysSinceCreated === 85 && 
                 (!deal.lastReminderSent || 
                  (deal.lastReminderSent && (now - deal.lastReminderSent) / (1000 * 60 * 60 * 24) >= 50))) {
          shouldSendReminder = true;
          reminderType = "90-day-warning";
        }
        
        if (shouldSendReminder) {
          // Customize message based on reminder type
          let unlockerMessage = `Please update the status of your deal for post "${deal.post.title}". It's been ${daysSinceCreated} day(s) since you unlocked it.`;
          let authorMessage = `Please update the status of the deal for your post "${deal.post.title}". It's been ${daysSinceCreated} day(s) since it was unlocked.`;
          
          // Special message for 90-day warning
          if (reminderType === "90-day-warning") {
            unlockerMessage = `Your deal for post "${deal.post.title}" will be automatically closed in 5 days if no status update is provided. Please update the status now to avoid penalties.`;
            authorMessage = `The deal for your post "${deal.post.title}" will be automatically closed in 5 days if no status update is provided. Please encourage the other party to update the status.`;
          }
          
          // Send notifications to both parties
          await sendNotification(
            deal.unlocker._id,
            `Deal Reminder (${daysSinceCreated} days)` + (reminderType === "90-day-warning" ? " - Final Warning" : ""),
            unlockerMessage
          );
          
          await sendNotification(
            deal.author._id,
            `Deal Reminder (${daysSinceCreated} days)` + (reminderType === "90-day-warning" ? " - Final Warning" : ""),
            authorMessage
          );
          
          // Update last reminder sent timestamp
          deal.lastReminderSent = now;
          await deal.save();
        }
        
        // Auto-close deals after 90 days with penalty
        if (daysSinceCreated >= 90) {
          deal.status = "Closed";
          deal.isActive = false;
          
          // Apply penalty for no update
          deal.creditAdjustments.penalty += 5; // 5 credit penalty
          
          // Track chronic non-update for future analytics
          deal.chronicNonUpdate = true;
          
          // Save the deal
          await deal.save();
          
          // Update post status to Cancelled
          await Post.findByIdAndUpdate(deal.post, { dealStatus: "Cancelled" });
          
          // Apply penalty to both users
          const [unlockerUser, authorUser] = await Promise.all([
            User.findById(deal.unlocker),
            User.findById(deal.author),
          ]);
          
          if (unlockerUser) {
            unlockerUser.credits = Math.max(0, unlockerUser.credits - 5); // Min 0 credits
            // Track penalty for user analytics
            unlockerUser.totalPenalties = (unlockerUser.totalPenalties || 0) + 1;
            await unlockerUser.save();
          }
          
          if (authorUser) {
            authorUser.credits = Math.max(0, authorUser.credits - 5); // Min 0 credits
            // Track penalty for user analytics
            authorUser.totalPenalties = (authorUser.totalPenalties || 0) + 1;
            await authorUser.save();
          }
          
          // Send notifications
          await sendNotification(
            deal.unlocker._id,
            "Deal Auto-Closed",
            `Your deal for post "${deal.post.title}" has been automatically closed due to inactivity. A penalty of 5 credits has been applied.`
          );
          
          await sendNotification(
            deal.author._id,
            "Deal Auto-Closed",
            `The deal for your post "${deal.post.title}" has been automatically closed due to inactivity. A penalty of 5 credits has been applied.`
          );
        }
      }
      
      console.log(`Deal reminder job completed. Processed ${deals.length} deals.`);
    } catch (error) {
      console.error("Error in deal reminder job:", error);
    }
  });
};

module.exports = { scheduleDealReminders };