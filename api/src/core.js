import { createHash, randomBytes } from 'node:crypto';

const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
const response = (status, body) => ({ status, jsonBody: body, headers });
const missing = error => error?.statusCode === 404 || error?.code === 'ResourceNotFound' || error?.code === 'EntityNotFound';
const conflict = error => error?.statusCode === 409 || error?.statusCode === 412;
const shortSlug = value => /^[A-Za-z0-9_-]{6}$/.test(value || '');
const legacyOwner = (owner, slug) => (/^[a-f0-9]{16}$/.test(owner || '') && /^[a-f0-9]{12}$/.test(slug || '')) || (/^[a-f0-9]{24}$/.test(owner || '') && /^[a-f0-9]{20}$/.test(slug || ''));
const validPair = (owner, slug) => (/^[A-Za-z0-9_-]{3,43}$/.test(owner || '') && shortSlug(slug)) || legacyOwner(owner, slug);
const ownerRow = '!owner';
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

const digestOf = userId => createHash('sha256').update(userId).digest();
export const ownerCandidateOf = (userId, length = 3) => digestOf(userId).toString('base64url').slice(0, length);
const legacyOwnersOf = userId => {
  const digest = digestOf(userId).toString('hex');
  return [digest.slice(0, 16), digest.slice(0, 24)];
};
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
export function createHandlers({ links, scans, now = () => new Date(), random = () => randomBytes(6).toString('base64url').slice(0, 6) }) {
  // Reserve aliases in the existing links table. A collision only makes the
  // later account's alias one character longer; no account-count threshold or
  // new lookup table is needed, and existing aliases never change.
  async function resolveOwner(userId, reserve = false) {
    const hash = digestOf(userId).toString('base64url');
    for (let length = 3; length <= hash.length; length++) {
      const alias = hash.slice(0, length);
      let marker;
      try { marker = await links.getEntity(alias, ownerRow); }
      catch (error) { if (!missing(error)) throw error; }
      if (marker) {
        if (marker.accountHash === hash) return alias;
        continue;
      }
      if (!reserve) return null;
      try {
        await links.createEntity({ partitionKey: alias, rowKey: ownerRow, accountHash: hash, createdAt: now().toISOString() });
        return alias;
      } catch (error) {
        if (!conflict(error)) throw error;
        length--; // Another request claimed this alias; re-read its marker.
      }
    }
    throw new Error('Could not reserve an account alias.');
  }
  async function ownerForSlug(userId, slug) {
    if (shortSlug(slug)) return resolveOwner(userId);
    const [first, second] = legacyOwnersOf(userId);
    if (/^[a-f0-9]{12}$/.test(slug || '')) return first;
    if (/^[a-f0-9]{20}$/.test(slug || '')) return second;
    return null;
  }
  async function list(request) {
    const principal = principalOf(request); if (!principal) return response(401, { error: 'Sign in with Microsoft.' });
    const current = await resolveOwner(principal.userId);
    const partitions = [...new Set([current, ...legacyOwnersOf(principal.userId)].filter(Boolean))];
    const items = [];
    for (const owner of partitions) {
      for await (const item of links.listEntities({ queryOptions: { filter: `PartitionKey eq '${owner}'` } })) {
        if (item.rowKey !== ownerRow && items.length < 100) items.push(strip(item));
      }
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return response(200, { links: items, limit: 100 });
  }
  async function create(request) {
    const principal = principalOf(request); if (!principal) return response(401, { error: 'Sign in with Microsoft.' });
    if (!['application/json', 'application/json; charset=utf-8'].includes(request.headers.get('content-type')?.toLowerCase())) return response(415, { error: 'Send JSON.' });
    const existing = await list(request); if (existing.jsonBody.links.length >= 100) return response(429, { error: 'The 100-link account limit has been reached.' });
    let input; try { input = await request.json(); } catch { return response(400, { error: 'Invalid JSON.' }); }
    let destination; try { destination = destinationOf(input?.destination); } catch (error) { return response(400, { error: error.message }); }
    const owner = await resolveOwner(principal.userId, true);
    const stamp = now().toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const item = { partitionKey: owner, rowKey: random(), title: titleOf(input?.title), destination, active: true, createdAt: stamp, updatedAt: stamp, scans: 0 };
      if (!shortSlug(item.rowKey)) throw new Error('Link ID generator returned an invalid value.');
      try { await links.createEntity(item); return response(201, { link: strip(item) }); }
      catch (error) { if (!conflict(error)) throw error; }
    }
    return response(503, { error: 'Could not reserve a link ID. Please retry.' });
  }
  async function update(request, slug) {
    const principal = principalOf(request); if (!principal) return response(401, { error: 'Sign in with Microsoft.' });
    const owner = await ownerForSlug(principal.userId, slug);
    if (!owner) return response(404, { error: 'Link not found.' });
    if (!['application/json', 'application/json; charset=utf-8'].includes(request.headers.get('content-type')?.toLowerCase())) return response(415, { error: 'Send JSON.' });
    let input; try { input = await request.json(); } catch { return response(400, { error: 'Invalid JSON.' }); }
    if (!input || typeof input !== 'object' || !('destination' in input || 'title' in input || 'active' in input)) return response(400, { error: 'Provide a destination, title, or active status.' });
    let destination;
    if ('destination' in input) try { destination = destinationOf(input.destination); } catch (error) { return response(400, { error: error.message }); }
    if ('active' in input && typeof input.active !== 'boolean') return response(400, { error: 'Active must be true or false.' });
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
  async function readStats(request, slug) {
    const principal = principalOf(request); if (!principal) return response(401, { error: 'Sign in with Microsoft.' });
    const owner = await ownerForSlug(principal.userId, slug);
    if (!owner) return response(404, { error: 'Link not found.' });
    try { await links.getEntity(owner, slug); } catch (error) { if (missing(error)) return response(404, { error: 'Link not found.' }); throw error; }
    const days = [];
    for await (const entity of scans.listEntities({ queryOptions: { filter: `PartitionKey eq '${owner}:${slug}'` } })) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(entity.rowKey) && Number.isSafeInteger(entity.count) && entity.count >= 0) days.push({ date: entity.rowKey, scans: entity.count });
    }
    days.sort((a, b) => b.date.localeCompare(a.date));
    return days;
  }
  async function stats(request, slug) {
    const result = await readStats(request, slug);
    if (!Array.isArray(result)) return result;
    const current = now();
    const today = current.toISOString().slice(0, 10);
    const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - 89)).toISOString().slice(0, 10);
    return response(200, { days: result.filter(day => day.date >= first && day.date <= today), note: 'Counts include repeat scans and may include automated scanners. No visitor IP addresses are stored.' });
  }
  async function statsCsv(request, slug) {
    const result = await readStats(request, slug);
    if (!Array.isArray(result)) return result;
    return {
      status: 200,
      body: `date_utc,scans\r\n${result.map(day => `${day.date},${day.scans}\r\n`).join('')}`,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="qr-scans-${slug}.csv"`,
        'X-Content-Type-Options': 'nosniff'
      }
    };
  }
  async function remove(request, slug) {
    const principal = principalOf(request); if (!principal) return response(401, { error: 'Sign in with Microsoft.' });
    const owner = await ownerForSlug(principal.userId, slug);
    if (!owner) return response(404, { error: 'Link not found.' });
    let item;
    try { item = await links.getEntity(owner, slug); }
    catch (error) { if (!missing(error)) throw error; }
    if (item) {
      try { await links.deleteEntity(owner, slug, { etag: item.etag }); }
      catch (error) {
        if (!missing(error)) {
          if (conflict(error)) return response(409, { error: 'This link changed while you were deleting it. Please reload.' });
          throw error;
        }
      }
    }
    // Retry-safe: a second DELETE can finish scan cleanup if the first was
    // interrupted after removing the link. Scan rows contain only daily totals.
    const days = [];
    for await (const day of scans.listEntities({ queryOptions: { filter: `PartitionKey eq '${owner}:${slug}'` } })) days.push(day);
    for (const day of days) {
      try { await scans.deleteEntity(day.partitionKey, day.rowKey); }
      catch (error) { if (!missing(error)) throw error; }
    }
    return response(200, { deleted: true });
  }
  async function redirect(owner, slug) {
    if (!validPair(owner, slug)) return { status: 404, body: 'Link not found.' };
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
  return { list, create, update, stats, statsCsv, remove, redirect };
}
