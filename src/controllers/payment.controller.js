const Payment = require("../models/Payment.model");
const Post = require("../models/Post.model");
const crypto = require("crypto");
const asyncHandler = require("../utils/asyncHandler");

const FIXED_UNLOCK_PRICE = process.env.FIXED_UNLOCK_PRICE
  ? parseFloat(process.env.FIXED_UNLOCK_PRICE)
  : 2000;

let Razorpay;
let razorpay;

try {
  Razorpay = require("razorpay");
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing in .env");
  }

  razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  console.log("✓ Razorpay initialized successfully");
} catch (error) {
  console.error("✗ Razorpay initialization failed:", error.message);
  razorpay = null;
}

// ======================== ENCRYPTION SETUP ========================
const RAW_KEY = process.env.PAYMENT_ENCRYPTION_KEY;

if (!RAW_KEY || RAW_KEY.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(RAW_KEY)) {
  throw new Error(
    "PAYMENT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).\n" +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
}

const PAYMENT_ENCRYPTION_KEY = Buffer.from(RAW_KEY, "hex");
const PAYMENT_ALGORITHM = "aes-256-cbc";

// ======================== HELPER: SHORT RECEIPT ========================
const generateReceipt = (postId, userId) => {
  const hash = crypto
    .createHash("md5")
    .update(`post_${postId}_user_${userId}_${Date.now()}`)
    .digest("hex")
    .substring(0, 20);
  return `rcpt_${hash}`;
};

// ======================== ENCRYPT TOKEN ========================
const encryptPaymentToken = (data) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    PAYMENT_ALGORITHM,
    PAYMENT_ENCRYPTION_KEY,
    iv
  );
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

// ======================== DECRYPT TOKEN ========================
const decryptPaymentToken = (encryptedData) => {
  try {
    const [ivHex, encrypted] = encryptedData.split(":");
    if (!ivHex || !encrypted) throw new Error("Invalid format");

    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(
      PAYMENT_ALGORITHM,
      PAYMENT_ENCRYPTION_KEY,
      iv
    );
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error("Invalid or corrupted payment token");
  }
};

