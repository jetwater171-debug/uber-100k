import { randomUUID } from 'node:crypto';
import { HttpError } from './errors.mjs';
import { diagnosticModes } from './fixtures.mjs';

export const status = {
  awaiting: 'Aguardando PIX de teste',
  pending: 'Pendente no teste',
  paid: 'Pago no teste',
  canceled: 'Cancelado no teste',
};

export const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/iu;

export function demoCatalog(state) {
  return state.catalog.filter(item => item.active && (item.id === 'camera' || state.settings.offerExtras));
}

export function createDemoOrder(state, { session, requestId, items, quotedTotal }, at) {
  if (typeof session !== 'string' || !uuid.test(session) || typeof requestId !== 'string' || !uuid.test(requestId)) {
    throw new HttpError(400, 'Abra uma jornada de teste pelo painel.');
  }
  if (!Array.isArray(items) || !items.includes('camera') || items.length > state.catalog.length ||
      items.some(id => typeof id !== 'string') || new Set(items).size !== items.length) {
    throw new HttpError(400, 'A seleção deve incluir uma câmera e produtos válidos.');
  }
  const wanted = [...items].sort();
  const existing = state.orders.find(order => order.requestId === requestId);
  if (existing) {
    if (existing.sessionId !== session || existing.items.map(item => item.id).sort().join(',') !== wanted.join(',')) {
      throw new HttpError(409, 'Esta solicitação de teste já pertence a outra seleção.');
    }
    return { order: existing, created: false };
  }
  if (state.orders.length >= 100) throw new HttpError(409, 'O ambiente atingiu o limite de pedidos de teste.');
  const selection = demoCatalog(state).filter(item => items.includes(item.id));
  if (selection.length !== items.length) throw new HttpError(409, 'Um produto saiu do catálogo de teste.');
  const total = selection.reduce((amount, item) => amount + item.cents, 0);
  if (quotedTotal !== undefined && quotedTotal !== total) {
    throw new HttpError(409, 'O preço mudou. Confira o novo total antes de criar o pedido.');
  }
  const order = {
    id: `DEMO-${randomUUID()}`,
    sessionId: session,
    requestId,
    items: selection.map(({ id, name, cents }) => ({ id, name, cents })),
    total,
    gateway: '',
    status: status.awaiting,
    createdAt: at,
  };
  state.orders.unshift(order);
  return { order, created: true };
}

function enqueue(state, { id, channel, event, detail, at }) {
  if (state.queue.some(job => job.id === id)) return;
  if (state.queue.length >= 300) {
    const oldestClosed = state.queue.findLastIndex(job => job.status !== 'Aguardando teste');
    if (oldestClosed === -1) throw new HttpError(409, 'Processe os registros pendentes para liberar espaço na fila de teste.');
    const [retired] = state.queue.splice(oldestClosed, 1);
    if (retired.event === 'Remarketing') {
      const order = state.orders.find(entry => entry.id === retired.detail);
      if (order) order.reminderQueuedAt ||= retired.createdAt;
    }
  }
  state.queue.unshift({ id, channel, event, detail, status: 'Aguardando teste', attempts: 0, createdAt: at });
}

function configuredEvent(state, key, event, detail, at) {
  for (const [channel, configured] of Object.entries(state.settings.tracking)) {
    if (configured.includes(event)) enqueue(state, {
      id: `${key}/${channel}/${event}`, channel, event, detail, at,
    });
  }
}

export function queueNavigationEvents(state, { page, session, day, completedProfile }, at) {
  const recent = state.queue[0];
  configuredEvent(state, `${session}/${page}/${day}`, 'PageView', page, at);
  if (page === 'oferta') configuredEvent(state, `${session}/${day}`, 'ViewContent', page, at);
  if (page === 'questionario' && completedProfile === true) configuredEvent(state, session, 'Lead', 'Cadastro concluído', at);
  return state.queue[0] !== recent;
}

function findOrder(state, id) {
  const order = state.orders.find(entry => entry.id === id);
  if (!order) throw new HttpError(404, 'Pedido de teste indisponível.');
  return order;
}

