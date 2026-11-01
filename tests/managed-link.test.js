import test from 'node:test';
import assert from 'node:assert/strict';
import { managedUrlOf } from '../src/managed-link.js';

const origin = 'https://qr.sgkafali.com';
test('design handoff accepts current and legacy managed links from this site', () => {
  assert.equal(managedUrlOf(`${origin}/api/r/guk/nlwLcI`, origin), `${origin}/api/r/guk/nlwLcI`);
  assert.equal(managedUrlOf(`${origin}/api/r/${'a'.repeat(16)}/${'b'.repeat(12)}`, origin), `${origin}/api/r/${'a'.repeat(16)}/${'b'.repeat(12)}`);
  assert.equal(managedUrlOf(`${origin}/api/r/${'a'.repeat(24)}/${'b'.repeat(20)}`, origin), `${origin}/api/r/${'a'.repeat(24)}/${'b'.repeat(20)}`);
});
test('design handoff ignores unrelated, malformed, and cross-site URLs', () => {
  for (const value of [null, 'not a URL', 'https://evil.example/api/r/guk/nlwLcI', `${origin}/api/r/guk/nlwLcI?x=1`, `${origin}/api/r/guk/nlwLcI#x`, `${origin}/api/links/guk`]) {
    assert.equal(managedUrlOf(value, origin), null);
  }
});
