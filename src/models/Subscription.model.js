const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ["Free", "Beginner", "Intermediate", "Advanced"],
    unique: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  priceINR: {
    type: Number,
    required: true,
    default: 0,
  },
  priceUSD: {
    type: Number,
    required: true,
    default: 0,
  },
  gstINR: {
    type: Number,
    default: 0,
  },
  gstUSD: {
    type: Number,
    default: 0,
  },
  totalINR: {
    type: Number,
    default: 0,
  },
  totalUSD: {
    type: Number,
    default: 0,
  },
  unlockCredits: {
    type: Number,
    required: true,
    default: 0,
  },
  createCredits: {
    type: Number,
    required: true,
    default: 0,
  },
  credits: {
    type: Number,
    required: true,
    default: 0,
  },
  duration: {
    type: Number, // Duration in days, 0 for lifetime
    default: 30,
  },
  features: [
    {
      type: String,
    },
  ],
  badge: {
    type: String,
    default: "",
  },
  badgeColor: {
    type: String,
    default: "#gray",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

const subscriptionHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    plan: {
      type: String,
      required: true,
      enum: ["Free", "Beginner", "Intermediate", "Advanced"],
    },
    credits: {
      type: Number,
      required: true,
    },
    priceINR: {
      type: Number,
      required: true,
    },
    priceUSD: {
      type: Number,
      required: true,
    },
    gstINR: {
      type: Number,
      default: 0,
    },
    gstUSD: {
      type: Number,
      default: 0,
    },
    totalINR: {
      type: Number,
      default: 0,
    },
    totalUSD: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      enum: ["INR", "USD"],
      default: "INR",
    },
    amountPaid: {
      type: Number,
      required: true,
    },
    paymentId: {
      type: String,
    },
    razorpayOrderId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
    },
    razorpaySignature: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
    },
    purchasedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
subscriptionHistorySchema.index({ user: 1, createdAt: -1 });
subscriptionHistorySchema.index({ razorpayOrderId: 1 });

const SubscriptionPlan = mongoose.model(
  "SubscriptionPlan",
  subscriptionPlanSchema
);
const SubscriptionHistory = mongoose.model(
  "SubscriptionHistory",
  subscriptionHistorySchema
);

module.exports = { SubscriptionPlan, SubscriptionHistory };
