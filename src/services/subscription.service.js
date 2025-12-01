const {
  SubscriptionPlan,
  SubscriptionHistory,
} = require("../models/Subscription.model");
const User = require("../models/User.model");
const Payment = require("../models/Payment.model");
const redisService = require("./redis.service");

// Subscription plan configurations
const SUBSCRIPTION_PLANS = {
  Free: {
    name: "Free",
    displayName: "Free Plan",
    priceINR: 0,
    priceUSD: 0,
    unlockCredits: 1,
    createCredits: 1,
    credits: 1,
    duration: 0, // Lifetime
    features: [
      "View 1 full post detail",
      "Create 1 post",
      "Basic Access",
      "Community Support",
    ],
    badge: "🆓",
    badgeColor: "#6B7280",
  },
  Beginner: {
    name: "Beginner",
    displayName: "Beginner Plan",
    priceINR: 299,
    priceUSD: 3.99,
    gstINR: Math.round(299 * 0.18), // 18% GST
    gstUSD: Math.round(3.99 * 0.18 * 100) / 100, // 18% GST
    totalINR: 299 + Math.round(299 * 0.18),
    totalUSD: Math.round((3.99 + 3.99 * 0.18) * 100) / 100,
    unlockCredits: 5,
    createCredits: 3,
    credits: 8,
    duration: 30,
    features: [
      "Unlock 5 posts per month",
      "Create 3 posts per month",
      "30 Days Validity",
      "Priority Support",
      "Beginner Badge",
    ],
    badge: "🌟",
    badgeColor: "#10B981",
  },
  Intermediate: {
    name: "Intermediate",
    displayName: "Intermediate Plan",
    priceINR: 799,
    priceUSD: 9.99,
    gstINR: Math.round(799 * 0.18), // 18% GST
    gstUSD: Math.round(9.99 * 0.18 * 100) / 100, // 18% GST
    totalINR: 799 + Math.round(799 * 0.18),
    totalUSD: Math.round((9.99 + 9.99 * 0.18) * 100) / 100,
    unlockCredits: 12,
    createCredits: 7,
    credits: 19,
    duration: 30,
    features: [
      "Unlock 12 posts per month",
      "Create 7 posts per month",
      "30 Days Validity",
      "Priority Support",
      "Intermediate Badge",
      "Early Access Features",
    ],
    badge: "⭐",
    badgeColor: "#3B82F6",
  },
  Advanced: {
    name: "Advanced",
    displayName: "Advanced Plan",
    priceINR: 1599,
    priceUSD: 19.99,
    gstINR: Math.round(1599 * 0.18), // 18% GST
    gstUSD: Math.round(19.99 * 0.18 * 100) / 100, // 18% GST
    totalINR: 1599 + Math.round(1599 * 0.18),
    totalUSD: Math.round((19.99 + 19.99 * 0.18) * 100) / 100,
    unlockCredits: 25,
    createCredits: 15,
    credits: 40,
    duration: 30,
    features: [
      "Unlock 25 posts per month",
      "Create 15 posts per month",
      "30 Days Validity",
      "VIP Support",
      "Advanced Badge",
      "Early Access Features",
      "Exclusive Content",
    ],
    badge: "💎",
    badgeColor: "#8B5CF6",
  },
};

const initializeSubscriptionPlans = async () => {
  try {
    for (const planKey in SUBSCRIPTION_PLANS) {
      const planData = SUBSCRIPTION_PLANS[planKey];
      await SubscriptionPlan.findOneAndUpdate(
        { name: planData.name },
        planData,
        { upsert: true, new: true }
      );

      // Invalidate cache when plans are updated
      const cacheKey = `subscription_plan_${planData.name}`;
      await redisService.del(cacheKey);
    }

    // Invalidate all plans cache
    await redisService.del("subscription_plans");

    console.log("Subscription plans initialized successfully");
  } catch (error) {
    console.error("Error initializing subscription plans:", error);
  }
};

const getAllPlans = async () => {
  // Try to get from cache first
  const cacheKey = "subscription_plans";
  const cachedPlans = await redisService.get(cacheKey);

  if (cachedPlans) {
    return cachedPlans;
  }

  // If not in cache, fetch from database
  const plans = await SubscriptionPlan.find({ isActive: true }).sort({
    priceINR: 1,
  });

  // Convert plans to plain objects before caching
  const plainPlans = plans.map((plan) =>
    plan && typeof plan.toObject === "function"
      ? plan.toObject({ getters: true, versionKey: false })
      : plan
  );

  // Cache for 1 hour
  await redisService.set(cacheKey, plainPlans, 3600);

  return plans;
};

const getPlanByName = async (planName) => {
  // Try to get from cache first
  const cacheKey = `subscription_plan_${planName}`;
  const cachedPlan = await redisService.get(cacheKey);

  if (cachedPlan) {
    return cachedPlan;
  }

  // If not in cache, fetch from database
  const plan = await SubscriptionPlan.findOne({
    name: planName,
    isActive: true,
  });

  // Cache for 1 hour
  if (plan) {
    await redisService.set(cacheKey, plan, 3600);
  }

  return plan;
};

