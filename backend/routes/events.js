// routes/events.js — the two endpoints the SDK talks to.
const express = require('express');
const router = express.Router();
const { ingestEvents, identify } = require('../controllers/eventsController');

router.post('/', ingestEvents);          // POST /api/events
router.post('/identify', identify);      // POST /api/events/identify

module.exports = router;