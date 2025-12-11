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

    // Track prospects who viewed the post
    views: [
      {
        prospect: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    unlockedBy: [
      {
        prospect: {
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
    
    // Validity period for the post (in days)
    validityPeriod: {
      type: Number,
      enum: [7, 15, 30],
      default: 7,
    },
    
    // Expiry date for the post
    expiresAt: {
      type: Date,
      index: true,
    },
    
    // Post status for creator/prospect system
    postStatus: {
      type: String,
      enum: ["Active", "Provisional", "Expired"],
      default: "Active",
      index: true,
    },
    
    // Badge level based on number of prospects who contacted
    badgeLevel: {
      type: Number,
      default: 0, // 0 = no badge, 1 = 10 contacts, 2 = 20 contacts, etc.
    },
    
    // Count of prospects who unlocked/viewed the post details
    unlockedDetailCount: {
      type: Number,
      default: 0,
    },
    
    // Count of prospects who contacted (unlocked) the post
    contactCount: {
      type: Number,
      default: 0,
    },
    
    // Toggle status for deal success/failure
    dealToggleStatus: {
      type: String,
      enum: ["Pending", "Success", "Fail"],
      default: "Pending",
    },

    // Track if validity renewal reminder has been sent
    validityReminderSent: {
      type: Boolean,
      default: false,
    },

    // Last validity renewal date
    lastRenewalAt: {
      type: Date,
    },

    // Won count for badge calculation
    wonCount: {
      type: Number,
      default: 0,
    },

    // Track achieved badges (array of badge levels)
    achievedBadges: [
      {
        type: Number, // 10, 20, 50, 100, 150
      },
    ],

    // Track won deal status from creator's perspective
    dealResult: {
      type: String,
      enum: ["Pending", "Won", "Failed", "Provisional"],
      default: "Pending",
      index: true,
    },

    // Expiry status
    isExpired: {
      type: Boolean,
      default: false,
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
postSchema.index({ "views.prospect": 1, createdAt: -1 });
postSchema.index({ "unlockedBy.prospect": 1, createdAt: -1 });
postSchema.index({ postStatus: 1, createdAt: -1 });
postSchema.index({ dealToggleStatus: 1, createdAt: -1 });
postSchema.index({ dealResult: 1, createdAt: -1 });
postSchema.index({ expiresAt: 1 });
postSchema.index({ isExpired: 1, createdAt: -1 });
postSchema.index({ author: 1, dealResult: 1 });
postSchema.index({ author: 1, wonCount: -1 });

// Credit cost for unlocking posts
postSchema.virtual("creditCost").get(function () {
  return 1; // default virtual fallback (migrated to real field below)
});

// Make creditCost a real stored field so different posts can charge different credits
postSchema.add({
  creditCost: {
    type: Number,
    default: 1,
    min: 1,
  },
});
postSchema.set("toJSON", { virtuals: true });
postSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Post", postSchema);