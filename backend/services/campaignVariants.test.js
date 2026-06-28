'use strict';

const { phaseForStage, messageTypeForPhase, validateAndRepairVariants } = require('./campaignVariants');
const { parseJSON } = require('./llm');
const { personalizeVariant } = require('./personalize');

describe('phase + messageType mapping', () => {
  test('phaseForStage maps the funnel stages', () => {
    expect(phaseForStage('add_to_cart')).toBe('pre_purchase');
    expect(phaseForStage('cart_abandoned')).toBe('pre_purchase');
    expect(phaseForStage('product')).toBe('pre_purchase');
    expect(phaseForStage('checkout')).toBe('purchase');
    expect(phaseForStage('payment_failed')).toBe('purchase');
    expect(phaseForStage('order_placed')).toBe('post_purchase');
    expect(phaseForStage('delivery_delayed')).toBe('post_purchase');
  });

  test('messageTypeForPhase', () => {
    expect(messageTypeForPhase('post_purchase')).toBe('UTILITY');
    expect(messageTypeForPhase('purchase')).toBe('MARKETING');
    expect(messageTypeForPhase('pre_purchase')).toBe('MARKETING');
  });
});

describe('validateAndRepairVariants', () => {
  test('returns exactly N distinct-strategy variants, MARKETING for pre_purchase', () => {
    const parsed = { variants: [
      { strategy: 'urgency', template: 'a' },
      { strategy: 'incentive', template: 'b' },
      { strategy: 'social_proof', template: 'c' },
    ] };
    const out = validateAndRepairVariants(parsed, { n: 3, channel: 'whatsapp', phase: 'pre_purchase', stage: 'cart_abandoned' });
    expect(out).toHaveLength(3);
    expect(new Set(out.map((v) => v.strategy)).size).toBe(3);
    expect(out.every((v) => v.messageType === 'MARKETING')).toBe(true);
    expect(out.every((v) => v.channel === 'whatsapp')).toBe(true);
  });

  test('dedupes duplicate strategies and pads back to N distinct', () => {
    const parsed = { variants: [
      { strategy: 'urgency', template: 'a' },
      { strategy: 'urgency', template: 'dup' }, // duplicate angle -> dropped
    ] };
    const out = validateAndRepairVariants(parsed, { n: 3, channel: 'email', phase: 'pre_purchase', stage: 'add_to_cart' });
    expect(out).toHaveLength(3);
    expect(new Set(out.map((v) => v.strategy)).size).toBe(3);
  });

  test('post_purchase stamps UTILITY even if the model said MARKETING', () => {
    const parsed = { variants: [{ strategy: 'status_update', template: 'Your order shipped', messageType: 'MARKETING' }] };
    const out = validateAndRepairVariants(parsed, { n: 2, channel: 'sms', phase: 'post_purchase', stage: 'order_placed' });
    expect(out).toHaveLength(2);
    expect(out.every((v) => v.messageType === 'UTILITY')).toBe(true);
  });

  test('email-only fields are stripped on non-email channels', () => {
    const parsed = { variants: [{ strategy: 'urgency', template: 'x', subjectLine: 'no', preheader: 'no' }] };
    const out = validateAndRepairVariants(parsed, { n: 2, channel: 'sms', phase: 'pre_purchase', stage: 'cart_abandoned' });
    expect(out[0].subjectLine).toBeUndefined();
    expect(out[0].preheader).toBeUndefined();
  });

  test('malformed / empty input -> N safe fallback variants (never crash)', () => {
    expect(validateAndRepairVariants(null, { n: 3, channel: 'email', phase: 'pre_purchase', stage: 'add_to_cart' })).toHaveLength(3);
    expect(validateAndRepairVariants({ nonsense: true }, { n: 2, channel: 'sms', phase: 'purchase', stage: 'checkout' })).toHaveLength(2);
  });
});

describe('end-to-end pipeline with a MOCKED LLM response (no network, no DB)', () => {
  test('raw model JSON -> parseJSON -> validate/repair -> personalize, no placeholder left', () => {
    const rawModelOutput = '```json\n{ "variants": [' +
      '{"strategy":"urgency","name":"Selling fast","subjectLine":"[First Name], [Product Name] is going fast","template":"Hi [First Name], your [Product Name] is almost gone!","conversionMetric":"CTR","bestSendTime":"1h"},' +
      '{"strategy":"social_proof","name":"Loved by many","subjectLine":"Why everyone loves [Product Name]","template":"Hi [First Name], thousands chose [Product Name].","conversionMetric":"CTR","bestSendTime":"1h"}' +
      '] }\n```';

    const parsed = parseJSON(rawModelOutput, { variants: [] });
    let variants = validateAndRepairVariants(parsed, { n: 3, channel: 'email', phase: 'pre_purchase', stage: 'cart_abandoned' });
    expect(variants).toHaveLength(3); // 2 from the model + 1 padded fallback
    expect(new Set(variants.map((v) => v.strategy)).size).toBe(3);

    variants = variants.map((v) => personalizeVariant(v, { firstName: 'Asha', productName: 'Vitamin C Serum' }));
    for (const v of variants) {
      expect(v.template).not.toMatch(/\[[^\]]+\]/);
      if (v.subjectLine) expect(v.subjectLine).not.toMatch(/\[[^\]]+\]/);
      expect(v.messageType).toBe('MARKETING');
    }
    expect(variants[0].template).toContain('Asha');
    expect(variants[0].template).toContain('Vitamin C Serum');
  });
});
