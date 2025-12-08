require("dotenv").config();

const app = require("./app");
const { PORT } = require("./config/env");

// Validate required environment variables
const requiredEnvVars = ["JWT_SECRET", "JWT_REFRESH_SECRET"];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn("\n[WARNING] Missing required environment variables:");
  missingVars.forEach((varName) => {
    console.warn(`  - ${varName}`);
  });
  console.warn("\n[INFO] Using default values for development.");
  console.warn(
    "[INFO] Please create a .env file with these variables for production.\n"
  );

  // Set defaults for development
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET =
      "dev-jwt-secret-key-change-in-production-" + Date.now();
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    process.env.JWT_REFRESH_SECRET =
      "dev-refresh-secret-key-change-in-production-" + Date.now();
  }
}

// Initialize scheduled jobs
const { initializeAccountDeletionJob } = require("./jobs/accountDeletion.job");
const { scheduleDealReminders } = require("./jobs/dealReminders.job");
const {
  initializeSubscriptionPlans,
} = require("./services/subscription.service");

initializeAccountDeletionJob();
scheduleDealReminders();

// Initialize subscription plans
initializeSubscriptionPlans();

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`⚠️  Running in development mode\n`);
  }
});
