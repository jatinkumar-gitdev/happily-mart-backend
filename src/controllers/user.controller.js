const asyncHandler = require("../utils/asyncHandler");
const User = require("../models/User.model");
const { sanitizeUser, generateAlphaNumericOTP } = require("../utils/helpers");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const {
  avatarUpload,
  handleMulterError,
} = require("../middleware/upload.middleware");
const accountService = require("../services/account.service");
const {
  sendEmailChangeVerificationEmail,
} = require("../services/email.service");
const redisService = require("../services/redis.service");

const PRESET_AVATARS = [
  "/avatars/avatar-1.png",
  "/avatars/avatar-2.png",
  "/avatars/avatar-3.png",
  "/avatars/avatar-4.png",
  "/avatars/avatar-5.png",
  "/avatars/avatar-6.png",
];

const removeExistingAvatarFile = (avatarPath) => {
  if (!avatarPath || !avatarPath.startsWith("/uploads/avatars/")) {
    return;
  }

  const absolutePath = path.join(process.cwd(), avatarPath);
  if (fs.existsSync(absolutePath)) {
    try {
      fs.unlinkSync(absolutePath);
    } catch (err) {
      console.error("Error deleting old avatar:", err);
    }
  }
};

const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "+credits +unlockCredits +createCredits +subscriptionPlan +subscriptionExpiresAt"
  );
  
  const sanitizedUser = sanitizeUser(user);
  // Include subscription details in profile
  sanitizedUser.credits = user.credits;
  sanitizedUser.unlockCredits = user.unlockCredits;
  sanitizedUser.createCredits = user.createCredits;
  sanitizedUser.subscriptionPlan = user.subscriptionPlan;
  sanitizedUser.subscriptionExpiresAt = user.subscriptionExpiresAt;
  
  res.json({
    success: true,
    user: sanitizedUser,
    presets: PRESET_AVATARS,
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const updates = { ...req.body };

  if (updates.email) {
    updates.email = updates.email.trim().toLowerCase();
  }
  if (updates.alternateEmail) {
    updates.alternateEmail = updates.alternateEmail.trim().toLowerCase();
  }

  delete updates.password;
  delete updates.isVerified;
  delete updates.role;
  delete updates.isDeactivated;
  delete updates.deletionRequestedAt;
  delete updates.deletionScheduledFor;
  delete updates.otp;
  delete updates.otpExpiry;
  delete updates.resetPasswordToken;
  delete updates.resetPasswordExpiry;

  const user = await User.findById(req.user._id).select(
    "+emailChangeToken +emailChangeExpiry"
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  let verificationRequired = false;
  let pendingEmail = null;

  if (updates.email && updates.email !== user.email) {
    const existingUser = await User.findOne({ email: updates.email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email is already in use",
      });
    }

    const otp = generateAlphaNumericOTP(8);
    user.pendingEmail = updates.email;
    user.emailChangeToken = otp;
    user.emailChangeExpiry = new Date(Date.now() + 15 * 60 * 1000);

    const emailSent = await sendEmailChangeVerificationEmail(
      user.pendingEmail,
      otp,
      user.name
    );

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email. Please try again.",
      });
    }

    verificationRequired = true;
    pendingEmail = user.pendingEmail;
    delete updates.email;
  }

  Object.assign(user, updates);
  await user.save();

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);
  await redisService.del(`account_status_${req.user._id}`);

  res.json({
    success: true,
    user: sanitizeUser(user),
    presets: PRESET_AVATARS,
    verificationRequired,
    pendingEmail,
    message: verificationRequired
      ? "We sent a verification code to your new email. Enter it within 15 minutes to finish the update."
      : "Profile updated successfully",
  });
});

const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });
  }

  const user = await User.findById(req.user._id);
  removeExistingAvatarFile(user.avatar);

  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { avatar: avatarPath },
    { new: true }
  );

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);

  res.json({
    success: true,
    message: "Avatar uploaded successfully",
    avatar: updatedUser.avatar,
  });
});

