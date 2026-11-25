import { randomUUID } from 'node:crypto';
import { channels, eventTypes, gateways } from './fixtures.mjs';
import { csv, filterRows, matchingRows, reports } from './reports.mjs';
import { HttpError } from './errors.mjs';
import { createDemoOrder, demoCatalog, paymentForOrder, processQueue, queueNavigationEvents, queueReminder, queueReminders, queueTest, reconcileOrder, uuid } from './operations.mjs';

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

function amend(state, command, at) {
  const { type, key, value } = command;
  switch (type) {
    case 'feature':
      if (!['compareGateways', 'offerExtras'].includes(key) || typeof value !== 'boolean') break;
      state.settings[key] = value;
      return { title: 'Controle atualizado', detail: key };
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
    case 'pix':
      if (!state.settings.gateways.some(gateway => gateway.name === key && gateway.enabled)) break;
      return { title: 'PIX de teste', detail: key, code: `SIMULACAO-${randomUUID()}`, status: 'Simulado · sem cobrança' };
    case 'integration-test':
      if (!channels.includes(key)) break;
      return queueTest(state, key, at);
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
  }
  throw new HttpError(400, 'Ação inválida para esta configuração.');
}

const trackedPages = ['inicio', 'oferta', 'cadastro', 'questionario', 'regiao', 'analise'];
const pageTitles = ['Início', 'Sobre a oferta', 'Cadastro', 'Questionário', 'Disponibilidade por região', 'Análise e ofertas'];
const trackedPageTitles = new Map(trackedPages.map((page, index) => [page, pageTitles[index]]));
const leadFields = ['id', 'name', 'city', 'origin', 'device'];
const saleFields = ['id', 'sessionId', 'gateway'];
const sections = ['overview', 'pages', 'leads', 'audience', 'sales', 'catalog', 'gateways',
  'tracking', 'utmfy', 'sms', 'queue', 'navigation', 'security'];

async function trafficReport(store, since) {
  const visits = await store.readTraffic(since);
  const counts = new Map();
  const stageByPage = new Map(trackedPages.map((page, index) => [page, index]));
  const furthestStageBySession = new Map();
  for (const row of visits) {
    counts.set(row.page, (counts.get(row.page) || 0) + 1);
    const stage = stageByPage.get(row.page);
    if (stage > (furthestStageBySession.get(row.session) ?? -1)) furthestStageBySession.set(row.session, stage);
  }
  const stageCounts = Array(trackedPages.length).fill(0);
  for (const stage of furthestStageBySession.values()) stageCounts[stage]++;
  return {
    rows: trackedPages.map(page => ({ page, count: counts.get(page) || 0 })),
    furthestPages: trackedPages.map((page, index) => ({ page, count: stageCounts[index] })),
    sessions: furthestStageBySession.size,
    limit: visits.length >= 1000,
  };
}

async function viewReport(store, params, time) {
  const section = params.get('section');
  if (!sections.includes(section)) throw new HttpError(404, 'Seção indisponível.');
  const snapshot = await store.read();
  const state = { version: snapshot.version, settings: snapshot.settings };
  if (section === 'catalog') state.catalog = snapshot.catalog;
  if (['utmfy', 'sms', 'security'].includes(section)) state.audit = snapshot.audit;
  if (section === 'sms') {
    state.orders = snapshot.orders.filter(order => order.status === 'Pendente no teste');
    state.queue = snapshot.queue.filter(job => job.event === 'Remarketing');
  }
  if (section === 'queue') state.queue = snapshot.queue;
  if (['catalog', 'tracking', 'utmfy', 'sms', 'queue', 'security'].includes(section)) return { state };

  const { leads, orders, ...overview } = reports(params, time, snapshot.orders);
  if (section === 'leads') {
    const records = await leadRecords(store, leads, overview.daily[0].day, params);
    return { state, data: { ...filterRows(records.rows, params, leadFields), limited: records.limited } };
  }
  if (section === 'sales') return { state, data: filterRows(orders, params, saleFields) };
  if (['pages', 'navigation'].includes(section)) {
    return { state, data: overview, traffic: await trafficReport(store, overview.daily[0].day) };
  }
  return { state, data: overview };
}

function trackedLead(id, visits) {
  const pages = new Set(visits.map(visit => visit.page));
  const firstDay = visits.map(visit => visit.day).sort()[0];
  return {
    id,
    name: `Sessão ${id.slice(0, 8)}`,
    source: 'tracked',
    origin: 'Jornada acompanhada',
    startedOn: firstDay,
    createdAt: `${firstDay}T00:00:00Z`,
    steps: trackedPages.filter(page => pages.has(page)).map(page => trackedPageTitles.get(page)),
  };
}

