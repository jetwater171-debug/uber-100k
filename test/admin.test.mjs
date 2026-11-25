import test from 'node:test';
import assert from 'node:assert/strict';
import { adminHandler } from '../server/admin.mjs';
import { localAuth } from '../server/auth.mjs';
import { memoryStore, supabaseStore } from '../server/store.mjs';
import { gateways } from '../server/fixtures.mjs';
import { csv } from '../server/reports.mjs';

const origin = 'http://127.0.0.1:4280';
const sessionId = '015379c9-c724-4c57-9aa4-f32cdc3049cb';
function fixture() {
  const handler = adminHandler({ auth: localAuth(), store: memoryStore(), now: () => Date.UTC(2026, 10, 25) });
  let session;
  async function request(route, options = {}) {
    const url = new URL('/api/admin', origin);
    url.search = new URLSearchParams({ route, ...options.query });
    const headers = { ...options.headers };
    if (session && options.auth !== false) headers.Cookie = session;
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      headers.Origin = options.origin || origin;
    }
    return handler(new Request(url, {
      headers, method: options.body ? 'POST' : 'GET',
      body: options.body ? JSON.stringify(options.body) : undefined,
    }));
  }
  return {
    request,
    async login() {
      const response = await request('login', { body: {} });
      session = response.headers.get('Set-Cookie').split(';')[0];
      return response;
    },
  };
}

test('private routes require session and state mutations reject cross-origin requests', async () => {
  const { request, login } = fixture();
  assert.equal((await request('overview')).status, 401);
  assert.equal((await request('login', { body: {}, origin: 'https://example.com' })).status, 403);
  const result = await login();
  assert.equal(result.status, 200);
  assert.match(result.headers.get('Set-Cookie'), /HttpOnly/);
  assert.match(result.headers.get('Set-Cookie'), /SameSite=Strict/);
  assert.equal((await request('settings')).status, 200);
  assert.equal((await request('logout', { body: {} })).status, 200);
  assert.equal((await request('settings')).status, 401);
});

test('demo PIX is available through all six gateway actions and audit entries are stored', async () => {
  const { request, login } = fixture();
  await login();
  for (const [version, gateway] of gateways.entries()) {
    const response = await request('command', { body: { type: 'pix', key: gateway, version } });
    assert.equal(response.status, 200);
    const { result } = await response.json();
    assert.match(result.code, /^SIMULACAO-/);
    assert.equal(result.status, 'Simulado · sem cobrança');
  }
  const state = await (await request('settings')).json();
  assert.equal(state.audit.length, 6);
});

test('store prevents concurrent state changes from overwriting configuration', async () => {
  const { request, login } = fixture();
  await login();
  const results = await Promise.all([
    request('command', { body: { type: 'feature', key: 'offerExtras', value: false, version: 0 } }),
    request('command', { body: { type: 'gateway', key: gateways[0], value: false, version: 0 } }),
  ]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  const state = await (await request('settings')).json();
  assert.equal(state.version, 1);
});

test('tracking counts actual demo navigation once per day, with a private bounded payload', async () => {
  const { request, login } = fixture();
  assert.equal((await request('traffic', { body: { page: 'inicio', session: sessionId } })).status, 401);
  await login();
  for (const page of ['inicio', 'inicio', 'cadastro']) {
    assert.equal((await request('traffic', { body: { page, session: sessionId } })).status, 204);
  }
  assert.equal((await request('traffic', { body: { page: 'fora-do-projeto', session: sessionId } })).status, 400);
  const { rows } = await (await request('traffic')).json();
  assert.equal(rows.find(row => row.page === 'inicio').count, 1);
  assert.equal(rows.find(row => row.page === 'cadastro').count, 1);
});

test('reports support search, period, pagination and CSV in the same environment', async () => {
  const { request, login } = fixture();
  await login();
  const overview = await (await request('overview', { query: { days: '14' } })).json();
  assert.equal(overview.days, 14);
  assert(overview.counts.revenue > 0);
  const leads = await (await request('leads', { query: { q: 'Sao Paulo' } })).json();
  assert(leads.total > 0);
  assert(leads.items.every(lead => lead.city === 'São Paulo'));
  assert(leads.items.length <= leads.perPage);
  const data = await request('export', { query: { kind: 'sales' } });
  assert.match(data.headers.get('Content-Disposition'), /vendas-teste.csv/);
  assert.match(await data.text(), /Pedido|PED-/);
  assert.match(csv([{ field: '=1+1' }], [['Cabeçalho', 'field']]), /"'=1\+1"/);
});

test('Supabase store sends compare-and-swap and deduplicated insert requests', async () => {
  const requests = [];
  const store = supabaseStore({
    url: 'https://fake-db.example',
    secret: 'sb_secret_fake',
    fetch: async (url, options) => {
      requests.push({ url, options });
      return options.method === 'POST' ? new Response(null, { status: 201 }) : Response.json([{ revision: 1 }]);
    },
  });
  assert(await store.save(0, { version: 1 }));
  await store.recordTraffic({ page: 'inicio', session: sessionId, day: '2026-11-25' });
  assert.equal(requests[0].url.searchParams.get('revision'), 'eq.0');
  assert.equal(requests[1].url.searchParams.get('on_conflict'), 'session,page,day');
  assert.equal(requests[1].options.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
});
