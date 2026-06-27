/*
 * engagR SDK — a tiny, dependency-free event tracker for your D2C site.
 *
 * What it does:
 *   1. Gives every visitor a stable anonymous id (so a returning visitor is recognised).
 *   2. Lets you record events like product_view / add_to_cart with one function call.
 *   3. Bundles events and sends them to your engagR backend (with safe retry — no data lost).
 *   4. Lets you attach a real identity + contact details + consent once a user signs up.
 *
 * How to use it (on your website):
 *   <script src="/engagr-sdk.js"></script>
 *   <script>
 *     engagr.init({ endpoint: 'http://localhost:5001' });   // your backend URL
 *     engagr.productView({ productName: 'Blue Shirt', price: 999, id: 'sku_123' });
 *     engagr.addToCart({ productName: 'Blue Shirt', price: 999 });
 *     engagr.identify('user_4827', {
 *       email: 'faraz@example.com',
 *       phone: '+919900000000',
 *       consent: { email: true, whatsapp: true, sms: false },
 *       traits:  { firstName: 'Faraz' }
 *     });
 *   </script>
 */
(function (window) {
  // settings (filled in by init)
  var config = { endpoint: '', flushIntervalMs: 4000, batchSize: 10 };
  var queue = [];                                   // events waiting to be sent
  var sessionId = 's_' + rand();                    // one session id per page visit

  function rand() { return Math.random().toString(36).slice(2, 10); }
  function uid(prefix) { return prefix + '_' + Date.now() + '_' + rand(); }

  // 1) a stable anonymous id, remembered in the browser
  function getAnonId() {
    var id = null;
    try { id = window.localStorage.getItem('engagr_anon'); } catch (e) {}
    if (!id) {
      id = uid('a');
      try { window.localStorage.setItem('engagr_anon', id); } catch (e) {}
    }
    return id;
  }

  // 2) send everything that's queued (and on failure, keep it for next time)
  function flush() {
    if (!config.endpoint || queue.length === 0) return;
    var batch = queue.splice(0, queue.length);      // take all waiting events
    fetch(config.endpoint + '/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anonId: getAnonId(), events: batch }),
      keepalive: true                               // still sends if the page is closing
    }).catch(function () {
      queue = batch.concat(queue);                  // network failed -> resend later
    });
  }

  // 3) the core function: record one event
  function track(name, properties, stage) {
    if (!name) return;
    queue.push({
      id: uid('e'),                                 // unique id -> backend ignores duplicates
      name: name,
      stage: stage || name,                         // which journey stage this maps to
      properties: properties || {},
      anonId: getAnonId(),
      sessionId: sessionId,
      brandUrl: window.location.origin,
      ts: new Date().toISOString()
    });
    if (queue.length >= config.batchSize) flush();
  }

  // 4) tell engagR who this visitor really is, plus consent to message them
  function identify(userId, info) {
    info = info || {};
    fetch(config.endpoint + '/api/events/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anonId: getAnonId(),
        userId: userId,
        email: info.email,
        phone: info.phone,
        consent: info.consent || {},                // { email, whatsapp, sms }
        traits: info.traits || {}                   // { firstName, ... }
      })
    }).catch(function () {});
  }

  // start everything up
  function init(options) {
    config = Object.assign(config, options || {});
    setInterval(flush, config.flushIntervalMs);     // send on a steady timer
    window.addEventListener('beforeunload', flush); // and when the visitor leaves
    track('page_view', { path: window.location.pathname, title: document.title }, 'page_view');
  }

  // the public toolkit, with shortcuts for the common D2C journey events
  window.engagr = {
    init: init,
    track: track,
    identify: identify,
    signup:      function (t) { track('signup', t, 'signup'); },
    productView: function (p) { track('product_view', p, 'product_view'); },
    addToCart:   function (p) { track('add_to_cart', p, 'add_to_cart'); },
    purchase:    function (p) { track('purchase', p, 'purchase'); }
  };
})(window);