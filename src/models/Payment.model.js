const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionHistory",
    },
    subscriptionPlan: {
      type: String,
      enum: ["Free", "Beginner", "Intermediate", "Advanced"],
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    razorpayOrderId: {
      type: String,
      required: true,
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
    paymentMethod: {
      type: String,
      default: "razorpay",
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ post: 1 });
paymentSchema.index({ razorpayOrderId: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