const setPresetAvatar = asyncHandler(async (req, res) => {
  const { preset } = req.body || {};

  if (!preset || !PRESET_AVATARS.includes(preset)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid preset avatar selection" });
  }

  const user = await User.findById(req.user._id);
  removeExistingAvatarFile(user.avatar);

  user.avatar = preset;
  await user.save();

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);

  res.json({
    success: true,
    message: "Avatar updated successfully",
    avatar: user.avatar,
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Current password and new password are required",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "New password must be at least 6 characters long",
    });
  }

  const user = await User.findById(req.user._id).select("+password");

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: "Current password is incorrect",
    });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await User.findByIdAndUpdate(req.user._id, { password: hashedPassword });

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);

  res.json({
    success: true,
    message: "Password changed successfully",
  });
});

// Account deletion and deactivation controllers
const requestAccountDeletion = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      message: "Password is required to confirm account deletion",
    });
  }

  const result = await accountService.requestAccountDeletion(
    req.user._id,
    password
  );

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);
  await redisService.del(`account_status_${req.user._id}`);

  res.json({
    success: true,
    ...result,
  });
});

const cancelAccountDeletion = asyncHandler(async (req, res) => {
  const result = await accountService.cancelAccountDeletion(req.user._id);

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);
  await redisService.del(`account_status_${req.user._id}`);

  res.json({
    success: true,
    ...result,
  });
});

const deactivateAccount = asyncHandler(async (req, res) => {
  const { password, reason } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      message: "Password is required to confirm account deactivation",
    });
  }

  const result = await accountService.deactivateAccount(
    req.user._id,
    password,
    reason
  );

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);
  await redisService.del(`account_status_${req.user._id}`);

  res.json({
    success: true,
    ...result,
  });
});

const getAccountStatus = asyncHandler(async (req, res) => {
  const status = await accountService.getAccountStatus(req.user._id);

  res.json({
    success: true,
    ...status,
  });
});

const handleForgotPasswordForDeletion = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  const result = await accountService.handleForgotPasswordForDeletion(email);

  res.json({
    success: true,
    ...result,
  });
});

const requestAccountReactivation = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  const result = await accountService.requestAccountReactivation(email);

  res.json({
    success: true,
    ...result,
  });
});

const verifyReactivationToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Reactivation token is required",
    });
  }

  const result = await accountService.reactivateAccount(token);

  // Invalidate user cache if reactivation was successful
  if (result && result.user && result.user._id) {
    await redisService.del(`user_${result.user._id}`);
    await redisService.del(`account_status_${result.user._id}`);
  }

  res.json({
    success: true,
    ...result,
  });
});

const verifyEmailChange = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Verification code is required",
    });
  }

  const user = await User.findById(req.user._id).select(
    "+emailChangeToken +emailChangeExpiry"
  );

  if (
    !user ||
    !user.pendingEmail ||
    !user.emailChangeToken ||
    !user.emailChangeExpiry
  ) {
    return res.status(400).json({
      success: false,
      message: "No email change request found",
    });
  }

  if (user.emailChangeExpiry < new Date()) {
    user.pendingEmail = undefined;
    user.emailChangeToken = undefined;
    user.emailChangeExpiry = undefined;
    await user.save();
    return res.status(400).json({
      success: false,
      message: "Verification code has expired. Please try again.",
    });
  }

  if (user.emailChangeToken !== token.trim().toUpperCase()) {
    return res.status(400).json({
      success: false,
      message: "Invalid verification code",
    });
  }

  user.email = user.pendingEmail;
  user.pendingEmail = undefined;
  user.emailChangeToken = undefined;
  user.emailChangeExpiry = undefined;
  await user.save();

  // Invalidate user cache
  await redisService.del(`user_${req.user._id}`);

  res.json({
    success: true,
    message:
      "Email updated successfully. Please log in again with your new email.",
  });
});

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  setPresetAvatar,
  changePassword,
  requestAccountDeletion,
  cancelAccountDeletion,
  deactivateAccount,
  getAccountStatus,
  handleForgotPasswordForDeletion,
  requestAccountReactivation,
  verifyReactivationToken,
  verifyEmailChange,
  avatarUpload,
  handleMulterError,
  PRESET_AVATARS,
};
