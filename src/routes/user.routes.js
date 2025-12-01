const express = require("express");
const {
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
} = require("../controllers/user.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { generalLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.get("/profile", authenticate, generalLimiter, getProfile);
router.put("/profile", authenticate, generalLimiter, updateProfile);
router.post(
  "/avatar",
  authenticate,
  generalLimiter,
  avatarUpload,
  handleMulterError,
  uploadAvatar
);
router.post(
  "/avatar/preset",
  authenticate,
  generalLimiter,
  setPresetAvatar
);
router.post("/change-password", authenticate, generalLimiter, changePassword);

// Account deletion and deactivation routes
router.post(
  "/account/delete-request",
  authenticate,
  generalLimiter,
  requestAccountDeletion
);
router.post(
  "/account/cancel-deletion",
  authenticate,
  generalLimiter,
  cancelAccountDeletion
);
router.post(
  "/account/deactivate",
  authenticate,
  generalLimiter,
  deactivateAccount
);
router.get("/account/status", authenticate, generalLimiter, getAccountStatus);
router.post(
  "/account/forgot-password-deletion",
  generalLimiter,
  handleForgotPasswordForDeletion
);
router.post(
  "/account/request-reactivation",
  generalLimiter,
  requestAccountReactivation
);
router.post(
  "/account/verify-reactivation",
  generalLimiter,
  verifyReactivationToken
);
router.post(
  "/email/change/verify",
  authenticate,
  generalLimiter,
  verifyEmailChange
);

module.exports = router;
