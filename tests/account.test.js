import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, renderDesign } from '../src/design.js';

test('default and reset design use black ink and frame color', () => {
  assert.equal(defaults.color, '#000000');
  assert.equal(defaults.frameMatchesInk, true);
  assert.equal(defaults.frameColor, '#000000');
  assert.ok(renderDesign('https://sgkafali.com').svg.includes('fill="#000000"'));
  assert.ok(renderDesign('https://sgkafali.com', { frame: 'bottom' }).svg.includes('rx="14" fill="#000000"'));
  assert.ok(renderDesign('https://sgkafali.com', { frame: 'bottom', color: '#1d5849' }).svg.includes('rx="14" fill="#1d5849"'));
  assert.ok(renderDesign('https://sgkafali.com', { frame: 'bottom', color: '#1d5849', frameMatchesInk: false, frameColor: '#dc2626' }).svg.includes('rx="14" fill="#dc2626"'));
});
test('dashboard routes require authentication while generator stays public', () => {
  const config = JSON.parse(readFileSync(new URL('../public/staticwebapp.config.json', import.meta.url)));
  // Azure normalizes trailing slashes before validating route uniqueness.
  const normalize = path => path.replace(/\/+$/, '') || '/';
  const normalizedRoutes = config.routes.map(route => normalize(route.route));
  assert.equal(new Set(normalizedRoutes).size, normalizedRoutes.length, 'Azure routes must be unique after trailing-slash normalization');
  for (const path of ['/dashboard', '/dashboard/']) {
    const route = config.routes.find(route => normalize(route.route) === normalize(path));
    assert.deepEqual(route.allowedRoles, ['authenticated']);
    assert.equal(route.rewrite, '/index.html');
    assert.equal(route.headers['Cache-Control'], 'no-store');
  }
  assert.equal(config.routes.find(route => route.route === '/').allowedRoles, undefined);
  assert.deepEqual(config.routes.find(route => route.route === '/api/links/*').allowedRoles, ['authenticated']);
  assert.equal(config.routes.some(route => route.route === '/r/*'), false);
  assert.equal(config.responseOverrides['401'].redirect, '/.auth/login/aad?post_login_redirect_uri=/dashboard');
});
