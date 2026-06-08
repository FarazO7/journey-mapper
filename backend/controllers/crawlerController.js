const OpenAI = require('openai');
const axios = require('axios');
const { buildJourneyGraph } = require('../services/journeyGraph');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Active run registry (sessionId -> apifyRunId) ─────────────────────────────
const activeRuns = {};

// ── JSON parse helper ─────────────────────────────────────────────────────────
const parseJSON = (raw, fallback = {}) => {
  try {
    const clean = String(raw).trim().replace(/```json|```/g, '').trim();
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('No JSON found');
    return JSON.parse(clean.substring(first, last + 1));
  } catch (e) {
    console.error('JSON parse error:', e.message);
    return fallback;
  }
};

// ── Campaign prompts (unchanged — still used on conversion nodes) ─────────────
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
- Body structure: greeting -> hero message -> context -> product/offer -> social proof -> urgency -> single CTA -> footer
- UTILITY: clean, professional, confirms key fact immediately, one subtle cross-sell only at bottom
- MARKETING: emotionally engaging, benefit-led, urgency-driven, aspirational
- UTILITY body: 100-150 words; MARKETING body: 150-250 words
- Reference the specific journey moment (e.g. "You left something behind", "Your order is confirmed")
- Single CTA only — never two buttons

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
- ONE core message only; single conversational CTA; end with [LINK]
- UTILITY: 50-80 words, 2-3 emojis max; MARKETING: 80-120 words, 3-5 emojis max
- Never corporate language

NOTE: WhatsApp templates must be approved by Meta before sending and are categorised
UTILITY vs MARKETING — keep this message within the stated messageType.

Respond ONLY with valid JSON, no markdown:
{
  "name": "campaign name",
  "template": "full whatsapp message",
  "hasImage": true,
  "imageGuidance": "specific visual description",
  "conversionMetric": "primary metric",
  "expectedOpenRate": "85-95%",
  "expectedCTR": "15-20%",
  "expectedRPR": "INR 200-350",
  "bestSendTime": "e.g. within 1hr of trigger",
  "events": ["event1", "event2"],
  "personalizationVariables": ["[First Name]", "[Product Name]"]
}`;

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
- Start with BRANDNAME:; end with [link]; one CTA only; hasImage always false
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

// ── Apify crawler (Playwright for JS-rendered storefronts) ────────────────────
// We only need page URLs; classification is URL-based. We still exclude the
// transactional pages (cart/checkout/account/search) because those states are
// INJECTED by the graph builder, not crawled.
const crawlWithApify = async (url, sessionId) => {
  const APIFY_TOKEN = process.env.APIFY_API_KEY;

  const startRes = await axios.post(
    `https://api.apify.com/v2/acts/aYG0l9s7dbB7j3gbS/runs?token=${APIFY_TOKEN}`,
    {
      startUrls: [{ url }],
      maxCrawlDepth: 4,
      maxCrawlPages: 40,
      maxConcurrency: 5,
      // JS rendering — most D2C storefronts render nav/category links client-side.
      // cheerio (static HTML) misses them. Use 'cheerio' only as a cheap fallback.
      crawlerType: 'playwright:firefox',
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

  let status = 'RUNNING';
  let attempts = 0;
  while (status === 'RUNNING' || status === 'READY') {
    if (sessionId && activeRuns[sessionId] === 'ABORTED') {
      await axios
        .post(`https://api.apify.com/v2/actor-runs/${runId}/abort?token=${APIFY_TOKEN}`)
        .catch(() => {});
      throw new Error('CRAWL_ABORTED');
    }
    await new Promise((r) => setTimeout(r, 4000));
    const statusRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    status = statusRes.data.data.status;
    attempts++;
    if (attempts > 30) break;
  }

  if (sessionId) delete activeRuns[sessionId];

  const resultsRes = await axios.get(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}&limit=200`
  );
  // Normalise to { url } — tolerate different actor output shapes.
  return (resultsRes.data || [])
    .map((item) => ({ url: item.url || item.loadedUrl || item.pageUrl }))
    .filter((p) => p.url);
};

// ── Routes ─────────────────────────────────────────────────────────────────────
const crawlWebsite = async (req, res) => {
  const { url, sessionId } = req.body;
  try {
    // 1. Brand detection (lightweight, from URL).
    const brandCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Based on this URL: ${url}, identify the brand.
Respond ONLY with valid JSON:
{ "brandName": "brand name", "brandTone": "2-4 word tone", "brandVertical": "one of: beauty, fashion, tech, food, home, health, sports, general" }`,
      }],
      max_tokens: 150,
    });
    const brand = parseJSON(brandCompletion.choices[0].message.content, {
      brandName: 'Brand', brandTone: 'Professional and customer-focused', brandVertical: 'general',
    });

    // 2. Crawl.
    console.log('Crawling:', url);
    const pages = await crawlWithApify(url, sessionId);
    console.log('Crawl complete. URLs:', pages.length);

    // 3. Build the state DAG deterministically (no LLM, no fabrication).
    const graph = buildJourneyGraph(pages, { vertical: brand.brandVertical });

    res.json({
      success: true,
      url,
      brand: {
        brandName: brand.brandName,
        brandTone: brand.brandTone,
        brandVertical: brand.brandVertical,
        pagesFound: pages.length,
      },
      graph, // { nodes, edges, meta }
    });
  } catch (error) {
    if (error.message === 'CRAWL_ABORTED') return res.json({ success: false, aborted: true });
    console.error('Crawl error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const stopCrawl = (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ success: false, error: 'No sessionId' });
  activeRuns[sessionId] = 'ABORTED';
  res.json({ success: true, message: 'Stop signal sent' });
};

const generateCampaign = async (req, res) => {
  const { brandName, brandTone, brandVertical, step, messageType, phase, channel } = req.body;
  try {
    const vertical = brandVertical || 'general';
    const promptMap = {
      email: getEmailPrompt(brandName, brandTone, vertical, step, messageType, phase),
      whatsapp: getWhatsAppPrompt(brandName, brandTone, vertical, step, messageType, phase),
      sms: getSMSPrompt(brandName, brandTone, vertical, step, messageType, phase),
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
      name: `${channel} Campaign`,
      template: 'Template could not be generated. Please retry.',
      hasImage: false, imageGuidance: 'N/A', conversionMetric: 'Track manually',
      events: [], personalizationVariables: ['[First Name]'],
    });

    res.json({ success: true, campaign });
  } catch (error) {
    console.error('Campaign error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { crawlWebsite, stopCrawl, generateCampaign };
