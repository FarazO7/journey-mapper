'use strict';

/**
 * journeyGraph.js — pure, network-free.
 *
 * Turns a list of crawled pages into a directed ACYCLIC graph of user STATES.
 *
 *   - One node per state (all product pages collapse into ONE shared "Product" node,
 *     and likewise all category/subcategory pages collapse into ONE shared "Category" node).
 *   - Edges mean "a user can move from A to B". A node may have many incoming edges
 *     (convergence) — e.g. Home, Search and every Category all point into Product —
 *     but no path ever loops back (acyclic).
 *   - The discovery half (Home / Search / Categories / Product) is derived from the
 *     real crawl. The conversion half (Add to Cart -> Checkout -> ... , Account) is
 *     INJECTED as a fixed yes/no pattern grafted onto the Product node.
 *
 * Output: { nodes: [...], edges: [...], meta: {...} }
 *
 * IMPORTANT: classification is URL-based, so this needs only `page.url` per page.
 * It does NOT depend on the crawler returning headings/links/text, which keeps it
 * robust to whatever Apify actor / output schema you use.
 */

// ── helpers ───────────────────────────────────────────────────────────────────
function humanize(s) {
  if (!s) return '';
  return decodeURIComponent(String(s))
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pathSegments(rawUrl) {
  try {
    return new URL(rawUrl).pathname.split('/').filter(Boolean);
  } catch {
    return String(rawUrl || '').split('?')[0].split('/').filter(Boolean);
  }
}

// ── classification ──────────────────────────────────────────────────────────
// state: 'home' | 'category' | 'subcategory' | 'product' | 'search' | 'unknown'
function classifyPage(page) {
  const url = page && page.url ? page.url : '';
  const segs = pathSegments(url);
  const lower = url.toLowerCase();

  if (segs.length === 0) return { state: 'home', label: 'Homepage' };

  const PRODUCT = ['products', 'product', 'p', 'dp', 'item', 'items'];
  if (segs.some((s) => PRODUCT.includes(s))) return { state: 'product', label: 'Product Page' };

  if (segs.some((s) => ['search', 'find'].includes(s)) || /[?&](q|query|s|keyword)=/.test(lower)) {
    return { state: 'search', label: 'Search' };
  }

  const CAT = ['collections', 'collection', 'category', 'categories', 'shop', 'c'];
  const ci = segs.findIndex((s) => CAT.includes(s));
  if (ci !== -1) {
    const handle = segs[ci + 1];
    const sub = segs[ci + 2];
    if (!handle || handle === 'all') return { state: 'category', handle: 'shop', label: 'Shop' };
    if (sub) return { state: 'subcategory', handle: `${handle}/${sub}`, parentHandle: handle, label: humanize(sub) };
    return { state: 'category', handle, label: humanize(handle) };
  }

  return { state: 'unknown', label: humanize(segs[segs.length - 1]) };
}

// ── injected conversion funnel (the fixed yes/no pattern) ─────────────────────
function conversionGraph() {
  const nodes = [
    { id: 'add_to_cart',        label: 'Add to Cart',         kind: 'conversion', type: 'happy_path', phase: 'pre_purchase',  messageType: 'MARKETING' },
    { id: 'cart_abandoned',     label: 'Cart Abandoned',      kind: 'conversion', type: 'dropoff',    phase: 'pre_purchase',  messageType: 'MARKETING', shouldCampaign: true, timing: '1 hour after cart abandoned' },
    { id: 'checkout',           label: 'Checkout',            kind: 'conversion', type: 'happy_path', phase: 'purchase',      messageType: 'UTILITY' },
    { id: 'checkout_abandoned', label: 'Checkout Abandoned',  kind: 'conversion', type: 'dropoff',    phase: 'purchase',      messageType: 'MARKETING', shouldCampaign: true, timing: '30 min after checkout abandoned' },
    { id: 'payment_successful', label: 'Payment Successful',  kind: 'conversion', type: 'happy_path', phase: 'purchase',      messageType: 'UTILITY' },
    { id: 'payment_failed',     label: 'Payment Failed',      kind: 'conversion', type: 'dropoff',    phase: 'purchase',      messageType: 'UTILITY',   shouldCampaign: true, timing: '15 min after payment failure' },
    { id: 'order_placed',       label: 'Order Placed',        kind: 'conversion', type: 'happy_path', phase: 'post_purchase', messageType: 'UTILITY' },
    { id: 'order_delivered',    label: 'Order Delivered',     kind: 'conversion', type: 'happy_path', phase: 'post_purchase', messageType: 'UTILITY' },
    { id: 'delivery_delayed',   label: 'Delivery Delayed',    kind: 'conversion', type: 'dropoff',    phase: 'post_purchase', messageType: 'UTILITY',   shouldCampaign: true, timing: '5 days after dispatch with no delivery' },
    { id: 'account',            label: 'Account / Login',     kind: 'conversion', type: 'happy_path', phase: 'pre_purchase',  messageType: 'UTILITY' },
    { id: 'logged_in',          label: 'Logged In',           kind: 'conversion', type: 'happy_path', phase: 'pre_purchase',  messageType: 'UTILITY' },
    { id: 'guest',              label: 'Continued as Guest',  kind: 'conversion', type: 'happy_path', phase: 'pre_purchase',  messageType: 'UTILITY' },
  ];
  const edges = [
    ['product', 'add_to_cart'],                 // browsing -> intent
    ['add_to_cart', 'checkout'],                // Yes -> proceed
    ['add_to_cart', 'cart_abandoned'],          // No  -> abandoned
    ['checkout', 'checkout_abandoned'],         // left before paying
    ['checkout', 'payment_successful'],         // payment goes through
    ['checkout', 'payment_failed'],             // payment fails -> dropoff
    ['payment_successful', 'order_placed'],     // order confirmed
    ['order_placed', 'order_delivered'],        // delivered successfully
    ['order_placed', 'delivery_delayed'],       // delayed / RTO risk -> dropoff
    ['home', 'account'],                        // account is a site-wide action
    ['account', 'logged_in'],                   // Yes
    ['account', 'guest'],                       // No
  ];
  return { nodes, edges };
}

// ── main builder ──────────────────────────────────────────────────────────────
function buildJourneyGraph(pages, opts = {}) {
  const classified = (pages || []).map((p) => classifyPage(p));

  const nodeMap = new Map();
  const addNode = (n) => { if (!nodeMap.has(n.id)) nodeMap.set(n.id, n); return n.id; };

  // Home is always the root.
  addNode({ id: 'home', label: 'Homepage', kind: 'discovery', type: 'start', phase: 'pre_purchase' });

  let hasProduct = false;
  let hasSearch = false;
  const categories = new Map();        // handle -> label
  const subcategories = new Map();     // "parent/sub" -> { label, parent }

  for (const c of classified) {
    if (c.state === 'product') hasProduct = true;
    else if (c.state === 'search') hasSearch = true;
    else if (c.state === 'category' && c.handle) categories.set(c.handle, c.label);
    else if (c.state === 'subcategory' && c.handle) {
      subcategories.set(c.handle, { label: c.label, parent: c.parentHandle });
      if (!categories.has(c.parentHandle)) categories.set(c.parentHandle, humanize(c.parentHandle));
    }
  }

  // Single shared Category node — all category/subcategory pages collapse into one,
  // exactly like product pages do (avoids flooding the graph with per-handle nodes).
  const hasCategory = categories.size > 0 || subcategories.size > 0;
  if (hasCategory) {
    addNode({ id: 'category', label: 'Category Page', kind: 'discovery', type: 'happy_path', phase: 'pre_purchase', messageType: 'MARKETING' });
  }

  // Single shared Product node. Categories imply products exist.
  if (hasProduct || hasCategory) {
    addNode({ id: 'product', label: 'Product Page', kind: 'discovery', type: 'happy_path', phase: 'pre_purchase', messageType: 'MARKETING' });
    hasProduct = true;
  }
  if (hasSearch) addNode({ id: 'search', label: 'Search', kind: 'discovery', type: 'happy_path', phase: 'pre_purchase', messageType: 'MARKETING' });

  // ── edges: acyclic, product = convergence point ──
  const seen = new Set();
  const edges = [];
  const addEdge = (s, t) => {
    if (s === t || !nodeMap.has(s) || !nodeMap.has(t)) return;
    const k = `${s}->${t}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ source: s, target: t });
  };

  // Discovery convergence: home -> category -> product (mirrors the product collapse).
  if (hasCategory) {
    addEdge('home', 'category');
    if (hasProduct) addEdge('category', 'product');
  }

  if (hasProduct) addEdge('home', 'product');           // featured products linked from home
  if (hasSearch) { addEdge('home', 'search'); if (hasProduct) addEdge('search', 'product'); }

  // ── graft the injected conversion funnel ──
  const conv = conversionGraph();
  if (hasProduct) {
    for (const n of conv.nodes) addNode(n);
    for (const [s, t] of conv.edges) addEdge(s, t);
  } else {
    // No commerce detected: keep only the account branch off home.
    for (const id of ['account', 'logged_in', 'guest']) {
      addNode(conv.nodes.find((n) => n.id === id));
    }
    addEdge('home', 'account'); addEdge('account', 'logged_in'); addEdge('account', 'guest');
  }

  const nodes = Array.from(nodeMap.values());
  const finalEdges = edges.map((e, i) => ({ id: `e${i}-${e.source}-${e.target}`, ...e }));

  return {
    nodes,
    edges: finalEdges,
    meta: {
      vertical: opts.vertical || 'general',
      categories: categories.size,
      subcategories: subcategories.size,
      hasProduct,
      hasSearch,
      nodeCount: nodes.length,
      edgeCount: finalEdges.length,
    },
  };
}

// ── self-check: assert the graph is acyclic and product is a single shared node ──
function assertValid(graph) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const productNodes = graph.nodes.filter((n) => n.id === 'product');
  if (productNodes.length > 1) throw new Error('product is not a single node');
  const categoryNodes = graph.nodes.filter((n) => n.id === 'category');
  if (categoryNodes.length > 1) throw new Error('category is not a single node');

  // cycle check (DFS)
  const adj = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) { if (adj.has(e.source)) adj.get(e.source).push(e.target); }
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map(graph.nodes.map((n) => [n.id, WHITE]));
  const stack = [];
  const dfs = (u) => {
    color.set(u, GREY); stack.push(u);
    for (const v of adj.get(u) || []) {
      if (!ids.has(v)) continue;
      if (color.get(v) === GREY) throw new Error(`cycle: ${stack.join(' -> ')} -> ${v}`);
      if (color.get(v) === WHITE) dfs(v);
    }
    color.set(u, BLACK); stack.pop();
  };
  for (const n of graph.nodes) if (color.get(n.id) === WHITE) dfs(n.id);

  // product in-degree (convergence)
  const inProduct = graph.edges.filter((e) => e.target === 'product').map((e) => e.source);
  return { ok: true, productParents: inProduct };
}

module.exports = { classifyPage, buildJourneyGraph, assertValid, humanize };
