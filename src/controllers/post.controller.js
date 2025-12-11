const asyncHandler = require("../utils/asyncHandler");
const Post = require("../models/Post.model");
const User = require("../models/User.model");
const Deal = require("../models/Deal.model");
const { sanitizeUser } = require("../utils/helpers");
const subscriptionService = require("../services/subscription.service");
const memcachedService = require("../services/memcached.service");
const { createDeal } = require("./deal.controller");
const { sendProspectInteractionNotification, sendUnlockNotification } = require("../services/notification.service");

const createPost = asyncHandler(async (req, res) => {
  const { title, requirement, description, category, subcategory, quantity, unit, hsnCode, validityPeriod = 7, isCreator = true, creditCost = 1 } = req.body;

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

  // Calculate expiry date based on validity period
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parseInt(validityPeriod));

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
    validityPeriod: parseInt(validityPeriod),
    expiresAt,
    isCreator: isCreator === 'true' || isCreator === true,
    creditCost: parseInt(creditCost) || 1,
    isActive: true,
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
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }
  
  // Invalidate user cache
  await memcachedService.del(`user_${req.user._id}`);
  
  // Emit socket event for feed refresh
  if (global.io) {
    global.io.emit("post:created", {
      postId: post._id,
      title: post.title,
      author: req.user._id,
    });
  }
  
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
    postObj.creditCost = post.creditCost || 1;

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
      // Add creator-specific fields
        postObj.unlockedDetailCount = post.unlockedDetailCount || 0;
        postObj.contactCount = post.contactCount || 0;
      postObj.dealToggleStatus = post.dealToggleStatus || "Pending";
      postObj.badgeLevel = post.badgeLevel || 0;
      postObj.isCreator = post.isCreator || true; // Add isCreator flag
      // If post is expired, provide revive options to the creator
      if (post.isExpired || post.postStatus === "Expired") {
        postObj.canRevive = true;
        const options = [7, 15, 30];
        postObj.reviveOptions = options.map((days) => ({
          days,
          cost: Math.ceil(days / 7),
        }));
      } else {
        postObj.canRevive = false;
        postObj.reviveOptions = [];
      }
    } else if (userId) {
        // Other user's post - check if unlocked
        // If post is expired or not active, never consider it unlocked for prospects
        if (post.postStatus === "Expired" || post.isExpired || post.isActive === false) {
          postObj.isUnlocked = false;
        } else {
          postObj.isUnlocked = post.unlockedBy && post.unlockedBy.some(
            (unlock) => {
              // Handle both old format (user) and new format (prospect)
              const unlockedUserId = unlock.prospect || unlock.user;
              return unlockedUserId && unlockedUserId.toString() === userId.toString();
            }
          );
        }
      postObj.isOwnPost = false;
      
      // Hide full description if not unlocked
      if (!postObj.isUnlocked) {
        postObj.description = postObj.description.substring(0, 100) + "...";
      }
      
      // Don't increment view count here anymore, it's done in getPostById
    } else {
      // Not authenticated
      postObj.isUnlocked = false;
      postObj.isOwnPost = false;
      postObj.description = postObj.description.substring(0, 100) + "...";
    }

    // Add common fields
    postObj.validityPeriod = post.validityPeriod || 7;
    postObj.expiresAt = post.expiresAt;
    postObj.postStatus = post.postStatus || "Active";
      postObj.unlockedDetailCount = post.unlockedDetailCount || 0;
      postObj.contactCount = post.contactCount || 0;
      postObj.dealToggleStatus = post.dealToggleStatus || "Pending";
      postObj.dealResult = post.dealResult || "Pending";
    
    // Check if post is expired
    if (post.expiresAt && new Date() > post.expiresAt) {
      postObj.postStatus = "Expired";
    }

    return postObj;
  });
};

