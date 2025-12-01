const { Redis } = require("@upstash/redis");

// Initialize Redis client with Upstash configuration
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

/**
 * Set a key-value pair in Redis with optional expiration
 * @param {string} key - The key to set
 * @param {any} value - The value to store (will be JSON.stringify'd)
 * @param {number} ex - Expiration time in seconds (optional)
 * @returns {Promise<boolean>} - True if successful
 */
const set = async (key, value, ex = null) => {
  try {
    // Convert Mongoose documents to plain objects before serializing
    const plainValue =
      value && typeof value.toObject === "function"
        ? value.toObject({ getters: true, versionKey: false })
        : value;

    const serializedValue = JSON.stringify(plainValue);
    if (ex) {
      await redis.set(key, serializedValue, { ex });
    } else {
      await redis.set(key, serializedValue);
    }
    return true;
  } catch (error) {
    console.error("Redis SET error:", error);
    return false;
  }
};

/**
 * Get a value by key from Redis
 * @param {string} key - The key to retrieve
 * @returns {Promise<any>} - The parsed value or null if not found
 */
const get = async (key) => {
  try {
    const value = await redis.get(key);
    if (value === null) return null;

    // Handle case where value might already be an object (not stringified)
    if (typeof value === "string") {
      return JSON.parse(value);
    }

    return value;
  } catch (error) {
    console.error("Redis GET error:", error);
    return null;
  }
};

/**
 * Delete a key from Redis
 * @param {string} key - The key to delete
 * @returns {Promise<number>} - Number of keys deleted (0 or 1)
 */
const del = async (key) => {
  try {
    return await redis.del(key);
  } catch (error) {
    console.error("Redis DEL error:", error);
    return 0;
  }
};

/**
 * Check if a key exists in Redis
 * @param {string} key - The key to check
 * @returns {Promise<boolean>} - True if key exists
 */
const exists = async (key) => {
  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    console.error("Redis EXISTS error:", error);
    return false;
  }
};

/**
 * Increment a numeric value in Redis
 * @param {string} key - The key to increment
 * @param {number} amount - The amount to increment by (default: 1)
 * @returns {Promise<number>} - The new value after incrementing
 */
const incrBy = async (key, amount = 1) => {
  try {
    return await redis.incrby(key, amount);
  } catch (error) {
    console.error("Redis INCRBY error:", error);
    return 0;
  }
};

/**
 * Add items to a Redis set
 * @param {string} key - The set key
 * @param {...string} members - Members to add to the set
 * @returns {Promise<number>} - Number of new members added
 */
const sadd = async (key, ...members) => {
  try {
    return await redis.sadd(key, ...members);
  } catch (error) {
    console.error("Redis SADD error:", error);
    return 0;
  }
};

/**
 * Check if a member exists in a Redis set
 * @param {string} key - The set key
 * @param {string} member - The member to check
 * @returns {Promise<boolean>} - True if member exists in set
 */
const sismember = async (key, member) => {
  try {
    const result = await redis.sismember(key, member);
    return result === 1;
  } catch (error) {
    console.error("Redis SISMEMBER error:", error);
    return false;
  }
};

/**
 * Get all members of a Redis set
 * @param {string} key - The set key
 * @returns {Promise<string[]>} - Array of members
 */
const smembers = async (key) => {
  try {
    return await redis.smembers(key);
  } catch (error) {
    console.error("Redis SMEMBERS error:", error);
    return [];
  }
};

/**
 * Remove members from a Redis set
 * @param {string} key - The set key
 * @param {...string} members - Members to remove
 * @returns {Promise<number>} - Number of members removed
 */
const srem = async (key, ...members) => {
  try {
    return await redis.srem(key, ...members);
  } catch (error) {
    console.error("Redis SREM error:", error);
    return 0;
  }
};

/**
 * Get all keys matching a pattern
 * @param {string} pattern - The pattern to match (e.g., "posts_*")
 * @returns {Promise<string[]>} - Array of matching keys
 */
const keys = async (pattern) => {
  try {
    return await redis.keys(pattern);
  } catch (error) {
    console.error("Redis KEYS error:", error);
    return [];
  }
};

module.exports = {
  set,
  get,
  del,
  exists,
  incrBy,
  sadd,
  sismember,
  smembers,
  srem,
  keys,
};