export function paymentForOrder(state, id, preferred, at) {
  const order = findOrder(state, id);
  if (order.status === status.paid || order.status === status.canceled) {
    throw new HttpError(409, 'O pedido de teste já foi encerrado.');
  }
  if (order.status === status.pending) {
    if (preferred && order.gateway !== preferred) throw new HttpError(409, 'O pedido já tem um PIX no gateway selecionado anteriormente.');
    return { title: 'PIX de teste já gerado', detail: order.gateway, code: order.payment.code, status: 'Simulado · sem cobrança' };
  }
  const gateway = state.settings.gateways.find(entry => entry.enabled && (!preferred || preferred === entry.name));
  if (!gateway) throw new HttpError(409, 'Ative um gateway de teste para continuar.');
  order.gateway = gateway.name;
  order.status = status.pending;
  order.payment = { code: `SIMULACAO-${randomUUID()}`, createdAt: at };
  configuredEvent(state, order.id, 'InitiateCheckout', order.id, at);
  return { title: 'PIX de teste gerado', detail: order.gateway, code: order.payment.code, status: 'Simulado · sem cobrança' };
}

export function reconcileOrder(state, id, outcome, at) {
  const order = findOrder(state, id);
  if (!['confirm', 'cancel'].includes(outcome)) throw new HttpError(400, 'Resultado de teste inválido.');
  const next = outcome === 'confirm' ? status.paid : status.canceled;
  if (order.status === next) return { title: 'Pedido já reconciliado', detail: order.id, status: next };
  if (order.status !== status.pending) throw new HttpError(409, 'Somente um PIX pendente pode ser reconciliado.');
  order.status = next;
  order.resolvedAt = at;
  const reminder = state.queue.find(job => job.id === `${order.id}/SMSMais/Remarketing`);
  if (reminder?.status === 'Aguardando teste') {
    reminder.status = 'Cancelado no teste';
    reminder.processedAt = at;
  }
  if (next === status.paid) configuredEvent(state, order.id, 'Purchase', order.id, at);
  return { title: 'Pedido de teste reconciliado', detail: order.id, status: next };
}

export function queueTest(state, channel, at, mode) {
  if (mode !== undefined && !diagnosticModes[channel]?.includes(mode)) {
    throw new HttpError(400, 'Escolha um diagnóstico disponível para este canal.');
  }
  enqueue(state, { id: randomUUID(), channel, event: mode || 'Diagnóstico', detail: 'Teste de integração', at });
  return { title: 'Teste enfileirado', detail: channel, status: 'Simulação' };
}

function addReminder(state, id, at) {
  const order = findOrder(state, id);
  if (order.status !== status.pending) throw new HttpError(409, 'Somente pedidos de teste pendentes entram no remarketing.');
  if (order.reminderQueuedAt) return false;
  const key = `${id}/SMSMais/Remarketing`;
  const existing = state.queue.find(job => job.id === key);
  if (!existing) enqueue(state, { id: key, channel: 'SMSMais', event: 'Remarketing', detail: id, at });
  order.reminderQueuedAt = existing?.createdAt || at;
  return !existing;
}

export function queueReminder(state, id, at) {
  addReminder(state, id, at);
  return { title: 'Lembrete de teste registrado', detail: id, status: 'Simulação' };
}

export function queueReminders(state, ids, at) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => typeof id !== 'string')) {
    throw new HttpError(400, 'Selecione de 1 a 20 pedidos pendentes.');
  }
  let queued = 0;
  for (const id of new Set(ids)) if (addReminder(state, id, at)) queued++;
  return {
    title: 'Lembretes de teste em lote',
    detail: queued === 1 ? '1 lembrete novo' : `${queued} lembretes novos`,
    status: 'Simulação',
  };
}

export const queueGroups = {
  utmfy: ['UTMfy', 'Pushcut'],
  sms: ['SMSMais'],
};

export function processQueue(state, at, scope) {
  const group = queueGroups[scope];
  const batch = state.queue.filter(entry => entry.status === 'Aguardando teste' && (!group || group.includes(entry.channel))).slice(-20);
  for (const job of batch) {
    job.status = 'Processado no teste';
    job.attempts++;
    job.processedAt = at;
  }
  return { title: 'Fila de teste processada', detail: `${batch.length} registros`, status: 'Simulação · sem envio externo' };
}
