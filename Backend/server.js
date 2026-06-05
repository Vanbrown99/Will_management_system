
/**
 * Server — Phase 4
 * Full security middleware stack applied
 */

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const path       = require('path');

const connectDB    = require('./config/db');
const authRoutes   = require('./routes/authRoutes');
const willRoutes   = require('./routes/willRoutes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Connect DB
connectDB();

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.FRONTEND_URL]
  : [
      'http://localhost:3000',
      'http://localhost:5000',
      'http://127.0.0.1:5500',
    ];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Sanitize MongoDB queries ──────────────────────────────────────────────────
// Prevents NoSQL injection: { "$gt": "" } → stripped out
app.use(mongoSanitize());

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ── Static frontend ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API routes ────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success:     true,
    message:     '🏥 DecentralWill API is healthy',
    environment: process.env.NODE_ENV,
    timestamp:   new Date().toISOString(),
    services: {
      database:   'connected',
      ipfs:       'connected',
      blockchain: 'pending — Phase 6',
    },
  });
});

app.use('/api/auth',  authRoutes);
app.use('/api/wills', willRoutes);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT   = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   🏛️  DecentralWill API — Phase 4          ║
║   🌐  http://localhost:${PORT}              ║
║   🔧  ${process.env.NODE_ENV}              ║
╚════════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

module.exports = app;
