import { randomBytes, randomUUID } from 'node:crypto';
import { siteSessionHandler } from './site-session.mjs';
import { channels, diagnosticModes, eventTypes, gateways } from './fixtures.mjs';
import { csv, filterRows, matchingRows, reports, salesAudit } from './reports.mjs';
import { HttpError } from './errors.mjs';
import { journeyPages, journeyTitle, summarizeJourney } from './journey.mjs';
import { createDemoOrder, demoCatalog, paymentForOrder, processQueue, queueNavigationEvents, queueReminder, queueReminders, queueTest, reconcileOrder, status, uuid } from './operations.mjs';

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function endpoint(request) {
  const url = new URL(request.url);
  return { url, route: url.searchParams.get('route') || url.pathname.replace(/^\/api\/admin\/?/, '') };
}

async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json') || !request.body) {
    throw new HttpError(415, 'Envie conteúdo JSON.');
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let source = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 8192) {
      await reader.cancel();
      throw new HttpError(413, 'Solicitação grande demais.');
    }
    source += decoder.decode(value, { stream: true });
  }
  let data;
  try { data = JSON.parse(source + decoder.decode()); } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Envie um objeto JSON.');
  return data;
}

const sameOrigin = (origin, expected) => origin === expected;
const testOrigin = 'https://origem-de-teste.test';

function amend(state, command, at, siteOrigin) {
  const { type, key, value } = command;
  switch (type) {
    case 'feature':
      if (!['compareGateways', 'offerExtras'].includes(key) || typeof value !== 'boolean') break;
      state.settings[key] = value;
      return { title: 'Controle atualizado', detail: key };
    case 'features': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) break;
      const changes = Object.entries(value);
      if (!changes.length || !changes.every(([name, enabled]) =>
        ['compareGateways', 'offerExtras'].includes(name) && typeof enabled === 'boolean')) break;
      Object.assign(state.settings, value);
      return { title: 'Configurações salvas', detail: changes.map(([name]) => name).join(', ') };
    }
    case 'catalog': {
      const item = state.catalog.find(record => record.id === key);
      if (!item || !value || typeof value.active !== 'boolean' ||
          !Number.isInteger(value.cents) || value.cents < 100 || value.cents > 1000000) break;
      item.cents = value.cents;
      item.active = value.active;
      return { title: 'Catálogo de teste atualizado', detail: item.name };
    }
    case 'gateway':
      if (!gateways.includes(key) || typeof value !== 'boolean') break;
      state.settings.gateways.find(gateway => gateway.name === key).enabled = value;
      return { title: 'Gateway de teste atualizado', detail: key };
    case 'gateway-settings':
      if (!Array.isArray(value) || value.length !== gateways.length ||
          new Set(value.map(entry => entry?.name)).size !== gateways.length ||
          !value.every(entry => gateways.includes(entry?.name) && typeof entry.enabled === 'boolean')) break;
      state.settings.gateways = value.map(({ name, enabled }) => ({ name, enabled }));
      return { title: 'Configurações dos gateways salvas', detail: `${value.filter(entry => entry.enabled).length} ativos em teste` };
    case 'priority':
      if (!gateways.includes(key) || ![-1, 1].includes(value)) break;
      {
        const list = state.settings.gateways;
        const from = list.findIndex(gateway => gateway.name === key);
        const to = from + value;
        if (to < 0 || to >= list.length) break;
        [list[from], list[to]] = [list[to], list[from]];
        return { title: 'Prioridade de teste atualizada', detail: key };
      }
    case 'tracking':
      if (!channels.includes(key) || !Array.isArray(value) || !value.every(event => eventTypes.includes(event))) break;
      state.settings.tracking[key] = [...new Set(value)];
      return { title: 'Eventos de teste configurados', detail: key };
    case 'tracking-settings': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) break;
      const entries = Object.entries(value);
      if (!entries.length || !entries.every(([channel, events]) =>
        channels.includes(channel) && Array.isArray(events) && events.every(event => eventTypes.includes(event)))) break;
      for (const [channel, events] of entries) state.settings.tracking[channel] = [...new Set(events)];
      return { title: 'Configurações de tracking salvas', detail: entries.map(([channel]) => channel).join(', ') };
    }
    case 'pix':
      if (!state.settings.gateways.some(gateway => gateway.name === key && gateway.enabled)) break;
      return { title: 'PIX de teste', detail: key, code: `SIMULACAO-${randomUUID()}`, status: 'Simulado · sem cobrança' };
    case 'pix-batch': {
      if (!Array.isArray(value) || !value.length || value.length > gateways.length || !value.every(name => gateways.includes(name))) break;
      const checks = [...new Set(value)].map(name => {
        const enabled = state.settings.gateways.find(entry => entry.name === name)?.enabled;
        return enabled ? { name, code: `SIMULACAO-${randomUUID()}` } : { name };
      });
      return { title: 'Teste de gateways registrado', detail: `${checks.length} selecionados`, status: 'Simulação', checks };
    }
    case 'integration-test':
      if (!channels.includes(key)) break;
      return queueTest(state, key, at, value);
    case 'queue-process':
      return processQueue(state, at);
    case 'order-payment':
      return paymentForOrder(state, key, value, at);
    case 'order-reconcile':
      return reconcileOrder(state, key, value, at);
    case 'order-reminder':
      return queueReminder(state, key, at);
    case 'order-reminders':
      return queueReminders(state, value, at);
    case 'domain-check': {
      if (!Object.hasOwn(journeyPages, key) || !['current', 'test'].includes(value)) break;
      const candidate = value === 'current' ? siteOrigin : testOrigin;
      const accepted = sameOrigin(candidate, siteOrigin);
      return {
        title: 'Verificação de domínio simulada',
        detail: new URL(candidate).hostname,
        domainPage: key,
        status: accepted ? 'Origem aceita no teste' : 'Origem rejeitada no teste',
      };
    }
  }
  throw new HttpError(400, 'Ação inválida para esta configuração.');
}

