const asyncHandler = require("../utils/asyncHandler");
const Deal = require("../models/Deal.model");
const Post = require("../models/Post.model");
const User = require("../models/User.model");

// Get all users (admin only)
const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
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
    users,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
  });
});

// Get user by ID (admin only)
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).select("-password");
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.json({
    success: true,
    user,
  });
});

// Update user (admin only)
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  // Remove sensitive fields that shouldn't be updated by admin
  delete updateData.password;
  delete updateData.role;
  delete updateData.email;

  const user = await User.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  ).select("-password");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.json({
    success: true,
    message: "User updated successfully",
    user,
  });
});

// Deactivate user (admin only)
const deactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const user = await User.findByIdAndUpdate(
    id,
    {
      isDeactivated: true,
      deactivationReason: reason,
    },
    { new: true }
  ).select("-password");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.json({
    success: true,
    message: "User deactivated successfully",
    user,
  });
});

// Get all posts (admin only)
const getAllPosts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;
  const skip = (page - 1) * limit;

  let query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { requirement: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  if (status) {
    query.isActive = status === "active";
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

// Get post by ID (admin only)
const getPostById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const post = await Post.findById(id).populate("author", "name email companyName");
  
  if (!post) {
    return res.status(404).json({
      success: false,
      message: "Post not found",
    });
  }

  res.json({
    success: true,
    post,
  });
});

// Update post status (admin only)
const updatePostStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  const post = await Post.findByIdAndUpdate(
    id,
    { isActive },
    { new: true }
  ).populate("author", "name email companyName");

  if (!post) {
    return res.status(404).json({
      success: false,
      message: "Post not found",
    });
  }

  res.json({
    success: true,
    message: `Post ${isActive ? "activated" : "deactivated"} successfully`,
    post,
  });
});

// Get all deals (admin only)
const getAllDeals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, status, sortBy = "createdAt", sortOrder = "desc" } = req.query;
  const skip = (page - 1) * limit;

  let query = {};
  
  if (search) {
    query.$or = [
      { dealId: { $regex: search, $options: "i" } },
      { "post.title": { $regex: search, $options: "i" } },
      { "unlocker.name": { $regex: search, $options: "i" } },
      { "author.name": { $regex: search, $options: "i" } },
    ];
  }

  if (status) {
    query.status = status;
  }

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

  const deals = await Deal.find(query)
    .populate("post", "title requirement category subcategory images")
    .populate("unlocker", "name email companyName designation phone avatar")
    .populate("author", "name email companyName designation phone avatar")
    .sort(sortOptions)
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Deal.countDocuments(query);

  res.json({
    success: true,
    deals,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
  });
});

// Get deal by ID (admin only)
const getDealById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deal = await Deal.findById(id)
    .populate("post", "title requirement description category subcategory images hsnCode quantity unit")
    .populate("unlocker", "name email phone countryCode companyName designation avatar")
    .populate("author", "name email phone countryCode companyName designation avatar");

  if (!deal) {
    return res.status(404).json({
      success: false,
      message: "Deal not found",
    });
  }

  res.json({
    success: true,
    deal,
  });
});

// Update deal status (admin override)
const updateDealStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  const adminId = req.user._id;

  const deal = await Deal.findById(id);

  if (!deal) {
    return res.status(404).json({
      success: false,
      message: "Deal not found",
    });
  }

  const validStatuses = ["Contacted", "Ongoing", "Success", "Fail", "Closed"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
    });
  }

  deal.status = status;
  deal.statusHistory.push({
    status,
    updatedBy: adminId,
    updatedAt: new Date(),
    notes: notes || "Status updated by admin",
    isAdminOverride: true,
  });

  await deal.save();

  // Update post status
  let postStatus = "Available";
  if (status === "Contacted" || status === "Ongoing") {
    postStatus = "In Progress";
  } else if (status === "Success" || status === "Fail") {
    postStatus = "Completed";
  } else if (status === "Closed") {
    postStatus = "Cancelled";
  }

  await Post.findByIdAndUpdate(deal.post, { dealStatus: postStatus });

  res.json({
    success: true,
    message: "Deal status updated by admin",
    deal,
  });
});

