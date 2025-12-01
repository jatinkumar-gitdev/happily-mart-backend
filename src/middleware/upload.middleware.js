const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create uploads directory if it doesn't exist
const ensureUploadDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Optimized storage configuration
const createStorage = (destination, filenamePrefix) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      ensureUploadDir(destination);
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname).toLowerCase();
      const sanitizedName = file.originalname
        .replace(/[^a-zA-Z0-9.-]/g, "_")
        .substring(0, 50);
      cb(null, `${filenamePrefix}-${uniqueSuffix}-${sanitizedName}${ext}`);
    },
  });
};

// File filter for images
const imageFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed."
      ),
      false
    );
  }
};

// Avatar upload configuration
const avatarStorage = createStorage("uploads/avatars", "avatar");

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit for avatars
    files: 1, // Only one file
  },
});

// Post images upload configuration
const postStorage = createStorage("uploads/posts", "post");

const postImageUpload = multer({
  storage: postStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for post images
    files: 5, // Maximum 5 images per post
  },
});

// Error handler for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB per image.",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum 5 images allowed.",
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "File upload failed",
    });
  }
  next();
};

module.exports = {
  avatarUpload: avatarUpload.single("avatar"),
  postImageUpload: postImageUpload.array("images", 5),
  handleMulterError,
};
