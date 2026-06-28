'use strict';

// personalize.js — pure, no DB / no network.
// Fills a message template's placeholders with a real user's data and GUARANTEES no
// literal placeholder (e.g. "[First Name]") survives in personalized output.
// GENERATION ONLY — prepares copy for human review; it sends nothing.

// Safe generic fallbacks for when we don't know the user's data.
const FALLBACK = {
  firstName: 'there',                  // -> "Hi there,"
  productName: 'the items you viewed',
};

// Derive personalization data from a Profile doc + the user's most recent
// product_view event. Either may be null/undefined; we fall back safely.
function buildPersonalizationData(profile, recentProductView) {
  const firstName =
    (profile && profile.traits && String(profile.traits.firstName || '').trim()) || '';
  const productName =
    (recentProductView && recentProductView.properties &&
      String(recentProductView.properties.productName || '').trim()) || '';
  return {
    firstName: firstName || FALLBACK.firstName,
    productName: productName || FALLBACK.productName,
    hasFirstName: !!firstName,
    hasProductName: !!productName,
  };
}

// Replace the known placeholders (case-insensitive, tolerant of spacing) then sweep
// away ANY remaining "[...]" token so a literal placeholder can never survive.
function fillPlaceholders(text, data = {}) {
  if (text == null) return text;
  const firstName = data.firstName || FALLBACK.firstName;
  const productName = data.productName || FALLBACK.productName;
  let out = String(text)
    .replace(/\[\s*first\s*name\s*\]/gi, firstName)
    .replace(/\[\s*product\s*name\s*\]/gi, productName)
    // safety sweep: drop any leftover bracketed token (e.g. a stray "[PROMO]")
    .replace(/\[[^\]]*\]/g, '')
    // tidy the spacing/punctuation left behind by a removed token
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?])/g, '$1');
  return out.trim();
}

// Personalize the human-readable fields of a variant.
function personalizeVariant(variant, data = {}) {
  const v = { ...variant };
  for (const field of ['template', 'subjectLine', 'preheader', 'name']) {
    if (v[field] != null) v[field] = fillPlaceholders(v[field], data);
  }
  return v;
}

module.exports = { buildPersonalizationData, fillPlaceholders, personalizeVariant, FALLBACK };
