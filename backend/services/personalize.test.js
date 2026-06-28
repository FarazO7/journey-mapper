'use strict';

const { buildPersonalizationData, fillPlaceholders, personalizeVariant } = require('./personalize');

const noPlaceholder = (s) => expect(s).not.toMatch(/\[[^\]]+\]/);

describe('personalize — fillPlaceholders', () => {
  test('fills [First Name] and [Product Name] from data', () => {
    const out = fillPlaceholders('Hi [First Name], your [Product Name] is waiting.', { firstName: 'Asha', productName: 'Vitamin C Serum' });
    expect(out).toBe('Hi Asha, your Vitamin C Serum is waiting.');
    noPlaceholder(out);
  });

  test('case-insensitive and tolerant of spacing', () => {
    const out = fillPlaceholders('Hey [first name] / [PRODUCT NAME]', { firstName: 'Bo', productName: 'Kajal' });
    noPlaceholder(out);
    expect(out).toContain('Bo');
    expect(out).toContain('Kajal');
  });

  test('sweeps away an unknown bracketed token — never leaves a literal placeholder', () => {
    const out = fillPlaceholders('Hi [First Name], use code [PROMO] now', { firstName: 'Sam', productName: 'X' });
    noPlaceholder(out);
    expect(out).toContain('Sam');
    expect(out).not.toContain('PROMO');
  });
});

describe('personalize — buildPersonalizationData fallbacks', () => {
  test('missing firstName -> safe generic greeting (no literal placeholder)', () => {
    const data = buildPersonalizationData({ traits: {} }, { properties: { productName: 'Serum' } });
    expect(data.firstName).toBe('there');
    expect(data.hasFirstName).toBe(false);
    const out = fillPlaceholders('Hi [First Name]!', data);
    expect(out).toBe('Hi there!');
    noPlaceholder(out);
  });

  test('no product_view -> generic product fallback (no literal placeholder)', () => {
    const data = buildPersonalizationData({ traits: { firstName: 'Lia' } }, null);
    expect(data.hasProductName).toBe(false);
    const out = fillPlaceholders('Your [Product Name] awaits', data);
    noPlaceholder(out);
    expect(out).toContain('the items you viewed');
  });

  test('full data sets both flags', () => {
    const data = buildPersonalizationData({ traits: { firstName: 'Ravi' } }, { properties: { productName: 'Face Wash' } });
    expect(data).toMatchObject({ firstName: 'Ravi', productName: 'Face Wash', hasFirstName: true, hasProductName: true });
  });
});

describe('personalize — personalizeVariant', () => {
  test('personalizes template + subject; no placeholder remains', () => {
    const v = personalizeVariant(
      { strategy: 'urgency', template: 'Hi [First Name], [Product Name] is selling fast', subjectLine: '[First Name], grab [Product Name]' },
      { firstName: 'Mira', productName: 'Toner' }
    );
    noPlaceholder(v.template);
    noPlaceholder(v.subjectLine);
    expect(v.template).toContain('Mira');
    expect(v.subjectLine).toContain('Toner');
  });
});
