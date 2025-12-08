const mongoose = require("mongoose");

const dealStatusEnum = ["Contacted", "Ongoing", "Success", "Fail", "Closed"];

const dealSchema = new mongoose.Schema(
  {
    // Unique identifier for this deal thread
    dealId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    
    // Reference to the post that was unlocked
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    
    // User who unlocked the post (User B)
    unlocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    
    // Original post author (User A)
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    
    // Masked contact information for both parties
    maskedContacts: {
      unlocker: {
        email: {
          type: String,
          required: true,
        },
        phone: {
          type: String,
          required: true,
        },
        tempId: {
          type: String,
          required: true,
        },
      },
      author: {
        email: {
          type: String,
          required: true,
        },
        phone: {
          type: String,
          required: true,
        },
        tempId: {
          type: String,
          required: true,
        },
      },
    },
    
    // Current status of the deal
    status: {
      type: String,
      enum: dealStatusEnum,
      default: "Contacted",
      index: true,
    },
    
    // Status history with timestamps
    statusHistory: [
      {
        status: {
          type: String,
          enum: dealStatusEnum,
          required: true,
        },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
        notes: {
          type: String,
        },
      },
    ],
    
    // Mutual confirmation for Success/Fail status
    confirmations: {
      success: {
        unlocker: {
          confirmed: {
            type: Boolean,
            default: false,
          },
          confirmedAt: {
            type: Date,
          },
        },
        author: {
          confirmed: {
            type: Boolean,
            default: false,
          },
          confirmedAt: {
            type: Date,
          },
        },
      },
      fail: {
        unlocker: {
          confirmed: {
            type: Boolean,
            default: false,
          },
          confirmedAt: {
            type: Date,
          },
        },
        author: {
          confirmed: {
            type: Boolean,
            default: false,
          },
          confirmedAt: {
            type: Date,
          },
        },
      },
    },
    
    // Timestamps for reminders
    lastReminderSent: {
      type: Date,
    },
    
    // Auto-close tracking
    autoCloseAt: {
      type: Date,
    },
    
    // Credit adjustments
    creditAdjustments: {
      bonus: {
        type: Number,
        default: 0,
      },
      penalty: {
        type: Number,
        default: 0,
      },
    },
    
    // Deal expiration (90 days from unlock)
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    
    // Whether the deal is active
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    
    // Track chronic non-update for analytics
    chronicNonUpdate: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
dealSchema.index({ post: 1, unlocker: 1 }, { unique: true });
dealSchema.index({ author: 1, status: 1 });
dealSchema.index({ unlocker: 1, status: 1 });
dealSchema.index({ status: 1, expiresAt: 1 });
dealSchema.index({ isActive: 1, expiresAt: 1 });

module.exports = mongoose.model("Deal", dealSchema);