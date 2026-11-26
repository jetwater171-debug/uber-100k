import { gatewayTemplate, populateGateways, setGatewayCardOpen } from './gateways.js?v=1';
import { leadDetails } from './lead-details.js?v=4';

const navigation = document.querySelector('#navigation');
const login = document.querySelector('#login');
const loginForm = document.querySelector('#login-form');
const feedback = document.querySelector('#feedback');
const view = document.querySelector('#view');
const details = document.querySelector('#details');
const saveSettings = document.querySelector('#save-settings');
const groups = [
  ['', ['overview', 'Visão geral'], ['tracking', 'Tracking'], ['utmfy', 'UTMfy'], ['sms', 'SMSMais'],
    ['gateways', 'Gateways'], ['pages', 'Páginas'], ['audience', 'Público'], ['sales', 'Vendas'],
    ['navigation', 'Saídas e retornos'], ['leads', 'Leads'], ['domains', 'Domínios']],
  ['Operação de teste', ['catalog', 'Catálogo'], ['queue', 'Fila de testes'], ['activity', 'Eventos da jornada'], ['security', 'Auditoria e segurança']],
];
const sectionNames = Object.fromEntries(groups.flatMap(([, ...links]) => links));
const sectionPaths = {
  overview: '/admin', tracking: '/admin/tracking', utmfy: '/admin/utmfy', sms: '/admin/smsmais',
  gateways: '/admin/gateways', pages: '/admin/pages', audience: '/admin/publico', sales: '/admin/vendas',
  navigation: '/admin/backredirects', leads: '/admin/leads', domains: '/admin/dominios',
  catalog: '/admin/catalogo', queue: '/admin/fila', activity: '/admin/eventos', security: '/admin/auditoria',
};
const sectionsByPath = Object.fromEntries(Object.entries(sectionPaths).map(([id, path]) => [path, id]));
const eventTypes = ['PageView', 'ViewContent', 'Lead', 'InitiateCheckout', 'Purchase'];
const orderStatuses = ['Aguardando PIX de teste', 'Pendente no teste', 'Pago no teste', 'Cancelado no teste'];
const trackedLabels = {
  inicio: 'Página inicial', oferta: 'Sobre a oferta', cadastro: 'Cadastro',
  questionario: 'Questionário', regiao: 'Disponibilidade por região', analise: 'Análise e ofertas',
};
const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const integer = new Intl.NumberFormat('pt-BR');
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const contexts = { days: 'all', from: '', to: '', q: '', page: 1, gateway: '', status: '' };
const dashboardControls = [
  ['compareGateways', 'Comparar gateways'],
  ['offerExtras', 'Exibir acessórios no catálogo de teste'],
];
const pendingSettings = {};
const pendingTracking = {};
const gatewaySettings = document.querySelector('#gateway-settings');
const testGateways = document.querySelector('#test-gateways');
const expandedGateways = new Set();
let gatewayDraft;
let gatewayMarkup;
let gatewayReport;
let operator;
let localMode = false;
let state;
let sequence = 0;
let liveRefresh = false;
let refreshTimer;
let updatesInFlight = 0;

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, mark => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[mark]
  ));
}

const money = cents => moneyFormat.format(cents / 100);
const checked = value => value ? ' checked' : '';
const selected = value => value ? ' selected' : '';
const section = () => {
  const name = location.hash.slice(1).split('/')[0];
  return Object.hasOwn(sectionNames, name) ? name : sectionsByPath[location.pathname] || 'overview';
};
const params = (fields = {}) => new URLSearchParams({ ...contexts, ...fields });

