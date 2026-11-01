import { app } from '@azure/functions';
import { TableClient } from '@azure/data-tables';
import { createHandlers } from './core.js';

let handlers;
function backend() {
  if (!handlers) {
    const connection = process.env.TABLES_CONNECTION_STRING;
    if (!connection) throw new Error('TABLES_CONNECTION_STRING is not configured.');
    handlers = createHandlers({
      links: TableClient.fromConnectionString(connection, 'links'),
      scans: TableClient.fromConnectionString(connection, 'scans')
    });
  }
  return handlers;
}
const fail = (error, context) => { context.error(error); return { status: 503, jsonBody: { error: 'Link service is temporarily unavailable.' }, headers: { 'Cache-Control': 'no-store' } }; };
app.http('links', { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'links', handler: async (request, context) => {
  try { return request.method === 'POST' ? await backend().create(request) : await backend().list(request); } catch (error) { return fail(error, context); }
} });
app.http('linkUpdate', { methods: ['PATCH'], authLevel: 'anonymous', route: 'links/{slug}', handler: async (request, context) => {
  try { return await backend().update(request, request.params.slug); } catch (error) { return fail(error, context); }
} });
app.http('linkStats', { methods: ['GET'], authLevel: 'anonymous', route: 'links/{slug}/stats', handler: async (request, context) => {
  try { return await backend().stats(request, request.params.slug); } catch (error) { return fail(error, context); }
} });
app.http('redirect', { methods: ['GET'], authLevel: 'anonymous', route: 'r/{owner}/{slug}', handler: async (request, context) => {
  try { return await backend().redirect(request.params.owner, request.params.slug); } catch (error) { return fail(error, context); }
} });
