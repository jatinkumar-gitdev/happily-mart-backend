const User = require("../models/User.model");
const { createOTP, setOTPExpiry, isOTPValid } = require("./otp.service");
const { generateResetToken } = require("../utils/helpers");
const {
  sendOTPEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} = require("./email.service");
const { createTokens, setRefreshTokenCookie } = require("./token.service");
const { sanitizeUser } = require("../utils/helpers");
const logger = require("../utils/logger");

const signup = async (userData) => {
  const normalizedEmail = normalizeEmail(userData.email);
  userData.email = normalizedEmail;
  if (userData.alternateEmail) {
    userData.alternateEmail = normalizeEmail(userData.alternateEmail);
  }

  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    // If user exists but is not verified, update their data
    if (!existingUser.isVerified) {
      Object.assign(existingUser, userData);
      await existingUser.save();
      return {
        userId: existingUser._id,
        message: "User data updated successfully",
      };
    }
    // If user exists and is verified, throw error
    throw new Error("User already exists with this email");
  }

  // Create new user
  const user = new User(userData);
  await user.save();
  return { userId: user._id, message: "User data saved successfully" };
};

const sendOTP = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new Error("User not found");
  }

  const otp = createOTP();
  user.otp = otp;
  user.otpExpiry = setOTPExpiry();
  await user.save();

  const emailSent = await sendOTPEmail(user.email, otp, user.name);
  if (!emailSent) {
    // In development, allow OTP to be saved even if email fails
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[WARNING] Email sending failed, but OTP saved for development: ${otp}`
      );
    } else {
      throw new Error("Failed to send OTP email");
    }
  }

  return { message: "OTP sent to your email" };
};

const verifyOTP = async (email, otp) => {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new Error("User not found");
  }

  if (!isOTPValid(otp, user.otp, user.otpExpiry)) {
    throw new Error("Invalid or expired OTP");
  }

  user.isVerified = true;
  user.otp = undefined;
  user.otpExpiry = undefined;
  await user.save();

  const { accessToken, refreshToken } = createTokens(user._id);
  await sendVerificationEmail(user.email, user.name);

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(user),
    message: "Email verified successfully",
  };
};

const normalizeEmail = (email = "") => email.trim().toLowerCase();

const login = async (email, password, rememberMe = false) => {
  const normalizedEmail = normalizeEmail(email);
  
  if (!email || !password) {
    logger.warn(`Login attempt with missing credentials - email: ${email ? "provided" : "missing"}, password: ${password ? "provided" : "missing"}`);
    throw new Error("Email and password are required");
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    logger.warn(`Login attempt with non-existent email: ${normalizedEmail}`);
    throw new Error("Invalid credentials");
  }

  // Check if account is deactivated - throw specific error
  if (user.isDeactivated) {
    logger.warn(`Login attempt on deactivated account: ${normalizedEmail}`);
    const error = new Error("ACCOUNT_DEACTIVATED");
    error.statusCode = 403;
    error.message = "Account is deactivated. Click 'Reactivate Account' to receive a reactivation email.";
    throw error;
  }

  // Validate password
  if (!password || password.trim() === "") {
    logger.warn(`Login attempt with empty password for: ${normalizedEmail}`);
    throw new Error("Password is required");
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    logger.warn(`Login attempt with invalid password for: ${normalizedEmail}`);
    throw new Error("Invalid credentials");
  }

  if (!user.isVerified) {
    logger.warn(`Login attempt on unverified account: ${normalizedEmail}`);
    throw new Error("Please verify your email first");
  }

  logger.info(`Successful login for: ${normalizedEmail}`);

  // Check if account deletion is scheduled. Instead of blocking login,
  // include deletion info in the response so the client can allow the
  // user to sign in and cancel deletion from profile settings.
  let deletionInfo = null;
  if (user.deletionRequestedAt && user.deletionScheduledFor) {
    const daysUntilDeletion = Math.ceil(
      (user.deletionScheduledFor - new Date()) / (1000 * 60 * 60 * 24)
    );
    if (!Number.isNaN(daysUntilDeletion) && daysUntilDeletion > 0) {
      deletionInfo = {
        scheduled: true,
        daysUntilDeletion,
        message: `Account deletion is scheduled. You have ${daysUntilDeletion} day(s) remaining. You can cancel the deletion from your profile settings.`,
      };
    }
  }

  const { accessToken, refreshToken } = createTokens(user._id);

  const response = {
    accessToken,
    refreshToken,
    user: sanitizeUser(user),
    rememberMe,
    message: "Login successful",
  };

  if (deletionInfo) {
    response.deletionInfo = deletionInfo;
  }

  return response;
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if user exists
    return { message: "If email exists, password reset link will be sent" };
  }

  const resetToken = generateResetToken();
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  await sendPasswordResetEmail(user.email, resetToken, user.name);
  return { message: "Password reset link sent to your email" };
};

const resetPassword = async (token, password) => {
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpiry: { $gt: new Date() },
  });

  if (!user) {
    throw new Error("Invalid or expired reset token");
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpiry = undefined;
  await user.save();

  return { message: "Password reset successfully" };
};

module.exports = {
  signup,
  sendOTP,
  verifyOTP,
  login,
  forgotPassword,
  resetPassword,
};