// Return possible validity options and credit cost for a specific post (owner only)
const getValidityOptions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const post = await Post.findById(id);
  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  if (post.author.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const options = [7, 15, 30];
  const reviveOptions = options.map((days) => ({ days, cost: Math.ceil(days / 7) }));

  res.json({ success: true, reviveOptions, postStatus: post.postStatus, isExpired: post.isExpired });
});

const filterPostsWithActiveAuthors = (posts) =>
  posts.filter((post) => post.author && !post.author.isDeactivated);

const getPosts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, author } = req.query;
  const skip = (page - 1) * limit;

  // Build query
  const query = { isActive: true };
  
  // Filter by author if specified
  if (author === 'me') {
    query.author = req.user._id;
  } else if (author) {
    query.author = author;
  }

  const userId = req.user?._id;

  // Try to get from cache first (only for anonymous users to avoid isOwnPost conflicts)
  let cacheKey = null;
  let cachedResult = null;
  
  if (!userId) {
    cacheKey = `posts_${page}_${limit}_${author || 'all'}_anonymous`;
    cachedResult = await memcachedService.get(cacheKey);
  }

  if (cachedResult) {
    return res.json({
      success: true,
      ...cachedResult,
    });
  }

  const posts = await Post.find(query)
    .select("title requirement description category subcategory images author likes favorites shares comments createdAt unlockedBy validityPeriod expiresAt postStatus dealToggleStatus dealResult wonCount unlockedDetailCount contactCount badgeLevel isActive isExpired")
    .populate(
      "author",
      "name email phone avatar companyName designation country state city isDeactivated"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const filteredPosts = filterPostsWithActiveAuthors(posts);
  const postsWithUnlockStatus = buildPostResponse(filteredPosts, userId);

  const total = await Post.countDocuments(query);

  const result = {
    posts: postsWithUnlockStatus,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
  };

  // Cache for 5 minutes (only for anonymous users to avoid isOwnPost conflicts)
  if (!userId) {
    await memcachedService.set(cacheKey, result, 300);
  }

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
    postObj.creditCost = post.creditCost || 1;
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

  postObj.creditCost = post.creditCost || 1;
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
      (unlock) => {
        // Handle both old format (user) and new format (prospect)
        const unlockedUserId = unlock.prospect || unlock.user;
        return unlockedUserId && unlockedUserId.toString() === userId.toString();
      }
    );
    postObj.isOwnPost = false;
    
    // If post is expired or inactive, don't increment views or allow unlocks
      if (post.postStatus === "Expired" || post.isExpired || post.isActive === false) {
        postObj.isUnlocked = false;
      }
  } else {
    postObj.isUnlocked = false;
    postObj.isOwnPost = false;
  }

  if (!postObj.isUnlocked) {
    postObj.description = postObj.description.substring(0, 100) + "...";
  }

  res.json({ success: true, post: postObj });
});

// Add new controller method for incrementing view count
const incrementViewCount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?._id;

  // Validate post existence
  const post = await Post.findById(id);
  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  // Validate post author availability
  const postAuthor = await User.findById(post.author);
  if (!postAuthor || postAuthor.isDeactivated) {
    return res.status(404).json({
      success: false,
      message: "Post owner is unavailable",
    });
  }

  // Prevent authors from incrementing their own view count
  if (post.author.toString() === userId.toString()) {
    return res.status(200).json({ success: true, message: "View count not incremented for own post" });
  }

  // Increment unlocked detail count
  const updatedPost = await Post.findByIdAndUpdate(
    id,
    { $inc: { unlockedDetailCount: 1 } },
    { new: true }
  ).select("unlockedDetailCount");

  // Invalidate cache and emit socket event for real-time update
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }
  
  // Emit socket event to creator
  if (global.io) {
    global.io.to(`user:${post.author.toString()}`).emit("post:unlockedDetailCountUpdated", {
      postId: id,
      unlockedDetailCount: updatedPost.unlockedDetailCount,
    });
  }

  res.json({ 
    success: true, 
    message: "Unlocked detail count incremented successfully",
    unlockedDetailCount: updatedPost.unlockedDetailCount
  });
});

