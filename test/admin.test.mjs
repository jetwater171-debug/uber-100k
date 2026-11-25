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
  const overview = await (await request('view', { query: { section: 'overview' } })).json();
  assert.equal(overview.traffic.pageViews, 3);
  assert.deepEqual(overview.traffic.daily, [{ day: '2026-11-25', count: 3 }]);
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

test('journey activity is private, validates page context and deduplicates by session and day', async () => {
  const { request, login } = fixture();
  const entry = { page: 'regiao', event: 'lookup_resolved', session: sessionId, postalCode: 'ignored-secret' };
  assert.equal((await request('journey-event', { body: entry })).status, 401);
  await login();
  assert.equal((await request('journey-event', { body: { ...entry, page: 'cadastro' } })).status, 400);
  assert.equal((await request('traffic', { body: { page: 'regiao', session: sessionId } })).status, 204);
  for (const event of ['lookup_resolved', 'lookup_resolved', 'page_return']) {
    assert.equal((await request('journey-event', { body: { ...entry, event } })).status, 204);
  }
  const { journey } = await (await request('view', { query: { section: 'activity' } })).json();
  assert.deepEqual(journey.milestones, [{ name: 'Região encontrada', count: 1 }]);
  assert.deepEqual(journey.returns, [{ name: 'Disponibilidade por região', count: 1 }]);
  assert.equal(journey.recent.length, 2);
  assert.doesNotMatch(JSON.stringify(journey), /ignored-secret/);
  const { lead } = await (await request('lead', { query: { id: sessionId } })).json();
  assert.equal(lead.activity.length, 2);
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
  const lookup = await request('order', { query: { id: first.result.code } });
  assert.equal((await lookup.json()).order.id, order.id);
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

test('a reminder batch validates pending orders, saves atomically and deduplicates retries', async () => {
  const { request, login } = fixture();
  await login();
  let version = 0;
  const command = async (type, key, value) => {
    const response = await request('command', { body: { type, key, value, version } });
    if (response.ok) version++;
    return response;
  };
  const ids = [];
  for (const requestId of [sessionId, '015379c9-c724-4c57-9aa4-f32cdc3049cd']) {
    const response = await request('demo-order', { body: { session: sessionId, requestId, items: ['camera'] } });
    assert.equal(response.status, 201);
    version++;
    const { id } = await response.json();
    ids.push(id);
    assert.equal((await command('order-payment', id, '')).status, 200);
  }
  assert.equal((await command('order-reminders', null, [ids[0], 'missing-order'])).status, 404);
  const previous = await (await request('settings')).json();
  assert.equal(previous.queue.length, 0);
  assert.equal(previous.orders.some(order => order.reminderQueuedAt), false);
  const accepted = await (await command('order-reminders', null, ids)).json();
  assert.equal(accepted.result.detail, '2 lembretes novos');
  assert.equal(accepted.state.queue.length, 2);
  const repeated = await (await command('order-reminders', null, ids)).json();
  assert.equal(repeated.result.detail, '0 lembretes novos');
  assert.equal(repeated.state.queue.length, 2);
});

test('reports start empty and support search, period, pagination and CSV from recorded rows', async () => {
  const { request, login } = fixture();
  await login();
  const overview = await (await request('overview', { query: { days: '14' } })).json();
  assert.equal(overview.days, 14);
  assert.deepEqual(overview.counts, { testOrders: 0, testPaid: 0, testRevenue: 0 });
  assert.equal(overview.traffic.sessions, 0);
  assert.equal((await (await request('leads')).json()).total, 0);
  await request('traffic', { body: { page: 'cadastro', session: sessionId } });
  const leads = await (await request('leads', { query: { q: sessionId.slice(0, 8) } })).json();
  assert.equal(leads.total, 1);
  assert.equal(leads.items[0].id, sessionId);
  assert(leads.items.length <= leads.perPage);
  const data = await request('export', { query: { kind: 'sales' } });
  assert.match(data.headers.get('Content-Disposition'), /vendas-teste.csv/);
  assert.match(await data.text(), /Sessão/);
  assert.match(csv([{ field: '=1+1' }], [['Cabeçalho', 'field']]), /"'=1\+1"/);
});

test('custom periods bound tracking, transactions and exports on both dates', async () => {
  const { request, login } = fixture();
  await login();
  await request('traffic', { body: { session: sessionId, page: 'inicio' } });
  const before = { from: '2026-11-24', to: '2026-11-24' };
  const today = { from: '2026-11-25', to: '2026-11-25' };
  const filtered = await (await request('view', { query: { section: 'overview', ...before } })).json();
  assert.equal(filtered.traffic.sessions, 0);
  assert.equal(filtered.data.since, '2026-11-24');
  assert.equal((await (await request('traffic', { query: today })).json()).sessions, 1);
  assert.equal((await request('traffic', { query: { from: '2026-02-30', to: '2026-03-10' } })).status, 400);
  const csv = await (await request('export', { query: { kind: 'leads', source: 'tracked', ...before } })).text();
  assert.doesNotMatch(csv, new RegExp(sessionId));
});

test('dashboard settings save together and reject unknown controls without writing', async () => {
  const { request, login } = fixture();
  await login();
  assert.equal((await request('command', { body: { type: 'features', version: 0, value: { offerExtras: false, openRoutes: true } } })).status, 400);
  const saved = await request('command', { body: { type: 'features', version: 0, value: { compareGateways: false, offerExtras: false } } });
  assert.equal(saved.status, 200);
  const data = await saved.json();
  assert.equal(data.state.version, 1);
  assert.equal(data.state.settings.compareGateways, false);
  assert.equal(data.state.settings.offerExtras, false);
});

test('sales audit and audience exports use recorded orders and aggregate session activity', async () => {
  const { request, login } = fixture();
  await login();
  const sale = await request('demo-order', { body: { items: ['camera'], session: sessionId, requestId: sessionId } });
  assert.equal(sale.status, 201);
  const list = await (await request('view', { query: { section: 'sales', source: 'tracked' } })).json();
  assert.equal(list.data.total, 1);
  assert.deepEqual(list.data.audit.find(row => row.name === status.awaiting),
    { name: status.awaiting, orders: 1, cents: 3990 });
  const samples = await (await request('sales', { query: { source: 'sample' } })).json();
  assert.equal(samples.total, 0);
  await request('traffic', { body: { page: 'cadastro', session: sessionId } });
  const csv = await (await request('export', { query: { kind: 'audience' } })).text();
  assert.match(csv, /Cadastro.*"1"/);
  assert.doesNotMatch(csv, new RegExp(sessionId));
});

test('diagnoses supported integration scenarios and records simulated origin checks', async () => {
  const { request, login } = fixture();
  await login();
  const command = (type, key, value, version) => request('command', { body: { type, key, value, version } });
  assert.equal((await command('integration-test', 'Meta', 'Torpedo de voz', 0)).status, 400);
  const diagnostic = await (await command('integration-test', 'SMSMais', 'Torpedo de voz', 0)).json();
  assert.equal(diagnostic.state.queue[0].event, 'Torpedo de voz');
  assert.equal((await command('domain-check', 'regiao', 'https://outside.example', 1)).status, 400);
  await command('domain-check', 'regiao', 'current', 1);
  await command('domain-check', 'analise', 'test', 2);
  const { domains } = await (await request('view', { query: { section: 'domains' } })).json();
  assert.equal(domains.origin, origin);
  assert.deepEqual(domains.checks.map(row => [row.domainPage, row.status]), [
    ['analise', 'Origem rejeitada no teste'], ['regiao', 'Origem aceita no teste'],
  ]);
});

test('tracked sessions can be filtered, exported and opened with their own orders', async () => {
  const { request, login } = fixture();
  await login();
  for (const page of ['oferta', 'inicio', 'cadastro']) {
    assert.equal((await request('traffic', { body: { page, session: sessionId } })).status, 204);
  }
  const created = await request('demo-order', { body: { items: ['camera'], session: sessionId, requestId: sessionId } });
  assert.equal(created.status, 201);
  const { id: orderId } = await created.json();
  const list = await (await request('view', { query: { section: 'leads', source: 'tracked' } })).json();
  assert.equal(list.data.total, 1);
  assert.deepEqual(list.data.items[0].steps, ['Início', 'Sobre a oferta', 'Cadastro']);
  assert.equal(list.data.items[0].status, status.awaiting);
  const otherStatus = await (await request('leads', { query: { source: 'tracked', status: status.paid } })).json();
  assert.equal(otherStatus.total, 0);
  assert.equal(list.data.items[0].visits, undefined);
  const samples = await (await request('leads', { query: { source: 'sample', q: sessionId } })).json();
  assert.equal(samples.total, 0);
  const detail = await (await request('lead', { query: { id: sessionId } })).json();
  assert.deepEqual(detail.lead.visits.map(visit => visit.title), ['Início', 'Sobre a oferta', 'Cadastro']);
  assert.deepEqual(detail.orders.map(order => order.id), [orderId]);
  const csvExport = await (await request('export', { query: { kind: 'leads', source: 'tracked' } })).text();
  assert.match(csvExport, new RegExp(sessionId));
  assert.match(csvExport, /Aguardando PIX de teste/);
  assert.doesNotMatch(csvExport, /Motorista de teste/);
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
  assert.equal(sales.data.items.length, 0);
  assert(sales.data.items.length <= sales.data.perPage);
  assert.equal(sales.state.orders, undefined);
  assert.equal((await request('view', { query: { section: 'outside' } })).status, 404);
});

test('Supabase store checks login limits and sends compare-and-swap and deduplicated insert requests', async () => {
  const requests = [];
  const store = supabaseStore({
    url: 'https://fake-db.example',
    secret: 'sb_secret_fake',
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.pathname === '/rest/v1/rpc/campaign_allow_admin_login') return Response.json(true);
      return options.method === 'POST' ? new Response(null, { status: 201 }) : Response.json([{ revision: 1 }]);
    },
  });
  assert(await store.save(0, { version: 1 }));
  await store.recordTraffic({ page: 'inicio', session: sessionId, day: '2026-11-25' });
  assert.equal(requests[0].url.searchParams.get('revision'), 'eq.0');
  assert.equal(requests[1].url.searchParams.get('on_conflict'), 'session,page,day');
  assert.equal(requests[1].options.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
  assert.equal(JSON.parse(requests[1].options.body).reporting_visible, true);
  const bucket = 'a'.repeat(64);
  assert.equal(await store.allowLoginAttempt(bucket), true);
  assert.equal(requests[2].url.pathname, '/rest/v1/rpc/campaign_allow_admin_login');
  assert.equal(requests[2].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[2].options.body), { p_bucket: bucket });
  await store.readTraffic('2026-11-25', sessionId);
  assert.equal(requests[3].url.searchParams.get('session'), `eq.${sessionId}`);
  assert.equal(requests[3].url.searchParams.get('reporting_visible'), 'is.true');
});
