const { generateAccessToken, generateRefreshToken } = require("../config/jwt");

const createTokens = (userId) => {
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);
  return { accessToken, refreshToken };
};

const setRefreshTokenCookie = (res, refreshToken, rememberMe = false, isAdmin = false) => {
  const cookieName = isAdmin ? "adminRefreshToken" : "refreshToken";
  // For admin users, set longer expiry if rememberMe is true
  const maxAge = isAdmin 
    ? (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)  // 30 days or 1 day for admin
    : (rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000); // 30 days or 7 days for regular users
  
  res.cookie(cookieName, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: maxAge,
    path: "/",
  });
};

module.exports = {
  createTokens,
  setRefreshTokenCookie,
};