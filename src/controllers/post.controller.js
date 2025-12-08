const asyncHandler = require("../utils/asyncHandler");
const Post = require("../models/Post.model");
const User = require("../models/User.model");
const Deal = require("../models/Deal.model");
const { sanitizeUser } = require("../utils/helpers");
const subscriptionService = require("../services/subscription.service");
const memcachedService = require("../services/memcached.service");
const { createDeal } = require("./deal.controller");

const createPost = asyncHandler(async (req, res) => {
  const { title, requirement, description, category, subcategory, quantity, unit, hsnCode } = req.body;

  if (!title || !requirement || !description || !category || !subcategory || !quantity || !unit || !hsnCode) {
    return res.status(400).json({
      success: false,
      message:
        "Title, requirement, description, category, subcategory, quantity, unit, and HSN code are required",
    });
  }

  // Check if user has create credits
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Check if subscription has expired
  if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
    return res.status(403).json({
      success: false,
      message: "Your subscription has expired. Please renew to continue.",
    });
  }

  // Check if user has create credits
  if (user.createCredits < 1) {
    return res.status(403).json({
      success: false,
      message:
        "Insufficient create credits. Please upgrade your plan to create more posts.",
    });
  }

  const images = req.files
    ? req.files.map((file) => `/uploads/posts/${file.filename}`)
    : [];

  const post = await Post.create({
    title,
    requirement,
    description,
    quantity,
    unit,
    hsnCode,
    category,
    subcategory,
    images,
    author: req.user._id,
  });

  // Deduct create credit
  user.createCredits -= 1;
  user.credits -= 1; // Also deduct from general credits
  await user.save();

  await post.populate("author", "name email phone avatar companyName");

  // Build proper post response with unlock status
  const postResponse = buildPostResponse([post], req.user._id)[0];

  // Invalidate all posts cache by using a more reliable approach
  // Since Memcached doesn't support pattern-based key deletion,
  // we'll invalidate specific commonly used cache keys
  
  // Invalidate paginated posts cache (pages 1-10 should cover most cases)
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6`); // 6 is the default limit
    await memcachedService.del(`posts_${i}_10`); // 10 is another common limit
  }
  
  // Invalidate user cache
  await memcachedService.del(`user_${req.user._id}`);
  
  // Small delay to ensure cache is cleared before responding
  await new Promise(resolve => setTimeout(resolve, 100));

  res.status(201).json({ 
    success: true, 
    post: postResponse,
    remainingCreateCredits: user.createCredits,
    remainingCredits: user.credits,
  });
});

const buildPostResponse = (posts, userId) => {
  return posts.map((post) => {
    const postObj = post.toObject();

    // Add credit cost for unlocking
    postObj.creditCost = 1;

    const isAuthor =
      userId &&
      post.author &&
      post.author._id &&
      post.author._id.toString() === userId.toString();

    if (isAuthor) {
      // Own post - always unlocked, show full details
      postObj.isUnlocked = true;
      postObj.isOwnPost = true;
      // Keep full description and author details
    } else if (userId) {
      // Other user's post - check if unlocked
      postObj.isUnlocked = post.unlockedBy && post.unlockedBy.some(
        (unlock) => unlock.user.toString() === userId.toString()
      );
      postObj.isOwnPost = false;
      
      // Hide full description if not unlocked
      if (!postObj.isUnlocked) {
        postObj.description = postObj.description.substring(0, 100) + "...";
      }
    } else {
      // Not authenticated
      postObj.isUnlocked = false;
      postObj.isOwnPost = false;
      postObj.description = postObj.description.substring(0, 100) + "...";
    }

    return postObj;
  });
};

const filterPostsWithActiveAuthors = (posts) =>
  posts.filter((post) => post.author && !post.author.isDeactivated);

const getPosts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  // Try to get from cache first
  const cacheKey = `posts_${page}_${limit}`;
  const cachedResult = await memcachedService.get(cacheKey);

  if (cachedResult) {
    return res.json({
      success: true,
      ...cachedResult,
    });
  }

  const posts = await Post.find({ isActive: true })
    .select("title requirement description category subcategory images author likes favorites shares comments createdAt unlockedBy")
    .populate(
      "author",
      "name email phone avatar companyName designation country state city isDeactivated"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const userId = req.user?._id;
  const filteredPosts = filterPostsWithActiveAuthors(posts);
  const postsWithUnlockStatus = buildPostResponse(filteredPosts, userId);

  const total = await Post.countDocuments({ isActive: true });

  const result = {
    posts: postsWithUnlockStatus,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
  };

  // Cache for 5 minutes
  await memcachedService.set(cacheKey, result, 300);

  res.json({
    success: true,
    ...result,
  });
});

const getPublicPosts = asyncHandler(async (req, res) => {
  const posts = await Post.find({ isActive: true })
    .populate("author", "name isDeactivated")
    .sort({ createdAt: -1 })
    .limit(3)
    .select(
      "title requirement description createdAt likes favorites shares comments"
    );

  const postsWithBlur = filterPostsWithActiveAuthors(posts).map((post) => {
    const postObj = post.toObject();
    postObj.description = postObj.description.substring(0, 100) + "...";
    postObj.isBlurred = true;
    postObj.creditCost = 1;
    return postObj;
  });

  res.json({ success: true, posts: postsWithBlur });
});

const getPostById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const post = await Post.findById(id).populate(
    "author",
    "name email phone avatar companyName designation country state city isDeactivated"
  );

  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  if (!post.author || post.author.isDeactivated) {
    return res.status(404).json({
      success: false,
      message: "Post owner is unavailable",
    });
  }

  const userId = req.user?._id;
  const postObj = post.toObject();

  postObj.creditCost = 1;
  const isAuthor =
    userId &&
    post.author &&
    post.author._id &&
    post.author._id.toString() === userId.toString();

  if (isAuthor) {
    postObj.isUnlocked = true;
    postObj.isOwnPost = true;
  } else if (userId) {
    postObj.isUnlocked = post.unlockedBy && post.unlockedBy.some(
      (unlock) => unlock.user.toString() === userId.toString()
    );
    postObj.isOwnPost = false;
  } else {
    postObj.isUnlocked = false;
    postObj.isOwnPost = false;
  }

  if (!postObj.isUnlocked) {
    postObj.description = postObj.description.substring(0, 100) + "...";
  }

  res.json({ success: true, post: postObj });
});

const likePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const post = await Post.findById(id);

  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  const userId = req.user._id;
  const isLiked = post.likes.includes(userId);

  if (isLiked) {
    post.likes = post.likes.filter(
      (like) => like.toString() !== userId.toString()
    );
  } else {
    post.likes.push(userId);
  }

  await post.save();

  // Invalidate all posts cache by using a more reliable approach
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }

  res.json({ success: true, likes: post.likes.length, isLiked: !isLiked });
});

const favoritePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const post = await Post.findById(id);

  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  const userId = req.user._id;
  const isFavorited = post.favorites.includes(userId);

  if (isFavorited) {
    post.favorites = post.favorites.filter(
      (fav) => fav.toString() !== userId.toString()
    );
  } else {
    post.favorites.push(userId);
  }

  await post.save();

  // Invalidate all posts cache by using a more reliable approach
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }

  res.json({
    success: true,
    favorites: post.favorites.length,
    isFavorited: !isFavorited,
  });
});

const getFavoritePosts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;
  const userId = req.user._id;

  const posts = await Post.find({
    isActive: true,
    favorites: userId,
  })
    .select("title requirement description category subcategory images author likes favorites shares comments createdAt unlockedBy")
    .populate(
      "author",
      "name email phone avatar companyName designation country state city isDeactivated"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const filteredPosts = filterPostsWithActiveAuthors(posts);
  const postsWithUnlockStatus = buildPostResponse(filteredPosts, userId);
  const total = await Post.countDocuments({
    isActive: true,
    favorites: userId,
  });

  res.json({
    success: true,
    posts: postsWithUnlockStatus,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
  });
});

const sharePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const post = await Post.findById(id);

  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  post.shares += 1;
  await post.save();

  // Invalidate all posts cache by using a more reliable approach
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }

  res.json({ success: true, shares: post.shares });
});

const addComment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({
      success: false,
      message: "Comment text is required",
    });
  }

  const post = await Post.findById(id);
  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  post.comments.push({
    user: req.user._id,
    text: text.trim(),
  });

  await post.save();
  await post.populate("comments.user", "name avatar");

  // Invalidate all posts cache by using a more reliable approach
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }

  const newComment = post.comments[post.comments.length - 1];
  res.status(201).json({ success: true, comment: newComment });
});

const getComments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const post = await Post.findById(id).populate("comments.user", "name avatar");

  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  res.json({ success: true, comments: post.comments });
});

const searchPosts = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.json({ success: true, posts: [], total: 0 });
  }

  const searchQuery = q.trim();
  const skip = (page - 1) * limit;

  const searchRegex = new RegExp(searchQuery, "i");

  const posts = await Post.find({
    isActive: true,
    $or: [
      { title: searchRegex },
      { requirement: searchRegex },
      { description: searchRegex },
    ],
  })
    .select("title requirement description category subcategory images author likes favorites shares comments createdAt unlockedBy")
    .populate(
      "author",
      "name email phone avatar companyName designation country state city isDeactivated"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const userId = req.user?._id;
  const filteredPosts = filterPostsWithActiveAuthors(posts);
  const postsWithUnlockStatus = buildPostResponse(filteredPosts, userId);

  const total = await Post.countDocuments({
    isActive: true,
    $or: [
      { title: searchRegex },
      { requirement: searchRegex },
      { description: searchRegex },
    ],
  });

  res.json({
    success: true,
    posts: postsWithUnlockStatus,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
  });
});

const unlockPost = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Fetch post with author details
  let post = await Post.findById(id).populate(
    "author",
    "name email phone avatar companyName designation country state city isDeactivated"
  );

  // Validate post existence
  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  // Validate post author availability
  if (!post.author || post.author.isDeactivated) {
    return res.status(404).json({
      success: false,
      message: "Post owner is unavailable",
    });
  }

  const userId = req.user._id;

  // Prevent authors from unlocking their own posts (should already be unlocked)
  if (post.author._id.toString() === userId.toString()) {
    return res.status(400).json({
      success: false,
      message: "You cannot unlock your own post as it's already unlocked for you.",
    });
  }

  // Check if user has already unlocked this post
  const alreadyUnlocked = post.unlockedBy && post.unlockedBy.some(
    (unlock) => unlock.user.toString() === userId.toString()
  );

  if (alreadyUnlocked) {
    return res.status(400).json({
      success: false,
      message: "You have already unlocked this post",
    });
  }

  try {
    // Use credit to unlock the post
    const creditResult = await subscriptionService.useCredit(userId, id);

    // Atomically check and add user to unlockedBy array to prevent race conditions
    const updatedPost = await Post.findOneAndUpdate(
      { 
        _id: id, 
        "unlockedBy.user": { $ne: userId } // Ensure user hasn't already unlocked
      },
      { 
        $push: { 
          unlockedBy: { 
            user: userId, 
            unlockedAt: new Date() 
          } 
        } 
      },
      { new: true }
    );

    // If no document was modified, user has already unlocked the post
    if (!updatedPost) {
      return res.status(400).json({
        success: false,
        message: "You have already unlocked this post",
      });
    }

    // Update the post reference
    post = updatedPost;
    
    // Create a deal for this unlock
    try {
      await createDeal(post._id, userId, post.author._id);
    } catch (dealError) {
      console.error("Error creating deal:", dealError);
      // Don't fail the unlock if deal creation fails
    }

    // Invalidate cache to ensure fresh data
    for (let i = 1; i <= 10; i++) {
      await memcachedService.del(`posts_${i}_6`);
      await memcachedService.del(`posts_${i}_10`);
    }
    
    // Also invalidate user cache to update credits
    await memcachedService.del(`user_${userId}`);

    // Prepare response data
    const postObj = post.toObject();
    postObj.isUnlocked = true;
    postObj.creditCost = 1;

    res.json({
      success: true,
      message: `Post unlocked successfully! You have ${creditResult.remainingUnlockCredits} unlock credit${creditResult.remainingUnlockCredits !== 1 ? 's' : ''} remaining.`,
      post: postObj,
      remainingCredits: creditResult.remainingCredits,
      remainingUnlockCredits: creditResult.remainingUnlockCredits,
    });
  } catch (error) {
    // Handle credit-related errors specifically
    if (error.message.includes("subscription has expired")) {
      return res.status(403).json({
        success: false,
        message: "Your subscription has expired. Please renew to continue.",
      });
    }
    
    if (error.message.includes("insufficient")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient unlock credits. Please purchase a plan to get more credits.",
      });
    }
    
    // Re-throw other errors
    throw error;
  }
});

module.exports = {
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
};
