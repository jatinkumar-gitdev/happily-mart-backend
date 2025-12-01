// Tier avatar mapping
const TIER_AVATAR_MAP = {
  bronze: "/avatars/avatar-1.png",
  silver: "/avatars/avatar-2.png",
  gold: "/avatars/avatar-3.png",
  diamond: "/avatars/avatar-4.png",
  basic: "/avatars/avatar-5.png",
  standard: "/avatars/avatar-6.png",
  premium: "/avatars/avatar-6.png",
  free: null,
};

// Tier hierarchy for comparing tiers
const TIER_HIERARCHY = {
  free: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  diamond: 4,
  basic: 2,
  standard: 3,
  premium: 4,
};

// Get tier based on points
const getTierFromPoints = (points) => {
  if (points >= 40) return "diamond";
  if (points >= 12) return "gold";
  if (points >= 5) return "silver";
  if (points >= 1) return "bronze";
  return "free";
};

// Assign default tier avatar if user doesn't have custom avatar
const assignTierAvatar = (user, plan) => {
  if (!user.avatar && TIER_AVATAR_MAP[plan]) {
    user.avatar = TIER_AVATAR_MAP[plan];
  }
  return user;
};

// Update user tier based on subscription
const updateUserTier = (user, plan) => {
  user.tier = plan;
  user.avatarTier = plan;
  return assignTierAvatar(user, plan);
};

// Get next tier requirements
const getNextTierRequirement = (currentTier) => {
  const requirements = {
    free: { next: "bronze", points: 1 },
    bronze: { next: "silver", points: 5 },
    silver: { next: "gold", points: 12 },
    gold: { next: "diamond", points: 40 },
    diamond: { next: null, points: null },
  };
  return requirements[currentTier] || requirements.free;
};

module.exports = {
  TIER_AVATAR_MAP,
  TIER_HIERARCHY,
  getTierFromPoints,
  assignTierAvatar,
  updateUserTier,
  getNextTierRequirement,
};
