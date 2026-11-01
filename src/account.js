// Authentication is provided by Azure Static Web Apps, not browser-local state.
// Do not imply the dashboard has persistence until its backend is implemented.
if (location.pathname.replace(/\/$/, '') === '/dashboard') {
  document.body.classList.add('dashboard-view');
  const dashboard = document.getElementById('dashboard');
  dashboard.hidden = false;
  document.title = 'My links — QR Studio';
  const status = document.getElementById('account-status');
  const empty = dashboard.querySelector('.dashboard-empty');
  empty.hidden = true;
  const accountLink = document.querySelector('.account-link');
  accountLink.href = '/dashboard'; accountLink.textContent = 'My account';
  accountLink.setAttribute('aria-current', 'page');
  fetch('/.auth/me', { cache: 'no-store', credentials: 'same-origin' })
    .then(response => { if (!response.ok) throw new Error('Authentication unavailable'); return response.json(); })
    .then(({ clientPrincipal }) => {
      if (!clientPrincipal?.userRoles?.includes('authenticated')) {
        status.textContent = 'You are not signed in. Return to the generator or sign in with Microsoft.';
        const link = document.createElement('a'); link.className = 'sign-in'; link.textContent = 'Sign in with Microsoft';
        link.href = '/.auth/login/aad?post_login_redirect_uri=/dashboard'; status.after(link);
        return;
      }
      status.textContent = `Signed in${clientPrincipal.userDetails ? ` as ${clientPrincipal.userDetails}` : ' with Microsoft'}.`;
      empty.hidden = false;
    })
    .catch(() => { status.textContent = 'We could not check your sign-in. Please reload or return to the generator; QR creation does not require an account.'; });
}
