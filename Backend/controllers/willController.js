/**
 * Will Controller
 * Handles all will CRUD operations.
 * Integrates IPFS + encryption pipeline.
 */

const willService = require('../services/willService');
const ipfsService = require('../services/ipfsService');
const Will        = require('../models/Will');

// ── Create will ───────────────────────────────────────────────────────────────
const createWill = async (req, res, next) => {
  try {
    const result = await willService.createWill(req.body, req.user);

    res.status(201).json({
      success:    true,
      message:    'Will encrypted and stored on IPFS successfully',
      will:       result.will,
      ipfsCid:    result.ipfsCid,
      gatewayUrl: result.gatewayUrl,
    });
  } catch (err) {
    next(err);
  }
};

// ── Get all wills for current user ────────────────────────────────────────────
const getMyWills = async (req, res, next) => {
  try {
    const {
      status,   // filter by status
      page  = 1,
      limit = 10,
    } = req.query;

    const query = {
      userId:    req.user._id,
      isDeleted: false,
    };

    if (status) query.status = status;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Will.countDocuments(query);
    const wills = await Will.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      wills,
      pagination: {
        total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── Get single will ───────────────────────────────────────────────────────────
const getWill = async (req, res, next) => {
  try {
    const will = await Will.findOne({
      willId:    req.params.willId,
      userId:    req.user._id,
      isDeleted: false,
    });

    if (!will) {
      return res.status(404).json({
        success: false,
        error:   'Will not found',
      });
    }

    res.json({ success: true, will });
  } catch (err) {
    next(err);
  }
};

// ── Get decrypted will content ────────────────────────────────────────────────
const getWillContent = async (req, res, next) => {
  try {
    const result = await willService.getWillContent(
      req.params.willId,
      req.user
    );

    res.json({
      success:     true,
      content:     result.content,
      integrityOk: result.integrityOk,
      ipfsCid:     result.ipfsCid,
      gatewayUrl:  result.gatewayUrl,
    });
  } catch (err) {
    next(err);
  }
};

// ── Activate will ─────────────────────────────────────────────────────────────
const activateWill = async (req, res, next) => {
  try {
    const will = await Will.findOne({
      willId:    req.params.willId,
      userId:    req.user._id,
      isDeleted: false,
    });

    if (!will) {
      return res.status(404).json({
        success: false,
        error:   'Will not found',
      });
    }
    if (will.status !== 'draft') {
      return res.status(400).json({
        success: false,
        error:   `Cannot activate a will with status: ${will.status}`,
      });
    }

    // Activate and calculate trigger date
    will.status                    = 'active';
    will.deadManSwitch.lastPing    = new Date();
    const trigger                  = new Date();
    trigger.setDate(
      trigger.getDate() + will.deadManSwitch.inactivityDays
    );
    will.deadManSwitch.triggerDate = trigger;
    await will.save();

    res.json({
      success: true,
      message: 'Will activated successfully. Dead man switch is now running.',
      will,
    });
  } catch (err) {
    next(err);
  }
};

// ── Ping dead man switch ──────────────────────────────────────────────────────
const pingWill = async (req, res, next) => {
  try {
    const will = await Will.findOne({
      willId:    req.params.willId,
      userId:    req.user._id,
      isDeleted: false,
    });

    if (!will) {
      return res.status(404).json({
        success: false,
        error:   'Will not found',
      });
    }
    if (will.status !== 'active') {
      return res.status(400).json({
        success: false,
        error:   'Only active wills can be pinged',
      });
    }
    if (!will.deadManSwitch.isEnabled) {
      return res.status(400).json({
        success: false,
        error:   'Dead man switch is disabled for this will',
      });
    }

    // Update ping and recalculate trigger date
    await will.updatePing();

    res.json({
      success:     true,
      message:     '💓 Activity confirmed. Dead man switch timer reset.',
      lastPing:    will.deadManSwitch.lastPing,
      triggerDate: will.deadManSwitch.triggerDate,
      daysUntilTrigger: will.deadManSwitch.inactivityDays,
    });
  } catch (err) {
    next(err);
  }
};

// ── Trigger execution ─────────────────────────────────────────────────────────
const executeWill = async (req, res, next) => {
  try {
    const will = await Will.findOne({
      willId:    req.params.willId,
      isDeleted: false,
    });

    if (!will) {
      return res.status(404).json({
        success: false,
        error:   'Will not found',
      });
    }
    if (will.status !== 'active') {
      return res.status(400).json({
        success: false,
        error:   'Only active wills can be executed',
      });
    }

    // Verify DMS has triggered or caller is owner
    const now         = new Date();
    const triggerDate = will.deadManSwitch.triggerDate;
    const isOwner     = will.userId.toString() === req.user._id.toString();
    const dmsTriggered = triggerDate && now >= triggerDate;

    if (!isOwner && !dmsTriggered) {
      return res.status(403).json({
        success: false,
        error:   'Dead man switch has not triggered yet',
      });
    }

    will.status = 'executed';
    await will.save();

    res.json({
      success: true,
      message: 'Will executed. Beneficiaries have been notified.',
      will,
    });
  } catch (err) {
    next(err);
  }
};

// ── Get will stats for dashboard ──────────────────────────────────────────────
const getStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [total, active, draft, executed] = await Promise.all([
      Will.countDocuments({ userId, isDeleted: false }),
      Will.countDocuments({ userId, isDeleted: false, status: 'active' }),
      Will.countDocuments({ userId, isDeleted: false, status: 'draft' }),
      Will.countDocuments({ userId, isDeleted: false, status: 'executed' }),
    ]);

    // Total beneficiaries across all wills
    const wills = await Will.find({ userId, isDeleted: false });
    const totalBeneficiaries = wills.reduce(
      (sum, w) => sum + (w.beneficiaries?.length || 0), 0
    );

    res.json({
      success: true,
      stats: {
        total,
        active,
        draft,
        executed,
        totalBeneficiaries,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createWill,
  getMyWills,
  getWill,
  getWillContent,
  activateWill,
  pingWill,
  executeWill,
  getStats,
};
