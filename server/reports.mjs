import { demoData, gateways, stages } from './fixtures.mjs';
import { status } from './operations.mjs';

function counts(rows, field) {
  const totals = new Map();
  for (const row of rows) totals.set(row[field], (totals.get(row[field]) || 0) + 1);
  return Array.from(totals, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function normalized(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function reports(params, now = Date.now(), journeyOrders = []) {
  const { sessions, orders } = demoData(now);
  const days = [7, 14, 30].includes(Number(params.get('days'))) ? Number(params.get('days')) : 7;
  const cutoff = now - days * 86400000;
  const visits = sessions.filter(row => Date.parse(row.createdAt) > cutoff);
  const transactions = orders.filter(row => Date.parse(row.createdAt) > cutoff);
  const paid = transactions.filter(order => order.status === status.paid);
  const realTests = journeyOrders.filter(order => Date.parse(order.createdAt) > cutoff);
  const journeyPaid = realTests.filter(order => order.status === status.paid);
  const paidSessions = new Set(paid.map(order => order.sessionId));
  const paidAudience = visits.filter(session => paidSessions.has(session.id));
  const steps = stages.map(name => ({ name, count: visits.filter(row => row.steps.includes(name)).length }));
  const funnel = steps.map((step, index) => ({
    ...step,
    departures: step.count - (steps[index + 1]?.count ?? step.count),
  }));
  const daily = Array.from({ length: days }, (_, index) => ({
    day: new Date(now - (days - index - 1) * 86400000).toISOString().slice(0, 10),
    visits: 0,
    sales: 0,
  }));
  const dailyRows = new Map(daily.map(row => [row.day, row]));
  for (const row of visits) {
    const day = dailyRows.get(row.createdAt.slice(0, 10));
    if (day) day.visits++;
  }
  for (const row of paid) {
    const day = dailyRows.get(row.createdAt.slice(0, 10));
    if (day) day.sales++;
  }

  return {
    days,
    counts: {
      visits: visits.length,
      leads: funnel[1].count,
      orders: transactions.length,
      paid: paid.length,
      revenue: paid.reduce((total, order) => total + order.total, 0),
      testOrders: realTests.length,
      testPaid: journeyPaid.length,
      testRevenue: journeyPaid.reduce((total, order) => total + order.total, 0),
    },
    daily,
    funnel,
    audience: {
      city: counts(paidAudience, 'city'),
      origin: counts(paidAudience, 'origin'),
      device: counts(paidAudience, 'device'),
      placement: counts(paidAudience, 'placement'),
    },
    gatewaySales: gateways.map(name => {
      const gatewayOrders = transactions.filter(row => row.gateway === name);
      const confirmed = gatewayOrders.filter(row => row.status === status.paid);
      return { name, orders: gatewayOrders.length, paid: confirmed.length,
        revenue: confirmed.reduce((sum, row) => sum + row.total, 0) };
    }),
    journeyGatewaySales: gateways.map(name => {
      const submitted = realTests.filter(order => order.gateway === name);
      const confirmed = journeyPaid.filter(order => order.gateway === name);
      return {
        name,
        orders: submitted.length,
        paid: confirmed.length,
        revenue: confirmed.reduce((total, order) => total + order.total, 0),
      };
    }),
    leads: visits.filter(row => row.steps.includes('Cadastro')),
    orders: [...realTests, ...transactions],
  };
}

export function matchingRows(rows, params, fields) {
  const search = normalized((params.get('q') || '').trim().slice(0, 100));
  return rows.filter(row => {
    const status = params.get('status');
    const gateway = params.get('gateway');
    const source = params.get('source');
    if (status && row.status !== status) return false;
    if (gateway && row.gateway !== gateway) return false;
    if (source === 'tracked' && !row.items && row.source !== 'tracked') return false;
    if (source === 'sample' && (row.items || row.source === 'tracked')) return false;
    return fields.some(field => normalized(String(row[field] || '')).includes(search));
  });
}

export function salesAudit(rows) {
  const states = Object.values(status).map(name => ({ name, orders: 0, cents: 0 }));
  const byStatus = new Map(states.map(row => [row.name, row]));
  for (const order of rows) {
    const row = byStatus.get(order.status);
    if (row) {
      row.orders++;
      row.cents += order.total;
    }
  }
  return states;
}

export function filterRows(rows, params, fields) {
  const match = matchingRows(rows, params, fields);
  const requestedPage = Number(params.get('page'));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100) : 1;
  const perPage = 12;
  return { items: match.slice((page - 1) * perPage, page * perPage), total: match.length, perPage, page };
}

export function csv(rows, columns) {
  const cell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r\n]/u, match => "'" + match).replaceAll('"', '""') + '"';
  return '\uFEFF' + [columns.map(([label]) => cell(label)).join(';'),
    ...rows.map(row => columns.map(([, field]) => cell(row[field])).join(';'))].join('\r\n');
}
