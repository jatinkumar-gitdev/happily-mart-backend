const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
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
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`MongoDB Pool Size: ${conn.connection.readyState}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
