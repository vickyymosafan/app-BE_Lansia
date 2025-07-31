const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getOne } = require('../config/database');
require('dotenv').config();

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Verify user still exists and is active
    const userResult = await getOne(
      'SELECT id, username, role, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!userResult.success || !userResult.data.is_active) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    req.user = userResult.data;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Authorization middleware
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// PIN validation middleware
const validatePIN = async (req, res, next) => {
  try {
    const { pin } = req.body;
    const { userId } = req.user;

    if (!pin) {
      return res.status(400).json({
        success: false,
        message: 'PIN required'
      });
    }

    const userResult = await getOne(
      'SELECT pin FROM users WHERE id = ?',
      [userId]
    );

    if (!userResult.success || userResult.data.pin !== pin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid PIN'
      });
    }

    next();
  } catch (error) {
    console.error('PIN validation error:', error);
    res.status(500).json({
      success: false,
      message: 'PIN validation failed'
    });
  }
};

// Rate limiting for sensitive operations
const sensitiveOperationLimit = (req, res, next) => {
  // This would typically use Redis or similar for production
  // For now, we'll implement basic in-memory rate limiting
  const key = `${req.ip}_${req.user?.id || 'anonymous'}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  if (!global.rateLimitStore) {
    global.rateLimitStore = new Map();
  }

  const userAttempts = global.rateLimitStore.get(key) || [];
  const recentAttempts = userAttempts.filter(time => now - time < windowMs);

  if (recentAttempts.length >= maxAttempts) {
    return res.status(429).json({
      success: false,
      message: 'Too many attempts. Please try again later.'
    });
  }

  recentAttempts.push(now);
  global.rateLimitStore.set(key, recentAttempts);
  next();
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticate,
  authorize,
  validatePIN,
  sensitiveOperationLimit
};
