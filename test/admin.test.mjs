import test from 'node:test';
import assert from 'node:assert/strict';
import { adminHandler } from '../server/admin.mjs';
import { localAuth, passwordAuth } from '../server/auth.mjs';
import { memoryStore, supabaseStore } from '../server/store.mjs';
import { gateways, initialState } from '../server/fixtures.mjs';
import { queueReminder, queueTest, status } from '../server/operations.mjs';
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

test('hosted password login limits attempts and uses a revocable opaque cookie', async () => {
  const sessions = new Map();
  let clock = Date.UTC(2026, 10, 25);
  let allowed = true;
  const buckets = [];
  const options = {
    password: 'password-fixture', secret: 'db-secret-fixture', trustVercel: true, now: () => clock,
    sessions: {
      async allowLoginAttempt(bucket) { buckets.push(bucket); return allowed; },
      async replaceAdminSession(session) { sessions.set(session.operator_id, session); },
      async readAdminSession(digest, at) {
        return [...sessions.values()].find(session => session.token_digest === digest && session.expires_at > at);
      },
      async revokeAdminSession(digest) {
        for (const [id, session] of sessions) if (session.token_digest === digest) sessions.delete(id);
      },
    },
  };
  const auth = passwordAuth(options);
  const request = cookie => new Request('https://panel.example/api/admin', {
    headers: { 'x-vercel-forwarded-for': '192.0.2.1', ...(cookie ? { Cookie: cookie } : {}) },
  });
  const login = async () => auth.login(request(), { password: options.password });
  await assert.rejects(auth.login(new Request('http://panel.example/api/admin'), { password: options.password }), { status: 403 });
  await assert.rejects(auth.login(request(), { password: 'wrong' }), { status: 401 });
  allowed = false;
  await assert.rejects(login(), { status: 429 });
  allowed = true;
  const { cookie: first, who } = await login();
  assert.match(first, /^__Secure-campaign-admin=[a-f0-9]{64};/);
  assert.match(first, /Max-Age=1800; Secure/);
  assert.doesNotMatch(first, /password-fixture|db-secret-fixture/);
  assert.notEqual(sessions.get(who.id).token_digest, first.split('=')[1].split(';')[0]);
  assert.deepEqual(await auth.verify(request(first)), who);
  assert.equal(new Set(buckets).size, 1);
  assert.match(buckets[0], /^[a-f0-9]{64}$/);
  const { cookie: second } = await login();
  await assert.rejects(auth.verify(request(first)), { status: 401 });
  await auth.logout(request(first));
  assert.deepEqual(await auth.verify(request(second)), who);
  await auth.logout(request(second));
  await assert.rejects(auth.verify(request(second)), { status: 401 });
  const { cookie: third } = await login();
  clock += 1800001;
  await assert.rejects(auth.verify(request(third)), { status: 401 });
  const { cookie: fourth } = await login();
  const rotated = passwordAuth({ ...options, password: 'rotated-fixture' });
  await assert.rejects(rotated.verify(request(fourth)), { status: 401 });
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
  for (const page of ['inicio', 'inicio', 'cadastro', 'inicio']) {
    assert.equal((await request('traffic', { body: { page, session: sessionId } })).status, 204);
  }
  const secondSession = '015379c9-c724-4c57-9aa4-f32cdc3049cc';
  assert.equal((await request('traffic', { body: { page: 'inicio', session: secondSession } })).status, 204);
  assert.equal((await request('traffic', { body: { page: 'fora-do-projeto', session: sessionId } })).status, 400);
  const { rows } = await (await request('traffic')).json();
  assert.equal(rows.find(row => row.page === 'inicio').count, 2);
  assert.equal(rows.find(row => row.page === 'cadastro').count, 1);
  const { traffic } = await (await request('view', { query: { section: 'navigation' } })).json();
  assert.equal(traffic.sessions, 2);
  assert.deepEqual(traffic.furthestPages.filter(row => row.count), [
    { page: 'inicio', count: 1 }, { page: 'cadastro', count: 1 },
  ]);
});

