'use strict';

// campaignVariants.js — pure, no DB / no network.
// MECE variant rules + validation/repair so the endpoint always returns exactly N
// distinct-strategy, stage-appropriate variants even when the LLM misbehaves.
// GENERATION ONLY — produces variants for human review; it sends nothing.

// Mutually-exclusive strategic angles. Pre/at-purchase lean persuasive; post-purchase
// is service/utility (NO discounts / urgency).
const PURCHASE_STRATEGIES = ['urgency', 'incentive', 'social_proof', 'value_reminder'];
const POST_PURCHASE_STRATEGIES = ['status_update', 'reassurance', 'cross_sell_soft'];

const STRATEGY_LABEL = {
  urgency: 'Urgency',
  incentive: 'Incentive / Offer',
  social_proof: 'Social Proof',
  value_reminder: 'Value / Benefit Reminder',
  status_update: 'Status Update',
  reassurance: 'Reassurance',
  cross_sell_soft: 'Soft Cross-sell',
};

// Deterministic stage -> phase map mirroring the journey funnel ids/labels.
// (journeyGraph owns the canonical nodes; we only read this mapping, never change it.)
function phaseForStage(stage) {
  const s = String(stage || '').toLowerCase();
  if (/order|deliver|ship|received/.test(s)) return 'post_purchase';
  if (/checkout|payment|purchase/.test(s)) return 'purchase';
  return 'pre_purchase'; // home, product, category, search, add_to_cart, cart_abandoned...
}

function messageTypeForPhase(phase) {
  return phase === 'post_purchase' ? 'UTILITY' : 'MARKETING';
}

function strategiesForPhase(phase) {
  return phase === 'post_purchase' ? POST_PURCHASE_STRATEGIES : PURCHASE_STRATEGIES;
}

// Channel KPI scaffold, consistent with the existing campaign shape.
function kpiFor(channel) {
  if (channel === 'email') return { expectedOpenRate: '20-30%', expectedCTR: '2-4%' };
  if (channel === 'whatsapp') return { expectedOpenRate: '85-95%', expectedCTR: '15-20%', expectedRPR: 'INR 150-300' };
  return { expectedCTR: '6-12%' }; // sms
}

// Deterministic, safe fallback variant for a strategy (used to repair/pad shortfalls).
function buildFallbackVariant(strategy, { channel, messageType, stage }) {
  const label = STRATEGY_LABEL[strategy] || strategy;
  const v = {
    strategy,
    name: `${label} — ${stage}`,
    channel,
    messageType,
    template: `Hi [First Name], a quick note about [Product Name]. (${label} angle.)`,
    conversionMetric: 'Track manually',
    bestSendTime: 'within 1 hour of trigger',
    personalizationVariables: ['[First Name]', '[Product Name]'],
    ...kpiFor(channel),
    _fallback: true,
  };
  if (channel === 'email') {
    v.subjectLine = '[First Name], about [Product Name]';
    v.preheader = label;
  }
  return v;
}

const REQUIRED = ['strategy', 'template'];

// Validate + repair an LLM response into exactly N distinct-strategy variants:
//  - drops malformed entries and duplicate strategies (MECE: no two alike)
//  - stamps channel + the phase-correct messageType server-side (model can't override)
//  - strips email-only fields on non-email channels
//  - pads any shortfall with deterministic fallback variants -> never crashes
function validateAndRepairVariants(parsed, { n = 3, channel, phase, stage } = {}) {
  const messageType = messageTypeForPhase(phase);
  const palette = strategiesForPhase(phase);
  const raw = Array.isArray(parsed) ? parsed
    : (parsed && Array.isArray(parsed.variants)) ? parsed.variants : [];

  const out = [];
  const used = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    if (REQUIRED.some((k) => !item[k] || !String(item[k]).trim())) continue;
    const strategy = String(item.strategy).toLowerCase().trim().replace(/[\s/]+/g, '_');
    if (used.has(strategy)) continue;                 // MECE: drop duplicate angle
    used.add(strategy);
    const v = {
      ...item,
      strategy,
      channel,
      messageType,                                    // server-authoritative
      personalizationVariables: Array.isArray(item.personalizationVariables)
        ? item.personalizationVariables : ['[First Name]', '[Product Name]'],
    };
    if (channel !== 'email') { delete v.subjectLine; delete v.preheader; }
    out.push(v);
    if (out.length >= n) break;
  }

  // pad shortfall with fresh strategies from the phase palette
  for (const strat of palette) {
    if (out.length >= n) break;
    if (used.has(strat)) continue;
    used.add(strat);
    out.push(buildFallbackVariant(strat, { channel, messageType, stage }));
  }
  // last resort if palette is exhausted but n is still larger
  let i = 0;
  while (out.length < n) {
    out.push(buildFallbackVariant(`${palette[i % palette.length]}_${i + 2}`, { channel, messageType, stage }));
    i++;
  }
  return out.slice(0, n);
}

module.exports = {
  PURCHASE_STRATEGIES, POST_PURCHASE_STRATEGIES, STRATEGY_LABEL,
  phaseForStage, messageTypeForPhase, strategiesForPhase,
  buildFallbackVariant, validateAndRepairVariants,
};
