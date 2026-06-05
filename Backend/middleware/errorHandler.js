/**
 * Global Error Handler Middleware
 * Catches all unhandled errors and returns structured JSON responses
 * Never exposes stack traces in production
 */

const errorHandler = (err, req, res, next) => {
  // Log the full error for server-side debugging
  console.error(`❌ Error [${req.method} ${req.path}]:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : '[hidden]',
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: messages,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      error: `Duplicate value for field: ${field}`,
    });
  }

  // Mongoose cast error (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: `Invalid value for field: ${err.path}`,
    });
  }

  // JWT errors (Phase 4)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token',
    });
  }

  // Default: Internal Server Error
  // In production, never expose the actual error message to clients
  res.status(err.statusCode || 500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error',
  });
};

// Handle 404 — route not found
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { errorHandler, notFound };