async function leadRecords(store, samples, since, params) {
  const source = params.get('source');
  if (source === 'sample') return { rows: samples, limited: false };

  const visits = await store.readTraffic(since);
  const bySession = new Map();
  for (const visit of visits) {
    if (!bySession.has(visit.session)) bySession.set(visit.session, []);
    bySession.get(visit.session).push(visit);
  }
  const rows = Array.from(bySession, ([id, pages]) => trackedLead(id, pages))
    .sort((first, next) => next.startedOn.localeCompare(first.startedOn) || first.id.localeCompare(next.id));
  if (source !== 'tracked') rows.push(...samples);
  return { rows, limited: visits.length >= 1000 };
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
  await store.recordTraffic({ page, session, day });
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await store.read();
    if (!queueNavigationEvents(state, event, at)) return;
    const previous = state.version++;
    if (await store.save(previous, state)) return;
  }
  throw new HttpError(409, 'A fila mudou. Reabra a página para tentar registrar os eventos de teste.');
}

export function adminHandler({ auth, store, now = Date.now }) {
  return async request => {
    try {
      const { url, route } = endpoint(request);
      if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Método indisponível.' }, 405, { Allow: 'GET, POST' });
      if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) {
        throw new HttpError(403, 'Origem inválida.');
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
        const entry = await saveOperation(store, state, amend(state, command, at), operator, at);
        return json({ state, result: entry });
      }
      if (request.method !== 'GET') throw new HttpError(404, 'Rota indisponível.');
      if (route === 'session') return json({ operator, prototype: true });
      if (route === 'demo-catalog') {
        const items = demoCatalog(await store.read()).map(({ id, cents }) => ({ id, cents }));
        return json({ items });
      }
      if (route === 'view') return json(await viewReport(store, url.searchParams, now()));
      if (route === 'settings') return json(await store.read());
      const supported = ['traffic', 'overview', 'leads', 'sales', 'lead', 'order', 'export'];
      if (!supported.includes(route)) throw new HttpError(404, 'Rota indisponível.');
      if (route === 'order') {
        const order = (await store.read()).orders.find(entry => entry.id === url.searchParams.get('id'));
        if (!order) throw new HttpError(404, 'Pedido de teste indisponível.');
        return json({ order });
      }
      if (route === 'lead' && uuid.test(url.searchParams.get('id') || '')) {
        const id = url.searchParams.get('id').toLowerCase();
        const since = reports(url.searchParams, now()).daily[0].day;
        const visits = await store.readTraffic(since, id);
        if (!visits.length) throw new HttpError(404, 'Sessão de teste indisponível no período.');
        const orders = (await store.read()).orders.filter(order => order.sessionId === id);
        const history = visits.toSorted((first, next) => first.day.localeCompare(next.day) ||
          trackedPages.indexOf(first.page) - trackedPages.indexOf(next.page))
          .map(({ page, day }) => ({ title: trackedPageTitles.get(page), day }));
        return json({ lead: { ...trackedLead(id, visits), visits: history }, orders });
      }
      const salesExport = route === 'export' && url.searchParams.get('kind') === 'sales';
      const orders = ['overview', 'sales'].includes(route) || salesExport ? (await store.read()).orders : [];
      const data = reports(url.searchParams, now(), orders);
      if (route === 'traffic') {
        return json(await trafficReport(store, data.daily[0].day));
      }
      if (route === 'overview') {
        const { leads, orders: transactions, ...overview } = data;
        return json(overview);
      }
      if (route === 'leads') {
        const records = await leadRecords(store, data.leads, data.daily[0].day, url.searchParams);
        return json({ ...filterRows(records.rows, url.searchParams, leadFields), limited: records.limited });
      }
      if (route === 'sales') return json(filterRows(data.orders, url.searchParams, saleFields));
      if (route === 'lead') {
        const lead = data.leads.find(row => row.id === url.searchParams.get('id'));
        if (!lead) throw new HttpError(404, 'Registro de teste indisponível no período.');
        return json({ lead, orders: data.orders.filter(order => order.sessionId === lead.id) });
      }
      if (route === 'export') {
        const fields = salesExport
          ? [['ID','id'], ['Sessão','sessionId'], ['Gateway','gateway'], ['Status','status'], ['Centavos','total'], ['Data','createdAt']]
          : [['Sessão','id'], ['Nome de teste','name'], ['Cidade','city'], ['Origem','origin'], ['Aparelho','device'], ['Data','createdAt']];
        const records = salesExport ? data.orders : (await leadRecords(store, data.leads, data.daily[0].day, url.searchParams)).rows;
        const rows = matchingRows(records, url.searchParams, salesExport ? saleFields : leadFields);
        return new Response(csv(rows, fields), {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${salesExport ? 'vendas' : 'leads'}-teste.csv"`,
            'Cache-Control': 'no-store',
          },
        });
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
