const accountService = require("../services/account.service");
const User = require("../models/User.model");

/**
 * Scheduled job to delete accounts that have passed the 7-day grace period
 * This should be run daily via cron or similar scheduler
 */
const processAccountDeletions = async () => {
  try {
    const now = new Date();
    
    // Find all users with deletion scheduled for today or earlier
    const usersToDelete = await User.find({
      deletionRequestedAt: { $exists: true },
      deletionScheduledFor: { $lte: now },
      isDeactivated: false, // Only delete if not already deactivated
    });

    console.log(`[Account Deletion Job] Found ${usersToDelete.length} accounts to delete`);

    let deletedCount = 0;
    let errorCount = 0;

    for (const user of usersToDelete) {
      try {
        await accountService.deleteAccountPermanently(user._id);
        deletedCount++;
        console.log(`[Account Deletion Job] Deleted account: ${user.email}`);
      } catch (error) {
        errorCount++;
        console.error(
          `[Account Deletion Job] Error deleting account ${user.email}:`,
          error.message
        );
      }
    }

    console.log(
      `[Account Deletion Job] Completed: ${deletedCount} deleted, ${errorCount} errors`
    );

    return {
      success: true,
      deletedCount,
      errorCount,
      totalProcessed: usersToDelete.length,
    };
  } catch (error) {
    console.error("[Account Deletion Job] Fatal error:", error);
    throw error;
  }
};

/**
 * Initialize the scheduled job
 * Runs every day at 2 AM
 */
const initializeAccountDeletionJob = () => {
  // Check if we're in a Node.js environment (not in tests)
  if (typeof setInterval === "undefined") {
    return;
  }

  // Run immediately on startup to catch any overdue deletions
  processAccountDeletions().catch((error) => {
    console.error("[Account Deletion Job] Initial run failed:", error);
  });

  // Schedule to run daily at 2 AM
  const runDaily = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0); // 2 AM

    const msUntil2AM = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      // Run the job
      processAccountDeletions().catch((error) => {
        console.error("[Account Deletion Job] Scheduled run failed:", error);
      });

      // Schedule next run (24 hours later)
      setInterval(() => {
        processAccountDeletions().catch((error) => {
          console.error("[Account Deletion Job] Scheduled run failed:", error);
        });
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntil2AM);
  };

  runDaily();
  console.log("[Account Deletion Job] Initialized - will run daily at 2 AM");
};

module.exports = {
  processAccountDeletions,
  initializeAccountDeletionJob,
};

