const asyncHandler = require("../utils/asyncHandler");
const Deal = require("../models/Deal.model");
const Post = require("../models/Post.model");
const User = require("../models/User.model");
const { v4: uuidv4 } = require("uuid");
const memcachedService = require("../services/memcached.service");
const { getNotificationsForUser, markNotificationAsRead } = require("../services/notification.service");

// Helper function to generate masked contacts
const generateMaskedContacts = (unlocker, author, postId) => {
  // Generate temporary masked emails (first letter + *** + domain)
  const maskEmail = (email) => {
    if (!email) return "";
    const [localPart, domain] = email.split("@");
    return `${localPart.charAt(0)}***@${domain}`;
  };

  // Generate temporary masked phones (first 2 digits + **** + last 2 digits)
  const maskPhone = (phone) => {
    if (!phone || phone.length < 4) return phone;
    return `${phone.substring(0, 2)}****${phone.substring(phone.length - 2)}`;
  };

  // Generate temporary contact identifiers for auto-detection
  const generateTempContactId = (userId, postId) => {
    // Create a unique temporary contact identifier
    return `temp_${userId.toString().substring(0, 8)}_${postId.toString().substring(0, 8)}`;
  };

  return {
    unlocker: {
      email: maskEmail(unlocker.email),
      phone: maskPhone(unlocker.phone),
      tempId: generateTempContactId(unlocker._id, postId), // For auto-detection
    },
    author: {
      email: maskEmail(author.email),
      phone: maskPhone(author.phone),
      tempId: generateTempContactId(author._id, postId), // For auto-detection
    },
  };
};

// Create a new deal when a post is unlocked
const createDeal = async (postId, unlockerId, authorId) => {
  try {
    // Fetch user details
    const [unlocker, author] = await Promise.all([
      User.findById(unlockerId).select("email phone"),
      User.findById(authorId).select("email phone"),
    ]);

    if (!unlocker || !author) {
      throw new Error("User not found");
    }

    // Generate unique deal ID
    const dealId = `DEAL-${uuidv4().substring(0, 8).toUpperCase()}`;

    // Calculate expiration (90 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    // Auto-close date (90 days from unlock)
    const autoCloseAt = new Date();
    autoCloseAt.setDate(autoCloseAt.getDate() + 90);

    // Create the deal
    const deal = await Deal.create({
      dealId,
      post: postId,
      unlocker: unlockerId,
      author: authorId,
      maskedContacts: generateMaskedContacts(unlocker, author, postId),
      expiresAt,
      autoCloseAt,
      statusHistory: [
        {
          status: "Contacted",
          updatedBy: unlockerId,
          updatedAt: new Date(),
          notes: "Deal initiated upon post unlock",
        },
      ],
    });

    // Update post status to In Progress
    await Post.findByIdAndUpdate(postId, { dealStatus: "In Progress" });

    return deal;
  } catch (error) {
    console.error("Error creating deal:", error);
    throw error;
  }
};

// Get deals for a user (both as unlocker and author)
const getUserDeals = asyncHandler(async (req, res) => {
  const { status, role } = req.query; // role: 'unlocker' or 'author'
  const userId = req.user._id;

  // Build query
  let query = {
    isActive: true,
  };

  if (role === "unlocker") {
    query.unlocker = userId;
  } else if (role === "author") {
    query.author = userId;
  } else {
    // Both roles
    query.$or = [{ unlocker: userId }, { author: userId }];
  }

  if (status) {
    query.status = status;
  }

  const deals = await Deal.find(query)
    .populate("post", "title requirement description")
    .populate("unlocker", "name email avatar companyName")
    .populate("author", "name email avatar companyName")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    deals,
  });
});

// Get a specific deal by ID
const getDealById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  const deal = await Deal.findOne({
    _id: id,
    $or: [{ unlocker: userId }, { author: userId }],
    isActive: true,
  })
    .populate("post", "title requirement description images category subcategory")
    .populate("unlocker", "name email avatar companyName designation")
    .populate("author", "name email avatar companyName designation");

  if (!deal) {
    return res.status(404).json({
      success: false,
      message: "Deal not found or you don't have access to it",
    });
  }

  res.json({
    success: true,
    deal,
  });
});

