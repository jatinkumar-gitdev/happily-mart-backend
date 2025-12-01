const User = require("../models/User.model");
const Post = require("../models/Post.model");
const { sanitizeUser, generateResetToken } = require("../utils/helpers");
const {
  sendPasswordResetEmail,
  sendReactivationEmail,
} = require("./email.service");
const redisService = require("./redis.service");

/**
 * Request account deletion - schedules deletion after 7 days
 * @param {string} userId - User ID
 * @param {string} password - User password for verification
 * @returns {Promise<Object>}
 */
const requestAccountDeletion = async (userId, password) => {
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw new Error("User not found");
  }

  if (user.isDeactivated) {
    throw new Error("Account is already deactivated");
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error("Invalid password");
  }

  // Schedule deletion for 7 days from now
  const deletionDate = new Date();
  deletionDate.setDate(deletionDate.getDate() + 7);

  user.deletionRequestedAt = new Date();
  user.deletionScheduledFor = deletionDate;
  await user.save();

  return {
    message:
      "Account deletion scheduled. Your account will be permanently deleted in 7 days.",
    deletionScheduledFor: deletionDate,
  };
};

/**
 * Cancel account deletion request
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
const cancelAccountDeletion = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (!user.deletionRequestedAt) {
    throw new Error("No deletion request found");
  }

  user.deletionRequestedAt = undefined;
  user.deletionScheduledFor = undefined;
  await user.save();

  return {
    message: "Account deletion request cancelled successfully",
  };
};

/**
 * Deactivate account immediately
 * @param {string} userId - User ID
 * @param {string} password - User password for verification
 * @param {string} reason - Optional reason for deactivation
 * @returns {Promise<Object>}
 */
const deactivateAccount = async (userId, password, reason = "") => {
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw new Error("User not found");
  }

  if (user.isDeactivated) {
    throw new Error("Account is already deactivated");
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error("Invalid password");
  }

  user.isDeactivated = true;
  user.deactivationReason = reason;
  user.deletionRequestedAt = undefined;
  user.deletionScheduledFor = undefined;
  await user.save();

  return {
    message: "Account deactivated successfully",
    user: sanitizeUser(user),
  };
};

/**
 * Request account reactivation - sends reactivation email
 * @param {string} email - User email
 * @returns {Promise<Object>}
 */
const requestAccountReactivation = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    // Don't reveal if user exists
    return {
      message:
        "If email exists and account is deactivated, reactivation link will be sent",
    };
  }

  if (!user.isDeactivated) {
    return {
      message:
        "If email exists and account is deactivated, reactivation link will be sent",
    };
  }

  const reactivationToken = generateResetToken();
  user.reactivationToken = reactivationToken;
  user.reactivationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await user.save();

  await sendReactivationEmail(user.email, reactivationToken, user.name);

  return {
    message: "Reactivation link sent to your email. Please check your inbox.",
  };
};

/**
 * Reactivate account using token
 * @param {string} token - Reactivation token
 * @returns {Promise<Object>}
 */
const reactivateAccount = async (token) => {
  const user = await User.findOne({
    reactivationToken: token,
    reactivationExpiry: { $gt: new Date() },
  });

  if (!user) {
    throw new Error("Invalid or expired reactivation token");
  }

  if (!user.isDeactivated) {
    throw new Error("Account is not deactivated");
  }

  user.isDeactivated = false;
  user.deactivationReason = undefined;
  user.reactivationToken = undefined;
  user.reactivationExpiry = undefined;
  await user.save();

  return {
    message: "Account reactivated successfully",
    user: sanitizeUser(user),
  };
};

/**
 * Delete account permanently (called by scheduled job)
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
const deleteAccountPermanently = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Delete all user posts
  await Post.deleteMany({ author: userId });

  // Delete user account
  await User.findByIdAndDelete(userId);

  return {
    message: "Account and all associated data deleted permanently",
    userId,
  };
};

/**
 * Handle forgot password scenario for account deletion
 * Sends password reset email so user can reset password and then delete account
 * @param {string} email - User email
 * @returns {Promise<Object>}
 */
const handleForgotPasswordForDeletion = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    // Don't reveal if user exists
    return {
      message:
        "If email exists and account deletion is scheduled, password reset link will be sent",
    };
  }

  // Check if deletion is scheduled
  if (!user.deletionRequestedAt) {
    return {
      message:
        "If email exists and account deletion is scheduled, password reset link will be sent",
    };
  }

  const resetToken = generateResetToken();
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  await sendPasswordResetEmail(user.email, resetToken, user.name);

  return {
    message:
      "Password reset link sent to your email. After resetting your password, you can proceed with account deletion.",
  };
};

/**
 * Get account status
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
const getAccountStatus = async (userId) => {
  // Try to get from cache first
  const cacheKey = `account_status_${userId}`;
  const cachedStatus = await redisService.get(cacheKey);

  if (cachedStatus) {
    return cachedStatus;
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  let daysUntilDeletion = null;
  if (user.deletionRequestedAt && user.deletionScheduledFor) {
    const now = new Date();
    const scheduledDate = new Date(user.deletionScheduledFor);
    if (scheduledDate > now) {
      daysUntilDeletion = Math.ceil(
        (scheduledDate - now) / (1000 * 60 * 60 * 24)
      );
    } else {
      daysUntilDeletion = 0;
    }
  }

  const status = {
    isDeactivated: user.isDeactivated,
    deactivationReason: user.deactivationReason,
    deletionRequestedAt: user.deletionRequestedAt,
    deletionScheduledFor: user.deletionScheduledFor,
    daysUntilDeletion,
  };

  // Cache for 5 minutes
  await redisService.set(cacheKey, status, 300);

  return status;
};

module.exports = {
  requestAccountDeletion,
  cancelAccountDeletion,
  deactivateAccount,
  requestAccountReactivation,
  reactivateAccount,
  deleteAccountPermanently,
  handleForgotPasswordForDeletion,
  getAccountStatus,
};
