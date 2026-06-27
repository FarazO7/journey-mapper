// controllers/eventsController.js — receives events from the SDK and saves them.
const { Event, Profile } = require('../models/Event');

// POST /api/events  — the SDK sends a batch of events here.
const ingestEvents = async (req, res) => {
  try {
    const { events = [], anonId } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ success: false, error: 'No events' });
    }

    let saved = 0;
    for (const ev of events) {
      if (!ev || !ev.name) continue;            // skip anything malformed (validation)

      // save the event; ignore exact duplicates (the resend safety net)
      try {
        await Event.create({
          dedupeId:   ev.id,
          anonId:     ev.anonId || anonId,
          userId:     ev.userId,
          name:       ev.name,
          stage:      ev.stage,
          properties: ev.properties || {},
          sessionId:  ev.sessionId,
          brandUrl:   ev.brandUrl,
          ts:         ev.ts ? new Date(ev.ts) : new Date()
        });
        saved++;
      } catch (e) {
        if (e.code === 11000) continue;          // duplicate id -> we already have it
        throw e;
      }

      // remember the furthest stage this visitor has reached (used later for drop-off)
      const id = ev.anonId || anonId;
      if (id) {
        await Profile.updateOne(
          { anonId: id },
          { $set: { lastStage: ev.stage || ev.name, lastSeen: new Date() } },
          { upsert: true }
        );
      }
    }

    res.json({ success: true, received: events.length, saved });
  } catch (error) {
    console.error('Ingest error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/events/identify — links the anonymous visitor to a real user,
// and stores contact details + per-channel consent.
const identify = async (req, res) => {
  try {
    const { anonId, userId, email, phone, consent = {}, traits = {} } = req.body;
    if (!anonId && !userId) {
      return res.status(400).json({ success: false, error: 'anonId or userId required' });
    }

    const filter = anonId ? { anonId } : { userId };
    await Profile.updateOne(
      filter,
      { $set: {
          anonId, userId, email, phone, traits,
          'consent.email':    !!consent.email,
          'consent.whatsapp': !!consent.whatsapp,
          'consent.sms':      !!consent.sms,
          lastSeen: new Date()
        } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Identify error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { ingestEvents, identify };