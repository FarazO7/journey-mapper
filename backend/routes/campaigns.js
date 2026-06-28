// routes/campaigns.js — Phase 3 variant generation (review only; nothing is sent).
const express = require('express');
const router = express.Router();
const { generateVariants } = require('../controllers/campaignController');

router.post('/generate-variants', generateVariants); // POST /api/campaigns/generate-variants

module.exports = router;
