const express = require('express');
const router = express.Router();
const { crawlWebsite, generateCampaign, stopCrawl } = require('../controllers/crawlerController');

router.post('/crawl', crawlWebsite);
router.post('/generate-campaign', generateCampaign);
router.post('/stop', stopCrawl);

module.exports = router;