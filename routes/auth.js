const express = require('express');
const router = express.Router();
const { 
  generateToken, 
  hashPassword, 
  comparePassword,
  authenticate,
  sensitiveOperationLimit 
} = require('../middleware/auth');
const { 
  validateUserLogin, 
  validateUserRegistration 
} = require('../middleware/validation');
const { getOne, insert, update } = require('../config/database');

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', validateUserLogin, sensitiveOperationLimit, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user by username
    const userResult = await getOne(
      'SELECT id, username, password, role, posyandu_name, is_active FROM users WHERE username = ?',
      [username]
    );

    if (!userResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = userResult.data;

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    await update('users', 
      { last_login: new Date() }, 
      'id = ?', 
      [user.id]
    );

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          posyandu_name: user.posyandu_name
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// @route   POST /api/auth/register
// @desc    Register new user (admin only)
// @access  Private (Admin)
router.post('/register', authenticate, validateUserRegistration, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can register new users'
      });
    }

    const { username, password, posyandu_name, pin, role = 'kader' } = req.body;

    // Check if username already exists
    const existingUser = await getOne(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUser.success) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const userData = {
      username,
      password: hashedPassword,
      role,
      posyandu_name,
      pin: pin || null,
      is_active: true
    };

    const result = await insert('users', userData);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create user'
      });
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: result.insertId,
        username,
        role,
        posyandu_name
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Get current user password
    const userResult = await getOne(
      'SELECT password FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!userResult.success) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(
      currentPassword, 
      userResult.data.password
    );

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    const updateResult = await update('users',
      { password: hashedNewPassword },
      'id = ?',
      [req.user.id]
    );

    if (!updateResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update password'
      });
    }

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', authenticate, async (req, res) => {
  try {
    const userResult = await getOne(
      'SELECT id, username, role, posyandu_name, created_at, last_login FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!userResult.success) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: userResult.data
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
});

// @route   POST /api/auth/verify-token
// @desc    Verify JWT token
// @access  Private
router.post('/verify-token', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      user: req.user
    }
  });
});

module.exports = router;
