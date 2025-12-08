const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    requirement: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    // New fields for purchase quantity
    quantity: {
      type: String,
      required: true,
    },
    unit: {
      type: String,
      required: true,
    },
    hsnCode: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    subcategory: {
      type: String,
      required: true,
      trim: true,
    },
    images: [
      {
        type: String,
      },
    ],
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    unlockedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        unlockedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    shares: {
      type: Number,
      default: 0,
    },
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        text: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    
    // Post status for deal tracking
    dealStatus: {
      type: String,
      enum: ["Available", "In Progress", "Completed", "Cancelled"],
      default: "Available",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ isActive: 1, createdAt: -1 });
// Additional compound indexes for common query patterns
postSchema.index({ favorites: 1, createdAt: -1 });
postSchema.index({ likes: 1, createdAt: -1 });
postSchema.index({ category: 1, subcategory: 1, createdAt: -1 });
postSchema.index({ "unlockedBy.user": 1, createdAt: -1 });

// Credit cost for unlocking posts
postSchema.virtual("creditCost").get(function () {
  return 1; // 1 credit point to unlock any post
});

postSchema.set("toJSON", { virtuals: true });
postSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Post", postSchema);