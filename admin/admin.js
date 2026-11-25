const navigation = document.querySelector('#navigation');
const login = document.querySelector('#login');
const loginForm = document.querySelector('#login-form');
const feedback = document.querySelector('#feedback');
const view = document.querySelector('#view');
const details = document.querySelector('#details');
const groups = [
  ['Operação', ['overview', 'Visão geral'], ['pages', 'Páginas e funil'], ['leads', 'Leads'], ['audience', 'Público'], ['sales', 'Vendas'], ['catalog', 'Catálogo']],
  ['Integrações', ['gateways', 'Gateways PIX'], ['tracking', 'Tracking'], ['utmfy', 'UTMfy e Pushcut'], ['sms', 'SMS e remarketing']],
  ['Diagnóstico', ['navigation', 'Saídas por etapa'], ['security', 'Auditoria e segurança']],
];
const sectionNames = Object.fromEntries(groups.flatMap(([, ...links]) => links));
const eventTypes = ['PageView', 'ViewContent', 'Lead', 'InitiateCheckout', 'Purchase'];
const trackedLabels = {
  inicio: 'Página inicial', oferta: 'Sobre a oferta', cadastro: 'Cadastro',
  questionario: 'Questionário', regiao: 'Disponibilidade por região', analise: 'Análise e ofertas',
};
const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const integer = new Intl.NumberFormat('pt-BR');
const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const contexts = { days: 7, q: '', page: 1, gateway: '', status: '' };
let operator;
let state;
let sequence = 0;

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, mark => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[mark]
  ));
}

