/**
 * Rate Limiting Middleware
 * Protects API from brute force attacks and abuse.
 */

const rateLimit = require('express-rate-limit');

// ── Auth rate limiter ─────────────────────────────────────────────────────────
// Strict — prevents brute force password attacks
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              10,              // max 10 requests per window
  message: {
    success: false,
    error:   'Too many login attempts. Please try again in 15 minutes.',
  },
  standardHeaders:  true,
  legacyHeaders:    false,
  skipSuccessfulRequests: true,      // only count failed attempts
});

// ── General API rate limiter ──────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      100,             // max 100 requests per window
  message: {
    success: false,
    error:   'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Will creation rate limiter ────────────────────────────────────────────────
// Prevents spam will creation (IPFS uploads cost resources)
const willCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      5,               // max 5 will creations per hour
  message: {
    success: false,
    error:   'Too many wills created. Please wait before creating another.',
  },
  standardHeaders: true,
  legacyHeaders:   false,
});

module.exports = {
  authLimiter,
  apiLimiter,
  willCreationLimiter,
};