test('journey orders use server prices and an idempotent request key', async () => {
  const { request, login } = fixture();
  const data = { items: ['camera', 'powerbank'], session: sessionId, requestId: sessionId, total: 1 };
  assert.equal((await request('demo-order', { body: data })).status, 401);
  await login();
  const created = await request('demo-order', { body: data });
  assert.equal(created.status, 201);
  const order = await created.json();
  assert.equal(order.total, 7580);
  const repeated = await request('demo-order', { body: { ...data, items: [...data.items].reverse() } });
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), order);
  assert.equal((await request('demo-order', { body: { ...data, items: ['camera'] } })).status, 409);
  assert.equal((await request('demo-order', { body: { ...data, items: ['powerbank'] } })).status, 400);
  const sales = await (await request('sales', { query: { q: order.id } })).json();
  assert.equal(sales.items.length, 1);
  assert.equal(sales.items[0].id, order.id);
});

test('configured navigation events are queued once without profile field values', async () => {
  const { request, login } = fixture();
  await login();
  const config = await request('command', {
    body: { type: 'tracking', key: 'Meta', value: ['PageView', 'ViewContent', 'Lead'], version: 0 },
  });
  assert.equal(config.status, 200);
  for (const [page, completedProfile] of [
    ['oferta', false], ['oferta', false], ['cadastro', false],
    ['questionario', false], ['questionario', true], ['questionario', true],
  ]) {
    assert.equal((await request('traffic', {
      body: { page, session: sessionId, completedProfile, name: 'ignored-fixture' },
    })).status, 204);
  }
  const { state } = await (await request('view', { query: { section: 'queue' } })).json();
  assert.deepEqual(state.queue.map(job => [job.event, job.channel, job.detail]), [
    ['Lead', 'Meta', 'Cadastro concluído'],
    ['PageView', 'Meta', 'questionario'],
    ['PageView', 'Meta', 'cadastro'],
    ['ViewContent', 'Meta', 'oferta'],
    ['PageView', 'Meta', 'oferta'],
  ]);
  assert.doesNotMatch(JSON.stringify(state.queue), /ignored-fixture/);
});

test('full test queues retain pending jobs and keep old reminders deduplicated', () => {
  const state = initialState();
  const at = '2026-11-25T00:00:00.000Z';
  state.orders.push({ id: 'old-order', status: status.pending });
  state.queue = Array.from({ length: 299 }, (_, index) => ({
    id: String(index), status: 'Aguardando teste',
  }));
  state.queue.push({
    id: 'old-order/SMSMais/Remarketing', event: 'Remarketing',
    detail: 'old-order', status: 'Processado no teste', createdAt: at,
  });
  queueTest(state, 'Meta', at);
  assert.equal(state.queue.length, 300);
  assert.equal(state.queue.at(-1).id, '298');
  assert.equal(state.orders[0].reminderQueuedAt, at);
  queueReminder(state, 'old-order', at);
  assert.throws(() => queueTest(state, 'Meta', at), { status: 409 });
});

test('the private journey catalog reflects prices and availability, with explicit acceptance after price changes', async () => {
  const { request, login } = fixture();
  assert.equal((await request('demo-catalog', { auth: false })).status, 401);
  await login();
  const edit = (key, value, version, type = 'catalog') => request('command', { body: { type, key, value, version } });
  assert.equal((await edit('camera', { cents: 4500, active: true }, 0)).status, 200);
  assert.equal((await edit('powerbank', { cents: 3590, active: false }, 1)).status, 200);
  const { items } = await (await request('demo-catalog')).json();
  assert.deepEqual(items.find(item => item.id === 'camera'), { id: 'camera', cents: 4500 });
  assert.equal(items.some(item => item.id === 'powerbank'), false);
  assert.equal((await edit('offerExtras', false, 2, 'feature')).status, 200);
  assert.deepEqual((await (await request('demo-catalog')).json()).items, [{ id: 'camera', cents: 4500 }]);
  const order = { session: sessionId, requestId: sessionId, items: ['camera'] };
  assert.equal((await request('demo-order', { body: { ...order, quotedTotal: 3990 } })).status, 409);
  const accepted = await request('demo-order', { body: { ...order, quotedTotal: 4500 } });
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).total, 4500);
});