// Add new controller method for editing a post
const editPost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, requirement, description, category, subcategory, quantity, unit, hsnCode, creditCost } = req.body;
  const userId = req.user._id;

  // Validate required fields
  if (!title || !requirement || !description || !category || !subcategory || !quantity || !unit || !hsnCode) {
    return res.status(400).json({
      success: false,
      message:
        "Title, requirement, description, category, subcategory, quantity, unit, and HSN code are required",
    });
  }

  // Find the post and verify ownership
  const post = await Post.findOne({ _id: id, author: userId });
  
  if (!post) {
    return res.status(404).json({
      success: false,
      message: "Post not found or you don't have permission to edit it",
    });
  }

  // Update the post
  const updatedPost = await Post.findByIdAndUpdate(
    id,
    {
      title,
      requirement,
      description,
      quantity,
      unit,
      hsnCode,
      category,
      subcategory,
      ...(creditCost !== undefined ? { creditCost: parseInt(creditCost) || 1 } : {}),
    },
    { new: true }
  ).populate("author", "name email phone avatar companyName");

  // Build proper post response with unlock status
  const postResponse = buildPostResponse([updatedPost], userId)[0];

  // Invalidate cache
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }

  // Emit socket event for post edit
  if (global.io) {
    global.io.emit("post:edited", {
      postId: id,
      title: updatedPost.title,
      requirement: updatedPost.requirement,
      description: updatedPost.description,
      category: updatedPost.category,
      subcategory: updatedPost.subcategory,
      creditCost: updatedPost.creditCost,
    });
  }

  res.json({
    success: true,
    message: "Post updated successfully",
    post: postResponse,
  });
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
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
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
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
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
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
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
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
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

  // If post is expired or inactive, prevent unlocking
  if (post.postStatus === "Expired" || post.isExpired || post.isActive === false) {
    return res.status(400).json({
      success: false,
      message: "This post is not available for unlocking. Renew or revive the post to make it available.",
    });
  }

  // Prevent unlocking if deal has been concluded (Won or Failed)
  if (post.dealResult && ['Won', 'Failed'].includes(post.dealResult)) {
    return res.status(400).json({
      success: false,
      message: "This deal has been concluded and is no longer available for unlocking.",
    });
  }

  // Check if user has already unlocked this post
  const alreadyUnlocked = post.unlockedBy && post.unlockedBy.some(
    (unlock) => {
      // Handle both old format (user) and new format (prospect)
      const unlockedUserId = unlock.prospect || unlock.user;
      return unlockedUserId && unlockedUserId.toString() === userId.toString();
    }
  );

  if (alreadyUnlocked) {
    return res.status(400).json({
      success: false,
      message: "You have already unlocked this post",
    });
  }

  try {
    // Use credit to unlock the post (charge according to post.creditCost)
    const postCost = post.creditCost || 1;
    const creditResult = await subscriptionService.useCredit(userId, id, postCost);

    // Atomically check and add user to unlockedBy array to prevent race conditions
    // Also increment contact count
    const updatedPost = await Post.findOneAndUpdate(
      { 
        _id: id, 
        "unlockedBy.prospect": { $ne: userId }, // Ensure user hasn't already unlocked
        isActive: true,
        postStatus: "Active",
        isExpired: false,
      },
      { 
        $push: { 
          unlockedBy: { 
            prospect: userId, 
            unlockedAt: new Date() 
          },
          views: { prospect: userId, viewedAt: new Date() }
        },
        $inc: { contactCount: 1, unlockedDetailCount: 1 } // Increment contact and unlocked detail count
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
    
    // Update badge level based on contact count
    const contactCount = post.contactCount || 0;
    let badgeLevel = 0;
    if (contactCount >= 150) badgeLevel = 5; // 150+
    else if (contactCount >= 100) badgeLevel = 4; // 100
    else if (contactCount >= 50) badgeLevel = 3; // 50
    else if (contactCount >= 20) badgeLevel = 2; // 20
    else if (contactCount >= 10) badgeLevel = 1; // 10
    
    if (badgeLevel > post.badgeLevel) {
      await Post.findByIdAndUpdate(id, { badgeLevel });
    }
    
    // Send notification to post creator about unlock with prospect details
    try {
      const prospect = await User.findById(userId).select("name avatar");
      const creator = await User.findById(post.author._id);
      if (creator && prospect) {
        // Send unlock notification
        await sendUnlockNotification(
          creator._id,
          { _id: prospect._id, name: prospect.name, avatar: prospect.avatar },
          post._id,
          post.title
        );
      }
    } catch (notificationError) {
      console.error("Failed to send unlock notification:", notificationError);
    }
    
    // Track prospect interaction
    try {
      const ProspectInteraction = require("../models/ProspectInteraction.model");
      await ProspectInteraction.create({
        post: post._id,
        creator: post.author._id,
        prospect: userId,
        interactionType: "ContactUnlock",
        unlockedAt: new Date(),
        notificationSent: true,
        notificationSentAt: new Date(),
        isContacted: false // Will be marked true when deal is actually used
      });
    } catch (interactionError) {
      console.error("Failed to track prospect interaction:", interactionError);
    }
    
    // Create a deal for this unlock
    try {
      await createDeal(post._id, userId, post.author._id);
    } catch (dealError) {
      console.error("Error creating deal:", dealError);
      // Don't fail the unlock if deal creation fails
    }

    // Invalidate cache to ensure fresh data
    for (let i = 1; i <= 10; i++) {
      await memcachedService.del(`posts_${i}_6_all`);
      await memcachedService.del(`posts_${i}_10_all`);
      await memcachedService.del(`posts_${i}_6`);
      await memcachedService.del(`posts_${i}_10`);
    }
    
    // Also invalidate user cache to update credits
    await memcachedService.del(`user_${userId}`);

    // Emit socket events for real-time updates
    if (global.io) {
      // Notify creator of contact count update
      global.io.to(`user:${post.author._id.toString()}`).emit("post:contactCountUpdated", {
        postId: id,
        contactCount: post.contactCount,
        badgeLevel: post.badgeLevel,
        prospect: {
          _id: userId,
          name: (await User.findById(userId))?.name || "Unknown",
        },
      });
      
      // Notify all prospects about this post's unlock
      global.io.emit("post:unlocked", {
        postId: id,
        contactCount: post.contactCount,
      });
    }

    // Prepare response data
    const postObj = post.toObject();
    postObj.isUnlocked = true;
    postObj.creditCost = post.creditCost || 1;

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

const updateDealToggleStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { dealToggleStatus } = req.body;
  const userId = req.user._id;

  // Find the post and verify ownership
  const post = await Post.findOne({ _id: id, author: userId });
  
  if (!post) {
    return res.status(404).json({
      success: false,
      message: "Post not found or you don't have permission to update it",
    });
  }

  // Validate deal toggle status
  if (!['Pending', 'Success', 'Fail'].includes(dealToggleStatus)) {
    return res.status(400).json({
      success: false,
      message: "Invalid deal toggle status",
    });
  }

  // Prepare update data
  const updateData = { dealToggleStatus };
  let dealResult = "Pending";
  let dealStatus = "Ongoing";
  
  // If toggled to Success or Fail, update deal result and post status
  if (dealToggleStatus === 'Success') {
    updateData.dealResult = "Won";
    dealResult = "Won";
    updateData.$inc = { wonCount: 1 }; // Increment won count
    dealStatus = "Success";
  } else if (dealToggleStatus === 'Fail') {
    updateData.dealResult = "Failed";
    dealResult = "Failed";
    dealStatus = "Fail";
  }

  // Update the post
  const updatedPost = await Post.findByIdAndUpdate(
    id,
    updateData,
    { new: true }
  );

  // Update related deal(s) for this post if toggling to Success or Fail
  if ((dealToggleStatus === 'Success' || dealToggleStatus === 'Fail') && updatedPost) {
    try {
      const deals = await Deal.find({ post: id, isActive: true, status: { $in: ["Contacted", "Ongoing"] } });
      for (const deal of deals) {
        // Mark deal as closed due to post deal result
        deal.status = dealStatus;
        deal.statusHistory.push({
          status: dealStatus,
          updatedBy: userId,
          updatedAt: new Date(),
          notes: `Deal ${dealStatus.toLowerCase()} due to post deal toggle by creator`
        });
        await deal.save();
      }
      console.log(`Updated ${deals.length} deal(s) to ${dealStatus} for post ${id}`);
    } catch (dealError) {
      console.error("Error updating deals for post:", dealError);
      // Don't fail the request if deal update fails
    }
  }

  // Update user's deals workspace history and check for badges
  try {
    const user = await User.findById(userId);
    if (user) {
      // Initialize workspace if needed
      if (!user.dealsWorkspace) {
        user.dealsWorkspace = {
          totalDeals: 0,
          wonDeals: 0,
          failedDeals: 0,
          pendingDeals: 0,
          history: []
        };
      }

      // Update workspace counts
      if (dealResult === "Won") {
        user.dealsWorkspace.wonDeals = (user.dealsWorkspace.wonDeals || 0) + 1;
        
        // Check for badge achievements
        const totalWonDeals = user.dealsWorkspace.wonDeals;
        const badgeLevels = [10, 20, 50, 100, 150];
        const earnedBadges = user.badges?.earnedBadges || [];
        const earnedLevels = earnedBadges.map(b => b.level);

        for (const level of badgeLevels) {
          if (totalWonDeals >= level && !earnedLevels.includes(level)) {
            // Award new badge
            user.badges.earnedBadges.push({
              level,
              earnedAt: new Date()
            });
            
            // Send badge notification
            try {
              const { sendBadgeEarnedNotification } = require("../services/notification.service");
              await sendBadgeEarnedNotification(userId, level, totalWonDeals);
            } catch (notificationError) {
              console.error("Failed to send badge notification:", notificationError);
            }
          }
        }
        
        user.badges.totalWonDeals = totalWonDeals;
      } else if (dealResult === "Failed") {
        user.dealsWorkspace.failedDeals = (user.dealsWorkspace.failedDeals || 0) + 1;
      }

      user.dealsWorkspace.totalDeals = (user.dealsWorkspace.totalDeals || 0) + 1;

      // Add to history
      user.dealsWorkspace.history.push({
        postId: post._id,
        result: dealResult,
        timestamp: new Date(),
        notes: `Post deal marked as ${dealResult.toLowerCase()}`
      });

      await user.save();
    }
  } catch (error) {
    console.error("Error updating user deal history:", error);
    // Don't fail the request if history update fails
  }

  // Invalidate cache
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }

  // Emit socket events for real-time deal status update
  if (global.io) {
    // Notify all users about post status change
    global.io.emit("post:dealStatusChanged", {
      postId: id,
      dealToggleStatus,
      dealResult,
      postStatus: updatedPost.postStatus,
      isActive: updatedPost.isActive,
    });
    
    // Notify prospects who unlocked this post
    const deals = await Deal.find({ post: id }).select("unlocker");
    deals.forEach(deal => {
      if (deal.unlocker) {
        global.io.to(`user:${deal.unlocker.toString()}`).emit("deal:statusUpdated", {
          postId: id,
          dealResult,
          message: dealResult === "Won" 
            ? "This deal has been marked as won and is no longer available for unlocking."
            : "This deal has been marked as failed.",
        });
      }
    });
  }

  res.json({
    success: true,
    message: "Deal toggle status updated successfully",
    post: updatedPost,
    dealResult,
  });
});

