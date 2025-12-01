const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";

  const logContext = `${req.method} ${req.originalUrl}`;

  if (statusCode >= 500) {
    logger.error(`${logContext} - ${message}`, err.stack);
  } else {
    logger.warn(`${logContext} - ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && statusCode >= 500
      ? { stack: err.stack }
      : {}),
  });
};

module.exports = errorHandler;

