import { randomUUID } from 'node:crypto';
import { channels, eventTypes, gateways } from './fixtures.mjs';
import { csv, filterRows, matchingRows, reports } from './reports.mjs';
import { HttpError } from './errors.mjs';
import { createDemoOrder, paymentForOrder, processQueue, queueReminder, queueTest, reconcileOrder, uuid } from './operations.mjs';

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
  }
  throw new HttpError(400, 'Ação inválida para esta configuração.');
}

const trackedPages = ['inicio', 'oferta', 'cadastro', 'questionario', 'regiao', 'analise'];
const leadFields = ['id', 'name', 'city', 'origin', 'device'];
const saleFields = ['id', 'sessionId', 'gateway'];

async function saveOperation(store, state, result, operator, at) {
  const previous = state.version;
  const entry = { ...result, at, actor: operator.id };
  state.audit = [entry, ...state.audit].slice(0, 100);
  state.version++;
  if (!await store.save(previous, state)) throw new HttpError(409, 'O painel mudou. Atualize e tente novamente.');
  return entry;
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
        const { page, session } = await body(request);
        if (!trackedPages.includes(page) || typeof session !== 'string' || !uuid.test(session)) {
          throw new HttpError(400, 'Evento de teste inválido.');
        }
        await store.recordTraffic({ page, session, day: at.slice(0, 10) });
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
      if (route === 'settings') return json(await store.read());
      const supported = ['traffic', 'overview', 'leads', 'sales', 'lead', 'order', 'export'];
      if (!supported.includes(route)) throw new HttpError(404, 'Rota indisponível.');
      if (route === 'order') {
        const order = (await store.read()).orders.find(entry => entry.id === url.searchParams.get('id'));
        if (!order) throw new HttpError(404, 'Pedido de teste indisponível.');
        return json({ order });
      }
      const orders = ['overview', 'sales', 'export'].includes(route) ? (await store.read()).orders : [];
      const data = reports(url.searchParams, now(), orders);
      if (route === 'traffic') {
        const since = data.daily[0].day;
        const visits = await store.readTraffic(since);
        return json({ rows: trackedPages.map(page => ({
          page,
          count: visits.filter(row => row.page === page).length,
        })), limit: visits.length >= 1000 });
      }
      if (route === 'overview') {
        const { leads, orders: transactions, ...overview } = data;
        return json(overview);
      }
      if (route === 'leads') return json(filterRows(data.leads, url.searchParams, leadFields));
      if (route === 'sales') return json(filterRows(data.orders, url.searchParams, saleFields));
      if (route === 'lead') {
        const lead = data.leads.find(row => row.id === url.searchParams.get('id'));
        if (!lead) throw new HttpError(404, 'Registro de teste indisponível no período.');
        return json({ lead, orders: data.orders.filter(order => order.sessionId === lead.id) });
      }
      if (route === 'export') {
        const sales = url.searchParams.get('kind') === 'sales';
        const fields = sales
          ? [['ID','id'], ['Sessão','sessionId'], ['Gateway','gateway'], ['Status','status'], ['Centavos','total'], ['Data','createdAt']]
          : [['Sessão','id'], ['Nome de teste','name'], ['Cidade','city'], ['Origem','origin'], ['Aparelho','device'], ['Data','createdAt']];
        const rows = matchingRows(sales ? data.orders : data.leads, url.searchParams, sales ? saleFields : leadFields);
        return new Response(csv(rows, fields), {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${sales ? 'vendas' : 'leads'}-teste.csv"`,
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
