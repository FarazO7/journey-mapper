'use strict';

const { detectDropoffs, DEFAULT_STAGE_ORDER } = require('./dropoffDetector');

const NOW = Date.parse('2026-06-28T12:00:00.000Z');
const MIN = 60 * 1000;
const WINDOW = 30 * MIN;

// minutes-ago -> ISO string. Events store ts as a Date in Mongo, but the detector
// must also accept ISO strings / epoch millis; tests exercise all three.
const agoIso = (mins) => new Date(NOW - mins * MIN).toISOString();

// build an event with sensible defaults; `over` overrides any field.
const ev = (over = {}) => ({
  dedupeId: 'd_' + Math.random().toString(36).slice(2),
  anonId: 'a1',
  userId: null,
  name: 'x',
  stage: 'page_view',
  ts: agoIso(60),
  ...over,
});

const run = (events, opts) =>
  detectDropoffs(events, { windowMs: WINDOW, now: NOW, ...opts });

test('flags a visitor stalled at add_to_cart past the window', () => {
  const out = run([
    ev({ stage: 'product_view', ts: agoIso(70) }),
    ev({ stage: 'add_to_cart', ts: agoIso(60) }),
  ]);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ anonId: 'a1', userId: null, stage: 'add_to_cart' });
  expect(out[0].reason).toContain('purchase');
  expect(out[0].lastSeen).toBe(agoIso(60));
});

test('does not flag a visitor who reached add_to_cart then purchased in the window', () => {
  const out = run([
    ev({ stage: 'add_to_cart', ts: agoIso(60) }),
    ev({ stage: 'purchase', ts: agoIso(55) }),
  ]);
  expect(out).toEqual([]);
});

test('does not flag a visitor still inside the window', () => {
  const out = run([ev({ stage: 'add_to_cart', ts: agoIso(10) })]); // 10 < 30
  expect(out).toEqual([]);
});

test('handles out-of-order events by sorting on ts', () => {
  const out = run([
    ev({ stage: 'add_to_cart', ts: agoIso(40) }), // later in array, more recent
    ev({ stage: 'product_view', ts: agoIso(80) }),
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].stage).toBe('add_to_cart');
  expect(out[0].lastSeen).toBe(agoIso(40)); // most recent activity
});

test('treats a visitor who skipped a stage but reached purchase as converted', () => {
  const out = run([
    ev({ stage: 'product_view', ts: agoIso(60) }),
    ev({ stage: 'purchase', ts: agoIso(55) }), // no add_to_cart
  ]);
  expect(out).toEqual([]);
});

test('flags at the furthest reached stage when a later stage is skipped', () => {
  const out = run([
    ev({ stage: 'page_view', ts: agoIso(90) }),
    ev({ stage: 'product_view', ts: agoIso(60) }), // no signup, no add_to_cart
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].stage).toBe('product_view');
  expect(out[0].reason).toContain('add_to_cart');
});

test('flags a visitor who only viewed a page', () => {
  const out = run([ev({ stage: 'page_view', ts: agoIso(60) })]);
  expect(out).toHaveLength(1);
  expect(out[0].stage).toBe('page_view');
  expect(out[0].reason).toContain('signup');
});

test('ignores duplicate events (same dedupeId) without spurious rows', () => {
  const dup = { dedupeId: 'dup1', anonId: 'a1', stage: 'add_to_cart', ts: agoIso(60) };
  const out = run([ev(dup), ev(dup)]);
  expect(out).toHaveLength(1);
  expect(out[0].stage).toBe('add_to_cart');
});

test('reports at the exact window boundary (inclusive)', () => {
  const out = run([ev({ stage: 'add_to_cart', ts: new Date(NOW - WINDOW).toISOString() })]);
  expect(out).toHaveLength(1);
});

test('includes userId when the visitor is identified', () => {
  const out = run([ev({ stage: 'add_to_cart', userId: 'u1', ts: agoIso(60) })]);
  expect(out[0].userId).toBe('u1');
});

test('collapses one identified user seen across multiple anonIds into a single row', () => {
  const out = run([
    ev({ anonId: 'a1', userId: 'u1', stage: 'add_to_cart', ts: agoIso(60) }),
    ev({ anonId: 'a2', userId: 'u1', stage: 'add_to_cart', ts: agoIso(50) }),
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].userId).toBe('u1');
  expect(out[0].lastSeen).toBe(agoIso(50)); // most recent activity wins the tie
});

test('returns [] for empty or missing input', () => {
  expect(detectDropoffs([], { now: NOW })).toEqual([]);
  expect(detectDropoffs(undefined, { now: NOW })).toEqual([]);
});

test('ignores events whose stage is not part of the funnel', () => {
  const out = run([ev({ stage: 'wishlist_add', ts: agoIso(60) })]);
  expect(out).toEqual([]);
});

test('accepts ts as a Date object and as epoch millis', () => {
  const asDate = run([ev({ anonId: 'd', stage: 'add_to_cart', ts: new Date(NOW - 60 * MIN) })]);
  const asEpoch = run([ev({ anonId: 'e', stage: 'add_to_cart', ts: NOW - 60 * MIN })]);
  expect(asDate).toHaveLength(1);
  expect(asEpoch).toHaveLength(1);
});

test('honours a custom stageOrder', () => {
  const out = detectDropoffs(
    [ev({ stage: 'a', ts: agoIso(60) })],
    { stageOrder: ['a', 'b'], windowMs: WINDOW, now: NOW }
  );
  expect(out).toHaveLength(1);
  expect(out[0].stage).toBe('a');
  expect(out[0].reason).toContain('"b"');
});

test('exposes the default stage order matching the SDK funnel', () => {
  expect(DEFAULT_STAGE_ORDER).toEqual([
    'page_view', 'signup', 'product_view', 'add_to_cart', 'purchase',
  ]);
});
