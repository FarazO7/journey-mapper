'use strict';

const { buildJourneyGraph, assertValid, classifyPage } = require('./journeyGraph');

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

describe('classifyPage — multiple URL schemes', () => {
  const state = (p) => classifyPage({ url: `https://x.com${p}` }).state;

  test('homepage', () => {
    expect(state('/')).toBe('home');
  });

  test('Shopify keyword scheme (unchanged)', () => {
    expect(state('/collections/face-wash')).toBe('category');
    expect(state('/collections/skin/face-wash')).toBe('subcategory');
    expect(state('/products/vitamin-c-serum')).toBe('product');
  });

  test('other keyword schemes', () => {
    expect(state('/c/electronics')).toBe('category');
    expect(state('/category/men')).toBe('category');
    expect(state('/sku/12345')).toBe('product');
    expect(state('/dp/B0ABC')).toBe('product');
  });

  test('product-by-shape: keyword-free SKU id (e.g. HealthKart /sv/.../SP-132971)', () => {
    expect(state('/sv/smash-creatine/SP-132971')).toBe('product');
    expect(state('/buy/widget/987654')).toBe('product');
  });

  test('slug-based category: keyword-free listing pages', () => {
    expect(state('/whey-protein')).toBe('category');
    expect(state('/multivitamins/for-men')).toBe('category');
    expect(state('/sale/gnc')).toBe('category');
  });

  test('non-commerce slugs are NOT categories', () => {
    expect(state('/policies/shipping-policy')).toBe('unknown');
    expect(state('/pages/plant')).toBe('unknown');
    expect(state('/about-us')).toBe('unknown');
    expect(state('/blog/how-to-bulk')).toBe('unknown');
  });

  test('4-digit years are not mistaken for product ids', () => {
    expect(state('/sale-2024')).toBe('category'); // slug, not product (>=5 digits needed)
  });
});

describe('buildJourneyGraph — non-Shopify storefront does not collapse', () => {
  // HealthKart-style: SKU-id products + keyword-free category slugs, no /collections/.
  const healthkartPages = [
    url('/'),
    url('/whey-protein'), url('/omega-3'), url('/multivitamins'), url('/creatine'),
    url('/multivitamins/for-men'), url('/sale/gnc'),
    url('/sv/smash-creatine/SP-132971'),
    url('/sv/dexter-omega-3/SP-103860'),
    url('/policies/shipping-policy'), // ignored (non-commerce)
  ];

  test('yields category + product nodes and the full funnel (not a 4-node collapse)', () => {
    const g = buildJourneyGraph(healthkartPages);
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain('category');
    expect(ids).toContain('product');
    for (const f of ['add_to_cart', 'cart_abandoned', 'checkout', 'payment_failed', 'order_placed', 'order_delivered']) {
      expect(ids).toContain(f);
    }
    expect(ids.length).toBeGreaterThan(4);
    expect(assertValid(g).ok).toBe(true);
  });

  test('Shopify set still yields its expected graph (no regression)', () => {
    const g = buildJourneyGraph(manyCategoryPages);
    const ids = g.nodes.map((n) => n.id);
    expect(ids.filter((id) => id === 'category')).toHaveLength(1);
    expect(ids.filter((id) => id === 'product')).toHaveLength(1);
    expect(ids).toContain('order_delivered');
    expect(assertValid(g).ok).toBe(true);
  });
});

describe('buildJourneyGraph — last-resort net for unrecognised schemes', () => {
  test('many crawled pages with no product/category signal still form a funnel', () => {
    const odd = ['/aa/bb/cc/dd', '/ee/ff/gg/hh', '/ii/jj/kk/ll', '/mm/nn/oo/pp',
      '/qq/rr/ss/tt', '/uu/vv/ww/xx', '/yy/zz/ab/cd', '/ef/gh/ij/kl', '/mn/op/qr/st'].map(url);
    const g = buildJourneyGraph([url('/'), ...odd]);
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain('product');
    expect(ids).toContain('add_to_cart');
    expect(assertValid(g).ok).toBe(true);
  });
});
