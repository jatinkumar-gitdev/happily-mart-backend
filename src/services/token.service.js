const { generateAccessToken, generateRefreshToken } = require("../config/jwt");

const createTokens = (userId) => {
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);
  return { accessToken, refreshToken };
};

const setRefreshTokenCookie = (res, refreshToken, rememberMe = false) => {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
  });
};

module.exports = {
  createTokens,
  setRefreshTokenCookie,
};

