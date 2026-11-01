import test from 'node:test';
import assert from 'node:assert/strict';
import { accountNavigationOf, sessionKindOf } from '../src/session.js';

test('Microsoft sessions get a My links navigation, guests get sign-in', () => {
  const principal = { identityProvider: 'aad', userRoles: ['anonymous', 'authenticated'] };
  assert.equal(sessionKindOf(principal), 'signed-in');
  assert.deepEqual(accountNavigationOf('signed-in'), { label: 'My links', href: '/dashboard' });
  assert.equal(sessionKindOf(null), 'guest');
  assert.equal(sessionKindOf({ identityProvider: 'aad', userRoles: ['anonymous'] }), 'guest');
  assert.equal(sessionKindOf({ identityProvider: 'github', userRoles: ['authenticated'] }), 'guest');
  assert.deepEqual(accountNavigationOf('guest'), { label: 'Sign in', href: '/.auth/login/aad?post_login_redirect_uri=/dashboard' });
  assert.deepEqual(accountNavigationOf('unavailable'), { label: 'My links', href: '/dashboard' });
});