const trackedPages = Object.keys(journeyPages);
const leadFields = ['id', 'name', 'origin', 'orderId'];
const saleFields = ['id', 'sessionId', 'gateway'];
const sections = ['overview', 'pages', 'leads', 'audience', 'sales', 'catalog', 'gateways',
  'tracking', 'activity', 'utmfy', 'sms', 'queue', 'navigation', 'domains', 'security'];

async function trafficReport(store, since, until) {
  const visits = await store.readTraffic(since, undefined, until);
  const counts = new Map();
  const dayCounts = new Map();
  const sessionsByPage = new Map(trackedPages.map(page => [page, new Set()]));
  const stageByPage = new Map(trackedPages.map((page, index) => [page, index]));
  const furthestStageBySession = new Map();
  for (const row of visits) {
    counts.set(row.page, (counts.get(row.page) || 0) + 1);
    dayCounts.set(row.day, (dayCounts.get(row.day) || 0) + 1);
    sessionsByPage.get(row.page).add(row.session);
    const stage = stageByPage.get(row.page);
    if (stage > (furthestStageBySession.get(row.session) ?? -1)) furthestStageBySession.set(row.session, stage);
  }
  const stageCounts = Array(trackedPages.length).fill(0);
  for (const stage of furthestStageBySession.values()) stageCounts[stage]++;
  return {
    rows: trackedPages.map(page => ({ page, count: counts.get(page) || 0 })),
    sessionsByPage: trackedPages.map(page => ({ page, count: sessionsByPage.get(page).size })),
    furthestPages: trackedPages.map((page, index) => ({ page, count: stageCounts[index] })),
    sessions: furthestStageBySession.size,
    pageViews: visits.length,
    daily: Array.from(dayCounts, ([day, count]) => ({ day, count })).sort((first, next) => first.day.localeCompare(next.day)),
    limit: visits.length >= 1000,
  };
}

