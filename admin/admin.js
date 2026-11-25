import { leadDetails } from './lead-details.js?v=3';

const navigation = document.querySelector('#navigation');
const login = document.querySelector('#login');
const loginForm = document.querySelector('#login-form');
const feedback = document.querySelector('#feedback');
const view = document.querySelector('#view');
const details = document.querySelector('#details');
const saveSettings = document.querySelector('#save-settings');
const groups = [
  ['', ['overview', 'Visão geral'], ['tracking', 'Tracking'], ['utmfy', 'UTMfy e Pushcut'], ['sms', 'SMS e remarketing'],
    ['gateways', 'Gateways PIX'], ['pages', 'Páginas e funil'], ['audience', 'Público'], ['sales', 'Vendas'],
    ['navigation', 'Saídas e retornos'], ['leads', 'Leads'], ['domains', 'Domínios']],
  ['Operação de teste', ['catalog', 'Catálogo'], ['queue', 'Fila de testes'], ['activity', 'Eventos da jornada'], ['security', 'Auditoria e segurança']],
];
const sectionNames = Object.fromEntries(groups.flatMap(([, ...links]) => links));
const eventTypes = ['PageView', 'ViewContent', 'Lead', 'InitiateCheckout', 'Purchase'];
const orderStatuses = ['Aguardando PIX de teste', 'Pendente no teste', 'Pago no teste', 'Cancelado no teste'];
const trackedLabels = {
  inicio: 'Página inicial', oferta: 'Sobre a oferta', cadastro: 'Cadastro',
  questionario: 'Questionário', regiao: 'Disponibilidade por região', analise: 'Análise e ofertas',
};
const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const integer = new Intl.NumberFormat('pt-BR');
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const contexts = { days: 7, from: '', to: '', q: '', page: 1, gateway: '', status: '' };
const dashboardControls = [
  ['compareGateways', 'Comparar gateways'],
  ['offerExtras', 'Exibir acessórios no catálogo de teste'],
];
const pendingSettings = {};
let operator;
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
  return Object.hasOwn(sectionNames, name) ? name : 'overview';
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
  saveSettings.hidden = !operator || section() !== 'overview';
  saveSettings.disabled = !Object.keys(pendingSettings).length || updatesInFlight > 0;
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
  document.querySelector('#operator-name').textContent = user?.name || '';
  if (!user) {
    view.replaceChildren();
    leadDialog.close();
    for (const key of Object.keys(pendingSettings)) delete pendingSettings[key];
  }
  updateSettingsButton();
  scheduleRefresh();
}

