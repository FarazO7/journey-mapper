'use strict';

// campaignController.js — Phase 3 MECE variant generation.
//
// GENERATION ONLY: produces 2-3 mutually-exclusive, collectively-exhaustive message
// variants for a journey node + channel, personalised with a real user's data when a
// profile is provided, and stores them for human review. NOTHING IS SENT here, and no
// email/WhatsApp/SMS provider SDK is imported (sending + consent-gating is Phase 4;
// assigning users to a variant and measuring winners is Phase 5).
const { Event, Profile } = require('../models/Event');
const CampaignVariant = require('../models/CampaignVariant');
const { getOpenAI, parseJSON } = require('../services/llm');
const {
  phaseForStage, messageTypeForPhase, strategiesForPhase, STRATEGY_LABEL,
  validateAndRepairVariants,
} = require('../services/campaignVariants');
const { buildPersonalizationData, personalizeVariant } = require('../services/personalize');

const CHANNELS = ['email', 'whatsapp', 'sms'];

// One prompt that returns ALL N variants for a channel in a single call
// (fewer round-trips / tokens than N separate calls).
function buildVariantsPrompt({ n, channel, stage, phase, messageType, brand }) {
  const strategies = strategiesForPhase(phase);
  const labels = strategies.map((s) => `${s} (${STRATEGY_LABEL[s]})`).join(', ');
  const toneRule = messageType === 'UTILITY'
    ? 'UTILITY tone: service / transactional (order & delivery updates, reassurance). NO discounts, NO urgency, NO promotional offers.'
    : 'MARKETING tone: persuasive — urgency, incentives, social proof and benefit framing are allowed.';
  const fmt = {
    email: 'EMAIL: each variant has a "subjectLine" (concise, specific), an optional "preheader", and a "template" body (100-200 words).',
    whatsapp: 'WHATSAPP: each variant has a "template" body only (no subject), 50-100 words, a few emojis ok, single CTA.',
    sms: 'SMS: each variant has a "template" body only (no subject), HARD LIMIT 160 characters, one CTA.',
  }[channel];
  const kpiFields = channel === 'email'
    ? '"expectedOpenRate": "e.g. 25-35%", "expectedCTR": "e.g. 3-5%",'
    : channel === 'whatsapp'
      ? '"expectedOpenRate": "85-95%", "expectedCTR": "15-20%", "expectedRPR": "INR 150-300",'
      : '"expectedCTR": "8-12%",';

  return `
You design MECE message variants for a customer-journey step. GENERATION ONLY — these are for human review, never auto-sent.

CONTEXT:
- Brand: ${brand.brandName || 'the brand'} (${brand.brandVertical || 'general'}), tone: ${brand.brandTone || 'professional, friendly'}
- Journey stage: ${stage}
- Phase: ${phase}  |  Message type: ${messageType}
- Channel: ${channel}

PRODUCE EXACTLY ${n} VARIANTS that are MECE:
- MUTUALLY EXCLUSIVE: each uses a DIFFERENT strategy; no two alike. Choose from: ${labels}.
- COLLECTIVELY EXHAUSTIVE: together they cover the main viable approaches for THIS stage.
- ${toneRule}
- ${fmt}
- Keep the placeholders [First Name] and [Product Name] verbatim in the copy (they are filled in later). Do not invent other bracketed tokens.
- Exactly one CTA per variant.

Respond ONLY with valid JSON, no markdown:
{
  "variants": [
    {
      "strategy": "one of: ${strategies.join(' | ')}",
      "name": "short variant name",
      ${channel === 'email' ? '"subjectLine": "subject", "preheader": "preheader text",' : ''}
      "template": "the message body",
      "conversionMetric": "primary metric",
      ${kpiFields}
      "bestSendTime": "e.g. within 1 hour of trigger",
      "personalizationVariables": ["[First Name]", "[Product Name]"]
    }
  ]
}`;
}

