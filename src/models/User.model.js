const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    designation: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    alternateEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
    },
    countryCode: {
      type: String,
      required: true,
    },
    alternatePhone: {
      type: String,
    },
    alternateCountryCode: {
      type: String,
    },
    companyName: {
      type: String,
      trim: true,
    },
    registrationNumber: {
      type: String,
      trim: true,
    },
    gstinNumber: {
      type: String,
      trim: true,
    },
    companyType: {
      type: String,
      trim: true,
    },
    companyStructure: {
      type: String,
      trim: true,
    },
    address1: {
      type: String,
      trim: true,
    },
    alternateAddress: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    commodities: {
      type: String,
      trim: true,
    },
    sector: {
      type: String,
      trim: true,
    },
    subSector: {
      type: String,
      trim: true,
    },
    linkedin: {
      type: String,
      trim: true,
    },
    twitter: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
    },
    otpExpiry: {
      type: Date,
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpiry: {
      type: Date,
    },
    pendingEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    emailChangeToken: {
      type: String,
      select: false,
    },
    emailChangeExpiry: {
      type: Date,
      select: false,
    },
    avatar: {
      type: String,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isDeactivated: {
      type: Boolean,
      default: false,
    },
    deactivationReason: {
      type: String,
      trim: true,
    },
    deletionRequestedAt: {
      type: Date,
    },
    deletionScheduledFor: {
      type: Date,
    },
    reactivationToken: {
      type: String,
    },
    reactivationExpiry: {
      type: Date,
    },
    // Subscription fields
    subscriptionPlan: {
      type: String,
      enum: ["Free", "Beginner", "Intermediate", "Advanced"],
      default: "Free",
    },
    credits: {
      type: Number,
      default: 1, // Free plan gets 1 credit
    },
    unlockCredits: {
      type: Number,
      default: 1,
    },
    createCredits: {
      type: Number,
      default: 1,
    },
    subscriptionExpiresAt: {
      type: Date,
    },
    subscriptionPurchasedAt: {
      type: Date,
    },
    creditsHistory: [
      {
        amount: {
          type: Number,
          required: true,
        },
        type: {
          type: String,
          enum: ["bonus", "penalty", "purchase", "used"],
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        relatedEntity: {
          type: String, // Could be dealId, postId, etc.
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    
    // Track total penalties for analytics
    totalPenalties: {
      type: Number,
      default: 0,
    },
    
    // User notifications
    notifications: [
      {
        title: {
          type: String,
          required: true,
        },
        message: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        isRead: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Achievement badges (Won deals count)
    badges: {
      totalWonDeals: {
        type: Number,
        default: 0,
      },
      earnedBadges: [
        {
          level: {
            type: Number, // 10, 20, 50, 100, 150
          },
          earnedAt: {
            type: Date,
          },
        },
      ],
    },

    // Deals workspace/history
    dealsWorkspace: {
      totalDeals: {
        type: Number,
        default: 0,
      },
      wonDeals: {
        type: Number,
        default: 0,
      },
      failedDeals: {
        type: Number,
        default: 0,
      },
      pendingDeals: {
        type: Number,
        default: 0,
      },
      history: [
        {
          postId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post",
          },
          result: {
            type: String,
            enum: ["Won", "Failed", "Pending"],
          },
          timestamp: {
            type: Date,
            default: Date.now,
          },
          notes: {
            type: String,
          },
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Compound indexes for common query patterns
userSchema.index({ email: 1 });
userSchema.index({ isDeactivated: 1, createdAt: -1 });
userSchema.index({ subscriptionPlan: 1, subscriptionExpiresAt: 1 });
userSchema.index({ role: 1, isDeactivated: 1 });

module.exports = mongoose.model("User", userSchema);
