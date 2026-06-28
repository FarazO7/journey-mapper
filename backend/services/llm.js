'use strict';

// llm.js — shared LLM helpers for the generation controllers.
// GENERATION ONLY: this talks to OpenAI and parses its JSON. It does not send any
// message and imports no email/WhatsApp/SMS provider SDK.
const OpenAI = require('openai');

// Lazily create one client so simply requiring this module never throws when
// OPENAI_API_KEY is absent (e.g. in unit tests that mock/never call the LLM).
let _client = null;
function getOpenAI() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// Tolerant JSON extractor — mirrors crawlerController's parseJSON: strips ```json
// fences and slices the first '{' .. last '}', returning `fallback` on any error.
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

module.exports = { getOpenAI, parseJSON };
