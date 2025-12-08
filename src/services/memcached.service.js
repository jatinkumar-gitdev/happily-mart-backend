const Memcached = require("memcached");

// Initialize Memcached client
// Using localhost:11211 as default, can be overridden with MEMCACHED_URL environment variable
const memcachedUrl = process.env.MEMCACHED_URL || "localhost:11211";
const memcached = new Memcached(memcachedUrl);

/**
 * Set a key-value pair in Memcached with optional expiration
 * @param {string} key - The key to set
 * @param {any} value - The value to store (will be JSON.stringify'd)
 * @param {number} lifetime - Expiration time in seconds (optional, default 0 = no expiration)
 * @returns {Promise<boolean>} - True if successful
 */
const set = async (key, value, lifetime = 0) => {
  try {
    // Convert Mongoose documents to plain objects before serializing
    const plainValue =
      value && typeof value.toObject === "function"
        ? value.toObject({ getters: true, versionKey: false })
        : value;

    const serializedValue = JSON.stringify(plainValue);
    return new Promise((resolve, reject) => {
      memcached.set(key, serializedValue, lifetime, (err) => {
        if (err) {
          console.error("Memcached SET error:", err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error("Memcached SET error:", error);
    return false;
  }
};

/**
 * Get a value by key from Memcached
 * @param {string} key - The key to retrieve
 * @returns {Promise<any>} - The parsed value or null if not found
 */
const get = async (key) => {
  try {
    return new Promise((resolve, reject) => {
      memcached.get(key, (err, data) => {
        if (err) {
          console.error("Memcached GET error:", err);
          resolve(null);
        } else {
          if (data === undefined || data === null) {
            resolve(null);
          } else {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (parseError) {
              console.error("Memcached GET parse error:", parseError);
              resolve(data);
            }
          }
        }
      });
    });
  } catch (error) {
    console.error("Memcached GET error:", error);
    return null;
  }
};

/**
 * Delete a key from Memcached
 * @param {string} key - The key to delete
 * @returns {Promise<boolean>} - True if successful
 */
const del = async (key) => {
  try {
    return new Promise((resolve, reject) => {
      memcached.del(key, (err) => {
        if (err) {
          console.error("Memcached DEL error:", err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error("Memcached DEL error:", error);
    return false;
  }
};

/**
 * Increment a numeric value in Memcached
 * @param {string} key - The key to increment
 * @param {number} amount - Amount to increment by (default 1)
 * @returns {Promise<number>} - The new value after incrementing
 */
const incr = async (key, amount = 1) => {
  try {
    return new Promise((resolve, reject) => {
      memcached.incr(key, amount, (err, result) => {
        if (err) {
          console.error("Memcached INCR error:", err);
          resolve(0);
        } else {
          resolve(result || 0);
        }
      });
    });
  } catch (error) {
    console.error("Memcached INCR error:", error);
    return 0;
  }
};

/**
 * Decrement a numeric value in Memcached
 * @param {string} key - The key to decrement
 * @param {number} amount - Amount to decrement by (default 1)
 * @returns {Promise<number>} - The new value after decrementing
 */
const decr = async (key, amount = 1) => {
  try {
    return new Promise((resolve, reject) => {
      memcached.decr(key, amount, (err, result) => {
        if (err) {
          console.error("Memcached DECR error:", err);
          resolve(0);
        } else {
          resolve(result || 0);
        }
      });
    });
  } catch (error) {
    console.error("Memcached DECR error:", error);
    return 0;
  }
};

/**
 * Add items to a Memcached set (simulated using individual keys)
 * @param {string} key - The set key prefix
 * @param {...string} members - Members to add to the set
 * @returns {Promise<number>} - Number of new members added
 */
const sadd = async (key, ...members) => {
  try {
    let addedCount = 0;
    for (const member of members) {
      const memberKey = `${key}:set:${member}`;
      const exists = await get(memberKey);
      if (exists === null) {
        const result = await set(memberKey, 1);
        if (result) addedCount++;
      }
    }
    return addedCount;
  } catch (error) {
    console.error("Memcached SADD error:", error);
    return 0;
  }
};

/**
 * Check if a member exists in a Memcached set
 * @param {string} key - The set key prefix
 * @param {string} member - The member to check
 * @returns {Promise<boolean>} - True if member exists in set
 */
const sismember = async (key, member) => {
  try {
    const memberKey = `${key}:set:${member}`;
    const exists = await get(memberKey);
    return exists !== null;
  } catch (error) {
    console.error("Memcached SISMEMBER error:", error);
    return false;
  }
};

/**
 * Get all members of a Memcached set
 * @param {string} key - The set key prefix
 * @returns {Promise<string[]>} - Array of members
 */
const smembers = async (key) => {
  try {
    // Note: This is a limitation of Memcached - we can't easily enumerate all keys
    // In a real implementation, you might want to store the set members in a separate key
    console.warn("SMEMBERS operation is not efficiently supported in Memcached");
    return [];
  } catch (error) {
    console.error("Memcached SMEMBERS error:", error);
    return [];
  }
};

/**
 * Get keys matching a pattern (limited support in Memcached)
 * @param {string} pattern - Pattern to match (limited support)
 * @returns {Promise<string[]>} - Array of matching keys (empty array in Memcached)
 */
const keys = async (pattern) => {
  try {
    // Note: Memcached doesn't support key enumeration/pattern matching
    // This is a limitation compared to Redis
    console.warn("KEYS operation is not supported in Memcached");
    return [];
  } catch (error) {
    console.error("Memcached KEYS error:", error);
    return [];
  }
};

module.exports = {
  set,
  get,
  del,
  incr,
  decr,
  sadd,
  sismember,
  smembers,
  keys,
};