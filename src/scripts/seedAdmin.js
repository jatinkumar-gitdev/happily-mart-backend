const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: __dirname + "/../../.env" });

const User = require("../models/User.model");

const ADMIN_EMAIL = "admin@happilymart.com";
const ADMIN_PASSWORD = "Admin@123456";
const ADMIN_NAME = "Super Admin";

const seedAdmin = async () => {
  try {
    // Log the URI to verify it's loaded correctly
    console.log("MONGODB_URI from env:", process.env.MONGODB_URI);
    
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      // Connection pool settings
      maxPoolSize: 20, // Maximum number of connections in the pool
      minPoolSize: 5,  // Minimum number of connections in the pool
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      heartbeatFrequencyMS: 10000, // Send heartbeat every 10 seconds
      retryWrites: true,
      retryReads: true
    });
    
    console.log("Connected to MongoDB");

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
    
    if (existingAdmin) {
      console.log("Admin user already exists:");
      console.log(`  Email: ${ADMIN_EMAIL}`);
      console.log(`  Password: ${ADMIN_PASSWORD}`);
      console.log(`  Role: ${existingAdmin.role}`);
      
      // Update role to admin if not already
      if (existingAdmin.role !== "admin") {
        existingAdmin.role = "admin";
        await existingAdmin.save();
        console.log("Updated existing user to admin role");
      }
    } else {
      // Hash the password before saving
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
      
      // Create admin user
      const admin = new User({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        phone: "0000000000",
        countryCode: "+91",
        role: "admin",
        isVerified: true,
        subscriptionPlan: "Advanced",
        credits: 9999,
        unlockCredits: 9999,
        createCredits: 9999,
      });

      await admin.save();
      console.log("Admin user created successfully!");
      console.log("================================");
      console.log("ADMIN CREDENTIALS:");
      console.log(`  Email: ${ADMIN_EMAIL}`);
      console.log(`  Password: ${ADMIN_PASSWORD}`);
      console.log("================================");
    }

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding admin:", error);
    process.exit(1);
  }
};

seedAdmin();