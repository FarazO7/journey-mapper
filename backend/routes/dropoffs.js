// routes/dropoffs.js — the read-only drop-off report endpoint.
const express = require('express');
const router = express.Router();
const { getDropoffs } = require('../controllers/dropoffController');

router.get('/', getDropoffs); // GET /api/dropoffs

module.exports = router;
