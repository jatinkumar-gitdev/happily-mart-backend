const asyncHandler = require("../utils/asyncHandler");
const User = require("../models/User.model");
const subscriptionService = require("../services/subscription.service");
const emailService = require("../services/email.service");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const redisService = require("../services/redis.service");

// Initialize Razorpay
let razorpay;
try {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.warn(
      "⚠️  Razorpay credentials not configured. Payment features will be disabled."
    );
    razorpay = null;
  } else {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log("✓ Razorpay initialized successfully");
  }
} catch (error) {
  console.error("✗ Razorpay initialization failed:", error.message);
  razorpay = null;
}

// Get all subscription plans
const getPlans = asyncHandler(async (req, res) => {
  const plans = await subscriptionService.getAllPlans();

  res.json({
    success: true,
    plans,
  });
});

// Get user's current subscription
const getMySubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.getUserSubscription(
    req.user._id
  );
  const badgeInfo = subscriptionService.getBadgeInfo(subscription.currentPlan);

  res.json({
    success: true,
    subscription: {
      ...subscription,
      ...badgeInfo,
    },
  });
});

// Create order for subscription purchase
const createSubscriptionOrder = asyncHandler(async (req, res) => {
  const { planName, currency = "INR" } = req.body;

  if (!planName) {
    return res.status(400).json({
      success: false,
      message: "Plan name is required",
    });
  }

  // Check if Razorpay is configured
  if (!razorpay) {
    return res.status(500).json({
      success: false,
      message: "Payment gateway not configured. Please contact support.",
    });
  }

  // Allow purchasing additional plans - credits will accumulate

  const plan = await subscriptionService.getPlanByName(planName);

  if (!plan) {
    return res.status(404).json({
      success: false,
      message: "Subscription plan not found",
    });
  }

  // Free plan doesn't require payment
  if (plan.name === "Free") {
    return res.status(400).json({
      success: false,
      message: "Free plan doesn't require payment",
    });
  }

  const amount = currency === "USD" ? plan.priceUSD : plan.priceINR;
  // For INR, add 18% GST to the base price
  const gstAmount = currency === "INR" ? Math.round(amount * 0.18) : 0;
  const totalAmount = amount + gstAmount;
  const amountInPaise = Math.round(totalAmount * 100);

  // Generate short receipt ID (max 40 chars)
  const timestamp = Date.now().toString().slice(-10);
  const userIdShort = req.user._id.toString().slice(-8);
  const receipt = `sub_${userIdShort}_${timestamp}`;

  const options = {
    amount: amountInPaise,
    currency: currency,
    receipt: receipt,
    notes: {
      userId: req.user._id.toString(),
      planName: plan.name,
      credits: plan.credits,
    },
  };

  try {
    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      plan: {
        name: plan.name,
        displayName: plan.displayName,
        credits: plan.credits,
        price: amount,
        gst: gstAmount,
        total: totalAmount,
      },
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create payment order. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Verify and complete subscription purchase
const verifySubscriptionPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    planName,
    currency,
    amount,
  } = req.body;

  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature ||
    !planName
  ) {
    return res.status(400).json({
      success: false,
      message: "Missing required payment details",
    });
  }

  // Verify signature
  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(sign.toString())
    .digest("hex");

  if (razorpay_signature !== expectedSign) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment signature",
    });
  }

  // Process subscription purchase
  const result = await subscriptionService.purchaseSubscription(
    req.user._id,
    planName,
    {
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      currency: currency || "INR",
      amount: amount,
    }
  );

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);
  await redisService.del(`account_status_${req.user._id}`);

  // Send payment receipt email
  try {
    const user = await User.findById(req.user._id);
    if (user && user.email) {
      const plan = await subscriptionService.getPlanByName(planName);
      
      // Build customer address from user data
      const addressParts = [];
      if (user.address1) addressParts.push(user.address1);
      if (user.city) addressParts.push(user.city);
      if (user.state) addressParts.push(user.state);
      if (user.country) addressParts.push(user.country);
      const customerAddress = addressParts.join(", ");
      
      // Build customer phone with country code
      const customerPhone = user.countryCode && user.phone 
        ? `${user.countryCode} ${user.phone}` 
        : user.phone || "";
      
      const paymentDetails = {
        paymentDate: new Date().toLocaleDateString("en-GB"),
        transactionId: razorpay_payment_id,
        planName: plan.displayName || plan.name,
        price: currency === "USD" ? `$${plan.priceUSD}` : `₹${plan.priceINR}`,
        gst:
          currency === "USD"
            ? `$${plan.gstUSD || (plan.priceUSD * 0.18).toFixed(2)}`
            : `₹${plan.gstINR || Math.round(plan.priceINR * 0.18)}`,
        total:
          currency === "USD"
            ? `$${plan.totalUSD || (plan.priceUSD * 1.18).toFixed(2)}`
            : `₹${plan.totalINR || Math.round(plan.priceINR * 1.18)}`,
        currency: currency || "INR",
        customerPhone,
        customerAddress,
      };

      await emailService.sendPaymentReceiptEmail(
        user.email,
        user.name,
        paymentDetails
      );
    }
  } catch (emailError) {
    console.error("Failed to send payment receipt email:", emailError);
  }

  res.json({
    success: true,
    message: "Subscription purchased successfully!",
    subscription: result.subscription,
    user: result.user,
  });
});

// Get subscription history
const getSubscriptionHistory = asyncHandler(async (req, res) => {
  const history = await subscriptionService.getSubscriptionHistory(
    req.user._id
  );

  res.json({
    success: true,
    history,
  });
});

// Use credit (called when unlocking a post)
const useCredit = asyncHandler(async (req, res) => {
  const { postId } = req.body;

  if (!postId) {
    return res.status(400).json({
      success: false,
      message: "Post ID is required",
    });
  }

  const result = await subscriptionService.useCredit(req.user._id, postId);

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);
  await redisService.del(`account_status_${req.user._id}`);

  res.json({
    success: true,
    ...result,
  });
});

module.exports = {
  getPlans,
  getMySubscription,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getSubscriptionHistory,
  useCredit,
};
