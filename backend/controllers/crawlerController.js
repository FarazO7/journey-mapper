const OpenAI = require('openai');
const axios  = require('axios');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Active run registry (sessionId → apifyRunId) ─────────────────────────────
const activeRuns = {};

// ─── Email Prompt ─────────────────────────────────────────────────────────────
const getEmailPrompt = (brandName, brandTone, brandVertical, step, messageType, phase) => `
You are a world-class email marketing strategist for ${brandVertical} brands. Generate a highly optimised email campaign.

CONTEXT:
- Brand: ${brandName}
- Brand Tone: ${brandTone}
- Brand Vertical: ${brandVertical}
- Journey Step: ${step}
- Message Type: ${messageType}
- Phase: ${phase}

RULES:
- Subject line: concise, curiosity or urgency driven, brand specific, never generic
- Preheader: adds NEW information, never repeats subject, under 90 chars
- Body structure: greeting → hero message → context → product/offer → social proof → urgency → single CTA → footer
- UTILITY: clean, professional, confirms key fact immediately, one subtle cross-sell only at bottom
- MARKETING: emotionally engaging, benefit-led, urgency-driven, aspirational
- Beauty/wellness tone: warm, aspirational, empowering
- Fashion tone: trendy, confident, exclusive
- Tech/health tone: precise, feature-focused, trust-building
- UTILITY body: 100-150 words
- MARKETING body: 150-250 words
- Reference the specific journey moment (e.g. "You left something behind", "Your order is confirmed")
- Single CTA only — never two buttons

PHASE-SPECIFIC GUIDANCE:
- pre_purchase: drive first conversion, overcome hesitation
- purchase: reduce friction, build confidence at payment moment
- post_purchase: delight, set expectations, build loyalty
- retention: win back with value, not desperation

Respond ONLY with valid JSON, no markdown:
{
  "name": "campaign name",
  "subjectLine": "subject line",
  "preheader": "preheader text under 90 chars",
  "template": "full email body",
  "hasImage": true,
  "imageGuidance": "specific visual description",
  "conversionMetric": "primary metric to track",
  "expectedOpenRate": "e.g. 28-35%",
  "expectedCTR": "e.g. 3-5%",
  "bestSendTime": "e.g. Tuesday 10am or 1hr after cart abandon",
  "events": ["event1", "event2"],
  "personalizationVariables": ["[First Name]", "[Product Name]"]
}`;

// ─── WhatsApp Prompt ──────────────────────────────────────────────────────────
const getWhatsAppPrompt = (brandName, brandTone, brandVertical, step, messageType, phase) => `
You are a world-class WhatsApp marketing strategist. WhatsApp has 85-95% open rates and 15-20% CTR — every word must earn its place.

CONTEXT:
- Brand: ${brandName}
- Brand Tone: ${brandTone}
- Brand Vertical: ${brandVertical}
- Journey Step: ${step}
- Message Type: ${messageType}
- Phase: ${phase}

THE GOLDEN RULE: Low frequency, high relevance. One irrelevant message = unsubscribe.

RULES:
- Always start with "Hi [First Name]!" — never "Dear Customer"
- Reference the SPECIFIC user action (e.g. "You left [Product Name] in your cart")
- ONE core message only
- Single conversational CTA — never two
- End with [LINK]
- UTILITY: 50-80 words, 2-3 emojis max, purely informational
- MARKETING: 80-120 words, 3-5 emojis max, benefit-led, urgency without desperation
- Never corporate language

Respond ONLY with valid JSON, no markdown:
{
  "name": "campaign name",
  "template": "full whatsapp message",
  "hasImage": true,
  "imageGuidance": "specific visual description",
  "conversionMetric": "primary metric",
  "expectedOpenRate": "85-95%",
  "expectedCTR": "15-20%",
  "expectedRPR": "€2.50-3.50",
  "bestSendTime": "e.g. within 1hr of trigger",
  "events": ["event1", "event2"],
  "personalizationVariables": ["[First Name]", "[Product Name]"]
}`;

// ─── SMS Prompt ───────────────────────────────────────────────────────────────
const getSMSPrompt = (brandName, brandTone, brandVertical, step, messageType, phase) => `
You are a world-class SMS marketing strategist. 160 characters. Every character counts.

CONTEXT:
- Brand: ${brandName}
- Brand Tone: ${brandTone}
- Brand Vertical: ${brandVertical}
- Journey Step: ${step}
- Message Type: ${messageType}
- Phase: ${phase}

RULES:
- HARD LIMIT: 160 characters — never exceed
- Start with BRANDNAME:
- End with [link]
- One CTA only
- hasImage always false
- UTILITY: confirm the key fact in first 10 words, no promotion
- MARKETING: lead with value in first 10 words, genuine urgency

Respond ONLY with valid JSON, no markdown:
{
  "name": "campaign name",
  "template": "SMS max 160 chars",
  "hasImage": false,
  "imageGuidance": "N/A",
  "conversionMetric": "metric to track",
  "expectedCTR": "8-15%",
  "bestSendTime": "e.g. within 5min of trigger",
  "events": ["event1", "event2"],
  "personalizationVariables": ["[First Name]"]
}`;

