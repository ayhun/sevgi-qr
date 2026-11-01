import { last90Days } from './daily-counts.js';
import { accountNavigationOf, sessionKindOf } from './session.js';

// One session check keeps the generator and dashboard in the same account state.
const isDashboard = location.pathname.replace(/\/$/, '') === '/dashboard';
const accountLink = document.querySelector('.account-link');
if (isDashboard) {
  document.body.classList.add('dashboard-view');
  const dashboard = document.getElementById('dashboard');
  dashboard.hidden = false;
  document.title = 'My links — QR Studio';
  accountLink.setAttribute('aria-current', 'page');
}
const sessionPromise = (async () => {
  try {
    const response = await fetch('/.auth/me', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Authentication unavailable');
    const { clientPrincipal } = await response.json();
    const kind = sessionKindOf(clientPrincipal);
    document.body.dataset.auth = kind;
    const navigation = accountNavigationOf(kind);
    accountLink.textContent = navigation.label;
    accountLink.href = navigation.href;
    if (kind === 'signed-in' && !isDashboard) {
      document.getElementById('account').setAttribute('aria-labelledby', 'member-title');
      if (clientPrincipal.userDetails) document.getElementById('member-status').textContent = `Signed in as ${clientPrincipal.userDetails}. Your managed links and daily counts are ready.`;
    }
    return { kind, principal: clientPrincipal };
  } catch {
    document.body.dataset.auth = 'unavailable';
    const navigation = accountNavigationOf('unavailable');
    accountLink.textContent = navigation.label;
    accountLink.href = navigation.href;
    if (!isDashboard) document.getElementById('account').setAttribute('aria-labelledby', 'unavailable-title');
    return { kind: 'unavailable' };
  }
})();

// Azure Static Web Apps protects /dashboard at the edge. The client check is
// for honest UI state and errors, not a replacement for server-side auth.
if (isDashboard) {
  const status = document.getElementById('account-status');
  const message = document.getElementById('managed-status');
  const content = document.getElementById('dashboard-content');
  const list = document.getElementById('managed-list');

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

  function dailyChart(days) {
    const series = last90Days(days);
    const total = series.reduce((sum, day) => sum + day.scans, 0);
    const maximum = Math.max(1, ...series.map(day => day.scans));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 900 220');
    svg.setAttribute('class', 'daily-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Daily scan counts for the last 90 UTC days. ${total} scans in total. Switch to table for exact values.`);
    const svgNode = (tag, attributes, content) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
      if (content !== undefined) node.textContent = content;
      return node;
    };
    const baseline = 176, height = 144, xStart = 44, step = 9.25;
    for (const fraction of [0, .5, 1]) {
      const y = baseline - height * fraction;
      svg.append(svgNode('line', { x1: xStart, x2: 884, y1: y, y2: y, class: 'chart-grid' }));
      svg.append(svgNode('text', { x: 34, y: y + 4, 'text-anchor': 'end', class: 'chart-label' }, String(Math.round(maximum * fraction))));
    }
    series.forEach((day, index) => {
      const barHeight = height * day.scans / maximum;
      const bar = svgNode('rect', { x: xStart + index * step, y: baseline - barHeight, width: 6.25, height: barHeight, class: 'chart-bar' });
      bar.append(svgNode('title', {}, `${day.date}: ${day.scans} scans`));
      svg.append(bar);
      if (index % 15 === 0 || index === 89) {
        const label = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day.date}T00:00:00Z`));
        svg.append(svgNode('text', { x: xStart + index * step + 3, y: 205, 'text-anchor': index === 89 ? 'end' : 'middle', class: 'chart-label' }, label));
      }
    });
    return svg;
  }

  function showDailyCounts(container, days, note, linkId) {
    const controls = element('div', 'stats-controls');
    const tableButton = action('Table', () => selectView('table'));
    const chartButton = action('Bar chart', () => selectView('chart'));
    const csv = element('a', 'text-button', 'Download full history (CSV)');
    csv.href = `/api/links/${encodeURIComponent(linkId)}/stats.csv`;
    const tableView = element('div', 'stats-view');
    const chartView = element('div', 'stats-view');
    chartView.append(dailyChart(days));
    if (!days.length) tableView.append(element('p', '', 'No scans recorded in the last 90 days.'));
    else {
      const table = element('table', 'stats-table');
      const head = element('tr'); head.append(element('th', '', 'Date (UTC)'), element('th', '', 'Scans'));
      table.append(head);
      for (const day of days) { const row = element('tr'); row.append(element('td', '', day.date), element('td', '', String(day.scans))); table.append(row); }
      tableView.append(table);
    }
    function selectView(view) {
      const chart = view === 'chart';
      tableView.hidden = chart; chartView.hidden = !chart;
      tableButton.setAttribute('aria-pressed', String(!chart));
      chartButton.setAttribute('aria-pressed', String(chart));
    }
    controls.append(tableButton, chartButton, csv);
    container.replaceChildren(
      element('h3', 'stats-title', 'Daily counts · last 90 days'),
      element('p', 'stats-scope', 'The table and chart show only the last 90 UTC days. Download the CSV for all recorded daily counts.'),
      controls, tableView, chartView, element('p', 'hint', note)
    );
    selectView('table');
  }

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
    const csv = element('a', 'text-button', 'Download full history (CSV)');
    csv.href = `/api/links/${encodeURIComponent(link.id)}/stats.csv`;
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
          showDailyCounts(stats, data.days, data.note, link.id);
        } catch (error) { stats.textContent = error.message; }
      }),
      csv,
      action('Delete', async event => {
        if (!window.confirm('Permanently delete this managed link? Its QR code will stop working, and its scan counts will be removed. This cannot be undone.')) return;
        const button = event.currentTarget; button.disabled = true;
        try { await api(`/api/links/${link.id}`, { method: 'DELETE' }); setMessage('Managed link and scan counts deleted.'); await loadLinks(); }
        catch (error) { setMessage(error.message, true); button.disabled = false; }
      }));
    actions.lastChild.classList.add('delete-action');
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
    if (!data.links.length) list.append(element('p', 'dashboard-empty', 'Nothing saved yet. Add a destination above to create an editable link for your next poster or handout.'));
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
  sessionPromise.then(async ({ kind, principal }) => {
    if (kind === 'unavailable') {
      status.textContent = 'We could not check your sign-in. Please reload to try again. The QR generator is still available.';
      return;
    }
    if (kind !== 'signed-in') {
      status.textContent = 'You are not signed in.';
      const link = element('a', 'sign-in', 'Sign in with Microsoft'); link.href = '/.auth/login/aad?post_login_redirect_uri=/dashboard'; status.after(link);
      return;
    }
    status.textContent = `Signed in${principal.userDetails ? ` as ${principal.userDetails}` : ' with Microsoft'}.`;
    content.hidden = false;
    try { await loadLinks(); } catch (error) { setMessage(error.message, true); }
  });
}
