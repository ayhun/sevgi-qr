import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { renderDesign } from '../src/design.js';

for (const frame of ['none', 'bottom', 'top', 'phone']) {
  for (const shape of ['square', 'rounded', 'dots']) {
    test(`decodes ${frame} frame / ${shape} modules / rounded corners`, async () => {
      const payload = 'https://sgkafali.com';
      const { svg, width, height } = renderDesign(payload, { frame, shape, eye: 'rounded' });
      const canvas = createCanvas(1024, Math.round(1024 * height / width));
      const ctx = canvas.getContext('2d'); ctx.drawImage(await loadImage(Buffer.from(svg)), 0, 0, canvas.width, canvas.height);
      assert.equal(jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data, payload);
    });
  }
}
test('logo with a caption frame decodes', async () => {
  const logo = createCanvas(64, 64); const ctx = logo.getContext('2d'); ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 64, 64);
  const payload = 'WIFI:T:WPA;S:Guest;P:password123;H:false;;';
  const { svg, width, height } = renderDesign(payload, { logo: logo.toDataURL('image/png'), frame: 'phone', shape: 'dots' });
  const canvas = createCanvas(1024, Math.round(1024 * height / width));
  const output = canvas.getContext('2d'); output.drawImage(await loadImage(Buffer.from(svg)), 0, 0, canvas.width, canvas.height);
  assert.equal(jsQR(output.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data, payload);
});
test('caption is escaped and untrusted image URLs rejected', () => {
  assert.ok(renderDesign('hello', { frame: 'top', caption: '<script>&' }).svg.includes('&lt;script&gt;&amp;'));
  assert.throws(() => renderDesign('hello', { logo: 'https://example.com/logo.png' }));
  assert.throws(() => renderDesign('hello', { color: 'red" onload="evil' }));
});