// ======================== CREATE ORDER ========================
const createOrder = asyncHandler(async (req, res) => {
  const { postId } = req.body;
  // SECURITY: Ignore any amount sent from frontend

  if (!postId) {
    return res.status(400).json({
      success: false,
      message: "Post ID is required",
    });
  }

  if (!razorpay) {
    return res.status(500).json({
      success: false,
      message: "Payment gateway not configured. Please contact support.",
    });
  }

  // Verify post exists
  const post = await Post.findById(postId).populate(
    "author",
    "name email phone alternateEmail alternatePhone companyName designation isDeactivated"
  );
  if (!post) {
    return res.status(404).json({
      success: false,
      message: "Post not found",
    });
  }

  if (!post.isActive) {
    return res.status(400).json({
      success: false,
      message: "This post is no longer available",
    });
  }

  if (!post.author || post.author.isDeactivated) {
    return res.status(400).json({
      success: false,
      message: "Post owner is unavailable",
    });
  }

  // SECURITY: Check if already unlocked
  const isUnlocked = post.unlockedBy.some(
    (unlock) => unlock.user.toString() === req.user._id.toString()
  );

  if (isUnlocked) {
    return res.status(400).json({
      success: false,
      message: "You have already unlocked this post",
    });
  }

  // Check if user is the author
  if (post.author.toString() === req.user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: "You cannot unlock your own post",
    });
  }

  // SECURITY: Use FIXED server-side price only
  const orderAmount = FIXED_UNLOCK_PRICE;

  const options = {
    amount: Math.round(orderAmount * 100), // Convert to paise
    currency: "INR",
    receipt: generateReceipt(postId, req.user._id),
    notes: {
      postId: postId.toString(),
      userId: req.user._id.toString(),
      unlockPrice: orderAmount.toString(),
    },
  };

  try {
    const order = await razorpay.orders.create(options);

    // Create payment record with server-side price
    const payment = await Payment.create({
      user: req.user._id,
      post: postId,
      amount: orderAmount,
      razorpayOrderId: order.id,
      status: "pending",
    });

    // Enhanced security token
    const paymentTokenData = {
      paymentId: payment._id.toString(),
      userId: req.user._id.toString(),
      postId: postId.toString(),
      orderId: order.id,
      amount: orderAmount,
      timestamp: Date.now(),
      sessionId: req.sessionID || crypto.randomBytes(16).toString("hex"),
      nonce: crypto.randomBytes(16).toString("hex"),
    };

    const encryptedToken = encryptPaymentToken(paymentTokenData);

    // Store in session with enhanced security
    if (!req.session.paymentTokens) req.session.paymentTokens = [];

    // Clean expired tokens first
    req.session.paymentTokens = req.session.paymentTokens.filter(
      (t) => t.expiresAt > Date.now()
    );

    req.session.paymentTokens.push({
      token: encryptedToken,
      paymentId: payment._id.toString(),
      orderId: order.id,
      amount: orderAmount,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 mins
    });

    // Save session
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      paymentId: payment._id,
      paymentToken: encryptedToken,
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ======================== VERIFY PAYMENT ========================
const verifyPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    paymentToken,
  } = req.body;

  // Validate required fields
  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature ||
    !paymentToken
  ) {
    return res.status(400).json({
      success: false,
      message: "Missing required payment verification data",
    });
  }

  // SECURITY: Decrypt and validate token
  let tokenData;
  try {
    tokenData = decryptPaymentToken(paymentToken);
  } catch (error) {
    console.error("Token decryption failed:", error);
    return res.status(400).json({
      success: false,
      message: "Invalid or expired payment token",
    });
  }

  // SECURITY: Validate session token exists
  const sessionToken = req.session.paymentTokens?.find(
    (t) =>
      t.paymentId === tokenData.paymentId && t.orderId === razorpay_order_id
  );

  if (!sessionToken) {
    return res.status(400).json({
      success: false,
      message: "Payment session expired or invalid. Please try again.",
    });
  }

  // SECURITY: Check session ID match
  const currentSessionId = req.sessionID || "";
  if (tokenData.sessionId !== currentSessionId) {
    console.error("Session ID mismatch");
    return res.status(403).json({
      success: false,
      message: "Invalid session. Security check failed.",
    });
  }

  // SECURITY: Check token expiry (30 minutes)
  if (Date.now() - tokenData.timestamp > 30 * 60 * 1000) {
    req.session.paymentTokens = req.session.paymentTokens.filter(
      (t) => t.paymentId !== tokenData.paymentId
    );
    return res.status(400).json({
      success: false,
      message: "Payment link expired. Please create a new order.",
    });
  }

  // SECURITY: Validate user ownership
  if (tokenData.userId !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized. User mismatch.",
    });
  }

  // SECURITY: Verify amount in token matches fixed price
  if (tokenData.amount !== FIXED_UNLOCK_PRICE) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment amount. Security check failed.",
    });
  }

  // Get payment record
  const payment = await Payment.findById(tokenData.paymentId).populate("post");

  if (!payment) {
    return res.status(400).json({
      success: false,
      message: "Payment record not found",
    });
  }

  // SECURITY: Verify order ID matches
  if (payment.razorpayOrderId !== razorpay_order_id) {
    return res.status(400).json({
      success: false,
      message: "Order ID mismatch. Security check failed.",
    });
  }

  // SECURITY: Check if payment already processed
  if (payment.status === "completed") {
    return res.status(400).json({
      success: false,
      message: "Payment already processed",
    });
  }

  // SECURITY: Verify payment amount matches fixed price
  if (payment.amount !== FIXED_UNLOCK_PRICE) {
    payment.status = "failed";
    await payment.save();
    return res.status(400).json({
      success: false,
      message: "Invalid payment amount. Transaction blocked.",
    });
  }

  // CRITICAL: Verify Razorpay signature
  const text = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(text)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    payment.status = "failed";
    await payment.save();

    // Remove token from session
    req.session.paymentTokens = req.session.paymentTokens.filter(
      (t) => t.paymentId !== tokenData.paymentId
    );

    return res.status(400).json({
      success: false,
      message: "Payment signature verification failed. Invalid payment.",
    });
  }

  // SUCCESS: Update payment record
  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  payment.status = "completed";
  await payment.save();

  // Remove token from session
  req.session.paymentTokens = req.session.paymentTokens.filter(
    (t) => t.paymentId !== tokenData.paymentId
  );

  // Unlock post for user
  const post = await Post.findById(payment.post).populate(
    "author",
    "name email phone alternateEmail alternatePhone companyName designation country state city avatar linkedin twitter website isDeactivated"
  );
  let unlockedPost = null;
  if (post) {
    if (!post.author || post.author.isDeactivated) {
      payment.status = "failed";
      await payment.save();
      return res.status(400).json({
        success: false,
        message: "Post owner is unavailable. Payment cancelled.",
      });
    }

    const alreadyUnlocked = post.unlockedBy.some(
      (u) => u.user.toString() === req.user._id.toString()
    );

    if (!alreadyUnlocked) {
      post.unlockedBy.push({
        user: req.user._id,
        unlockedAt: new Date(),
      });
      await post.save();
    }

    const postObj = post.toObject();
    postObj.isUnlocked = true;
    postObj.unlockPrice = FIXED_UNLOCK_PRICE;
    unlockedPost = postObj;
  }

  res.json({
    success: true,
    message: "Payment successful! Post unlocked.",
    payment: {
      id: payment._id,
      amount: payment.amount,
      status: payment.status,
      postId: payment.post,
      createdAt: payment.createdAt,
    },
    unlockedPost,
  });
});

// ======================== PAYMENT HISTORY ========================
const getPaymentHistory = asyncHandler(async (req, res) => {
  const payments = await Payment.find({
    user: req.user._id,
    status: "completed", // Only show successful payments
  })
    .populate("post", "title requirement")
    .sort({ createdAt: -1 });

  // Add virtual unlockPrice to response
  const paymentsWithPrice = payments.map((payment) => ({
    ...payment.toObject(),
    unlockPrice: FIXED_UNLOCK_PRICE,
  }));

  res.json({
    success: true,
    payments: paymentsWithPrice,
    total: paymentsWithPrice.length,
  });
});

// ======================== GET UNLOCK PRICE ========================
const getUnlockPrice = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    unlockPrice: FIXED_UNLOCK_PRICE,
  });
});

module.exports = {
  createOrder,
  verifyPayment,
  getPaymentHistory,
  getUnlockPrice,
  FIXED_UNLOCK_PRICE,
};