// Resolve the user's personalization context: profile + most recent product_view.
// Events are frequently stored under the anonId captured BEFORE identify linked it
// to a userId, so we resolve the profile first and then query events across every id
// we know for this person (the passed-in ids plus the profile's linked ids).
async function loadUserContext({ userId, anonId }) {
  const seed = [];
  if (userId) seed.push({ userId });
  if (anonId) seed.push({ anonId });
  if (!seed.length) return { profile: null, recentProductView: null };

  const profile = await Profile.findOne({ $or: seed }).lean();

  const idOr = [];
  for (const u of new Set([userId, profile && profile.userId].filter(Boolean))) idOr.push({ userId: u });
  for (const a of new Set([anonId, profile && profile.anonId].filter(Boolean))) idOr.push({ anonId: a });

  const recentProductView = idOr.length
    ? await Event.findOne({ name: 'product_view', $or: idOr }).sort({ ts: -1 }).lean()
    : null;
  return { profile, recentProductView };
}

// POST /api/campaigns/generate-variants
const generateVariants = async (req, res) => {
  try {
    const body = req.body || {};
    const { stage, channel, userId, anonId, phase: phaseIn, brandName, brandTone, brandVertical } = body;
    const n = Math.min(3, Math.max(2, Number(body.n) || 3)); // 2-3 variants, default 3

    if (!stage || !String(stage).trim()) {
      return res.status(400).json({ success: false, error: 'stage is required' });
    }
    if (!CHANNELS.includes(channel)) {
      return res.status(400).json({ success: false, error: `channel must be one of ${CHANNELS.join(', ')}` });
    }

    const phase = phaseIn || phaseForStage(stage);
    const messageType = messageTypeForPhase(phase);
    const brand = { brandName, brandTone, brandVertical };

    // 1) one LLM call -> all N variants for this channel
    let parsed;
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: buildVariantsPrompt({ n, channel, stage, phase, messageType, brand }) }],
        max_tokens: (channel === 'email' ? 500 : 300) * n,
        temperature: 0.8,
      });
      parsed = parseJSON(completion.choices[0].message.content, { variants: [] });
    } catch (e) {
      console.error('Variant LLM error:', e.message);
      parsed = { variants: [] }; // recover -> validateAndRepair fills safe fallbacks
    }

    // 2) validate + repair -> exactly N distinct-strategy, stage-correct variants
    let variants = validateAndRepairVariants(parsed, { n, channel, phase, stage });

    // 3) personalise with the user's real data when an id is provided
    let personalized = false;
    let consent = null;
    let user = null;
    if (userId || anonId) {
      const { profile, recentProductView } = await loadUserContext({ userId, anonId });
      const data = buildPersonalizationData(profile, recentProductView);
      variants = variants.map((v) => personalizeVariant(v, data));
      personalized = true;
      // consent is INFORMATIONAL only here — it gates SENDING in Phase 4, not generation
      consent = profile && profile.consent
        ? { email: !!profile.consent.email, whatsapp: !!profile.consent.whatsapp, sms: !!profile.consent.sms }
        : { email: false, whatsapp: false, sms: false };
      user = {
        userId: userId || (profile && profile.userId) || null,
        anonId: anonId || (profile && profile.anonId) || null,
        firstName: data.hasFirstName ? data.firstName : null,
        recentProduct: data.hasProductName ? data.productName : null,
      };
    }

    // 4) persist for review (best-effort; a write failure must not fail generation)
    let persistedId = null;
    try {
      const doc = await CampaignVariant.create({ stage, phase, channel, messageType, userId, anonId, personalized, variants });
      persistedId = doc._id;
    } catch (e) {
      console.error('Variant persist error:', e.message);
    }

    res.json({
      success: true,
      stage, channel, phase, messageType,
      personalized, consent, user, variants, persistedId,
      note: 'Generated for review only — not sent (sending is Phase 4).',
    });
  } catch (error) {
    console.error('Generate-variants error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { generateVariants, buildVariantsPrompt, loadUserContext };
