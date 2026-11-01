// Azure Static Web Apps supplies identity and protects dashboard/API routes.
if (location.pathname.replace(/\/$/, '') === '/dashboard') {
  document.body.classList.add('dashboard-view');
  const dashboard = document.getElementById('dashboard');
  dashboard.hidden = false;
  document.title = 'My links — QR Studio';
  const status = document.getElementById('account-status');
  const message = document.getElementById('managed-status');
  const content = document.getElementById('dashboard-content');
  const list = document.getElementById('managed-list');
  const accountLink = document.querySelector('.account-link');
  accountLink.href = '/dashboard'; accountLink.textContent = 'My links';
  accountLink.setAttribute('aria-current', 'page');

  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  async function api(path, options) {
    const result = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...options });
    let body; try { body = await result.json(); } catch { throw new Error('The link service returned an unexpected response.'); }
    if (!result.ok) throw new Error(body.error || 'The link service is unavailable.');
    return body;
  }
  const setMessage = (text, error = false) => { message.textContent = text; message.className = error ? 'status error' : 'status'; };
  const action = (text, callback) => { const button = element('button', 'text-button', text); button.type = 'button'; button.addEventListener('click', callback); return button; };
  const urlFor = link => new URL(link.shortUrl, location.origin).href;

  function renderLink(link) {
    const card = element('article', 'managed-card');
    const heading = element('div', 'managed-card-heading');
    heading.append(element('h2', '', link.title || new URL(link.destination).hostname), element('span', `managed-badge${link.active ? '' : ' paused'}`, link.active ? 'ACTIVE' : 'PAUSED'));
    const destination = element('a', 'managed-destination', link.destination);
    destination.href = link.destination; destination.target = '_blank'; destination.rel = 'noopener noreferrer';
    const shortUrl = element('a', 'managed-short', urlFor(link)); shortUrl.href = urlFor(link); shortUrl.target = '_blank'; shortUrl.rel = 'noopener noreferrer';
    const actions = element('div', 'managed-actions');
    const design = element('a', 'sign-in', 'Design QR code');
    design.href = `/?managed=${encodeURIComponent(urlFor(link))}#generator`;
    actions.append(design,
      action('Copy link', async () => { try { await navigator.clipboard.writeText(urlFor(link)); setMessage('Managed link copied.'); } catch { setMessage('Copy unavailable. Select the link text above.', true); } }),
      action('Edit', () => { editor.hidden = !editor.hidden; if (!editor.hidden) editor.querySelector('input').focus(); }),
      action(link.active ? 'Pause' : 'Resume', async () => {
        try { await api(`/api/links/${link.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !link.active }) }); setMessage(link.active ? 'Link paused.' : 'Link resumed.'); await loadLinks(); }
        catch (error) { setMessage(error.message, true); }
      }),
      action('Daily counts', async () => {
        stats.hidden = !stats.hidden; if (stats.hidden) return;
        stats.textContent = 'Loading counts…';
        try {
          const data = await api(`/api/links/${link.id}/stats`);
          stats.replaceChildren();
          if (!data.days.length) stats.append(element('p', '', 'No scans recorded yet.'));
          else {
            const table = element('table', 'stats-table');
            const head = element('tr'); head.append(element('th', '', 'Date (UTC)'), element('th', '', 'Scans'));
            table.append(head);
            for (const day of data.days) { const row = element('tr'); row.append(element('td', '', day.date), element('td', '', String(day.scans))); table.append(row); }
            stats.append(table);
          }
          stats.append(element('p', 'hint', data.note));
        } catch (error) { stats.textContent = error.message; }
      }));
    const editor = element('form', 'managed-edit'); editor.hidden = true;
    const titleLabel = element('label', '', 'Link name'); const title = element('input'); title.value = link.title || ''; title.maxLength = 100; titleLabel.append(title);
    const destinationLabel = element('label', '', 'Destination URL'); const target = element('input'); target.type = 'url'; target.value = link.destination; target.required = true; target.maxLength = 2048; destinationLabel.append(target);
    const save = element('button', 'sign-in', 'Save changes'); save.type = 'submit';
    editor.append(titleLabel, destinationLabel, save);
    editor.addEventListener('submit', async event => {
      event.preventDefault(); save.disabled = true;
      try { await api(`/api/links/${link.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.value, destination: target.value }) }); setMessage('Destination updated. Existing QR codes still work.'); await loadLinks(); }
      catch (error) { setMessage(error.message, true); save.disabled = false; }
    });
    const stats = element('div', 'managed-stats'); stats.hidden = true;
    card.append(heading, element('p', 'managed-label', 'DESTINATION'), destination, element('p', 'managed-label', 'MANAGED LINK'), shortUrl, actions, editor, stats);
    return card;
  }
  async function loadLinks() {
    const data = await api('/api/links');
    list.replaceChildren();
    if (!data.links.length) list.append(element('p', 'dashboard-empty', 'No managed links yet. Create your first one above.'));
    else for (const link of data.links) list.append(renderLink(link));
  }
  document.getElementById('managed-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true;
    try {
      await api('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.elements.title.value, destination: form.elements.destination.value }) });
      form.reset(); setMessage('Managed link created. Design a QR code or copy its link below.'); await loadLinks();
    } catch (error) { setMessage(error.message, true); }
    finally { button.disabled = false; }
  });
  fetch('/.auth/me', { cache: 'no-store', credentials: 'same-origin' })
    .then(response => { if (!response.ok) throw new Error('Authentication unavailable'); return response.json(); })
    .then(async ({ clientPrincipal }) => {
      if (!clientPrincipal?.userRoles?.includes('authenticated')) {
        status.textContent = 'You are not signed in.';
        const link = element('a', 'sign-in', 'Sign in with Microsoft'); link.href = '/.auth/login/aad?post_login_redirect_uri=/dashboard'; status.after(link);
        return;
      }
      status.textContent = `Signed in${clientPrincipal.userDetails ? ` as ${clientPrincipal.userDetails}` : ' with Microsoft'}.`;
      content.hidden = false;
      try { await loadLinks(); } catch (error) { setMessage(error.message, true); }
    })
    .catch(() => { status.textContent = 'We could not check your sign-in. Please reload. QR creation is still available without an account.'; });
}
