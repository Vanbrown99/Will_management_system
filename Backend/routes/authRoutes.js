/**
 * Auth Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 * POST /api/auth/logout
 */

const express  = require('express');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User     = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Token helper ──────────────────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
      .matches(/[0-9]/).withMessage('Password must contain a number'),
  ],
  async (req, res, next) => {
    try {
      // Return validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array().map((e) => e.msg),
        });
      }

      const { name, email, password, ethereumAddress } = req.body;

      // Check for duplicate email
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ success: false, error: 'Email already registered.' });
      }

      const user = await User.create({ name, email, password, ethereumAddress });
      const token = signToken(user._id);

      // Update lastLogin
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token,
        user: user.toSafeObject(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array().map((e) => e.msg),
        });
      }

      const { email, password } = req.body;

      // Fetch user WITH password field (select: false by default)
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        // Generic error — don't reveal which field is wrong
        return res.status(401).json({ success: false, error: 'Invalid email or password.' });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Invalid email or password.' });
      }

      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });

      const token = signToken(user._id);

      res.json({
        success: true,
        message: 'Logged in successfully',
        token,
        user: user.toSafeObject(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/auth/me — get current user (protected) ──────────────────────────
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', protect, (req, res) => {
  // JWT is stateless — client deletes the token
  // If you add refresh tokens later, invalidate them here
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
