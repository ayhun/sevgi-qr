import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { buildPayload } from '../src/payload.js';

const cases = [
  ['link', { url: 'example.com/paper?q=MRI&year=2026' }, 'https://example.com/paper?q=MRI&year=2026'],
  ['text', { text: 'Hello, MRI!\nGrüße — 日本語' }, 'Hello, MRI!\nGrüße — 日本語'],
  ['email', { email: 'hello@example.com', subject: 'MRI & AI', body: 'Hello\nThank you!' }, 'mailto:hello@example.com?subject=MRI%20%26%20AI&body=Hello%0AThank%20you!'],
  ['call', { phone: '+49 (151) 234-56789' }, 'tel:+4915123456789'],
  ['sms', { phone: '+4915123456789', message: 'Meet at 12:30?' }, 'SMSTO:+4915123456789:Meet at 12:30?'],
  ['whatsapp', { phone: '+49 151 23456789', message: 'Hello & welcome' }, 'https://wa.me/4915123456789?text=Hello%20%26%20welcome'],
  ['wifi', { ssid: 'Lab; Guest', password: 'a:b\\c,d"e', security: 'WPA', hidden: true }, 'WIFI:T:WPA;S:Lab\\; Guest;P:a\\:b\\\\c\\,d\\"e;H:true;;'],
  ['vcard', { first: 'Sevgi', last: 'Kafali', organization: 'Lab; MRI', email: 'hello@example.com' }, 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Kafali;Sevgi;;;\r\nFN:Sevgi Kafali\r\nORG:Lab\\; MRI\r\nEMAIL:hello@example.com\r\nEND:VCARD']
];
for (const [type, data, expected] of cases) {
  test(`${type}: payload and independent PNG decode`, async () => {
    const payload = buildPayload(type, data);
    assert.equal(payload, expected);
    const buffer = await QRCode.toBuffer(payload, { width: 768, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#1d5849', light: '#ffffff' } });
    const png = PNG.sync.read(buffer);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.equal(decoded?.data, expected);
  });
}
test('reject unsafe links, malformed contact information and empty inputs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:pass@example.com', '']) assert.throws(() => buildPayload('link', { url }));
  assert.throws(() => buildPayload('email', { email: 'a@example.com\r\nBcc:x@example.com' }));
  assert.throws(() => buildPayload('call', { phone: '123?evil' }));
  assert.throws(() => buildPayload('whatsapp', { phone: '015123456789' }));
  assert.throws(() => buildPayload('wifi', { ssid: 'x'.repeat(33), password: 'secret' }));
  assert.throws(() => buildPayload('vcard', {}));
});
test('open Wi-Fi omits previous password and preserves significant spaces', () => {
  assert.equal(buildPayload('wifi', { ssid: ' Guest ', security: 'nopass', password: 'old secret' }), 'WIFI:T:nopass;S: Guest ;P:;H:false;;');
});
test('vCard escapes newlines and separators instead of injecting properties', () => {
  const result = buildPayload('vcard', { first: 'A\nTEL:123', last: 'B;C,D', street: 'Main;Street', city: 'Munich' });
  assert.ok(result.includes('N:B\\;C\\,D;A\\nTEL:123;;;'));
  assert.ok(!result.includes('\r\nTEL:123'));
  assert.ok(result.includes('ADR;TYPE=WORK:;;Main\\;Street;Munich;;;'));
});
