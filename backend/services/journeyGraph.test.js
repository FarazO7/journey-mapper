'use strict';

const { buildJourneyGraph, assertValid } = require('./journeyGraph');

const url = (p) => ({ url: `https://shop.example.com${p}` });

// A site with ~20 distinct categories + a subcategory + a couple of products —
// the shape that used to flood the graph with one node per category.
const manyCategoryPages = [
  url('/'),
  ...[
    'face-wash', 'sunscreen', 'moisturizers', 'face-serum', 'facial-kits',
    'face-scrub', 'shampoo', 'conditioner', 'body-wash', 'body-lotion',
    'hair-oil', 'face-cream', 'toner', 'sheet-masks', 'lip-balm',
    'kajal', 'foundation', 'primer', 'baby-lotion', 'baby-soap',
  ].map((h) => url(`/collections/${h}`)),
  url('/collections/skin/face-wash'), // a subcategory
  url('/products/vitamin-c-serum'),
  url('/products/ubtan-face-wash'),
];

describe('buildJourneyGraph — category collapse (CHANGE 1)', () => {
  const g = buildJourneyGraph(manyCategoryPages, { vertical: 'beauty' });
  const ids = g.nodes.map((n) => n.id);
  const has = (s, t) => g.edges.some((e) => e.source === s && e.target === t);

  test('collapses every category/subcategory into exactly ONE "category" node', () => {
    expect(ids.filter((id) => id === 'category')).toHaveLength(1);
    expect(ids.some((id) => id.startsWith('cat:') || id.startsWith('subcat:'))).toBe(false);
  });

  test('product pages still collapse into exactly one "product" node', () => {
    expect(ids.filter((id) => id === 'product')).toHaveLength(1);
  });

  test('wires the convergence home -> category -> product', () => {
    expect(has('home', 'category')).toBe(true);
    expect(has('category', 'product')).toBe(true);
  });
});

describe('buildJourneyGraph — extended post-purchase funnel (CHANGE 2)', () => {
  const g = buildJourneyGraph(manyCategoryPages, { vertical: 'beauty' });
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const has = (s, t) => g.edges.some((e) => e.source === s && e.target === t);

  test('payment + delivery nodes exist with correct type/phase', () => {
    expect(byId.payment_successful).toMatchObject({ type: 'happy_path', phase: 'purchase' });
    expect(byId.payment_failed).toMatchObject({ type: 'dropoff', phase: 'purchase', shouldCampaign: true });
    expect(byId.order_delivered).toMatchObject({ type: 'happy_path', phase: 'post_purchase' });
    expect(byId.delivery_delayed).toMatchObject({ type: 'dropoff', phase: 'post_purchase', shouldCampaign: true });
    expect(byId.payment_failed.timing).toBeTruthy();
    expect(byId.delivery_delayed.timing).toBeTruthy();
  });

  test('payment step is inserted between checkout and order_placed', () => {
    expect(has('checkout', 'order_placed')).toBe(false);      // old direct edge removed
    expect(has('checkout', 'payment_successful')).toBe(true);
    expect(has('checkout', 'payment_failed')).toBe(true);
    expect(has('payment_successful', 'order_placed')).toBe(true);
    expect(has('checkout', 'checkout_abandoned')).toBe(true); // preserved
  });

  test('delivery states hang off order_placed', () => {
    expect(has('order_placed', 'order_delivered')).toBe(true);
    expect(has('order_placed', 'delivery_delayed')).toBe(true);
  });
});

describe('buildJourneyGraph — invariants', () => {
  test('graph stays acyclic for a rich fixture', () => {
    expect(assertValid(buildJourneyGraph(manyCategoryPages)).ok).toBe(true);
  });

  test('categories-only fixture: one category node, product implied, still acyclic', () => {
    const g = buildJourneyGraph([url('/'), url('/collections/face-wash'), url('/collections/sunscreen')]);
    const ids = g.nodes.map((n) => n.id);
    expect(ids.filter((id) => id === 'category')).toHaveLength(1);
    expect(ids).toContain('product'); // categories imply products exist
    expect(assertValid(g).ok).toBe(true);
  });

  test('preserves the { nodes, edges, meta } contract and node/edge fields', () => {
    const g = buildJourneyGraph(manyCategoryPages);
    expect(g).toHaveProperty('nodes');
    expect(g).toHaveProperty('edges');
    expect(g).toHaveProperty('meta');
    for (const n of g.nodes) {
      expect(n).toHaveProperty('id');
      expect(n).toHaveProperty('label');
      expect(n).toHaveProperty('type');
    }
    for (const e of g.edges) {
      expect(e).toHaveProperty('id');
      expect(e).toHaveProperty('source');
      expect(e).toHaveProperty('target');
    }
  });
});
