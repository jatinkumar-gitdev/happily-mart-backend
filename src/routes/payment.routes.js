const express = require("express");
const {
  createOrder,
  verifyPayment,
  getPaymentHistory,
  getUnlockPrice,
} = require("../controllers/payment.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { generalLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// Public route to get unlock price
router.get("/unlock-price", getUnlockPrice);

// Protected routes
router.post("/create-order", authenticate, generalLimiter, createOrder);
router.post("/verify", authenticate, generalLimiter, verifyPayment);
router.get("/history", authenticate, generalLimiter, getPaymentHistory);

module.exports = router;
