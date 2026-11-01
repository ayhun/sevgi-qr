import { createHash, randomBytes } from 'node:crypto';

const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
const response = (status, body) => ({ status, jsonBody: body, headers });
const missing = error => error?.statusCode === 404 || error?.code === 'ResourceNotFound' || error?.code === 'EntityNotFound';
const conflict = error => error?.statusCode === 409 || error?.statusCode === 412;
const safeSlug = value => /^[a-f0-9]{20}$/.test(value || '');
const safeOwner = value => /^[a-f0-9]{24}$/.test(value || '');
const strip = item => ({ id: item.rowKey, title: item.title, destination: item.destination, active: item.active, createdAt: item.createdAt, updatedAt: item.updatedAt, shortUrl: `/api/r/${item.partitionKey}/${item.rowKey}` });

export function principalOf(request) {
  const encoded = request.headers.get('x-ms-client-principal');
  if (!encoded || encoded.length > 16384) return null;
  try {
    const principal = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (principal?.identityProvider !== 'aad' || !principal?.userRoles?.includes('authenticated') || typeof principal?.userId !== 'string' || principal.userId.length > 200) return null;
    return principal;
  } catch { return null; }
}

export const ownerOf = userId => createHash('sha256').update(userId).digest('hex').slice(0, 24);
export function destinationOf(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Enter a website URL under 2,048 characters.');
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a valid https:// or http:// website address.'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) throw new Error('Enter a public http or https website address without credentials.');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) throw new Error('Private network destinations are not supported.');
  return url.href;
}
export function titleOf(input) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, 100);
}

// These handlers receive injected Table clients, keeping storage and auth
// behavior testable without connecting to Azure or inventing a local identity.
export function createHandlers({ links, scans, now = () => new Date(), random = () => randomBytes(10).toString('hex') }) {
  async function list(request) {
    const principal = principalOf(request); if (!principal) return response(401, { error: 'Sign in with Microsoft.' });
    const owner = ownerOf(principal.userId), items = [];
    for await (const item of links.listEntities({ queryOptions: { filter: `PartitionKey eq '${owner}'` } })) {
      if (items.length === 100) break;
      items.push(strip(item));
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return response(200, { links: items, limit: 100 });
  }
  async function create(request) {
    const principal = principalOf(request); if (!principal) return response(401, { error: 'Sign in with Microsoft.' });
    if (!['application/json', 'application/json; charset=utf-8'].includes(request.headers.get('content-type')?.toLowerCase())) return response(415, { error: 'Send JSON.' });
    const owner = ownerOf(principal.userId);
    const existing = await list(request); if (existing.jsonBody.links.length >= 100) return response(429, { error: 'The 100-link account limit has been reached.' });
    let input; try { input = await request.json(); } catch { return response(400, { error: 'Invalid JSON.' }); }
    let destination; try { destination = destinationOf(input?.destination); } catch (error) { return response(400, { error: error.message }); }
    const stamp = now().toISOString();
    for (let attempt = 0; attempt < 3; attempt++) {
      const item = { partitionKey: owner, rowKey: random(), title: titleOf(input?.title), destination, active: true, createdAt: stamp, updatedAt: stamp, scans: 0 };
      try { await links.createEntity(item); return response(201, { link: strip(item) }); }
      catch (error) { if (!conflict(error)) throw error; }
    }
    return response(503, { error: 'Could not reserve a link ID. Please retry.' });
  }
  async function update(request, slug) {
    const principal = principalOf(request); if (!principal) return response(401, { error: 'Sign in with Microsoft.' });
    if (!safeSlug(slug)) return response(404, { error: 'Link not found.' });
    if (!['application/json', 'application/json; charset=utf-8'].includes(request.headers.get('content-type')?.toLowerCase())) return response(415, { error: 'Send JSON.' });
    let input; try { input = await request.json(); } catch { return response(400, { error: 'Invalid JSON.' }); }
    if (!input || typeof input !== 'object' || !('destination' in input || 'title' in input || 'active' in input)) return response(400, { error: 'Provide a destination, title, or active status.' });
    let destination;
    if ('destination' in input) try { destination = destinationOf(input.destination); } catch (error) { return response(400, { error: error.message }); }
    if ('active' in input && typeof input.active !== 'boolean') return response(400, { error: 'Active must be true or false.' });
    const owner = ownerOf(principal.userId);
    for (let attempt = 0; attempt < 4; attempt++) {
      let item; try { item = await links.getEntity(owner, slug); } catch (error) { if (missing(error)) return response(404, { error: 'Link not found.' }); throw error; }
      const change = { partitionKey: owner, rowKey: slug, updatedAt: now().toISOString() };
      if ('title' in input) change.title = titleOf(input.title);
      if (destination) change.destination = destination;
      if ('active' in input) change.active = input.active;
      try { await links.updateEntity(change, 'Merge', { etag: item.etag }); return response(200, { link: strip({ ...item, ...change }) }); }
      catch (error) { if (!conflict(error)) throw error; }
    }
    return response(409, { error: 'This link changed while you were editing. Please reload.' });
  }
  async function stats(request, slug) {
    const principal = principalOf(request); if (!principal) return response(401, { error: 'Sign in with Microsoft.' });
    if (!safeSlug(slug)) return response(404, { error: 'Link not found.' });
    const owner = ownerOf(principal.userId);
    try { await links.getEntity(owner, slug); } catch (error) { if (missing(error)) return response(404, { error: 'Link not found.' }); throw error; }
    const days = [];
    for await (const entity of scans.listEntities({ queryOptions: { filter: `PartitionKey eq '${owner}:${slug}'` } })) days.push({ date: entity.rowKey, scans: entity.count });
    days.sort((a, b) => b.date.localeCompare(a.date));
    return response(200, { days: days.slice(0, 90), note: 'Counts include repeat scans and may include automated scanners. No visitor IP addresses are stored.' });
  }
  async function redirect(owner, slug) {
    if (!safeOwner(owner) || !safeSlug(slug)) return { status: 404, body: 'Link not found.' };
    let item; try { item = await links.getEntity(owner, slug); } catch (error) { if (missing(error)) return { status: 404, body: 'Link not found.' }; throw error; }
    if (!item.active) return { status: 410, body: 'This link is paused.' };
    const today = now().toISOString().slice(0, 10), partitionKey = `${owner}:${slug}`;
    // An analytics failure never breaks a printed QR code. Stop counting above
    // 10,000 scans per link per day to bound analytics writes and stored counts.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const counter = await scans.getEntity(partitionKey, today);
        if (counter.count >= 10000) break;
        await scans.updateEntity({ partitionKey, rowKey: today, count: counter.count + 1 }, 'Merge', { etag: counter.etag });
        break;
      } catch (error) {
        if (missing(error)) try { await scans.createEntity({ partitionKey, rowKey: today, count: 1 }); break; } catch (createError) { if (!conflict(createError)) break; }
        else if (!conflict(error)) break;
      }
    }
    return { status: 302, headers: { Location: item.destination, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } };
  }
  return { list, create, update, stats, redirect };
}