async function viewReport(store, params, time, siteOrigin) {
  const section = params.get('section');
  if (!sections.includes(section)) throw new HttpError(404, 'Seção indisponível.');
  const snapshot = await store.read();
  const state = { version: snapshot.version, settings: snapshot.settings };
  if (section === 'catalog') state.catalog = snapshot.catalog;
  if (['utmfy', 'sms', 'security'].includes(section)) state.audit = snapshot.audit;
  if (['tracking', 'utmfy', 'sms'].includes(section)) state.diagnostics = diagnosticModes;
  if (section === 'sms') {
    state.orders = snapshot.orders.filter(order => order.status === 'Pendente no teste');
    state.queue = snapshot.queue.filter(job => job.event === 'Remarketing');
  }
  if (section === 'queue') state.queue = snapshot.queue;
  if (section === 'utmfy') state.queue = snapshot.queue.filter(job => ['UTMfy', 'Pushcut'].includes(job.channel));
  if (section === 'domains') return {
    state,
    domains: {
      origin: siteOrigin,
      testOrigin,
      pages: journeyPages,
      checks: snapshot.audit.filter(entry => entry.domainPage),
    },
  };
  if (section === 'tracking') {
    const { since, until } = reports(params, time);
    const [traffic, events] = await Promise.all([
      trafficReport(store, since, until), store.readJourneyEvents(since, undefined, until),
    ]);
    return { state, pixel: [
      { name: 'PageView', count: traffic.pageViews },
      { name: 'ViewContent', count: traffic.rows.find(row => row.page === 'oferta').count },
      { name: 'Lead', count: events.filter(row => row.event === 'profile_submitted').length },
      { name: 'InitiateCheckout', count: events.filter(row => row.event === 'selection_opened').length },
    ], limited: traffic.limit || events.length >= 1000 };
  }
  if (['catalog', 'utmfy', 'sms', 'queue', 'security'].includes(section)) return { state };

  const { orders, ...overview } = reports(params, time, snapshot.orders);
  const { since, until } = overview;
  if (section === 'leads') {
    const records = await leadRecords(store, orders, since, until);
    return { state, data: { ...filterRows(records.rows, params, leadFields), limited: records.limited } };
  }
  if (section === 'sales') return {
    state, data: { ...overview, ...filterRows(orders, params, saleFields), audit: salesAudit(matchingRows(orders, params, saleFields)) },
  };
  if (section === 'activity' || section === 'navigation') {
    const [events, traffic] = await Promise.all([
      store.readJourneyEvents(since, undefined, until),
      section === 'navigation' ? trafficReport(store, since, until) : undefined,
    ]);
    const journey = summarizeJourney(events);
    const recent = events.slice(0, 30).map(({ page, event, occurred_at }) => ({
      page: journeyPages[page], title: journeyTitle(page, event), at: occurred_at,
    }));
    return { state, data: overview, traffic, journey: { ...journey, recent } };
  }
  if (section === 'overview' || section === 'gateways') {
    const [traffic, events] = await Promise.all([trafficReport(store, since, until), store.readJourneyEvents(since, undefined, until)]);
    const reached = event => new Set(events.filter(row => row.event === event).map(row => row.session)).size;
    const today = new Date(time).toISOString().slice(0, 10);
    const dailyGatewaySales = section === 'gateways' ? gateways.map(name => {
      const records = snapshot.orders.filter(order => order.gateway === name);
      const created = records.filter(order => order.payment?.createdAt?.startsWith(today));
      const confirmed = order => order.status === status.paid;
      return { name, orders: created.length, converted: created.filter(confirmed).length,
        paid: records.filter(order => confirmed(order) && order.resolvedAt?.startsWith(today)).length };
    }) : undefined;
    return { state, data: {
      ...overview, lastActivity: events[0]?.occurred_at, dailyGatewaySales,
      funnel: { postal: reached('lookup_resolved'), selection: reached('selection_opened'),
        paid: new Set(orders.filter(order => order.status === status.paid).map(order => order.sessionId)).size },
    }, traffic };
  }
  if (['pages', 'audience'].includes(section)) {
    return { state, data: overview, traffic: await trafficReport(store, since, until) };
  }
  return { state, data: overview };
}

function trackedLead(id, visits) {
  const pages = new Set(visits.map(visit => visit.page));
  const firstDay = visits.map(visit => visit.day).sort()[0];
  const latestDay = visits.map(visit => visit.day).sort().at(-1);
  const latestTime = visits.filter(visit => visit.day === latestDay).map(visit => visit.occurred_at).filter(Boolean).sort().at(-1);
  return {
    id,
    name: `Sessão ${id.slice(0, 8)}`,
    source: 'tracked',
    origin: 'Jornada acompanhada',
    startedOn: firstDay,
    createdAt: `${firstDay}T00:00:00Z`,
    updatedOn: latestDay,
    updatedAt: latestTime,
    steps: trackedPages.filter(page => pages.has(page)).map(page => journeyPages[page]),
  };
}

