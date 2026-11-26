import { gateways } from './fixtures.mjs';
import { status } from './operations.mjs';
import { HttpError } from './errors.mjs';

function normalized(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

const dayMs = 86400000;
function utcDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value || '')) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

export function reportPeriod(params, now) {
  if (params.get('from') || params.get('to')) {
    const start = utcDay(params.get('from'));
    const end = utcDay(params.get('to'));
    const days = (end - start) / dayMs + 1;
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new HttpError(400, 'Informe um intervalo de até 90 dias.');
    return { days, start };
  }
  const today = Math.floor(now / dayMs) * dayMs;
  const month = new Date(today).getUTCDate();
  const startByPreset = {
    all: 0, today, yesterday: today - dayMs, month: today - (month - 1) * dayMs,
  };
  const preset = params.get('days');
  if (Object.hasOwn(startByPreset, preset)) {
    const start = startByPreset[preset];
    return { days: preset === 'yesterday' ? 1 : (today - start) / dayMs + 1, start };
  }
  const days = [7, 14, 30].includes(Number(params.get('days'))) ? Number(params.get('days')) : 7;
  return { days, start: today - (days - 1) * dayMs };
}

export function reports(params, now = Date.now(), journeyOrders = []) {
  const { days, start } = reportPeriod(params, now);
  const since = new Date(start).toISOString().slice(0, 10);
  const until = new Date(start + (days - 1) * dayMs).toISOString().slice(0, 10);
  const orders = journeyOrders.filter(order => {
    const day = order.createdAt.slice(0, 10);
    return day >= since && day <= until;
  });
  const confirmed = orders.filter(order => order.status === status.paid);
  return {
    days,
    since,
    until,
    counts: {
      testOrders: orders.length,
      testPaid: confirmed.length,
      testRevenue: confirmed.reduce((total, order) => total + order.total, 0),
    },
    journeyGatewaySales: gateways.map(name => {
      const submitted = orders.filter(order => order.gateway === name);
      const paid = confirmed.filter(order => order.gateway === name);
      return {
        name,
        orders: submitted.length,
        paid: paid.length,
        revenue: paid.reduce((total, order) => total + order.total, 0),
      };
    }),
    orders,
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
    return fields.some(field => {
      const value = field.split('.').reduce((entry, key) => entry?.[key], row);
      return (Array.isArray(value) ? value : [value]).some(item => normalized(String(item || '')).includes(search));
    });
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
  const perPage = 12;
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, Math.max(1, Math.ceil(match.length / perPage))) : 1;
  return { items: match.slice((page - 1) * perPage, page * perPage), total: match.length, perPage, page };
}

export function csv(rows, columns) {
  const cell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r\n]/u, match => "'" + match).replaceAll('"', '""') + '"';
  return '\uFEFF' + [columns.map(([label]) => cell(label)).join(';'),
    ...rows.map(row => columns.map(([, field]) => cell(row[field])).join(';'))].join('\r\n');
}
