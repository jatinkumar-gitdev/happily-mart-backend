const express = require("express");
const {
  createPost,
  getPosts,
  getPublicPosts,
  getPostById,
  likePost,
  favoritePost,
  getFavoritePosts,
  sharePost,
  addComment,
  getComments,
  searchPosts,
  unlockPost,
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
router.get("/", authenticate, generalLimiter, getPosts);
router.get("/favorites", authenticate, generalLimiter, getFavoritePosts);
router.get("/:id", authenticate, generalLimiter, getPostById);
router.post("/:id/like", authenticate, generalLimiter, likePost);
router.post("/:id/favorite", authenticate, generalLimiter, favoritePost);
router.post("/:id/share", authenticate, generalLimiter, sharePost);
router.post("/:id/comment", authenticate, generalLimiter, addComment);
router.get("/:id/comments", authenticate, generalLimiter, getComments);
router.post("/:id/unlock", authenticate, generalLimiter, unlockPost);

module.exports = router;