const money = cents => moneyFormat.format(cents / 100);
const checked = value => value ? ' checked' : '';
const selected = value => value ? ' selected' : '';
const section = () => Object.hasOwn(sectionNames, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
const params = (fields = {}) => new URLSearchParams({ ...contexts, ...fields });

async function api(route, options) {
  const query = params({ route });
  const response = await fetch(`/api/admin?${query}`, options && {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'O painel ficou indisponível.');
  return data;
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
  document.querySelector('#operator-name').textContent = user?.email || '';
  if (!user) view.replaceChildren();
}

function nav(active) {
  navigation.innerHTML = groups.map(([group, ...links]) => '<p class="nav-label">' + group + '</p>' +
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

function panel(name, body, badge = '') {
  return `<section class="panel"><div class="panel-head"><h2>${escape(name)}</h2>${badge ? `<span class="badge">${escape(badge)}</span>` : ''}</div>${body}</section>`;
}

function table(headers, rows) {
  if (!rows.length) return '<p class="empty">Nenhum registro para estes filtros.</p>';
  return '<div class="scroller"><table><thead><tr>' + headers.map(header => `<th scope="col">${escape(header)}</th>`).join('') +
    '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') +
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

function dashboard(data) {
  const { counts } = data;
  return title('Visão geral', 'Acompanhe o funil e as vendas de teste da campanha.') + range() + '</div>' +
    '<div class="cards">' + [
      ['Visitas de exemplo', integer.format(counts.visits)], ['Cadastros de exemplo', integer.format(counts.leads)],
      ['Pedidos de teste', integer.format(counts.orders)], ['Pagos no teste', integer.format(counts.paid)],
      ['Receita simulada', money(counts.revenue)],
    ].map(([label, value]) => metric(label, value)).join('') + '</div>' +
    '<div class="columns">' + panel('Funil da campanha', bars(data.funnel), 'Amostra') +
    panel('Visitas por dia', bars(data.daily.slice(-7).map(item => ({ name: item.day.slice(5).split('-').reverse().join('/'), count: item.visits })))) +
    '</div>' + '<div class="stack dashboard-controls">' + panel('Controles da demonstração', [
      ['compareGateways', 'Comparar gateways'], ['offerExtras', 'Exibir acessórios no catálogo de teste'],
    ].map(([id, label]) => `<label class="control-row checkbox"><span>${label}</span>
      <input type="checkbox" data-change="feature" data-key="${id}"${checked(state.settings[id])}></label>`).join('')) + '</div>';
}

function pagination(result) {
  const total = Math.max(1, Math.ceil(result.total / result.perPage));
  return `<div class="paginate"><span>${result.total} registros · página ${result.page} de ${total}</span>
    <div class="controls"><button class="button secondary" type="button" data-page="${result.page - 1}"${result.page <= 1 ? ' disabled' : ''}>Anterior</button>
    <button class="button secondary" type="button" data-page="${result.page + 1}"${result.page >= total ? ' disabled' : ''}>Próxima</button></div></div>`;
}

function listView(kind, data) {
  const sales = kind === 'sales';
  const listTitle = sales ? 'Transações simuladas' : 'Cadastros de teste';
  const filters = sales ? `<label>Gateway <select name="gateway"><option value="">Todos</option>${state.settings.gateways.map(({ name }) =>
    `<option${selected(name === contexts.gateway)}>${escape(name)}</option>`).join('')}</select></label>
    <label>Estado <select name="status"><option value="">Todos</option>${['Pago no teste', 'Pendente no teste'].map(status =>
      `<option${selected(status === contexts.status)}>${status}</option>`).join('')}</select></label>` : '';
  const columns = sales ? ['Pedido', 'Gateway', 'Valor', 'Estado'] : ['Cadastro', 'Cidade', 'Origem', 'Última etapa', ''];
  const rows = data.items.map(row => sales
    ? [escape(row.id), escape(row.gateway), money(row.total), escape(row.status)]
    : [escape(row.name), escape(row.city), escape(row.origin), escape(row.steps.at(-1)),
      `<button type="button" class="button secondary" data-lead="${escape(row.id)}">Detalhes</button>`]);
  return title(sectionNames[kind], 'Consulte e exporte registros demonstrativos por período.') + range() + '</div>' +
    panel(listTitle, `<form id="filters" class="controls">
      <label>Buscar<input name="q" value="${escape(contexts.q)}" maxlength="100" placeholder="Buscar registros"></label>${filters}
      <button class="button primary" type="submit">Filtrar</button>
      <a class="button secondary" href="/api/admin?${escape(params({ route: 'export', kind }))}">Exportar CSV</a>
      </form>` + table(columns, rows) + pagination(data));
}

function gatewayView(data) {
  const rows = state.settings.gateways.map(({ name, enabled }, index) =>
    [String(index + 1), escape(name), `<label class="checkbox"><input type="checkbox" data-change="gateway" data-key="${escape(name)}"${checked(enabled)}>Ativo</label>`,
      `<div class="controls">
        <button type="button" title="Subir prioridade" aria-label="Subir prioridade de ${escape(name)}" class="button secondary" data-priority="-1" data-key="${escape(name)}"${index === 0 ? ' disabled' : ''}>↑</button>
        <button type="button" title="Descer prioridade" aria-label="Descer prioridade de ${escape(name)}" class="button secondary" data-priority="1" data-key="${escape(name)}"${index === state.settings.gateways.length - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" class="button secondary" data-pix="${escape(name)}"${enabled ? '' : ' disabled'}>Testar PIX</button></div>`]);
  const gatewaySales = data.gatewaySales.map(row =>
    [escape(row.name), integer.format(row.orders), integer.format(row.paid), money(row.revenue)]);
  return title('Gateways PIX', 'Configure a ordem e gere comprovantes de teste dos seis gateways.') + range() + '</div><div class="stack">' +
    panel('Prioridade dos gateways', table(['Ordem', 'Gateway', 'Modo de teste', 'Ações'], rows), 'Simulação') +
    (state.settings.compareGateways ? panel('Desempenho no período', table(['Gateway', 'Pedidos', 'Pagos no teste', 'Receita simulada'], gatewaySales)) : '') +
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
    <div class="control-row"><button type="button" class="button secondary" data-integration="${channel}">Executar teste local</button></div>`, 'Simulação')).join('');
}

async function render() {
  if (!operator) return;
  const current = ++sequence;
  const active = section();
  nav(active);
  view.setAttribute('aria-busy', 'true');
  try {
    const [settings, data, traffic] = await Promise.all([
      api('settings'),
      api(['leads','sales'].includes(active) ? active : 'overview'),
      active === 'pages' ? api('traffic') : null,
    ]);
    if (current !== sequence || !operator) return;
    state = settings;
    const placeholderHistory = state.audit.filter(entry => ['UTMfy','Pushcut','SMSMais'].includes(entry.detail));
    const renderers = {
      overview: () => dashboard(data),
      pages: () => title('Páginas e funil', 'Compare as visitas da jornada acompanhada com o funil de exemplo.') + range() + '</div><div class="columns">' +
        panel('Tracking da jornada de teste', '<p class="empty">Abra o site abaixo e percorra as etapas. A contagem acompanha esta jornada de teste.</p>' +
          '<a href="/?analytics=demo" target="_blank" rel="noopener" class="button primary">Abrir jornada com tracking</a> ' +
          '<button type="button" id="refresh-tracking" class="button secondary">Atualizar</button>' +
          bars(traffic.rows.map(row => ({ name: trackedLabels[row.page], count: row.count }))), traffic.limit ? 'Últimos 1.000 eventos' : 'Visitas de teste') +
        panel('Etapas percorridas', bars(data.funnel), 'Amostra') + '</div>',
      leads: () => listView('leads', data),
      sales: () => listView('sales', data),
      audience: () => title('Público', 'Agrupamentos das sessões de exemplo com vendas confirmadas em teste.') + range() + '</div><div class="columns">' +
        panel('Cidades', bars(data.audience.city)) + panel('Origens', bars(data.audience.origin)) +
        panel('Aparelhos', bars(data.audience.device)) + '</div>',
      catalog: catalogView,
      gateways: () => gatewayView(data),
      tracking: () => title('Tracking', 'Configure a matriz de eventos para validar o fluxo em simulação.') + '</div><div class="columns">' + trackingCards(['Meta','TikTok']) + '</div>',
      utmfy: () => title('UTMfy e Pushcut', 'Valide eventos e notificações com registros de teste.') + '</div><div class="stack">' +
        '<div class="columns">' + trackingCards(['UTMfy','Pushcut']) + '</div>' + panel('Histórico de testes', auditTable(placeholderHistory.filter(entry => entry.detail !== 'SMSMais'))) + '</div>',
      sms: () => title('SMS e remarketing', 'Teste o registro de eventos da integração em modo de demonstração.') + '</div><div class="stack">' +
        trackingCards(['SMSMais']) + panel('Histórico de testes', auditTable(placeholderHistory.filter(entry => entry.detail === 'SMSMais'))) + '</div>',
      navigation: () => title('Saídas por etapa', 'Consulte o abandono observado nas jornadas de exemplo.') + range() + '</div>' +
        panel('Principais saídas', bars(data.funnel.map(row => ({ name: row.name, count: row.departures })))),
      security: () => title('Auditoria e segurança', 'Histórico das mudanças feitas por operadores neste painel.') + '</div>' +
        panel('Atividade do painel', auditTable(state.audit)),
    };
    view.innerHTML = renderers[active]();
  } catch (error) {
    if (current === sequence) notice(error.message, true);
  } finally {
    if (current === sequence) view.removeAttribute('aria-busy');
  }
}

async function command(type, key, value) {
  const response = await api('command', { type, key, value, version: state.version });
  state = response.state;
  await render();
  notice(response.result.status ? `${response.result.detail} · ${response.result.status}` : response.result.title);
  return response.result;
}

function showDetails(titleText, content) {
  document.querySelector('#details-title').textContent = titleText;
  document.querySelector('#details-content').innerHTML = content;
  details.showModal();
}

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
  } catch (error) { notice(error.message, true); } finally { submit.disabled = false; }
});

document.querySelector('#logout').addEventListener('click', async () => {
  try { await api('logout', {}); account(null); notice(''); } catch (error) { notice(error.message, true); }
});

window.addEventListener('hashchange', () => {
  Object.assign(contexts, { q: '', page: 1, gateway: '', status: '' });
  notice('');
  render();
});

view.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const entries = Object.fromEntries(new FormData(form));
  if (form.id === 'filters') {
    Object.assign(contexts, entries, { page: 1 });
    await render();
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
    contexts.page = 1;
    await render();
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
  if (!button) return;
  try {
    if (button.id === 'refresh-tracking') await render();
    if (button.dataset.page) { contexts.page = Number(button.dataset.page); await render(); }
    if (button.dataset.priority) await command('priority', button.dataset.key, Number(button.dataset.priority));
    if (button.dataset.integration) await command('integration-test', button.dataset.integration);
    if (button.dataset.pix) {
      const result = await command('pix', button.dataset.pix);
      showDetails('PIX de teste', `<p class="muted">Identificador de simulação para ${escape(result.detail)}.</p>
        <p class="empty">${escape(result.code)}</p><p>Este teste não gera cobrança.</p>`);
    }
    if (button.dataset.lead) {
      const response = await fetch(`/api/admin?${params({ route: 'lead', id: button.dataset.lead })}`);
      if (!response.ok) throw new Error('Registro indisponível neste período.');
      const { lead, orders } = await response.json();
      showDetails(lead.name, `<p>${escape(lead.city)} · ${escape(lead.origin)} · ${escape(lead.device)}</p>
        <ol class="details-list">${lead.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>` +
        table(['Pedido', 'Gateway', 'Valor'], orders.map(order => [escape(order.id), escape(order.gateway), money(order.total)])));
    }
  } catch (error) { notice(error.message, true); }
});

try {
  const mode = await api('mode');
  if (mode.local) {
    const fields = document.querySelector('#credentials');
    fields.hidden = true;
    for (const input of fields.querySelectorAll('input')) input.disabled = true;
    document.querySelector('#login-action').textContent = 'Abrir painel de teste';
  }
  const session = await api('session').catch(() => null);
  if (session) { account(session.operator); await render(); }
} catch (error) {
  notice(error.message, true);
  document.querySelector('#login-action').disabled = true;
}
