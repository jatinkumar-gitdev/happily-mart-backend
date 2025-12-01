const jwt = require("jsonwebtoken");

if (!process.env.JWT_SECRET && !process.env.JWT_REFRESH_SECRET) {
  try {
    require("dotenv").config();
  } catch (e) {}
}

if (!process.env.JWT_SECRET) {
  console.warn(
    "[WARNING] JWT_SECRET is not set. Using default for development."
  );
  console.warn(
    "[WARNING] Please set JWT_SECRET in your .env file for production."
  );
  process.env.JWT_SECRET =
    "dev-jwt-secret-key-change-in-production-" + Date.now();
}

if (!process.env.JWT_REFRESH_SECRET) {
  console.warn(
    "[WARNING] JWT_REFRESH_SECRET is not set. Using default for development."
  );
  console.warn(
    "[WARNING] Please set JWT_REFRESH_SECRET in your .env file for production."
  );
  process.env.JWT_REFRESH_SECRET =
    "dev-refresh-secret-key-change-in-production-" + Date.now();
}

const generateAccessToken = (userId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required. Please set it in your .env file.");
  }
  return jwt.sign({ userId }, secret, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m",
  });
};

const generateRefreshToken = (userId) => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_REFRESH_SECRET is required. Please set it in your .env file."
    );
  }
  return jwt.sign({ userId }, secret, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d",
  });
};

const verifyToken = (token, secret) => {
  return jwt.verify(token, secret);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
};
