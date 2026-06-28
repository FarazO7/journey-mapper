'use strict';

/**
 * dropoffDetector.js — pure, network-free.
 *
 * Infers funnel drop-offs from raw events. A "drop-off" is the ABSENCE of the
 * next expected stage: a visitor reached some stage in `stageOrder` but did not
 * reach the following stage before the window elapsed. There is no drop-off event.
 *
 * Input : an array of event objects shaped like the `Event` model
 *         ({ dedupeId, anonId, userId, stage, ts, ... }).
 * Output: one row per dropped-off visitor — { anonId, userId, stage, reason, lastSeen }.
 *
 * Deterministic: pass a fixed `now` to make the window logic testable without the clock.
 */

// The canonical funnel order. Mirrors the stages the SDK emits
// (page_view / signup / product_view / add_to_cart / purchase).
const DEFAULT_STAGE_ORDER = ['page_view', 'signup', 'product_view', 'add_to_cart', 'purchase'];

const MINUTE_MS = 60 * 1000;
const DEFAULT_WINDOW_MS = 30 * MINUTE_MS;

// ts may arrive as a Date, an ISO string, or epoch millis — normalise to millis.
function toMillis(ts) {
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? null : t;
}

// Drop exact resends: the same dedupeId counts once. Events without a dedupeId
// are always kept (we have no basis to treat them as duplicates).
function dedupe(events) {
  const seen = new Set();
  const out = [];
  for (const ev of events || []) {
    if (!ev) continue;
    if (ev.dedupeId) {
      if (seen.has(ev.dedupeId)) continue;
      seen.add(ev.dedupeId);
    }
    out.push(ev);
  }
  return out;
}

function detectDropoffs(events, opts = {}) {
  const stageOrder = opts.stageOrder || DEFAULT_STAGE_ORDER;
  const windowMs = typeof opts.windowMs === 'number' ? opts.windowMs : DEFAULT_WINDOW_MS;
  const now = typeof opts.now === 'number' ? opts.now : Date.now();

  const lastStage = stageOrder[stageOrder.length - 1];
  const stageIndex = new Map(stageOrder.map((s, i) => [s, i]));
  const windowMinutes = Math.round(windowMs / MINUTE_MS);

  // 1) dedupe, then 2) group by anonId (present on every SDK event).
  //    Each group tracks the userId (if ever identified), last activity, and the
  //    earliest time each funnel stage was reached.
  const groups = new Map(); // key -> { anonId, userId, lastSeenMs, reachedAtMs: Map(stage->ms) }
  for (const ev of dedupe(events)) {
    const anonId = ev.anonId || null;
    const key = anonId || '';                   // anon-less events still group together
    const tsMs = toMillis(ev.ts);

    let g = groups.get(key);
    if (!g) {
      g = { anonId, userId: null, lastSeenMs: null, reachedAtMs: new Map() };
      groups.set(key, g);
    }
    if (!g.userId && ev.userId) g.userId = ev.userId;
    if (tsMs !== null && (g.lastSeenMs === null || tsMs > g.lastSeenMs)) g.lastSeenMs = tsMs;

    // only funnel stages participate; record the EARLIEST time each was reached
    if (stageIndex.has(ev.stage) && tsMs !== null) {
      const prev = g.reachedAtMs.get(ev.stage);
      if (prev === undefined || tsMs < prev) g.reachedAtMs.set(ev.stage, tsMs);
    }
  }

  // 3) per visitor: furthest reached stage -> window check on its successor.
  const rows = [];
  for (const g of groups.values()) {
    let furthestIdx = -1;
    for (const stage of g.reachedAtMs.keys()) {
      const idx = stageIndex.get(stage);
      if (idx > furthestIdx) furthestIdx = idx;
    }
    if (furthestIdx === -1) continue;                       // reached no funnel stage
    const stage = stageOrder[furthestIdx];
    if (stage === lastStage) continue;                      // converted — reached the goal

    const reachedAt = g.reachedAtMs.get(stage);
    if (now - reachedAt < windowMs) continue;               // still inside the window (boundary inclusive)

    const nextStage = stageOrder[furthestIdx + 1];
    rows.push({
      anonId: g.anonId,
      userId: g.userId,
      stage,
      reason: `Reached "${stage}" but did not reach "${nextStage}" within ${windowMinutes} minutes`,
      lastSeen: g.lastSeenMs !== null ? new Date(g.lastSeenMs).toISOString() : null,
      _idx: furthestIdx,
      _lastSeenMs: g.lastSeenMs,
    });
  }

  // 4) collapse rows for the same identified user (seen across multiple anonIds):
  //    keep the furthest stage, tie-break on most recent activity.
  const byUser = new Map();
  const anonRows = [];
  for (const row of rows) {
    if (!row.userId) { anonRows.push(row); continue; }
    const existing = byUser.get(row.userId);
    const better = !existing
      || row._idx > existing._idx
      || (row._idx === existing._idx && (row._lastSeenMs || 0) > (existing._lastSeenMs || 0));
    if (better) byUser.set(row.userId, row);
  }

  // deterministic order: most recently active first, then strip internal keys.
  const finalRows = anonRows.concat(Array.from(byUser.values()));
  finalRows.sort((a, b) => (b._lastSeenMs || 0) - (a._lastSeenMs || 0));
  return finalRows.map(({ _idx, _lastSeenMs, ...row }) => row);
}

module.exports = { detectDropoffs, DEFAULT_STAGE_ORDER };