const updatePostValidity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { validityPeriod } = req.body;
  const userId = req.user._id;

  // Find the post and verify ownership
  const post = await Post.findOne({ _id: id, author: userId });
  
  if (!post) {
    return res.status(404).json({
      success: false,
      message: "Post not found or you don't have permission to update it",
    });
  }

  // Validate validity period
  if (![7, 15, 30].includes(parseInt(validityPeriod))) {
    return res.status(400).json({
      success: false,
      message: "Invalid validity period. Must be 7, 15, or 30 days.",
    });
  }

  // Check if subscription has expired
  const user = await User.findById(userId);
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

  // If post is expired, we need to deduct credits for renewal
  // Deduct credits for extending validity (1 credit per 7 days).
  // We charge for the chosen validity period when updating validity.
  let creditDeductionMessage = "";
  try {
    const extensionDays = parseInt(validityPeriod);
    const creditResult = await subscriptionService.useValidityExtensionCredit(userId, extensionDays, id);
    creditDeductionMessage = creditResult.message;
  } catch (creditError) {
    return res.status(400).json({
      success: false,
      message: creditError.message,
    });
  }

  // Calculate new expiry date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + parseInt(validityPeriod));

  // Update the post
  const updatedPost = await Post.findByIdAndUpdate(
    id,
    { 
      validityPeriod: parseInt(validityPeriod),
      expiresAt,
      postStatus: "Active", // Reset to active when validity is renewed
      isExpired: false,
      isActive: true,
      lastRenewalAt: new Date(),
      validityReminderSent: false,
      dealResult: "Pending", // Reset deal result on revive so post can be unlocked again
      dealToggleStatus: "Pending", // Reset toggle status on revive
    },
    { new: true }
  ).populate("author", "name");

  // Invalidate cache
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }

  // Emit socket event for post validity update
  if (global.io) {
    global.io.emit("post:validityUpdated", {
      postId: id,
      validityPeriod: updatedPost.validityPeriod,
      expiresAt: updatedPost.expiresAt,
      postStatus: updatedPost.postStatus,
      isActive: updatedPost.isActive,
      dealResult: updatedPost.dealResult,
    });
    
    // Notify creator
    global.io.to(`user:${userId.toString()}`).emit("post:revived", {
      postId: id,
      message: `Your post "${updatedPost.title}" has been successfully revived!`,
      validityPeriod: updatedPost.validityPeriod,
      expiresAt: updatedPost.expiresAt,
    });
  }

  const message = creditDeductionMessage 
    ? `Post validity updated successfully. ${creditDeductionMessage}`
    : "Post validity updated successfully";

  res.json({
    success: true,
    message,
    post: updatedPost,
  });
});

// Delete (soft-delete) a post by the author
const deletePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const post = await Post.findOne({ _id: id, author: userId });
  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found or you don't have permission to delete it" });
  }

  // Soft delete: mark as inactive and provisional
  post.isActive = false;
  post.postStatus = "Provisional";
  await post.save();

  // Invalidate caches
  for (let i = 1; i <= 10; i++) {
    await memcachedService.del(`posts_${i}_6_all`);
    await memcachedService.del(`posts_${i}_10_all`);
    await memcachedService.del(`posts_${i}_6`);
    await memcachedService.del(`posts_${i}_10`);
  }

  // Emit socket event for post deletion
  if (global.io) {
    global.io.emit("post:deleted", {
      postId: id,
      message: "A post you viewed has been deleted.",
    });
  }

  res.json({ success: true, message: "Post deleted successfully" });
});

module.exports = {
  createPost,
  getPosts,
  getPublicPosts,
  getPostById,
  incrementViewCount,
  editPost,
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
  deletePost,
  getValidityOptions,
};