async function leadRecords(store, orders, since, until) {
  const latestBySession = new Map();
  for (const order of orders) {
    const previous = latestBySession.get(order.sessionId);
    if (!previous || order.createdAt > previous.createdAt) latestBySession.set(order.sessionId, order);
  }
  const includeOrder = row => {
    const latest = latestBySession.get(row.id);
    return { ...row, orderId: latest?.id, total: latest?.total, gateway: latest?.gateway || '', status: latest?.status || '' };
  };
  const visits = await store.readTraffic(since, undefined, until);
  const bySession = new Map();
  for (const visit of visits) {
    if (!bySession.has(visit.session)) bySession.set(visit.session, []);
    bySession.get(visit.session).push(visit);
  }
  const rows = Array.from(bySession, ([id, pages]) => trackedLead(id, pages))
    .sort((first, next) => next.updatedOn.localeCompare(first.updatedOn) ||
      (next.updatedAt || '').localeCompare(first.updatedAt || '') || first.id.localeCompare(next.id));
  return { rows: rows.map(includeOrder), limited: visits.length >= 1000 };
}

async function saveOperation(store, state, result, operator, at) {
  const previous = state.version;
  const entry = { ...result, at, actor: operator.id };
  state.audit = [entry, ...state.audit].slice(0, 100);
  state.version++;
  if (!await store.save(previous, state)) throw new HttpError(409, 'O painel mudou. Atualize e tente novamente.');
  return entry;
}

async function recordDemoNavigation(store, event, at) {
  const { page, session, day } = event;
  await store.recordTraffic({ page, session, day, occurred_at: at });
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await store.read();
    if (!queueNavigationEvents(state, event, at)) return;
    const previous = state.version++;
    if (await store.save(previous, state)) return;
  }
  throw new HttpError(409, 'A fila mudou. Reabra a página para tentar registrar os eventos de teste.');
}

