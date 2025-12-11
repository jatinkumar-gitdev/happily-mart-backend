const express = require("express");
const {
  createPost,
  getPosts,
  getPublicPosts,
  getPostById,
  incrementViewCount,
  editPost, // Add new import
  likePost,
  favoritePost,
  getFavoritePosts,
  sharePost,
  addComment,
  getComments,
  searchPosts,
  unlockPost,
  updateDealToggleStatus,
  updatePostValidity,
  getValidityOptions,
    deletePost,
} = require("../controllers/post.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { generalLimiter } = require("../middleware/rateLimiter");
const {
  postImageUpload,
  handleMulterError,
} = require("../middleware/upload.middleware");

const router = express.Router();

// Public route - get first 3 posts (blurred)
router.get("/public", generalLimiter, getPublicPosts);

// Search route (public but can be used by authenticated users too)
router.get("/search", generalLimiter, searchPosts);

// Protected routes
router.post(
  "/",
  authenticate,
  generalLimiter,
  postImageUpload,
  handleMulterError,
  createPost
);
router.put("/:id", authenticate, generalLimiter, editPost); // Add new route for editing posts
router.delete("/:id", authenticate, generalLimiter, deletePost);
router.get("/", authenticate, generalLimiter, getPosts);
router.get("/favorites", authenticate, generalLimiter, getFavoritePosts);
router.get("/:id", authenticate, generalLimiter, getPostById);
router.post("/:id/view", authenticate, generalLimiter, incrementViewCount);
router.post("/:id/like", authenticate, generalLimiter, likePost);
router.post("/:id/favorite", authenticate, generalLimiter, favoritePost);
router.post("/:id/share", authenticate, generalLimiter, sharePost);
router.post("/:id/comment", authenticate, generalLimiter, addComment);
router.get("/:id/comments", authenticate, generalLimiter, getComments);
router.post("/:id/unlock", authenticate, generalLimiter, unlockPost);
router.put("/:id/deal-toggle", authenticate, generalLimiter, updateDealToggleStatus);
router.put("/:id/validity", authenticate, generalLimiter, updatePostValidity);
router.get("/:id/validity/options", authenticate, generalLimiter, getValidityOptions);

module.exports = router;