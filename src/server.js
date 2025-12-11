require("dotenv").config();

const http = require("http");
const { Server: SocketIO } = require("socket.io");
const app = require("./app");
const { PORT } = require("./config/env");

const server = http.createServer(app);
const io = new SocketIO(server, {
  path: "/socket.io/",
  cors: {
    origin: [process.env.FRONTEND_URL || "http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
});

app.set("io", io);
global.io = io;

const userSockets = new Map();

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  
  if (userId) {
    if (!userSockets.has(userId)) {
      userSockets.set(userId, []);
    }
    userSockets.get(userId).push(socket.id);
    socket.userId = userId;
    socket.join(`user:${userId}`);
    console.log(`User ${userId} connected with socket ${socket.id}`);
  }

  socket.on("disconnect", () => {
    if (userId && userSockets.has(userId)) {
      const sockets = userSockets.get(userId);
      const index = sockets.indexOf(socket.id);
      if (index > -1) {
        sockets.splice(index, 1);
      }
      if (sockets.length === 0) {
        userSockets.delete(userId);
      }
    }
    console.log(`User ${userId} disconnected`);
  });
});

app.emitToUser = (userId, eventName, data) => {
  io.to(`user:${userId}`).emit(eventName, data);
};

app.broadcastToAll = (eventName, data) => {
  io.emit(eventName, data);
};

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
const { schedulePostValidityReminders } = require("./jobs/postValidityReminders.job");
const {
  initializeSubscriptionPlans,
} = require("./services/subscription.service");

initializeAccountDeletionJob();
scheduleDealReminders();
schedulePostValidityReminders();

// Initialize subscription plans
initializeSubscriptionPlans();

server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`⚠️  Running in development mode\n`);
  }
});