const getUserSubscription = async (userId) => {
  const user = await User.findById(userId).select(
    "subscriptionPlan credits unlockCredits createCredits subscriptionExpiresAt subscriptionPurchasedAt"
  );

  if (!user) {
    throw new Error("User not found");
  }

  const plan = await getPlanByName(user.subscriptionPlan);

  // Check if subscription has expired
  let isExpired = false;
  if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
    isExpired = true;
  }

  return {
    currentPlan: user.subscriptionPlan,
    credits: user.credits,
    unlockCredits: user.unlockCredits,
    createCredits: user.createCredits,
    expiresAt: user.subscriptionExpiresAt,
    purchasedAt: user.subscriptionPurchasedAt,
    isExpired,
    planDetails: plan,
  };
};

const purchaseSubscription = async (userId, planName, paymentDetails) => {
  const plan = await getPlanByName(planName);

  if (!plan) {
    throw new Error("Invalid subscription plan");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Calculate expiry date
  let expiresAt = null;
  if (plan.duration > 0) {
    // If user already has an active subscription, extend from current expiry
    if (user.subscriptionExpiresAt && new Date() < user.subscriptionExpiresAt) {
      expiresAt = new Date(user.subscriptionExpiresAt);
    } else {
      expiresAt = new Date();
    }
    expiresAt.setDate(expiresAt.getDate() + plan.duration);
  }

  // Update user subscription - ADD credits to existing ones
  user.subscriptionPlan = plan.name; // Update to highest tier
  user.unlockCredits = (user.unlockCredits || 0) + plan.unlockCredits; // ADD new credits
  user.createCredits = (user.createCredits || 0) + plan.createCredits; // ADD new credits
  user.credits = (user.credits || 0) + plan.credits; // ADD new credits
  user.subscriptionExpiresAt = expiresAt;
  user.subscriptionPurchasedAt = new Date();
  await user.save();

  // Create subscription history record
  const subscriptionHistory = await SubscriptionHistory.create({
    user: userId,
    plan: plan.name,
    credits: plan.credits,
    priceINR: plan.priceINR,
    priceUSD: plan.priceUSD,
    gstINR: plan.gstINR || 0,
    gstUSD: plan.gstUSD || 0,
    totalINR: plan.totalINR || plan.priceINR,
    totalUSD: plan.totalUSD || plan.priceUSD,
    currency: paymentDetails.currency || "INR",
    amountPaid: paymentDetails.amount,
    razorpayOrderId: paymentDetails.razorpayOrderId,
    razorpayPaymentId: paymentDetails.razorpayPaymentId,
    razorpaySignature: paymentDetails.razorpaySignature,
    status: "completed",
    expiresAt: expiresAt,
  });

  // Create payment record
  await Payment.create({
    user: userId,
    subscription: subscriptionHistory._id,
    subscriptionPlan: plan.name,
    amount: paymentDetails.amount,
    currency: paymentDetails.currency || "INR",
    razorpayOrderId: paymentDetails.razorpayOrderId,
    razorpayPaymentId: paymentDetails.razorpayPaymentId,
    razorpaySignature: paymentDetails.razorpaySignature,
    status: "completed",
  });

  return {
    subscription: subscriptionHistory,
    user: {
      subscriptionPlan: user.subscriptionPlan,
      credits: user.credits,
      unlockCredits: user.unlockCredits,
      createCredits: user.createCredits,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    },
  };
};

const useCredit = async (userId, postId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  // Check if subscription has expired
  if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
    throw new Error("Your subscription has expired. Please renew to continue.");
  }

  if (user.unlockCredits < 1) {
    throw new Error(
      "Insufficient unlock credits. Please purchase a plan to get more credits."
    );
  }

  user.unlockCredits -= 1;
  user.credits -= 1; // Also deduct from general credits for backward compatibility
  await user.save();

  return {
    remainingCredits: user.credits,
    remainingUnlockCredits: user.unlockCredits,
    message: "Credit used successfully",
  };
};

const getSubscriptionHistory = async (userId) => {
  const history = await SubscriptionHistory.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(10);

  return history;
};

const getBadgeInfo = (planName) => {
  const planConfig = SUBSCRIPTION_PLANS[planName];
  if (!planConfig) {
    return {
      badge: "",
      badgeColor: "#6B7280",
      displayName: "Free Plan",
    };
  }

  return {
    badge: planConfig.badge,
    badgeColor: planConfig.badgeColor,
    displayName: planConfig.displayName,
  };
};

module.exports = {
  SUBSCRIPTION_PLANS,
  initializeSubscriptionPlans,
  getAllPlans,
  getPlanByName,
  getUserSubscription,
  purchaseSubscription,
  useCredit,
  getSubscriptionHistory,
  getBadgeInfo,
};
