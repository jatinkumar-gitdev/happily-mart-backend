const mongoose = require("mongoose");

const prospectInteractionSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    prospect: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Track interaction type
    interactionType: {
      type: String,
      enum: ["View", "ContactUnlock", "Message"],
      required: true,
    },
    // View details
    viewedAt: {
      type: Date,
    },
    // Unlock details
    unlockedAt: {
      type: Date,
    },
    // Contact unlock notification sent
    notificationSent: {
      type: Boolean,
      default: false,
    },
    notificationSentAt: {
      type: Date,
    },
    // Whether this unlocked contact was actually used (contacted)
    isContacted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
prospectInteractionSchema.index({ post: 1, prospect: 1 });
prospectInteractionSchema.index({ creator: 1, interactionType: 1, createdAt: -1 });
prospectInteractionSchema.index({ prospect: 1, interactionType: 1 });
prospectInteractionSchema.index({ post: 1, interactionType: 1, createdAt: -1 });
prospectInteractionSchema.index({ notificationSent: 1, unlockedAt: 1 });

module.exports = mongoose.model("ProspectInteraction", prospectInteractionSchema);
