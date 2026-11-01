export function sessionKindOf(principal) {
  return principal?.identityProvider === 'aad' && principal?.userRoles?.includes('authenticated') ? 'signed-in' : 'guest';
}

export function accountNavigationOf(kind) {
  return kind === 'guest'
    ? { label: 'Sign in', href: '/.auth/login/aad?post_login_redirect_uri=/dashboard' }
    : { label: 'My links', href: '/dashboard' };
}
