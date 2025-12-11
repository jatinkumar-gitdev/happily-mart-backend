const asyncHandler = require("../utils/asyncHandler");
const User = require("../models/User.model");
const Post = require("../models/Post.model");
const Deal = require("../models/Deal.model");
const { sanitizeUser } = require("../utils/helpers");

// Get all users (paginated)
const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = "" } = req.query;
  const skip = (page - 1) * limit;

  let query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { companyName: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(query)
    .select("-password")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await User.countDocuments(query);

  res.json({
    success: true,
    users: users.map(sanitizeUser),
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
  });
});

// Get user by ID
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).select("-password");
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  res.json({ success: true, user: sanitizeUser(user) });
});

// Update user
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Remove sensitive fields that shouldn't be updated via admin panel
  delete updates.password;
  delete updates.emailVerificationToken;
  delete updates.resetPasswordToken;
  delete updates.role;

  const user = await User.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  res.json({ success: true, user: sanitizeUser(user) });
});

// Deactivate user
const deactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findByIdAndUpdate(
    id,
    { isDeactivated: true },
    { new: true }
  ).select("-password");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  res.json({ success: true, user: sanitizeUser(user) });
});

// Get all posts (paginated)
const getAllPosts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = "" } = req.query;
  const skip = (page - 1) * limit;

  let query = { isActive: true };
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { requirement: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const posts = await Post.find(query)
    .populate("author", "name email companyName")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Post.countDocuments(query);

  res.json({
    success: true,
    posts,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
  });
});

// Get post by ID
const getPostById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const post = await Post.findById(id).populate(
    "author",
    "name email companyName"
  );
  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  res.json({ success: true, post });
});

// Update post status
const updatePostStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  const post = await Post.findByIdAndUpdate(
    id,
    { isActive },
    { new: true }
  );
  if (!post) {
    return res.status(404).json({ success: false, message: "Post not found" });
  }

  res.json({ success: true, post });
});

// Get all deals (paginated)
const getAllDeals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (page - 1) * limit;

  let query = { isActive: true };
  if (status) {
    query.status = status;
  }

  const deals = await Deal.find(query)
    .populate("post", "title")
    .populate("unlocker", "name email")
    .populate("author", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Deal.countDocuments(query);

  res.json({
    success: true,
    deals,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
  });
});

// Get deal by ID
const getDealById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deal = await Deal.findById(id)
    .populate("post", "title description")
    .populate("unlocker", "name email")
    .populate("author", "name email");
  if (!deal) {
    return res.status(404).json({ success: false, message: "Deal not found" });
  }

  res.json({ success: true, deal });
});

// Update deal status
const updateDealStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const deal = await Deal.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );
  if (!deal) {
    return res.status(404).json({ success: false, message: "Deal not found" });
  }

  res.json({ success: true, deal });
});

// Close deal
const closeDeal = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deal = await Deal.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );
  if (!deal) {
    return res.status(404).json({ success: false, message: "Deal not found" });
  }

  res.json({ success: true, message: "Deal closed successfully" });
});

// Get deal analytics
const getDealAnalytics = asyncHandler(async (req, res) => {
  // Success rate by status
  const statusCounts = await Deal.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Average response time
  const responseTimes = await Deal.aggregate([
    {
      $match: {
        status: { $in: ["Success", "Fail", "Closed"] },
      },
    },
    {
      $project: {
        responseTime: {
          $divide: [
            { $subtract: [{ $arrayElemAt: ["$statusHistory.updatedAt", -1] }, "$createdAt"] },
            1000 * 60 * 60 * 24, // Convert to days
          ],
        },
      },
    },
  ]);

  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((sum, item) => sum + item.responseTime, 0) / responseTimes.length
      : 0;

  res.json({
    success: true,
    statusCounts,
    avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
  });
});

// Get recent activity
const getRecentActivity = asyncHandler(async (req, res) => {
  const recentUsers = await User.find()
    .select("name email createdAt")
    .sort({ createdAt: -1 })
    .limit(5);

  const recentPosts = await Post.find({ isActive: true })
    .populate("author", "name")
    .select("title createdAt")
    .sort({ createdAt: -1 })
    .limit(5);

  const recentDeals = await Deal.find({ isActive: true })
    .populate("post", "title")
    .populate("unlocker", "name")
    .select("status createdAt")
    .sort({ createdAt: -1 })
    .limit(5);

  res.json({
    success: true,
    recentUsers,
    recentPosts,
    recentDeals,
  });
});