test('PIX reconciliation records purchase once and processes pending jobs idempotently', async () => {
  const { request, login } = fixture();
  await login();
  let version = 0;
  const command = async (type, key, value, expected = 200) => {
    const result = await request('command', { body: { type, key, value, version } });
    assert.equal(result.status, expected);
    if (result.ok) version++;
    return result.json();
  };
  await command('tracking', 'Meta', ['InitiateCheckout', 'Purchase']);
  const created = await request('demo-order', { body: { session: sessionId, requestId: sessionId, items: ['camera'] } });
  assert.equal(created.status, 201);
  version++;
  const order = await created.json();
  await command('order-reconcile', order.id, 'confirm', 409);
  const first = await command('order-payment', order.id, '');
  const repeated = await command('order-payment', order.id, first.result.detail);
  assert.equal(repeated.result.code, first.result.code);
  await command('order-reconcile', order.id, 'confirm');
  await command('order-reconcile', order.id, 'confirm');
  await command('order-reconcile', order.id, 'cancel', 409);
  const processed = await command('queue-process');
  assert.deepEqual(processed.state.queue.map(job => [job.event, job.attempts]),
    [['Purchase', 1], ['InitiateCheckout', 1]]);
  assert(processed.state.queue.every(job => job.status === 'Processado no teste'));
  const again = await command('queue-process');
  assert.equal(again.result.detail, '0 registros');
  const overview = await (await request('overview')).json();
  assert.equal(overview.counts.testOrders, 1);
  assert.equal(overview.counts.testPaid, 1);
  assert.equal(overview.counts.testRevenue, 3990);
  const gateway = overview.journeyGatewaySales.find(row => row.name === first.result.detail);
  assert.deepEqual(gateway, { name: first.result.detail, orders: 1, paid: 1, revenue: 3990 });
});

test('a pending reminder is deduplicated and canceled after payment reconciliation', async () => {
  const { request, login } = fixture();
  await login();
  const created = await request('demo-order', { body: { session: sessionId, requestId: sessionId, items: ['camera'] } });
  const order = await created.json();
  async function command(type, version, value) {
    return request('command', { body: { type, key: order.id, version, value } });
  }
  assert.equal((await command('order-reminder', 1)).status, 409);
  assert.equal((await command('order-payment', 1, '')).status, 200);
  assert.equal((await command('order-reminder', 2)).status, 200);
  const repeated = await (await command('order-reminder', 3)).json();
  assert.equal(repeated.state.queue.length, 1);
  const confirmed = await (await command('order-reconcile', 4, 'confirm')).json();
  assert.equal(confirmed.state.queue[0].status, 'Cancelado no teste');
  const processed = await (await command('queue-process', 5)).json();
  assert.equal(processed.state.queue[0].attempts, 0);
  assert.equal((await command('order-reminder', 6)).status, 409);
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

test('view requests return one consistent snapshot with section-specific records', async () => {
  const { request, login } = fixture();
  await login();
  const pages = await (await request('view', { query: { section: 'pages', days: '14' } })).json();
  assert.deepEqual(Object.keys(pages.state).sort(), ['settings', 'version']);
  assert.equal(pages.data.days, 14);
  assert.equal(pages.traffic.rows.length, 6);
  const catalog = await (await request('view', { query: { section: 'catalog' } })).json();
  assert.equal(catalog.state.catalog.length, 6);
  assert.equal(catalog.data, undefined);
  const sales = await (await request('view', { query: { section: 'sales', page: '1' } })).json();
  assert(sales.data.items.length > 0);
  assert(sales.data.items.length <= sales.data.perPage);
  assert.equal(sales.state.orders, undefined);
  assert.equal((await request('view', { query: { section: 'outside' } })).status, 404);
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