async function api(route, options, filters = {}) {
  const query = params({ ...filters, route });
  const response = await fetch(`/api/admin?${query}`, options && {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'O painel ficou indisponível.');
  return data;
}

const leadDialog = leadDetails({ request: (route, query) => api(route, undefined, query), openOrder: showOrder,
  escape, money, date, table, period: () => ({ days: contexts.days, from: contexts.from, to: contexts.to }) });

function openLinkedLead() {
  const match = location.hash.match(/^#leads\/([A-Za-z\d-]{1,100})$/u);
  if (operator && match) void leadDialog.open(match[1]);
}

function updateSettingsButton() {
  const active = section();
  const tracking = ['tracking', 'utmfy', 'sms'].includes(active);
  const gateways = active === 'gateways';
  testGateways.hidden = !operator || !gateways;
  saveSettings.hidden = !operator || !(tracking || gateways || active === 'overview');
  saveSettings.setAttribute('form', gateways ? 'gateway-settings' : tracking ? 'tracking-settings' : 'dashboard-settings');
  const dirty = gateways ? Boolean(gatewayDraft) : Object.keys(tracking ? pendingTracking : pendingSettings).length > 0;
  saveSettings.disabled = !dirty || updatesInFlight > 0;
}

function notice(message, error = false) {
  feedback.hidden = !message;
  feedback.textContent = message || '';
  feedback.dataset.error = String(error);
}

function account(user) {
  operator = user;
  login.hidden = Boolean(user);
  view.hidden = !user;
  navigation.hidden = !user;
  document.querySelector('#operator').hidden = !user;
  document.querySelector('#logout').hidden = !user;
  if (!user) {
    view.replaceChildren();
    leadDialog.close();
    gatewayDraft = undefined;
    gatewayReport = undefined;
    expandedGateways.clear();
    for (const key of Object.keys(pendingSettings)) delete pendingSettings[key];
    for (const key of Object.keys(pendingTracking)) delete pendingTracking[key];
  }
  updateSettingsButton();
  scheduleRefresh();
}

function nav(active) {
  navigation.innerHTML = groups.map(([group, ...links]) => {
    const items = links.map(([id, label]) => `<a class="admin-nav-item" href="${sectionPaths[id]}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    return group ? `<details class="admin-extra-nav"${links.some(([id]) => id === active) ? ' open' : ''}>
      <summary>${group}</summary><div>${items}</div></details>` : items;
  }).join('');
}

function title(name, copy) {
  return `<div class="view-header"><div><h2 class="section-heading">${escape(name)}</h2>
    <p class="muted">${escape(copy)}</p></div>`;
}

const periodOptions = [
  ['all', 'Todo período'], ['today', 'Hoje'], ['yesterday', 'Ontem'], ['7', 'Últimos 7 dias'],
  ['14', 'Últimos 14 dias'], ['30', 'Últimos 30 dias'], ['month', 'Este mês'], ['custom', 'Personalizado'],
];

function range() {
  const value = contexts.from ? 'custom' : String(contexts.days);
  return `<label>Período <select id="period">${periodOptions.filter(([key]) => key !== 'custom' || ['overview', 'sales', 'audience'].includes(section()) || value === key)
    .map(([key, label]) => `<option value="${key}"${selected(key === value)}>${label}</option>`).join('')}</select></label>`;
}

function liveControls() {
  return `<div class="controls">${range()}<button class="button secondary" type="button"
    id="live-refresh" title="Atualiza a cada 30 segundos" aria-pressed="${liveRefresh}">Atualização automática</button></div>`;
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  if (!operator || !liveRefresh || document.hidden || !['overview', 'pages'].includes(section())) return;
  refreshTimer = setInterval(() => {
    if (!updatesInFlight && !view.hasAttribute('aria-busy') && !document.activeElement?.matches('input, select, textarea')) {
      void render();
    }
  }, 30000);
}

function panel(name, body, badge = '') {
  return `<section class="panel"><div class="panel-head"><h2>${escape(name)}</h2>${badge ? `<span class="badge">${escape(badge)}</span>` : ''}</div>${body}</section>`;
}

function table(headers, rows, leads) {
  if (!rows.length) return '<p class="empty">Nenhum registro para estes filtros.</p>';
  return `<div class="scroller${leads ? ' lead-table' : ''}"><table><thead><tr>` +
    headers.map(header => `<th scope="col">${escape(header)}</th>`).join('') +
    '</tr></thead><tbody>' + rows.map((row, index) => `<tr${leads ? ` data-lead-row="${escape(leads[index].id)}"` : ''}>` + row.map(cell => `<td>${cell}</td>`).join('') +
      '</tr>').join('') + '</tbody></table></div>';
}

function bars(items) {
  const max = Math.max(1, ...items.map(item => item.count));
  return items.length ? items.map(item => `<div class="bar"><span>${escape(item.name)}</span>
    <meter aria-label="${escape(item.name)}" value="${item.count}" max="${max}"></meter>
    <strong>${integer.format(item.count)}</strong></div>`).join('') : '<p class="empty">Sem registros no período.</p>';
}

function auditTable(records) {
  return table(['Quando', 'Atividade', 'Detalhe', 'Resultado'], records.map(record =>
    [date.format(new Date(record.at)), escape(record.title), escape(record.detail), escape(record.status || 'Registrado')]));
}

function dashboard(data, traffic) {
  const { funnel, counts, lastActivity, since, until, journeyGatewaySales } = data;
  const gateway = state.settings.gateways.find(item => item.enabled);
  const ratio = (value, base = traffic.sessions) => base ? Math.round(value / base * 100) : 0;
  const periodLabel = contexts.from ? `${displayDay(since)} a ${displayDay(until)}`
    : periodOptions.find(([key]) => key === String(contexts.days))?.[1];
  const steps = [
    ['CEP encontrado', funnel.postal, 'Região consultada'],
    ['Seleção aberta', funnel.selection, 'Resumo de produtos'],
    ['PIX confirmado em teste', counts.testPaid, 'Pedidos de teste'],
  ];
  const kpi = (title, value, description, accent = false) => `
    <div class="admin-kpi${accent ? ' admin-kpi--accent' : ''}">
      <span>${title}</span><strong>${value}</strong><em>${description}</em>
    </div>`;
  const gateways = journeyGatewaySales.filter(row => row.orders);
  const best = gateways.toSorted((a, b) => ratio(b.paid, b.orders) - ratio(a.paid, a.orders))[0];
  return `<div class="admin-section-header overview-heading">
      <h1>Visão geral</h1><span class="badge">Base: ${integer.format(traffic.sessions)}</span>
    </div>
    <div class="admin-hero">
      <div><h3>Monitoramento ao vivo</h3>
        <p>Compare o funil por etapa e acompanhe as sessões registradas no site.</p>
        <div class="admin-hero-tags">
          <span class="admin-tag">Última atividade: <strong>${lastActivity ? date.format(new Date(lastActivity)) : '—'}</strong></span>
          <span class="admin-tag">Gateway ativo: <strong>${escape(gateway?.name || '—')}</strong></span>
          <span class="admin-tag">Melhor conversão: <strong>${best ? escape(best.name) + ' · ' + ratio(best.paid, best.orders) + '%' : '—'}</strong></span>
          <span class="admin-tag">Fonte: ${localMode ? 'Servidor local' : 'Supabase'}</span>
        </div>
      </div>
      <div class="admin-hero-highlight"><span>Sessões registradas</span><strong>${integer.format(traffic.sessions)}</strong><em>No período</em></div>
    </div>
    ${dateToolbar()}
    <div class="overview-period"><p class="muted">Período: ${escape(periodLabel)}${traffic.limit ? ' · últimos 1.000 registros' : ''}</p>
      <button type="button" class="button secondary" id="live-refresh" aria-pressed="${liveRefresh}">Atualização automática</button></div>
    <div class="admin-kpi-grid">
      ${steps.toReversed().map(([label, count, description]) => kpi(label, integer.format(count), description)).join('')}
      ${[
        ['Conversão PIX', funnel.paid, 'Sessões com PIX de teste confirmado'],
        ['Conversão da seleção', funnel.selection, 'Sessões que abriram o resumo'],
        ['Conversão do CEP', funnel.postal, 'Sessões que encontraram a região'],
      ].map(([label, count, description]) => kpi(label, ratio(count) + '%', description, true)).join('')}
    </div>
    <div class="admin-funnel">
      ${[steps[0], steps[1], [steps[2][0], funnel.paid]].map(([label, count]) => `
        <div class="admin-funnel-row"><span>${label}</span><meter aria-label="${label}" min="0" max="${Math.max(traffic.sessions, count, 1)}" value="${count}"></meter>
          <strong>${ratio(count)}%</strong></div>`).join('')}
    </div>
    <section class="admin-native-funnel">
      <div class="admin-native-funnel-head"><h2>Funil de conversão</h2><span class="badge">Base: ${integer.format(traffic.sessions)}</span></div>
      <p>Sessões únicas que passaram por cada página.</p>
      <div class="admin-native-funnel-track">
        ${traffic.sessionsByPage.map(row => `<div class="admin-native-stage">
          <span>${trackedLabels[row.page]}</span><strong>${integer.format(row.count)}</strong>
          <meter aria-label="${trackedLabels[row.page]}" min="0" max="${Math.max(1, traffic.sessions)}" value="${row.count}"></meter>
          <span>${ratio(row.count)}% das sessões</span>
        </div>`).join('')}
      </div>
    </section>
    <div class="stack dashboard-controls">
      ${panel('Conversão por gateway', table(['Gateway', 'PIX de teste', 'Confirmados', 'Conversão', 'Valor confirmado'], journeyGatewaySales.map(row => [
        escape(row.name), integer.format(row.orders), integer.format(row.paid), ratio(row.paid, row.orders) + '%', money(row.revenue),
      ])))}
      ${panel('Controle do funil', '<form id="dashboard-settings">' + dashboardControls.map(([id, label]) =>
        `<label class="control-row checkbox"><span>${label}</span><input type="checkbox" data-dashboard-setting="${id}"${checked(pendingSettings[id] ?? state.settings[id])}></label>`).join('') + '</form>')}
      ${panel('Gateways PIX', '<a class="button secondary" href="#gateways">Configurar gateways</a>')}
      ${panel('Visitas por dia', bars(traffic.daily.map(({ day, count }) => ({ name: displayDay(day), count }))))}
    </div>`;
}

function displayDay(day) {
  return day?.split('-').reverse().join('/') || '—';
}

function dateToolbar() {
  return `<form id="date-filter" class="overview-range">
    ${range()}
    <label>De <input type="date" name="from" value="${escape(contexts.from)}"></label>
    <label>Até <input type="date" name="to" value="${escape(contexts.to)}"></label>
    <button type="submit" class="button secondary">Aplicar</button>
    <button type="button" class="button secondary" id="clear-dates">Limpar</button>
  </form>`;
}

function metrics(cards) {
  return '<div class="admin-kpi-grid report-metrics">' + cards.map(([label, value, info]) => `
    <div class="admin-kpi"><span>${escape(label)}</span><strong>${escape(value)}</strong>
      <em>${escape(info)}</em></div>`).join('') + '</div>';
}

function pageCards(items) {
  return '<div class="admin-pages-grid">' + items.map(({ name, count, detail }) =>
    `<article class="admin-page-card"><h3>${escape(name)}</h3><strong>${integer.format(count)}</strong><span>${escape(detail)}</span></article>`).join('') + '</div>';
}

function pagesView(traffic) {
  const counts = traffic.sessionsByPage;
  const leader = counts.toSorted((first, next) => next.count - first.count).find(row => row.count);
  const final = counts.at(-1).count;
  return panel('Insights do funil', '<p class="muted report-caption">Compare o alcance de cada etapa da jornada.</p>' +
    metrics([['Sessões', traffic.sessions, 'Visitantes no período'], ['Pageviews', traffic.pageViews, 'Páginas registradas'],
      ['Etapa com mais sessões', leader ? trackedLabels[leader.page] : '—', 'Maior alcance'],
      ['Análise e ofertas', final, 'Sessões na última página']]), 'Diagnóstico') +
    panel('Páginas e fluxo', pageCards(traffic.rows.map((row, index) =>
      ({ name: trackedLabels[row.page], count: row.count, detail: integer.format(counts[index].count) + ' sessões únicas' }))) +
      `<div class="controls report-actions">${liveControls()}<button type="button" id="refresh-tracking" class="button secondary">Atualizar</button>
      <a href="/?analytics=demo" target="_blank" rel="noopener" class="button secondary">Abrir jornada de teste</a></div>`, 'Pageviews');
}

function audienceView(traffic, data) {
  const top = traffic.furthestPages.toSorted((a, b) => b.count - a.count).find(row => row.count);
  return panel('Radar de público', `<div class="admin-hero">
    <div><h3>Público da campanha</h3><p>Confira onde as sessões chegam no funil e exporte o ranking por etapa.</p>
      <div class="admin-hero-tags"><span class="admin-tag">Etapa mais frequente: ${top ? escape(trackedLabels[top.page]) : '—'}</span>
      <span class="admin-tag">${integer.format(traffic.pageViews)} visitas registradas</span></div>
      <div class="report-actions"><button id="refresh-tracking" class="button secondary" type="button">Atualizar público</button></div>
    </div><div class="admin-hero-highlight"><span>Sessões registradas</span><strong>${integer.format(traffic.sessions)}</strong><em>${data.counts.testPaid} PIX confirmados em teste</em></div>
    </div>` + dateToolbar(), 'Sessões') +
    panel('Exportar público', `<a class="button secondary" href="/api/admin?${escape(params({ route: 'export', kind: 'audience' }))}">Exportar público CSV</a>`) +
    panel('Ranking detalhado', '<div class="columns">' +
      panel('Sessões por etapa', bars(traffic.sessionsByPage.map(row => ({ ...row, name: trackedLabels[row.page] })))) +
      panel('Etapa mais avançada', bars(traffic.furthestPages.map(row => ({ ...row, name: trackedLabels[row.page] })))) + '</div>');
}

function navigationView(traffic, journey) {
  const returns = new Map(journey.returns.map(row => [row.name, row.count]));
  const names = { ...trackedLabels, inicio: 'Início', regiao: 'Disponibilidade por região' };
  const records = traffic.rows.map(row => ({ name: names[row.page], count: returns.get(names[row.page]) || 0, visits: row.count }));
  const top = records.toSorted((first, next) => next.count - first.count).find(row => row.count);
  const percent = record => record?.visits ? (record.count * 100 / record.visits).toFixed(1).replace('.', ',') + '%' : '—';
  return panel('Resumo rápido', metrics([
    ['Retornos', records.reduce((sum, item) => sum + item.count, 0), 'Por sessão e página'],
    ['Página com mais retornos', top?.name || '—', 'Maior volume no período'],
    ['Taxa de retorno dessa página', percent(top), 'Retornos / pageviews'],
  ]) + range(), 'Navegação') +
    panel('Top etapas', bars(journey.returns), 'Ranking') +
    panel('Detalhe por página', pageCards(records.map(row => ({ ...row, detail: percent(row) + ' de retorno' }))), 'Retornos');
}

function salesOverview(data) {
  const leading = data.journeyGatewaySales.toSorted((a, b) => b.revenue - a.revenue).find(row => row.paid);
  const cards = data.journeyGatewaySales.map(row => `<button type="button" class="gateway-sales-card${row.name === contexts.gateway ? ' is-active' : ''}"
    data-sales-gateway="${escape(row.name)}" aria-pressed="${row.name === contexts.gateway}">
    <div class="gateway-sales-card__top"><strong>${escape(row.name)}</strong></div>
    <span class="gateway-sales-card__value">${money(row.revenue)}</span>
    <div class="gateway-sales-card__meta"><span>${integer.format(row.paid)} confirmados</span><span>${integer.format(row.orders)} PIX</span></div>
  </button>`);
  return panel('Resumo bruto', `<div class="admin-hero"><div><h3>Auditoria de faturamento</h3>
    <p>Consulte os valores dos pedidos confirmados no ambiente de teste.</p>
    <div class="admin-hero-tags"><span class="admin-tag">Gateway líder: ${escape(leading?.name || '—')}</span>
    <span class="admin-tag">Filtro atual: ${escape(contexts.gateway || 'Todos')}</span></div></div>
    <div class="admin-hero-highlight"><span>Confirmado em teste</span><strong>${money(data.counts.testRevenue)}</strong>
      <em>${integer.format(data.counts.testPaid)} pagamentos simulados</em></div></div>` + dateToolbar() +
    `<div class="gateway-sales-grid">${cards.join('')}</div>`, `Base: ${integer.format(data.counts.testOrders)} pedidos`);
}

function pagination(result) {
  const total = Math.max(1, Math.ceil(result.total / result.perPage));
  return `<div class="paginate"><span>${result.total} registros · página ${result.page} de ${total}</span>
    <div class="controls"><button class="button secondary" type="button" data-page="${result.page - 1}"${result.page <= 1 ? ' disabled' : ''}>Anterior</button>
    <button class="button secondary" type="button" data-page="${result.page + 1}"${result.page >= total ? ' disabled' : ''}>Próxima</button></div></div>`;
}

function listView(kind, data) {
  const sales = kind === 'sales';
  const listTitle = sales ? 'Vendas do gateway' : 'Leads';
  const filters = `<label>Gateway <select name="gateway"><option value="">Todos</option>${state.settings.gateways.map(({ name }) =>
    `<option${selected(name === contexts.gateway)}>${escape(name)}</option>`).join('')}</select></label>
    <label>Estado <select name="status"><option value="">Todos</option>${orderStatuses.map(status =>
      `<option${selected(status === contexts.status)}>${status}</option>`).join('')}</select></label>`;
  const columns = sales ? ['Pedido', 'Origem', 'Gateway', 'Valor', 'Estado', ''] :
    ['Lead', 'Origem', 'Oferta', 'Jornada', 'Pagamentos', 'Valor', 'Atualizado'];
  const rows = data.items.map(row => sales
    ? [escape(row.id), 'Jornada acompanhada', escape(row.gateway || '—'), money(row.total),
      escape(row.status), `<button type="button" class="button secondary" data-order="${escape(row.id)}">Ver pedido</button>`]
    : [`<button type="button" class="lead-link" data-lead="${escape(row.id)}">${escape(row.name)}</button>`, escape(row.origin),
      row.orderId ? 'Pedido de teste' : '—', escape(row.steps.at(-1)),
      escape([row.status, row.gateway].filter(Boolean).join(' · ') || '—'),
      row.total === undefined ? '—' : money(row.total), row.updatedAt ? date.format(new Date(row.updatedAt)) : displayDay(row.updatedOn)]);
  const summary = sales && data.audit ? panel('Auditoria de faturamento simulado', table(['Estado', 'Pedidos', 'Valor total'],
    data.audit.map(row => [escape(row.name), integer.format(row.orders), money(row.cents)]))) : '';
  return (sales ? salesOverview(data) : '') + '<div class="stack">' +
    panel(listTitle, `<form id="filters" class="controls admin-toolbar">
      ${sales ? '' : range()}
      <label>Buscar<input name="q" value="${escape(contexts.q)}" maxlength="100" placeholder="${sales ? 'Pedido ou sessão' : 'Sessão ou ID do pedido'}"></label>${filters}
      <button class="button secondary" type="submit">Filtrar</button>
      <a class="button secondary" href="/api/admin?${escape(params({ route: 'export', kind }))}">Exportar CSV</a>
      ${sales ? '' : '<button class="button secondary" type="button" id="refresh-leads">Atualizar</button><button class="button secondary" type="button" id="lookup-leads">Consultar transações</button>'}
      </form><div class="admin-table-wrap">` + table(columns, rows, sales ? undefined : data.items) + '</div>' + pagination(data),
      data.limited ? 'Últimos 1.000 eventos acompanhados' : integer.format(data.total)) + summary + '</div>';
}

function updateGatewayView(focus) {
  view.innerHTML = gatewayMarkup;
  populateGateways(view, { ...gatewayReport, gateways: gatewayDraft ?? state.settings.gateways, expanded: expandedGateways });
  if (focus) {
    const row = [...view.querySelectorAll('[data-gateway-order-item]')].find(item => item.dataset.gatewayOrderItem === focus.name);
    const move = row?.querySelector(`[data-gateway-order-move="${focus.direction}"]:enabled`) || row?.querySelector('.gateway-order-move:enabled');
    move?.focus({ preventScroll: true });
  }
  updateSettingsButton();
}

function applyGatewayDraft(items, focus) {
  gatewayDraft = JSON.stringify(items) === JSON.stringify(state.settings.gateways) ? undefined : items;
  updateGatewayView(focus);
}

function moveGateway(name, targetIndex, direction) {
  const items = [...(gatewayDraft ?? state.settings.gateways)];
  const from = items.findIndex(entry => entry.name === name);
  if (from < 0 || targetIndex < 0 || targetIndex >= items.length || from === targetIndex) return;
  items.splice(targetIndex, 0, ...items.splice(from, 1));
  applyGatewayDraft(items, direction && { name, direction });
}

function catalogView() {
  const items = state.settings.offerExtras ? state.catalog : state.catalog.filter(item => item.id === 'camera');
  return title('Catálogo', 'Edite valores e disponibilidade do catálogo de teste.') + '</div>' +
    panel('Produtos', items.map(item => `<form class="control-row catalog-form" data-product="${escape(item.id)}">
      <strong>${escape(item.name)}</strong><label>Preço em reais <input name="amount" type="number" step=".01" min="1" max="10000" value="${(item.cents / 100).toFixed(2)}" required></label>
      <label class="checkbox"><input type="checkbox" name="active"${checked(item.active)}>Disponível</label>
      <button type="submit" class="button secondary">Salvar</button></form>`).join(''));
}

function channelSettings(channel) {
  return `<div class="checks">${eventTypes.map(event =>
    `<label><input type="checkbox" form="tracking-settings" data-pixel-event="${event}" data-key="${channel}"${checked((pendingTracking[channel] ?? state.settings.tracking[channel]).includes(event))}>${event}</label>`).join('')}</div>`;
}

function diagnosticButtons(channel, scenarios) {
  return `<form class="controls diagnostic-form" data-channel="${channel}">${scenarios.map(([mode, label]) =>
    `<button type="submit" name="mode" value="${escape(mode)}" class="button secondary">${escape(label)}</button>`).join('')}</form>`;
}

function pixelSettings() {
  const platforms = ['Meta', 'TikTok'];
  const settings = platforms.map(channel => panel(`Pixel do ${channel}`, channelSettings(channel), 'Simulação'));
  const tests = platforms.map(channel => `<form class="controls diagnostic-form" data-channel="${channel}">
    <label>Cenário do ${channel}<select name="mode">${state.diagnostics[channel].map(mode => `<option>${escape(mode)}</option>`).join('')}</select></label>
    <button type="submit" class="button secondary">Testar ${channel}</button></form>`);
  return '<div class="stack"><form id="tracking-settings" class="stack">' + settings.join('') + '</form>' +
    panel('Teste rápido', '<div class="columns">' + tests.join('') + '</div>') + '</div>';
}

function utmfyView() {
  return '<form id="tracking-settings" hidden></form>' +
    panel('UTMfy', channelSettings('UTMfy'), 'Simulação') +
    panel('Teste rápido', diagnosticButtons('UTMfy', [['PIX gerado', 'Testar PIX gerado'], ['PIX pago', 'Testar PIX pago']])) +
    panel('Venda manual', diagnosticButtons('UTMfy', [['Venda manual', 'Enfileirar simulação']]), 'Simulação') +
    panel('Pushcut', channelSettings('Pushcut') + diagnosticButtons('Pushcut', [['PIX gerado', 'Testar PIX gerado'], ['PIX pago', 'Testar PIX pago']]), 'Simulação') +
    panel('Fila backend', table(['Canal', 'Evento', 'Estado', 'Tentativas'], state.queue.map(item =>
      [escape(item.channel), escape(item.event), escape(item.status), item.attempts])),
    `${state.queue.length} registros`);
}

function queueView() {
  const waiting = state.queue.filter(item => item.status === 'Aguardando teste').length;
  const records = state.queue.map(item => [escape(item.channel), escape(item.event), escape(item.detail), escape(item.status), item.attempts,
    item.processedAt ? date.format(new Date(item.processedAt)) : '—']);
  return title('Fila de testes', 'Acompanhe os eventos dos pedidos e processe lotes de até 20 registros.') +
    `<button class="button primary" type="button" id="process-queue"${waiting ? '' : ' disabled'}>Processar fila</button></div>` +
    panel('Histórico da fila', table(['Canal', 'Evento', 'Origem', 'Estado', 'Tentativas', 'Processado em'], records), `${waiting} aguardando`);
}

function domainsView(domains) {
  const checkedPages = new Map();
  for (const check of domains.checks) {
    const name = domains.pages[check.domainPage];
    checkedPages.set(name, (checkedPages.get(name) || 0) + 1);
  }
  return title('Domínios', 'Teste a validação de origem que protege as solicitações do painel.') + '</div><div class="stack">' +
    panel('Origem do painel', `<p>${escape(domains.origin)}</p>
      <form id="domain-check" class="controls diagnostic-form">
        <label>Página<select name="page">${Object.entries(domains.pages).map(([id, name]) =>
          `<option value="${escape(id)}">${escape(name)}</option>`).join('')}</select></label>
        <label>Origem simulada<select name="candidate">
          <option value="current">Origem do painel</option>
          <option value="test">${escape(domains.testOrigin)}</option>
        </select></label>
        <button type="submit" class="button secondary">Verificar origem</button>
      </form>`, 'Simulação') +
    '<div class="columns">' + panel('Testes por página', bars([...checkedPages].map(([name, count]) => ({ name, count })))) +
    panel('Histórico de verificações', table(['Quando', 'Página', 'Domínio', 'Resultado'], domains.checks.map(row =>
      [date.format(new Date(row.at)), escape(domains.pages[row.domainPage]), escape(row.detail), escape(row.status)]))) +
    '</div></div>';
}

function pendingRemarketing() {
  const reminders = new Set(state.queue.filter(job => job.event === 'Remarketing').map(job => job.detail));
  const pending = state.orders.filter(order => order.status === orderStatuses[1]);
  const rows = pending.map(order => {
    const queued = order.reminderQueuedAt || reminders.has(order.id);
    return [
      queued ? '—' : `<input type="checkbox" name="reminder" value="${escape(order.id)}" aria-label="Selecionar pedido ${escape(order.id)}">`,
      escape(order.id), escape(order.gateway), money(order.total),
      queued ? 'Lembrete registrado' : `<button class="button secondary" type="button" data-reminder="${escape(order.id)}">Enfileirar lembrete</button>`,
    ];
  });
  const actions = pending.some(order => !order.reminderQueuedAt && !reminders.has(order.id)) ?
    '<div class="controls"><button class="button primary" type="submit">Enfileirar selecionados</button>' +
    '<button class="button secondary" type="button" id="select-reminders">Selecionar até 20</button></div>' : '';
  return panel('Pedidos da jornada com PIX pendente',
    '<form id="reminder-batch">' + actions + table(['Selecionar', 'Pedido', 'Gateway', 'Valor', 'Ação'], rows) + '</form>', 'Simulação');
}

function smsView() {
  const pending = state.orders.length;
  return '<form id="tracking-settings" hidden></form>' +
    panel('Converta quem parou antes de pagar', `<div class="admin-hero"><div>
      <h3>Remarketing de pedidos pendentes</h3>
      <p>Enfileire lembretes e confira o andamento no ambiente de teste.</p></div>
      <div class="admin-hero-highlight"><span>PIX pendentes</span><strong>${pending}</strong></div></div>`, 'Simulação') +
    panel('Conexão da API', channelSettings('SMSMais'), 'Eventos de teste') +
    panel('Webhook de entrega e respostas', diagnosticButtons('SMSMais', [['Retorno de entrega', 'Simular retorno de entrega']])) +
    pendingRemarketing() +
    panel('Teste de SMS', diagnosticButtons('SMSMais', [['SMS de teste', 'Testar SMS']])) +
    panel('Torpedo de voz', diagnosticButtons('SMSMais', [['Torpedo de voz', 'Testar voz']])) +
    panel('Estado da integração', auditTable(state.audit.filter(entry => entry.detail === 'SMSMais' ||
      ['Lembrete de teste registrado', 'Lembretes de teste em lote'].includes(entry.title))));
}

async function render() {
  if (!operator) return;
  const current = ++sequence;
  const active = section();
  nav(active);
  const topbar = {
    overview: ['Painel Administrativo', 'Visão geral de desempenho, funil e operação.'],
    gateways: ['Gateways PIX', 'Central de roteamento, testes e conversão por gateway.'],
    pages: ['Páginas', 'Acompanhe as etapas e a passagem de visitantes pelo funil.'],
    tracking: ['Tracking', 'Configure os eventos do Meta e do TikTok no ambiente de teste.'],
    audience: ['Público', 'Compare a distribuição das sessões em cada etapa.'],
    sales: ['Vendas por gateway', 'Consulte as transações e a auditoria de faturamento simulado.'],
    sms: ['Central de SMS', 'Acompanhe pedidos pendentes e teste o remarketing.'],
    leads: ['Leads', 'Busque sessões, confira a jornada e consulte transações.'],
    navigation: ['Saídas e retornos', 'Veja em quais páginas a jornada avançou ou teve retorno.'],
    utmfy: ['UTMfy', 'Acompanhe a fila de testes do UTMfy e do Pushcut.'],
    domains: ['Domínios', 'Consulte a origem do painel e o histórico de verificações.'],
  };
  const [heading, description] = topbar[active] || [sectionNames[active], ''];
  document.body.dataset.admin = active;
  document.querySelector('.path').textContent = heading;
  const descriptionNode = document.querySelector('#topbar-description');
  descriptionNode.textContent = description;
  descriptionNode.hidden = !description;
  updateSettingsButton();
  view.setAttribute('aria-busy', 'true');
  try {
    const response = await api('view', undefined, { section: active });
    if (current !== sequence || !operator) return;
    const { data, traffic, journey, domains } = response;
    state = response.state;
    updateSettingsButton();
    const renderers = {
      overview: () => dashboard(data, traffic),
      pages: () => pagesView(traffic),
      leads: () => listView('leads', data),
      sales: () => listView('sales', data),
      audience: () => audienceView(traffic, data),
      catalog: catalogView,
      tracking: () => title('Tracking', 'Configure os eventos e consulte a atividade registrada.') + range() + '</div><div class="stack">' +
        pixelSettings() + panel('Eventos do site', bars(response.pixel), response.limited ? 'Últimos 1.000 registros por consulta' : 'Medição própria') + '</div>',
      utmfy: utmfyView,
      sms: smsView,
      queue: queueView,
      activity: () => title('Eventos da jornada', 'Acompanhe as ações registradas no protótipo, da primeira etapa até a seleção.') + range() + '</div>' +
        '<div class="stack">' + panel('Marcos registrados', bars(journey.milestones), journey.limited ? 'Últimos 1.000 eventos' : '') +
        panel('Eventos recentes', table(['Quando', 'Página', 'Evento'], journey.recent.map(row =>
          [date.format(new Date(row.at)), escape(row.page), escape(row.title)]))) + '</div>',
      navigation: () => navigationView(traffic, journey),
      domains: () => domainsView(domains),
      security: () => title('Auditoria e segurança', 'Histórico das mudanças feitas por operadores neste painel.') + '</div>' +
        panel('Atividade do painel', auditTable(state.audit)),
    };
    const keepFocus = document.activeElement?.id === 'live-refresh';
    view.dataset.section = active;
    if (active === 'gateways') {
      gatewayMarkup ||= await gatewayTemplate();
      if (current !== sequence || !operator) return;
      gatewayReport = { data, traffic };
      updateGatewayView();
    } else view.innerHTML = renderers[active]();
    if (keepFocus) view.querySelector('#live-refresh')?.focus({ preventScroll: true });
  } catch (error) {
    if (current === sequence) notice(error.message, true);
  } finally {
    if (current === sequence) view.removeAttribute('aria-busy');
  }
}

navigation.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href);
  event.preventDefault();
  if (url.pathname === location.pathname && !location.hash) return;
  history.pushState(null, '', url.pathname);
  onNavigation();
});

async function command(type, key, value) {
  updatesInFlight++;
  try {
    const response = await api('command', { type, key, value, version: state.version });
    state = response.state;
    await render();
    notice(response.result.status ? `${response.result.detail} · ${response.result.status}` : response.result.title);
    return response.result;
  } finally {
    updatesInFlight--;
  }
}

function showDetails(titleText, content) {
  document.querySelector('#details-title').textContent = titleText;
  document.querySelector('#details-content').innerHTML = content;
  if (!details.open) details.showModal();
}

function openTransactionLookup() {
  showDetails('Consultar transações', `<form id="lead-order-lookup" class="controls">
    <label>Pedido ou código PIX de teste<input name="reference" required maxlength="100"></label>
    <button type="submit" class="button primary">Consultar</button><p class="muted" role="status"></p>
  </form>`);
  details.querySelector('[name=reference]').focus();
}

function openGatewayTests(provider) {
  if (!state?.settings?.gateways) return;
  const options = state.settings.gateways.map(entry => `<label class="gateway-test-option">
    <input type="checkbox" name="provider" value="${escape(entry.name)}"${checked(provider ? provider === entry.name : entry.enabled)}>
    <span>${escape(entry.name)}</span><small>${entry.enabled ? 'Ligado' : 'Desligado'}</small></label>`);
  showDetails('Testar gateways', `<form id="gateway-test-form">
    <p class="muted">Execute o diagnóstico no ambiente de simulação.</p>
    <div class="gateway-test-option-grid">${options.join('')}</div>
    <button class="button primary" type="submit">Executar testes</button>
    <div class="gateway-test-results" role="status"></div>
  </form>`);
}

testGateways.addEventListener('click', () => openGatewayTests());

gatewaySettings.addEventListener('submit', async event => {
  event.preventDefault();
  if (!gatewayDraft || updatesInFlight) return;
  const submitted = gatewayDraft;
  saveSettings.disabled = true;
  view.inert = true;
  try {
    await command('gateway-settings', null, submitted);
    gatewayDraft = undefined;
  } catch (error) {
    notice(error.message, true);
    await render();
  } finally {
    view.inert = false;
    updateSettingsButton();
  }
});

view.addEventListener('dragstart', event => {
  const row = event.target.closest('[data-gateway-order-item]');
  if (!row || !event.dataTransfer) return;
  row.classList.add('is-dragging');
  event.dataTransfer.setData('text/plain', row.dataset.gatewayOrderItem);
  event.dataTransfer.effectAllowed = 'move';
});
view.addEventListener('dragover', event => {
  if (view.querySelector('.is-dragging') && event.target.closest('[data-gateway-order-item]')) event.preventDefault();
});
view.addEventListener('dragend', () => view.querySelector('.is-dragging')?.classList.remove('is-dragging'));
view.addEventListener('drop', event => {
  const row = event.target.closest('[data-gateway-order-item]');
  const source = view.querySelector('.is-dragging');
  if (!row || !source) return;
  event.preventDefault();
  const index = (gatewayDraft ?? state.settings.gateways).findIndex(entry => entry.name === row.dataset.gatewayOrderItem);
  moveGateway(source.dataset.gatewayOrderItem, index);
});

async function showOrder(id) {
  const response = await fetch(`/api/admin?${params({ route: 'order', id })}`);
  if (!response.ok) throw new Error('Pedido de teste indisponível.');
  const { order } = await response.json();
  const orderId = order.id;
  const enabled = state.settings.gateways.filter(entry => entry.enabled);
  let actions = '';
  if (order.status === orderStatuses[0]) {
    actions = `<div class="controls"><label>Gateway <select id="order-gateway"><option value="">Usar prioridade configurada</option>${enabled.map(entry =>
      `<option>${escape(entry.name)}</option>`).join('')}</select></label>
      <button type="button" class="button primary" data-order-action="order-payment" data-id="${escape(orderId)}"${enabled.length ? '' : ' disabled'}>Gerar PIX de teste</button></div>`;
  } else if (order.status === orderStatuses[1]) {
    actions = `<div class="controls">
      <button type="button" class="button primary" data-order-action="order-reconcile" data-outcome="confirm" data-id="${escape(orderId)}">Simular confirmação</button>
      <button type="button" class="button secondary" data-order-action="order-reconcile" data-outcome="cancel" data-id="${escape(orderId)}">Simular cancelamento</button></div>`;
  }
  showDetails('Pedido de teste', `<p class="empty">${escape(order.id)}</p>
    ${table(['Produto', 'Preço registrado'], order.items.map(item => [escape(item.name), money(item.cents)]))}
    <p class="empty"><strong>${money(order.total)}</strong> · ${escape(order.status)}</p>
    ${order.payment ? `<p class="empty">${escape(order.gateway)} · ${escape(order.payment.code)}</p>` : ''}
    ${actions}<p id="order-feedback" class="empty" role="status" hidden></p>`);
}

details.addEventListener('submit', async event => {
  if (event.target.id === 'gateway-test-form') {
    event.preventDefault();
    const form = event.target;
    const selected = new FormData(form).getAll('provider');
    const results = form.querySelector('.gateway-test-results');
    if (!selected.length) {
      results.textContent = 'Selecione ao menos um gateway.';
      return;
    }
    event.submitter.disabled = true;
    results.textContent = 'Executando testes…';
    try {
      const result = await command('pix-batch', null, selected);
      results.innerHTML = result.checks.map(({ name, code }) => `<section class="gateway-test-card">
        <strong>${escape(name)}</strong><p>${code ? 'PIX de teste gerado' : 'Gateway desligado'}</p>
        ${code ? `<code>${escape(code)}</code>` : ''}</section>`).join('');
    } catch (error) {
      results.textContent = error.message;
    } finally {
      event.submitter.disabled = false;
    }
    return;
  }
  if (event.target.id !== 'lead-order-lookup') return;
  event.preventDefault();
  const reference = new FormData(event.target).get('reference').trim();
  if (!reference) return;
  const message = event.target.querySelector('[role=status]');
  try { await showOrder(reference); }
  catch (error) { message.textContent = error.message; }
});

details.addEventListener('click', async event => {
  const button = event.target.closest('button[data-order-action]');
  if (!button) return;
  button.disabled = true;
  try {
    const { orderAction, id, outcome } = button.dataset;
    await command(orderAction, id, outcome || document.querySelector('#order-gateway')?.value || '');
    if (details.open) await showOrder(id);
  } catch (error) {
    const message = document.querySelector('#order-feedback');
    if (message) {
      message.textContent = error.message;
      message.hidden = false;
    }
    await render();
  } finally {
    button.disabled = false;
  }
});

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = document.querySelector('#login-action');
  submit.disabled = true;
  try {
    const data = await api('login', Object.fromEntries(new FormData(loginForm)));
    loginForm.reset();
    notice('');
    account(data.operator);
    await render();
    openLinkedLead();
  } catch (error) { notice(error.message, true); } finally { submit.disabled = false; }
});

document.querySelector('#logout').addEventListener('click', async () => {
  try { await api('logout', {}); account(null); notice(''); } catch (error) { notice(error.message, true); }
});

let shownLocation = location.pathname + location.hash;
async function onNavigation() {
  const current = location.pathname + location.hash;
  if (current === shownLocation) return;
  shownLocation = current;
  leadDialog.close();
  Object.assign(contexts, { q: '', page: 1, gateway: '', status: '' });
  notice('');
  scheduleRefresh();
  await render();
  openLinkedLead();
}
window.addEventListener('hashchange', onNavigation);
window.addEventListener('popstate', onNavigation);
document.addEventListener('visibilitychange', scheduleRefresh);

view.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const entries = Object.fromEntries(new FormData(form, event.submitter || undefined));
  if (form.id === 'date-filter') {
    if (!entries.from && !entries.to && form.querySelector('#period').value !== 'custom') return;
    if (!entries.from || !entries.to || entries.from > entries.to || Date.parse(entries.to) - Date.parse(entries.from) > 89 * 86400000) {
      notice('Informe um intervalo de até 90 dias.', true);
      return;
    }
    Object.assign(contexts, { from: entries.from, to: entries.to, page: 1 });
    notice('');
    await render();
    return;
  }
  if (form.id === 'dashboard-settings' || form.id === 'tracking-settings') {
    const tracking = form.id === 'tracking-settings';
    const pending = tracking ? pendingTracking : pendingSettings;
    if (!Object.keys(pending).length) return;
    saveSettings.disabled = true;
    try {
      await command(tracking ? 'tracking-settings' : 'features', null, { ...pending });
      for (const key of Object.keys(pending)) delete pending[key];
    } catch (error) { notice(error.message, true); await render(); }
    finally { updateSettingsButton(); }
    return;
  }
  if (form.id === 'filters') {
    Object.assign(contexts, entries, { page: 1 });
    await render();
    return;
  }
  if (form.id === 'reminder-batch') {
    const ids = new FormData(form).getAll('reminder');
    if (!ids.length || ids.length > 20) { notice('Selecione de 1 a 20 pedidos pendentes.', true); return; }
    event.submitter.disabled = true;
    try { await command('order-reminders', null, ids); }
    catch (error) { notice(error.message, true); await render(); }
    finally { event.submitter.disabled = false; }
    return;
  }
  if (form.id === 'transaction-lookup' || form.matches('.diagnostic-form')) {
    try {
      if (form.id === 'transaction-lookup') {
        await showOrder(entries.reference);
      } else if (form.id === 'domain-check') {
        await command('domain-check', entries.page, entries.candidate);
      } else {
        await command('integration-test', form.dataset.channel, entries.mode || undefined);
      }
    } catch (error) { notice(error.message, true); }
    return;
  }
  if (form.matches('.catalog-form')) {
    try { await command('catalog', form.dataset.product, { cents: Math.round(Number(entries.amount) * 100), active: entries.active === 'on' }); }
    catch (error) { notice(error.message, true); await render(); }
  }
});

view.addEventListener('change', async event => {
  const { target } = event;
  if (target.id === 'period') {
    if (target.value === 'custom') { view.querySelector('[name=from]')?.focus(); return; }
    contexts.days = target.value;
    contexts.from = '';
    contexts.to = '';
    contexts.page = 1;
    await render();
    return;
  }
  if (target.dataset.gatewayEnabled) {
    applyGatewayDraft((gatewayDraft ?? state.settings.gateways).map(entry =>
      entry.name === target.dataset.gatewayEnabled ? { ...entry, enabled: target.checked } : entry));
    [...view.querySelectorAll('[data-gateway-enabled]')].find(input => input.dataset.gatewayEnabled === target.dataset.gatewayEnabled)
      ?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.dashboardSetting) {
    const key = target.dataset.dashboardSetting;
    if (target.checked === state.settings[key]) delete pendingSettings[key];
    else pendingSettings[key] = target.checked;
    updateSettingsButton();
    return;
  }
  if (target.dataset.pixelEvent) {
    const channel = target.dataset.key;
    const enabled = [...view.querySelectorAll('input[data-pixel-event]:checked')]
      .filter(input => input.dataset.key === channel).map(input => input.dataset.pixelEvent);
    const saved = state.settings.tracking[channel];
    if (enabled.length === saved.length && enabled.every(event => saved.includes(event))) delete pendingTracking[channel];
    else pendingTracking[channel] = enabled;
    updateSettingsButton();
    return;
  }
});

view.addEventListener('click', async event => {
  const button = event.target.closest('button');
  const leadRow = event.target.closest('[data-lead-row]');
  if (leadRow && (!button || button.dataset.lead)) { await leadDialog.open(leadRow.dataset.leadRow); return; }
  if (!button) return;
  try {
    if (button.id === 'clear-dates') {
      Object.assign(contexts, { days: 'all', from: '', to: '', page: 1 });
      notice('');
      await render();
    }
    if (button.id === 'live-refresh') {
      liveRefresh = !liveRefresh;
      button.setAttribute('aria-pressed', String(liveRefresh));
      scheduleRefresh();
    }
    if (button.id === 'refresh-tracking') await render();
    if (button.id === 'refresh-leads' || button.id === 'gateway-refresh') await render();
    if (button.id === 'lookup-leads' || button.id === 'gateway-lookup') openTransactionLookup();
    if (button.id === 'process-queue') await command('queue-process');
    if (button.id === 'select-reminders') {
      const boxes = [...button.form.querySelectorAll('input[name="reminder"]')];
      boxes.forEach((box, index) => { box.checked = index < 20; });
    }
    if (button.dataset.salesGateway) {
      contexts.gateway = contexts.gateway === button.dataset.salesGateway ? '' : button.dataset.salesGateway;
      contexts.page = 1;
      await render();
    }
    if (button.dataset.order) await showOrder(button.dataset.order);
    if (button.dataset.reminder) await command('order-reminder', button.dataset.reminder);
    if (button.dataset.page) { contexts.page = Number(button.dataset.page); await render(); }
    if (button.dataset.gatewayOrderMove) {
      const name = button.closest('[data-gateway-order-item]').dataset.gatewayOrderItem;
      const direction = button.dataset.gatewayOrderMove;
      const index = (gatewayDraft ?? state.settings.gateways).findIndex(entry => entry.name === name);
      moveGateway(name, index + (direction === 'up' ? -1 : 1), direction);
    }
    if (button.matches('[data-gateway-config-toggle]')) {
      const card = button.closest('[data-gateway-card]');
      const name = card.dataset.gatewayCard;
      const open = !expandedGateways.has(name);
      if (open) expandedGateways.add(name);
      else expandedGateways.delete(name);
      setGatewayCardOpen(card, open);
    }
    if (button.dataset.testProvider) openGatewayTests(button.dataset.testProvider);
  } catch (error) { notice(error.message, true); }
});

try {
  const linkedPeriod = new URLSearchParams(location.search);
  if (periodOptions.some(([key]) => key !== 'custom' && key === linkedPeriod.get('days'))) contexts.days = linkedPeriod.get('days');
  if (linkedPeriod.has('from') && linkedPeriod.has('to')) Object.assign(contexts, { from: linkedPeriod.get('from'), to: linkedPeriod.get('to') });
  const mode = await api('mode');
  localMode = mode.local;
  if (localMode) {
    const fields = document.querySelector('#credentials');
    fields.hidden = true;
    for (const input of fields.querySelectorAll('input')) input.disabled = true;
    document.querySelector('#login-action').textContent = 'Abrir painel de teste';
  }
  const session = await api('session').catch(() => null);
  if (session) { account(session.operator); await render(); openLinkedLead(); }
} catch (error) {
  notice(error.message, true);
  document.querySelector('#login-action').disabled = true;
}