// Get post analytics for admin dashboard
const getPostAnalytics = asyncHandler(async (req, res) => {
  try {
    // Get total posts
    const totalPosts = await Post.countDocuments();
    
    // Get active posts
    const activePosts = await Post.countDocuments({ 
      postStatus: "Active",
      expiresAt: { $gte: new Date() }
    });
    
    // Get total views and contacts
    const postsAggregation = await Post.aggregate([
      {
        $group: {
          _id: null,
          totalViews: { $sum: "$unlockedDetailCount" },
          totalContacts: { $sum: "$contactCount" },
          avgContactsPerPost: { $avg: "$contactCount" }
        }
      }
    ]);
    
    const postData = postsAggregation[0] || { 
      totalViews: 0, 
      totalContacts: 0, 
      avgContactsPerPost: 0 
    };
    
    // Get total creators (users who have created posts)
    const totalCreators = await User.countDocuments({ 
      _id: { $in: await Post.distinct("author") }
    });
    
    // Get top creators by contact count
    const topCreators = await Post.aggregate([
      {
        $group: {
          _id: "$author",
          totalContacts: { $sum: "$contactCount" },
          postCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "authorInfo"
        }
      },
      {
        $unwind: "$authorInfo"
      },
      {
        $project: {
          name: "$authorInfo.name",
          companyName: "$authorInfo.companyName",
          totalContacts: 1,
          postCount: 1
        }
      },
      {
        $sort: { totalContacts: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    // Get badge distribution
    const badgeDistribution = await Post.aggregate([
      {
        $group: {
          _id: "$badgeLevel",
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Format badge distribution
    const formattedBadgeDistribution = {
      bronze: 0, // 10+ contacts
      silver: 0, // 20+ contacts
      gold: 0, // 50+ contacts
      platinum: 0, // 100+ contacts
      diamond: 0 // 150+ contacts
    };
    
    badgeDistribution.forEach(item => {
      switch(item._id) {
        case 1: formattedBadgeDistribution.bronze = item.count; break;
        case 2: formattedBadgeDistribution.silver = item.count; break;
        case 3: formattedBadgeDistribution.gold = item.count; break;
        case 4: formattedBadgeDistribution.platinum = item.count; break;
        case 5: formattedBadgeDistribution.diamond = item.count; break;
      }
    });
    
    // Get active prospects (users who have unlocked posts)
    const activeProspects = await User.countDocuments({
      _id: { $in: await Post.distinct("unlockedBy.prospect") }
    });
    
    // Get returning prospects (users who have unlocked multiple posts)
    const returningProspectsAggregation = await Post.aggregate([
      {
        $unwind: "$unlockedBy"
      },
      {
        $group: {
          _id: "$unlockedBy.prospect",
          unlockCount: { $sum: 1 }
        }
      },
      {
        $match: {
          unlockCount: { $gt: 1 }
        }
      }
    ]);
    
    const returningProspects = returningProspectsAggregation.length;
    
    // Calculate average posts per creator
    const avgPostsPerCreator = totalCreators > 0 ? totalPosts / totalCreators : 0;
    
    res.json({
      success: true,
      totalPosts,
      activePosts,
      totalViews: postData.totalViews,
      totalContacts: postData.totalContacts,
      avgContactsPerPost: postData.avgContactsPerPost,
      totalCreators,
      topCreators,
      badgeDistribution: formattedBadgeDistribution,
      activeProspects,
      returningProspects,
      avgPostsPerCreator
    });
  } catch (error) {
    console.error("Error fetching post analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch post analytics"
    });
  }
});

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser,
  getAllPosts,
  getPostById,
  updatePostStatus,
  getAllDeals,
  getDealById,
  updateDealStatus,
  closeDeal,
  getDealAnalytics,
  getRecentActivity,
  getPostAnalytics
};