// ─── Apify Crawler ────────────────────────────────────────────────────────────
const crawlWithApify = async (url, sessionId) => {
  const APIFY_TOKEN = process.env.APIFY_API_KEY;

  const startRes = await axios.post(
    `https://api.apify.com/v2/acts/aYG0l9s7dbB7j3gbS/runs?token=${APIFY_TOKEN}`,
    {
      startUrls: [{ url }],
      maxCrawlDepth: 4,
      maxCrawlPages: 30,
      maxConcurrency: 5,
      crawlerType: 'cheerio',
      excludeUrlGlobs: [
        '**/*.pdf', '**/*.jpg', '**/*.png', '**/*.gif',
        '**/cart**', '**/checkout**', '**/account**',
        '**/login**', '**/signup**', '**/search**',
      ],
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const runId = startRes.data.data.id;
  if (sessionId) activeRuns[sessionId] = runId;

  // Poll until complete
  let status = 'RUNNING';
  let attempts = 0;
  while (status === 'RUNNING' || status === 'READY') {
    if (sessionId && activeRuns[sessionId] === 'ABORTED') {
      await axios.post(
        `https://api.apify.com/v2/actor-runs/${runId}/abort?token=${APIFY_TOKEN}`
      ).catch(() => {});
      throw new Error('CRAWL_ABORTED');
    }
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    status = statusRes.data.data.status;
    attempts++;
    if (attempts > 30) break;
  }

  if (sessionId) delete activeRuns[sessionId];

  const resultsRes = await axios.get(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}&limit=30`
  );
  return resultsRes.data;
};

// ─── Build Journey Tree ───────────────────────────────────────────────────────
const buildJourneyTree = async (crawlData, brandName, brandTone, brandVertical, url) => {
  const pageSummaries = crawlData.slice(0, 25).map(page => ({
    url:      page.url,
    title:    page.title || '',
    headings: (page.headings || []).slice(0, 5).map(h => h.text || h).join(', '),
    links:    (page.links || []).slice(0, 12).map(l => l.text || l.url || l).join(', '),
    text:     (page.text || '').slice(0, 400),
  }));

  const prompt = `
You are a senior growth strategist and CRO expert. Build a realistic B2C user journey tree for "${brandName}" (${brandVertical} brand, tone: ${brandTone}).

CRAWLED SITE DATA from ${url}:
${JSON.stringify(pageSummaries, null, 2)}

CRITICAL MENTAL MODEL:
Each node = a USER STATE (moment in their life with the brand), NOT a website page.
The tree must follow human decision-making, not the sitemap.

JOURNEY FRAMEWORK (adapt to the actual brand using crawl data):

ACQUISITION:
- User discovers brand → lands on Homepage
  - Engages with content → Discovery phase
  - Bounces immediately (50% do) → type: dropoff, tier 3, shouldCampaign: false

DISCOVERY:
- Browses category relevant to this brand → views products
  - Finds product → Product Detail Page
  - Gets overwhelmed or price shock → type: dropoff, tier 2
- Product Detail Page
  - Reads reviews, considers → Add to Cart or Wishlist
  - Exits without action → type: dropoff, tier 2, campaign if viewed 2+ times

INTENT:
- Wishlist / Save for Later
  - Returns within 48h → proceeds to cart (happy_path)
  - Goes cold after 48h → type: dropoff, tier 1, shouldCampaign: true
- Add to Cart
  - Proceeds to checkout → happy_path
  - Abandons cart (65-75%) → type: dropoff, tier 1, shouldCampaign: true

CONVERSION:
- Checkout Initiated
  - Completes address/shipping → Payment page
  - Abandons mid-form (45-55%) → type: dropoff, tier 1, shouldCampaign: true
- Payment Page
  - Completes payment → Order Confirmed (happy_path, post_purchase)
  - Payment failure → type: dropoff, tier 1, shouldCampaign: true, messageType: UTILITY
  - Changes mind → type: dropoff, tier 1, shouldCampaign: true

POST-PURCHASE:
- Order Confirmed → Order Processing → Dispatched
  - Out for Delivery → Delivered (happy_path, post_purchase, UTILITY)
    - Post-delivery: review prompt → Repeat Purchase or Dormant
  - Delivery Failed → type: dropoff, post_purchase, UTILITY, shouldCampaign: true
- Not Dispatched within SLA → type: dropoff, post_purchase, UTILITY, shouldCampaign: true

RETENTION:
- Dormant user (30d+ no activity) → type: retention, shouldCampaign: true
- Loyal Customer → Referral / Loyalty prompt → type: retention

NODE FIELD RULES:
1. type: exactly "happy_path", "dropoff", or "retention"
2. phase: "pre_purchase", "purchase", "post_purchase", or "retention"
3. messageType: "UTILITY" for transactional/order/delivery, "MARKETING" for persuasion
4. timing: specific trigger e.g. "1 hour after cart abandoned", "immediately on payment failure"
5. tier: 1, 2, or 3
6. shouldCampaign: true/false — tier 1 dropoffs ALWAYS true
7. dropoffRate: realistic % string e.g. "68%" — required on all dropoff nodes, null otherwise
8. dropoffReason: max 5 words e.g. "Price friction at checkout" — required on dropoff nodes, null otherwise
9. children: array — empty [] at true leaf nodes only
10. DO NOT name nodes "X Dropoff" — dropoff is a type field on real moment nodes

THREE-TIER RULE:
- Tier 1 (ALWAYS campaign): Cart abandon, Checkout abandon, Payment drop, Wishlist 48h, Sign-up abandon
- Tier 2 (Campaign only with prior intent): Product viewed 2+, Search with click
- Tier 3 (NEVER campaign): Homepage bounce, Category browse exit

QUALITY REQUIREMENTS:
- Minimum 15 nodes total
- At least 5 dropoff nodes
- At least 3 post_purchase nodes
- At least 2 retention nodes
- Use actual brand category names from crawl data

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "journeySteps": [
    {
      "step": "Homepage Discovery",
      "type": "happy_path",
      "phase": "pre_purchase",
      "messageType": "MARKETING",
      "timing": "N/A",
      "tier": 3,
      "shouldCampaign": false,
      "dropoffRate": null,
      "dropoffReason": null,
      "children": []
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 6000,
    temperature: 0.4,
  });

  const raw = completion.choices[0].message.content.trim();
  const clean = raw.replace(/```json|```/g, '').trim();
  const first = clean.indexOf('{');
  const last  = clean.lastIndexOf('}');
  return JSON.parse(clean.substring(first, last + 1));
};

// ─── Parse JSON helper ────────────────────────────────────────────────────────
const parseJSON = (raw, fallback = {}) => {
  try {
    const clean = raw.trim().replace(/```json|```/g, '').trim();
    const first = clean.indexOf('{');
    const last  = clean.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('No JSON found');
    return JSON.parse(clean.substring(first, last + 1));
  } catch (e) {
    console.error('JSON parse error:', e.message);
    return fallback;
  }
};

// ─── Routes ───────────────────────────────────────────────────────────────────

const crawlWebsite = async (req, res) => {
  const { url, sessionId } = req.body;

  try {
    // 1. Brand detection
    const brandCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Based on this URL: ${url}, identify the brand.
Respond ONLY with valid JSON:
{
  "brandName": "brand name",
  "brandTone": "2-4 word tone e.g. Vibrant and playful",
  "brandVertical": "one of: beauty, fashion, tech, food, home, health, sports, general"
}`,
      }],
      max_tokens: 150,
    });

    const brandData = parseJSON(brandCompletion.choices[0].message.content, {
      brandName:     'Brand',
      brandTone:     'Professional and customer-focused',
      brandVertical: 'general',
    });

    // 2. Crawl with Apify
    console.log('Starting Apify crawl for:', url);
    const crawlData = await crawlWithApify(url, sessionId);
    console.log('Apify crawl complete. Pages:', crawlData.length);

    // 3. Build behaviour-first journey tree
    console.log('Building journey tree with GPT-4o...');
    const treeData = await buildJourneyTree(
      crawlData,
      brandData.brandName,
      brandData.brandTone,
      brandData.brandVertical,
      url,
    );

    res.json({
      success: true,
      url,
      journey: {
        brandName:     brandData.brandName,
        brandTone:     brandData.brandTone,
        brandVertical: brandData.brandVertical,
        journeySteps:  treeData.journeySteps,
        pagesFound:    crawlData.length,
      },
    });

  } catch (error) {
    if (error.message === 'CRAWL_ABORTED') {
      return res.json({ success: false, aborted: true });
    }
    console.error('Crawl error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const stopCrawl = (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ success: false, error: 'No sessionId' });
  activeRuns[sessionId] = 'ABORTED';
  console.log('Crawl abort signal set for session:', sessionId);
  res.json({ success: true, message: 'Stop signal sent' });
};

const generateCampaign = async (req, res) => {
  const { brandName, brandTone, brandVertical, step, messageType, phase, channel } = req.body;

  try {
    const vertical = brandVertical || 'general';
    const promptMap = {
      email:    getEmailPrompt(brandName, brandTone, vertical, step, messageType, phase),
      whatsapp: getWhatsAppPrompt(brandName, brandTone, vertical, step, messageType, phase),
      sms:      getSMSPrompt(brandName, brandTone, vertical, step, messageType, phase),
    };

    const prompt = promptMap[channel];
    if (!prompt) return res.status(400).json({ success: false, error: 'Invalid channel' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: channel === 'email' ? 1200 : 700,
      temperature: 0.7,
    });

    const campaign = parseJSON(completion.choices[0].message.content, {
      name:                     `${channel} Campaign`,
      template:                 'Template could not be generated. Please retry.',
      hasImage:                 false,
      imageGuidance:            'N/A',
      conversionMetric:         'Track manually',
      events:                   [],
      personalizationVariables: ['[First Name]'],
    });

    res.json({ success: true, campaign });

  } catch (error) {
    console.error('Campaign error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { crawlWebsite, stopCrawl, generateCampaign };