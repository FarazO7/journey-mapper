// controllers/dropoffController.js — read-only drop-off report.
// Thin glue: a scoped DB query -> the pure detector -> a { success } response.
const { Event } = require('../models/Event');
const { detectDropoffs, DEFAULT_STAGE_ORDER } = require('../services/dropoffDetector');

// GET /api/dropoffs — visitors who reached a funnel stage but not the next one
// within DROPOFF_WINDOW_MINUTES (default 30).
//
// Optional ?lookbackMinutes= bounds the query (default 24h) so we never scan the
// whole collection. It must exceed the drop-off window, because a stalled
// visitor's last event is by definition older than the window itself.
const getDropoffs = async (req, res) => {
  try {
    const windowMinutes = Number(process.env.DROPOFF_WINDOW_MINUTES) || 30;
    const windowMs = windowMinutes * 60 * 1000;

    const lookbackMinutes = Number(req.query.lookbackMinutes) || 1440; // 24h
    const since = new Date(Date.now() - lookbackMinutes * 60 * 1000);

    const events = await Event.find({
      stage: { $in: DEFAULT_STAGE_ORDER },
      ts: { $gte: since },
    }).sort({ ts: 1 }).lean();

    const dropoffs = detectDropoffs(events, {
      stageOrder: DEFAULT_STAGE_ORDER,
      windowMs,
      now: Date.now(),
    });

    res.json({ success: true, dropoffs });
  } catch (error) {
    console.error('Dropoffs error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getDropoffs };