export function adminHandler({ auth, store, now = Date.now, siteSecret = randomBytes(32) }) {
  const site = siteSessionHandler({ secret: siteSecret, store, now });
  return async request => {
    try {
      const { url, route } = endpoint(request);
      if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Método indisponível.' }, 405, { Allow: 'GET, POST' });
      if (request.method === 'POST' && !sameOrigin(request.headers.get('Origin'), url.origin)) {
        throw new HttpError(403, 'Origem inválida.');
      }
      if (['site-catalog', 'site-session', 'site-event', 'site-preference'].includes(route)) {
        return await site(request, route, body);
      }
      if (request.method === 'GET' && route === 'mode') return json({ local: auth.demo, prototype: true });
      if (request.method === 'POST' && route === 'login') {
        const result = await auth.login(request, await body(request));
        return json({ operator: result.who }, 200, { 'Set-Cookie': result.cookie });
      }
      if (request.method === 'POST' && route === 'logout') {
        return json({ ok: true }, 200, { 'Set-Cookie': await auth.logout(request) });
      }
      const operator = await auth.verify(request);
      const at = new Date(now()).toISOString();
      if (request.method === 'POST' && route === 'traffic') {
        const { page, session, completedProfile } = await body(request);
        if (!trackedPages.includes(page) || typeof session !== 'string' || !uuid.test(session)) {
          throw new HttpError(400, 'Evento de teste inválido.');
        }
        await recordDemoNavigation(store, { page, session, day: at.slice(0, 10), completedProfile }, at);
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      }
      if (request.method === 'POST' && route === 'journey-event') {
        const { page, event, session } = await body(request);
        if (typeof page !== 'string' || typeof event !== 'string' || !journeyTitle(page, event) ||
            typeof session !== 'string' || !uuid.test(session)) {
          throw new HttpError(400, 'Evento de jornada inválido.');
        }
        await store.recordJourneyEvent({ page, event, session, day: at.slice(0, 10), occurred_at: at });
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      }
      if (request.method === 'POST' && route === 'demo-order') {
        const data = await body(request);
        const state = await store.read();
        const { order, created } = createDemoOrder(state, data, at);
        if (created) await saveOperation(store, state, { title: 'Pedido de jornada de teste', detail: order.id }, operator, at);
        return json({ id: order.id, total: order.total, status: order.status }, created ? 201 : 200);
      }
      if (request.method === 'POST' && route === 'command') {
        const command = await body(request);
        const state = await store.read();
        if (command.version !== state.version) throw new HttpError(409, 'O painel mudou. Atualize e tente novamente.');
        const entry = await saveOperation(store, state, amend(state, command, at, url.origin), operator, at);
        return json({ state, result: entry });
      }
      if (request.method !== 'GET') throw new HttpError(404, 'Rota indisponível.');
      if (route === 'session') return json({ operator, prototype: true });
      if (route === 'demo-catalog') {
        const items = demoCatalog(await store.read()).map(({ id, cents }) => ({ id, cents }));
        return json({ items });
      }
      if (route === 'view') return json(await viewReport(store, url.searchParams, now(), url.origin));
      if (route === 'settings') return json(await store.read());
      const supported = ['traffic', 'overview', 'leads', 'sales', 'lead', 'order', 'export'];
      if (!supported.includes(route)) throw new HttpError(404, 'Rota indisponível.');
      if (route === 'order') {
        const lookup = url.searchParams.get('id')?.trim();
        const order = (await store.read()).orders.find(entry => lookup && (entry.id === lookup || entry.payment?.code === lookup));
        if (!order) throw new HttpError(404, 'Pedido de teste indisponível.');
        return json({ order });
      }
      if (route === 'lead' && uuid.test(url.searchParams.get('id') || '')) {
        const id = url.searchParams.get('id').toLowerCase();
        const { since, until } = reports(url.searchParams, now());
        const visits = await store.readTraffic(since, id, until);
        if (!visits.length) throw new HttpError(404, 'Sessão de teste indisponível no período.');
        const [snapshot, events] = await Promise.all([store.read(), store.readJourneyEvents(since, id, until)]);
        const orders = snapshot.orders.filter(order => order.sessionId === id);
        const history = visits.toSorted((first, next) => first.day.localeCompare(next.day) ||
          (first.occurred_at || '').localeCompare(next.occurred_at || '') || trackedPages.indexOf(first.page) - trackedPages.indexOf(next.page))
          .map(({ page, day, occurred_at }) => ({ title: journeyPages[page], day, at: occurred_at }));
        const activity = events.map(({ page, event, occurred_at }) => ({ title: journeyTitle(page, event), at: occurred_at }));
        return json({ lead: { ...trackedLead(id, visits), visits: history, activity }, orders });
      }
      const salesExport = route === 'export' && url.searchParams.get('kind') === 'sales';
      const orders = ['overview', 'sales', 'leads'].includes(route) ||
        (route === 'export' && url.searchParams.get('kind') !== 'audience') ? (await store.read()).orders : [];
      const data = reports(url.searchParams, now(), orders);
      const { since, until } = data;
      if (route === 'export' && url.searchParams.get('kind') === 'audience') {
        const traffic = await trafficReport(store, since, until);
        const rows = traffic.sessionsByPage.filter(item => item.count).map(item => ({ ...item, name: journeyPages[item.page] }));
        return csvFile('publico.csv', rows, [['Etapa', 'name'], ['Sessões registradas', 'count']]);
      }
      if (route === 'traffic') {
        return json(await trafficReport(store, since, until));
      }
      if (route === 'overview') {
        const { orders: transactions, ...overview } = data;
        return json({ ...overview, traffic: await trafficReport(store, since, until) });
      }
      if (route === 'leads') {
        const records = await leadRecords(store, data.orders, since, until);
        return json({ ...filterRows(records.rows, url.searchParams, leadFields), limited: records.limited });
      }
      if (route === 'sales') return json(filterRows(data.orders, url.searchParams, saleFields));
      if (route === 'lead') {
        throw new HttpError(404, 'Sessão registrada indisponível no período.');
      }
      if (route === 'export') {
        const fields = salesExport
          ? [['ID','id'], ['Sessão','sessionId'], ['Gateway','gateway'], ['Status','status'], ['Centavos','total'], ['Data','createdAt']]
          : [['Sessão','id'], ['Identificação','name'], ['Origem','origin'], ['Gateway','gateway'], ['Estado','status'], ['Data','createdAt']];
        const records = salesExport ? data.orders : (await leadRecords(store, data.orders, since, until)).rows;
        const rows = matchingRows(records, url.searchParams, salesExport ? saleFields : leadFields);
        return csvFile(salesExport ? 'vendas-teste.csv' : 'leads-teste.csv', rows, fields);
      }
      throw new HttpError(404, 'Rota indisponível.');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof TypeError || error.name === 'TimeoutError') {
        return json({ error: 'Serviço temporariamente indisponível.' }, 503);
      }
      return json({ error: 'O painel encontrou uma falha interna.' }, 500);
    }
  };
}

function csvFile(filename, rows, fields) {
  return new Response(csv(rows, fields), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
