/**
 * Will Routes — all endpoints now require JWT auth
 */

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

// All will routes require authentication
router.use(protect);

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Will API operational', user: req.user.email });
});

router.post('/', (req, res) => {
  res.status(501).json({ success: false, message: 'Coming in Phase 4' });
});

router.get('/', (req, res) => {
  res.status(501).json({ success: false, message: 'Coming in Phase 4' });
});

router.put('/:willId', (req, res) => {
  res.status(501).json({ success: false, message: 'Coming in Phase 4' });
});

router.post('/:willId/ping', (req, res) => {
  res.status(501).json({ success: false, message: 'Coming in Phase 7' });
});

router.post('/:willId/execute', (req, res) => {
  res.status(501).json({ success: false, message: 'Coming in Phase 7' });
});

module.exports = router;