// Update deal status
const updateDealStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  const userId = req.user._id;

  const deal = await Deal.findOne({
    _id: id,
    $or: [{ unlocker: userId }, { author: userId }],
    isActive: true,
  });

  if (!deal) {
    return res.status(404).json({
      success: false,
      message: "Deal not found or you don't have access to it",
    });
  }

  // Validate status transition
  const validTransitions = {
    Contacted: ["Ongoing", "Closed"],
    Ongoing: ["Success", "Fail", "Closed"],
    Success: ["Closed"], // Can only be closed after mutual confirmation
    Fail: ["Closed"], // Can only be closed after mutual confirmation
    Closed: [], // Final state
  };

  if (!validTransitions[deal.status].includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot transition from ${deal.status} to ${status}`,
    });
  }

  // Handle mutual confirmation for Success/Fail
  if (status === "Success" || status === "Fail") {
    const confirmationType = status.toLowerCase();
    const userRole = deal.unlocker.toString() === userId.toString() ? "unlocker" : "author";

    // Mark user's confirmation
    deal.confirmations[confirmationType][userRole].confirmed = true;
    deal.confirmations[confirmationType][userRole].confirmedAt = new Date();

    // Check if both parties have confirmed
    const bothConfirmed =
      deal.confirmations[confirmationType].unlocker.confirmed &&
      deal.confirmations[confirmationType].author.confirmed;

    if (bothConfirmed) {
      // Both confirmed, update status
      deal.status = status;
      
      // Award bonus credits for timely confirmation
      const timeDiff = (new Date() - new Date(deal.createdAt)) / (1000 * 60 * 60 * 24); // days
      if (timeDiff <= 1) {
        // Bonus for confirming within 1 day
        deal.creditAdjustments.bonus += 5;
      } else if (timeDiff <= 7) {
        // Bonus for confirming within 7 days
        deal.creditAdjustments.bonus += 3;
      } else if (timeDiff <= 30) {
        // Smaller bonus for confirming within 30 days
        deal.creditAdjustments.bonus += 1;
      } else {
        // Penalty for taking too long
        deal.creditAdjustments.penalty += 2;
      }
    } else {
      // Only one party confirmed, don't change status yet
      await deal.save();
      return res.json({
        success: true,
        message: `Your confirmation recorded. Waiting for ${
          userRole === "unlocker" ? "author" : "unlocker"
        } to confirm`,
        deal,
      });
    }
  } else {
    // Direct status update for other transitions
    deal.status = status;
  }

  // Add to status history
  deal.statusHistory.push({
    status,
    updatedBy: userId,
    updatedAt: new Date(),
    notes,
  });

  await deal.save();

  // Update post status based on deal status
  let postStatus = "Available";
  if (status === "Contacted" || status === "Ongoing") {
    postStatus = "In Progress";
  } else if (status === "Success" || status === "Fail") {
    postStatus = "Completed";
  } else if (status === "Closed") {
    postStatus = "Cancelled";
  }
  
  await Post.findByIdAndUpdate(deal.post, { dealStatus: postStatus });

  // Update user dealsWorkspace history when deal reaches Success/Fail
  if (status === "Success" || status === "Fail") {
    try {
      const post = await Post.findById(deal.post).select("title category");
      const dealResult = status === "Success" ? "Won" : "Failed";
      
      // Fetch both users
      const [unlockerUser, authorUser] = await Promise.all([
        User.findById(deal.unlocker),
        User.findById(deal.author),
      ]);

      // Update both users' dealsWorkspace
      const users = [unlockerUser, authorUser];
      for (const user of users) {
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

          // Check if this deal is already in history
          const existingHistoryIndex = user.dealsWorkspace.history.findIndex(
            h => h.postId?.toString() === deal.post.toString()
          );

          if (existingHistoryIndex === -1) {
            // New entry, update counts
            if (dealResult === "Won") {
              user.dealsWorkspace.wonDeals = (user.dealsWorkspace.wonDeals || 0) + 1;
            } else if (dealResult === "Failed") {
              user.dealsWorkspace.failedDeals = (user.dealsWorkspace.failedDeals || 0) + 1;
            }
            user.dealsWorkspace.totalDeals = (user.dealsWorkspace.totalDeals || 0) + 1;

            // Add to history
            user.dealsWorkspace.history.push({
              postId: deal.post,
              result: dealResult,
              timestamp: new Date(),
              notes: `Deal marked as ${dealResult.toLowerCase()}`
            });
          } else {
            // Update existing entry
            const oldResult = user.dealsWorkspace.history[existingHistoryIndex].result;
            if (oldResult !== dealResult) {
              // Adjust counts if result changed
              if (oldResult === "Won") {
                user.dealsWorkspace.wonDeals -= 1;
              } else if (oldResult === "Failed") {
                user.dealsWorkspace.failedDeals -= 1;
              }

              if (dealResult === "Won") {
                user.dealsWorkspace.wonDeals = (user.dealsWorkspace.wonDeals || 0) + 1;
              } else if (dealResult === "Failed") {
                user.dealsWorkspace.failedDeals = (user.dealsWorkspace.failedDeals || 0) + 1;
              }

              user.dealsWorkspace.history[existingHistoryIndex] = {
                postId: deal.post,
                result: dealResult,
                timestamp: new Date(),
                notes: `Deal marked as ${dealResult.toLowerCase()}`
              };
            }
          }

          await user.save();
        }
      }
    } catch (error) {
      console.error("Error updating user dealsWorkspace:", error);
      // Don't fail the request if history update fails
    }
  }

  // Apply credit adjustments if closing deal
  if (status === "Closed" || status === "Success" || status === "Fail") {
    // Apply bonuses/penalties
    if (deal.creditAdjustments.bonus > 0 || deal.creditAdjustments.penalty > 0) {
      const [unlockerUser, authorUser] = await Promise.all([
        User.findById(deal.unlocker),
        User.findById(deal.author),
      ]);

      if (unlockerUser) {
        unlockerUser.credits += deal.creditAdjustments.bonus;
        unlockerUser.credits -= deal.creditAdjustments.penalty;
        await unlockerUser.save();
      }

      if (authorUser) {
        authorUser.credits += deal.creditAdjustments.bonus;
        authorUser.credits -= deal.creditAdjustments.penalty;
        await authorUser.save();
      }
    }
  }

  res.json({
    success: true,
    message: "Deal status updated successfully",
    deal,
  });
});

// Get deal statistics for a user
const getDealStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get counts by status
  const stats = await Deal.aggregate([
    {
      $match: {
        $or: [{ unlocker: userId }, { author: userId }],
        isActive: true,
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Calculate response time statistics
  const responseTimes = await Deal.aggregate([
    {
      $match: {
        $or: [{ unlocker: userId }, { author: userId }],
        isActive: true,
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

  // Format stats
  const formattedStats = {
    Contacted: 0,
    Ongoing: 0,
    Success: 0,
    Fail: 0,
    Closed: 0,
  };

  stats.forEach((stat) => {
    formattedStats[stat._id] = stat.count;
  });

  res.json({
    success: true,
    stats: formattedStats,
    avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
  });
});

// Admin functions
const getAllDeals = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
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

// Get deal notifications for a user
const getDealNotifications = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    const notifications = await getNotificationsForUser(userId);
    
    res.json({
      success: true,
      notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
});

// Mark a notification as read
const markNotificationAsReadController = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.params;
    
    const result = await markNotificationAsRead(userId, notificationId);
    
    if (result.success) {
      res.json({
        success: true,
        message: "Notification marked as read",
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
    });
  }
});

module.exports = {
  createDeal,
  getUserDeals,
  getDealById,
  updateDealStatus,
  getDealStats,
  getAllDeals,
  getDealAnalytics,
  getDealNotifications,
  markNotificationAsRead: markNotificationAsReadController,
};