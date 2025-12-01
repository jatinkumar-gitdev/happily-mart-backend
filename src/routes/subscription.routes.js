const express = require("express");
const router = express.Router();
const subscriptionController = require("../controllers/subscription.controller");
const { authenticate } = require("../middleware/auth.middleware");

// Public route - Get all subscription plans
router.get("/plans", subscriptionController.getPlans);

// Protected routes
router.use(authenticate);

// Get user's current subscription
router.get("/my-subscription", subscriptionController.getMySubscription);

// Create subscription order
router.post("/create-order", subscriptionController.createSubscriptionOrder);

// Verify subscription payment
router.post(
  "/verify-payment",
  subscriptionController.verifySubscriptionPayment
);

// Get subscription history
router.get("/history", subscriptionController.getSubscriptionHistory);

// Use credit for unlocking post
router.post("/use-credit", subscriptionController.useCredit);

module.exports = router;