// Force close a deal (admin only)
const closeDeal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.user._id;

  const deal = await Deal.findById(id);

  if (!deal) {
    return res.status(404).json({
      success: false,
      message: "Deal not found",
    });
  }

  deal.status = "Closed";
  deal.isActive = false;
  deal.statusHistory.push({
    status: "Closed",
    updatedBy: adminId,
    updatedAt: new Date(),
    notes: reason || "Force closed by admin",
    isAdminOverride: true,
  });

  await deal.save();

  await Post.findByIdAndUpdate(deal.post, { dealStatus: "Cancelled" });

  res.json({
    success: true,
    message: "Deal force closed by admin",
    deal,
  });
});

// Get deal analytics (admin only)
const getDealAnalytics = asyncHandler(async (req, res) => {
  // Get counts by status
  const statusCounts = await Deal.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Get recent deals
  const recentDeals = await Deal.find()
    .populate("post", "title")
    .populate("unlocker", "name email")
    .populate("author", "name email")
    .sort({ createdAt: -1 })
    .limit(10);

  // Calculate success rate
  const totalDeals = await Deal.countDocuments();
  const successDeals = await Deal.countDocuments({ status: "Success" });
  const failDeals = await Deal.countDocuments({ status: "Fail" });
  const closedDeals = await Deal.countDocuments({ status: "Closed" });
  
  const successRate = totalDeals > 0 ? (successDeals / totalDeals) * 100 : 0;
  const failRate = totalDeals > 0 ? (failDeals / totalDeals) * 100 : 0;
  const completionRate = totalDeals > 0 ? ((successDeals + failDeals + closedDeals) / totalDeals) * 100 : 0;

  // Get chronic non-update statistics
  const chronicNonUpdateCount = await Deal.countDocuments({ chronicNonUpdate: true });
  
  // Get total penalties applied
  const totalPenaltiesResult = await Deal.aggregate([
    {
      $group: {
        _id: null,
        totalPenalties: { $sum: "$creditAdjustments.penalty" },
      },
    },
  ]);
  
  const totalPenaltiesApplied = totalPenaltiesResult.length > 0 ? totalPenaltiesResult[0].totalPenalties : 0;
  const avgPenaltyPerDeal = totalDeals > 0 ? totalPenaltiesApplied / totalDeals : 0;
  
  // Calculate average response time
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

  // Deals by month (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const dealsByMonth = await Deal.aggregate([
    {
      $match: {
        createdAt: { $gte: sixMonthsAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        count: { $sum: 1 },
        successful: {
          $sum: { $cond: [{ $eq: ["$status", "Success"] }, 1, 0] },
        },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  res.json({
    success: true,
    analytics: {
      statusCounts,
      recentDeals,
      totalDeals,
      successRate: parseFloat(successRate.toFixed(2)),
      failRate: parseFloat(failRate.toFixed(2)),
      completionRate: parseFloat(completionRate.toFixed(2)),
      chronicNonUpdateCount,
      totalPenaltiesApplied,
      avgPenaltyPerDeal: parseFloat(avgPenaltyPerDeal.toFixed(2)),
      avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
      dealsByMonth,
    },
  });
});

// Get recent activity (admin only)
const getRecentActivity = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;

  // Recent deals
  const recentDeals = await Deal.find()
    .populate("post", "title")
    .populate("unlocker", "name email")
    .populate("author", "name email")
    .sort({ createdAt: -1 })
    .limit(parseInt(limit / 3));

  // Recent posts
  const recentPosts = await Post.find()
    .populate("author", "name email")
    .sort({ createdAt: -1 })
    .limit(parseInt(limit / 3));

  // Recent users
  const recentUsers = await User.find()
    .select("name email companyName createdAt role")
    .sort({ createdAt: -1 })
    .limit(parseInt(limit / 3));

  // Combine and format activity
  const activity = [
    ...recentDeals.map((deal) => ({
      type: "deal",
      id: deal._id,
      dealId: deal.dealId,
      title: deal.post?.title || "Unknown Post",
      status: deal.status,
      participants: {
        unlocker: deal.unlocker?.name,
        author: deal.author?.name,
      },
      createdAt: deal.createdAt,
    })),
    ...recentPosts.map((post) => ({
      type: "post",
      id: post._id,
      title: post.title,
      author: post.author?.name,
      isActive: post.isActive,
      createdAt: post.createdAt,
    })),
    ...recentUsers.map((user) => ({
      type: "user",
      id: user._id,
      name: user.name,
      email: user.email,
      companyName: user.companyName,
      role: user.role,
      createdAt: user.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    success: true,
    activity: activity.slice(0, parseInt(limit)),
  });
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
};