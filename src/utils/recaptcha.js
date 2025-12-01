const axios = require("axios");

/**
 * Verify Google reCAPTCHA token
 * @param {string} token - The reCAPTCHA token from frontend
 * @returns {Promise<boolean>} - Returns true if verification successful
 */
const verifyRecaptcha = async (token) => {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  // If no secret key configured, skip verification
  if (!secretKey) {
    console.warn(
      "⚠️  RECAPTCHA_SECRET_KEY not configured - skipping verification"
    );
    return true;
  }

  // If no token provided and secret is configured, fail verification
  if (!token) {
    console.warn("⚠️  No reCAPTCHA token provided");
    return false;
  }

  try {
    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: secretKey,
          response: token,
        },
      }
    );

    return response.data.success === true;
  } catch (error) {
    console.error("reCAPTCHA verification error:", error.message);
    return false;
  }
};

module.exports = {
  verifyRecaptcha,
};