function nav(active) {
  navigation.innerHTML = groups.map(([group, ...links]) => (group ? '<p class="nav-label">' + group + '</p>' : '') +
    links.map(([id, label]) => `<a href="#${id}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')).join('');
}

function title(name, copy) {
  return `<div class="view-header"><div><p class="eyebrow">Ambiente de protótipo</p>
    <h1>${escape(name)}</h1><p class="muted">${escape(copy)}</p></div>`;
}

function range() {
  return `<label>Período <select id="period">${[7, 14, 30].map(days =>
    `<option value="${days}"${selected(days === contexts.days)}>Últimos ${days} dias</option>`).join('')}</select></label>`;
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

function metric(label, value) {
  return `<div class="panel metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function auditTable(records) {
  return table(['Quando', 'Atividade', 'Detalhe', 'Resultado'], records.map(record =>
    [date.format(new Date(record.at)), escape(record.title), escape(record.detail), escape(record.status || 'Registrado')]));
}

function dashboard(data, traffic) {
  const { counts } = data;
  return title('Visão geral', 'Acompanhe o funil e as vendas de teste da campanha.') + liveControls() + '</div>' +
    `<section class="panel live-panel"><div><h2>Monitoramento ao vivo</h2>
      <p class="muted">Acompanhe as sessões e os pedidos registrados nas jornadas de teste.</p>
      <div class="controls"><span class="badge">${integer.format(traffic.pageViews)} ${traffic.pageViews === 1 ? 'visita registrada' : 'visitas registradas'}</span>
      <span class="badge">Gateway prioritário · ${escape(state.settings.gateways.find(item => item.enabled)?.name || 'Nenhum ativo')}</span></div></div>
      <div class="live-score"><span>Sessões acompanhadas</span><strong>${integer.format(traffic.sessions)}</strong></div></section>` +
    `<form id="date-filter" class="controls">
      <label>De <input type="date" name="from" value="${escape(contexts.from)}"></label>
      <label>Até <input type="date" name="to" value="${escape(contexts.to)}"></label>
      <button type="submit" class="button primary">Aplicar</button>
      <button type="button" class="button secondary" id="clear-dates">Limpar</button>
    </form>` +
    '<div class="stack dashboard-controls">' + panel('Jornadas registradas neste painel',
      '<div class="cards">' + metric('Sessões acompanhadas', integer.format(traffic.sessions)) +
      metric('Visitas registradas', integer.format(traffic.pageViews)) +
      metric('Pedidos de jornada', integer.format(counts.testOrders)) +
      metric('Confirmados em teste', integer.format(counts.testPaid)) +
      metric('Valor confirmado em teste', money(counts.testRevenue)) + '</div>', traffic.limit ? 'Últimos 1.000 eventos' : '') +
    '<div class="columns">' + panel('Sessões por etapa', bars(traffic.sessionsByPage.map(row => ({
      name: trackedLabels[row.page], count: row.count,
    })))) + panel('Visitas registradas por dia', bars(traffic.daily.map(({ day, count }) => ({
      name: day.slice(5).split('-').reverse().join('/'), count,
    })))) + '</div>' + panel('Controles da demonstração', '<form id="dashboard-settings">' +
      dashboardControls.map(([id, label]) => `<label class="control-row checkbox"><span>${label}</span>
        <input type="checkbox" data-dashboard-setting="${id}"${checked(pendingSettings[id] ?? state.settings[id])}></label>`).join('') + '</form>') + '</div>';
}

function pagination(result) {
  const total = Math.max(1, Math.ceil(result.total / result.perPage));
  return `<div class="paginate"><span>${result.total} registros · página ${result.page} de ${total}</span>
    <div class="controls"><button class="button secondary" type="button" data-page="${result.page - 1}"${result.page <= 1 ? ' disabled' : ''}>Anterior</button>
    <button class="button secondary" type="button" data-page="${result.page + 1}"${result.page >= total ? ' disabled' : ''}>Próxima</button></div></div>`;
}

function listView(kind, data) {
  const sales = kind === 'sales';
  const listTitle = sales ? 'Transações simuladas' : 'Sessões do protótipo';
  const filters = `<label>Gateway <select name="gateway"><option value="">Todos</option>${state.settings.gateways.map(({ name }) =>
    `<option${selected(name === contexts.gateway)}>${escape(name)}</option>`).join('')}</select></label>
    <label>Estado <select name="status"><option value="">Todos</option>${orderStatuses.map(status =>
      `<option${selected(status === contexts.status)}>${status}</option>`).join('')}</select></label>`;
  const columns = sales ? ['Pedido', 'Origem', 'Gateway', 'Valor', 'Estado', ''] :
    ['Sessão', 'Cidade', 'Origem', 'Etapa mais avançada', 'Gateway', 'Estado do pedido', ''];
  const rows = data.items.map(row => sales
    ? [escape(row.id), 'Jornada acompanhada', escape(row.gateway || '—'), money(row.total),
      escape(row.status), `<button type="button" class="button secondary" data-order="${escape(row.id)}">Ver pedido</button>`]
    : [escape(row.name), escape(row.city || '—'), escape(row.origin), escape(row.steps.at(-1)), escape(row.gateway || '—'), escape(row.status || '—'),
      `<button type="button" class="button secondary" data-lead="${escape(row.id)}">Detalhes</button>`]);
  const summary = sales && data.audit ? panel('Auditoria de faturamento simulado', table(['Estado', 'Pedidos', 'Valor total'],
    data.audit.map(row => [escape(row.name), integer.format(row.orders), money(row.cents)]))) : '';
  return title(sectionNames[kind], 'Consulte e exporte registros demonstrativos por período.') + range() + '</div><div class="stack">' +
    summary +
    panel(listTitle, `<form id="filters" class="controls">
      <label>Buscar<input name="q" value="${escape(contexts.q)}" maxlength="100" placeholder="Buscar registros"></label>${filters}
      <button class="button primary" type="submit">Filtrar</button>
      <a class="button secondary" href="/api/admin?${escape(params({ route: 'export', kind }))}">Exportar CSV</a>
      </form>` + table(columns, rows, sales ? undefined : data.items) + pagination(data),
      data.limited ? 'Últimos 1.000 eventos acompanhados' : '') + '</div>';
}

function gatewayView(data) {
  const rows = state.settings.gateways.map(({ name, enabled }, index) =>
    [String(index + 1), escape(name), `<label class="checkbox"><input type="checkbox" data-change="gateway" data-key="${escape(name)}"${checked(enabled)}>Ativo</label>`,
      `<div class="controls">
        <button type="button" title="Subir prioridade" aria-label="Subir prioridade de ${escape(name)}" class="button secondary" data-priority="-1" data-key="${escape(name)}"${index === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" title="Descer prioridade" aria-label="Descer prioridade de ${escape(name)}" class="button secondary" data-priority="1" data-key="${escape(name)}"${index === state.settings.gateways.length - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" class="button secondary" data-pix="${escape(name)}"${enabled ? '' : ' disabled'}>Testar PIX</button></div>`]);
  const gatewaySales = data.journeyGatewaySales.map(row =>
    [escape(row.name), integer.format(row.orders), integer.format(row.paid), money(row.revenue)]);
  return title('Gateways PIX', 'Configure a ordem e gere comprovantes de teste dos seis gateways.') + range() + '</div><div class="stack">' +
    panel('Prioridade dos gateways', table(['Ordem', 'Gateway', 'Modo de teste', 'Ações'], rows), 'Simulação') +
    panel('Consulta de transação', `<form class="controls" id="transaction-lookup">
      <label>Pedido ou código PIX de teste<input name="reference" required maxlength="100"></label>
      <button type="submit" class="button secondary">Consultar</button></form>`) +
    (state.settings.compareGateways ? panel('Desempenho das jornadas de teste', table(['Gateway', 'Pedidos com PIX', 'Confirmados', 'Valor confirmado em teste'], gatewaySales)) : '') +
    '</div>';
}

function catalogView() {
  const items = state.settings.offerExtras ? state.catalog : state.catalog.filter(item => item.id === 'camera');
  return title('Catálogo', 'Edite valores e disponibilidade do catálogo de teste.') + '</div>' +
    panel('Produtos', items.map(item => `<form class="control-row catalog-form" data-product="${escape(item.id)}">
      <strong>${escape(item.name)}</strong><label>Preço em reais <input name="amount" type="number" step=".01" min="1" max="10000" value="${(item.cents / 100).toFixed(2)}" required></label>
      <label class="checkbox"><input type="checkbox" name="active"${checked(item.active)}>Disponível</label>
      <button type="submit" class="button secondary">Salvar</button></form>`).join(''));
}

function trackingCards(channels) {
  return channels.map(channel => panel(channel, `<div class="checks">${eventTypes.map(event =>
    `<label><input type="checkbox" data-event="${event}" data-key="${channel}"${checked(state.settings.tracking[channel].includes(event))}>${event}</label>`).join('')}</div>
    <form class="controls diagnostic-form" data-channel="${channel}">
      <label>Cenário de teste<select name="mode">${(state.diagnostics?.[channel] || []).map(mode =>
        `<option>${escape(mode)}</option>`).join('')}</select></label>
      <button type="submit" class="button secondary">Enfileirar teste</button>
    </form>`, 'Simulação')).join('');
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

async function render() {
  if (!operator) return;
  const current = ++sequence;
  const active = section();
  nav(active);
  updateSettingsButton();
  view.setAttribute('aria-busy', 'true');
  try {
    const response = await api('view', undefined, { section: active });
    if (current !== sequence || !operator) return;
    const { data, traffic, journey, domains } = response;
    state = response.state;
    updateSettingsButton();
    const placeholderHistory = (state.audit || []).filter(entry => ['UTMfy','Pushcut','SMSMais'].includes(entry.detail));
    const renderers = {
      overview: () => dashboard(data, traffic),
      pages: () => title('Páginas e funil', 'Compare visitas registradas e sessões únicas nas etapas acompanhadas.') + liveControls() + '</div><div class="columns">' +
        panel('Tracking da jornada de teste', '<p class="empty">Abra o site abaixo e percorra as etapas. A contagem acompanha esta jornada de teste.</p>' +
          '<a href="/?analytics=demo" target="_blank" rel="noopener" class="button primary">Abrir jornada com tracking</a> ' +
          '<button type="button" id="refresh-tracking" class="button secondary">Atualizar</button>' +
          bars(traffic.rows.map(row => ({ name: trackedLabels[row.page], count: row.count }))),
          traffic.limit ? 'Últimos 1.000 eventos' : `${integer.format(traffic.sessions)} sessões de teste`) +
        panel('Sessões únicas por etapa', bars(traffic.sessionsByPage.map(row => ({ name: trackedLabels[row.page], count: row.count })))) + '</div>',
      leads: () => listView('leads', data),
      sales: () => listView('sales', data),
      audience: () => title('Público', 'Distribuição das sessões registradas no período.') +
        `<div class="controls">${range()}<a class="button secondary" href="/api/admin?${escape(params({ route: 'export', kind: 'audience' }))}">Exportar público CSV</a></div></div><div class="columns">` +
        panel('Sessões por etapa', bars(traffic.sessionsByPage.filter(row => row.count).map(row =>
          ({ name: trackedLabels[row.page], count: row.count })))) +
        panel('Etapa mais avançada por sessão', bars(traffic.furthestPages.filter(row => row.count).map(row =>
          ({ name: trackedLabels[row.page], count: row.count })))) + '</div>',
      catalog: catalogView,
      gateways: () => gatewayView(data),
      tracking: () => title('Tracking', 'Configure a matriz de eventos para validar o fluxo em simulação.') + '</div><div class="columns">' + trackingCards(['Meta','TikTok']) + '</div>',
      utmfy: () => title('UTMfy e Pushcut', 'Valide eventos e notificações com registros de teste.') + '</div><div class="stack">' +
        '<div class="columns">' + trackingCards(['UTMfy','Pushcut']) + '</div>' + panel('Histórico de testes', auditTable(placeholderHistory.filter(entry => entry.detail !== 'SMSMais'))) + '</div>',
      sms: () => title('SMS e remarketing', 'Teste o registro de eventos da integração em modo de demonstração.') + '</div><div class="stack">' +
        pendingRemarketing() + trackingCards(['SMSMais']) +
        panel('Histórico de testes', auditTable(state.audit.filter(entry => entry.detail === 'SMSMais' ||
          ['Lembrete de teste registrado', 'Lembretes de teste em lote'].includes(entry.title)))) + '</div>',
      queue: queueView,
      activity: () => title('Eventos da jornada', 'Acompanhe as ações registradas no protótipo, da primeira etapa até a seleção.') + range() + '</div>' +
        '<div class="stack">' + panel('Marcos registrados', bars(journey.milestones), journey.limited ? 'Últimos 1.000 eventos' : '') +
        panel('Eventos recentes', table(['Quando', 'Página', 'Evento'], journey.recent.map(row =>
          [date.format(new Date(row.at)), escape(row.page), escape(row.title)]))) + '</div>',
      navigation: () => title('Saídas e retornos', 'Veja até onde as sessões avançaram e em quais páginas houve retorno pelo navegador.') + range() + '</div>' +
        '<div class="columns">' + panel('Etapa mais avançada por sessão', bars(traffic.furthestPages.map(row => ({ name: trackedLabels[row.page], count: row.count }))),
          traffic.limit ? 'Últimos 1.000 eventos' : `${integer.format(traffic.sessions)} sessões de teste`) +
        panel('Retornos por página', bars(journey.returns), journey.limited ? 'Últimos 1.000 eventos' : '') + '</div>',
      domains: () => domainsView(domains),
      security: () => title('Auditoria e segurança', 'Histórico das mudanças feitas por operadores neste painel.') + '</div>' +
        panel('Atividade do painel', auditTable(state.audit)),
    };
    const keepFocus = document.activeElement?.id === 'live-refresh';
    view.innerHTML = renderers[active]();
    if (keepFocus) view.querySelector('#live-refresh')?.focus({ preventScroll: true });
  } catch (error) {
    if (current === sequence) notice(error.message, true);
  } finally {
    if (current === sequence) view.removeAttribute('aria-busy');
  }
}

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

window.addEventListener('hashchange', async () => {
  leadDialog.close();
  Object.assign(contexts, { q: '', page: 1, gateway: '', status: '' });
  notice('');
  scheduleRefresh();
  await render();
  openLinkedLead();
});
document.addEventListener('visibilitychange', scheduleRefresh);

view.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const entries = Object.fromEntries(new FormData(form));
  if (form.id === 'date-filter') {
    if (!entries.from || !entries.to || entries.from > entries.to || Date.parse(entries.to) - Date.parse(entries.from) > 89 * 86400000) {
      notice('Informe um intervalo de até 90 dias.', true);
      return;
    }
    Object.assign(contexts, { from: entries.from, to: entries.to, page: 1 });
    notice('');
    await render();
    return;
  }
  if (form.id === 'dashboard-settings') {
    if (!Object.keys(pendingSettings).length) return;
    saveSettings.disabled = true;
    try {
      await command('features', null, { ...pendingSettings });
      for (const key of Object.keys(pendingSettings)) delete pendingSettings[key];
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
    contexts.days = Number(target.value);
    contexts.from = '';
    contexts.to = '';
    contexts.page = 1;
    await render();
    return;
  }
  if (target.dataset.dashboardSetting) {
    const key = target.dataset.dashboardSetting;
    if (target.checked === state.settings[key]) delete pendingSettings[key];
    else pendingSettings[key] = target.checked;
    updateSettingsButton();
    return;
  }
  try {
    if (target.dataset.change) await command(target.dataset.change, target.dataset.key, target.checked);
    if (target.dataset.event) {
      const on = [...view.querySelectorAll('input[data-event]:checked')]
        .filter(input => input.dataset.key === target.dataset.key).map(input => input.dataset.event);
      await command('tracking', target.dataset.key, on);
    }
  } catch (error) { notice(error.message, true); await render(); }
});

view.addEventListener('click', async event => {
  const button = event.target.closest('button');
  const leadRow = event.target.closest('[data-lead-row]');
  if (leadRow && (!button || button.dataset.lead)) { await leadDialog.open(leadRow.dataset.leadRow); return; }
  if (!button) return;
  try {
    if (button.id === 'clear-dates') {
      Object.assign(contexts, { from: '', to: '', page: 1 });
      notice('');
      await render();
    }
    if (button.id === 'live-refresh') {
      liveRefresh = !liveRefresh;
      button.setAttribute('aria-pressed', String(liveRefresh));
      scheduleRefresh();
    }
    if (button.id === 'refresh-tracking') await render();
    if (button.id === 'process-queue') await command('queue-process');
    if (button.id === 'select-reminders') {
      const boxes = [...button.form.querySelectorAll('input[name="reminder"]')];
      boxes.forEach((box, index) => { box.checked = index < 20; });
    }
    if (button.dataset.order) await showOrder(button.dataset.order);
    if (button.dataset.reminder) await command('order-reminder', button.dataset.reminder);
    if (button.dataset.page) { contexts.page = Number(button.dataset.page); await render(); }
    if (button.dataset.priority) await command('priority', button.dataset.key, Number(button.dataset.priority));
    if (button.dataset.pix) {
      const result = await command('pix', button.dataset.pix);
      showDetails('PIX de teste', `<p class="muted">Identificador de simulação para ${escape(result.detail)}.</p>
        <p class="empty">${escape(result.code)}</p><p>Este teste não gera cobrança.</p>`);
    }
  } catch (error) { notice(error.message, true); }
});

try {
  const linkedPeriod = new URLSearchParams(location.search);
  if ([7, 14, 30].includes(Number(linkedPeriod.get('days')))) contexts.days = Number(linkedPeriod.get('days'));
  if (linkedPeriod.has('from') && linkedPeriod.has('to')) Object.assign(contexts, { from: linkedPeriod.get('from'), to: linkedPeriod.get('to') });
  const mode = await api('mode');
  if (mode.local) {
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
