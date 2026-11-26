import { integrationForms } from './integration-forms.js?v=1';

const numbers = new Intl.NumberFormat('pt-BR');
const dates = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
const rate = (count, base) => base ? Math.round(count * 100 / base) : 0;

export async function gatewayTemplate() {
  const response = await fetch('/admin/gateways.template.html?v=2');
  if (!response.ok) throw new Error('Não foi possível carregar a página de gateways.');
  return response.text();
}

export function populateGateways(root, { data, traffic, gateways, expanded }) {
  const { funnel, counts, lastActivity, dailyGatewaySales, journeyGatewaySales } = data;
  const configured = gateways.find(entry => entry.enabled)?.name || '—';
  const period = new Map(journeyGatewaySales.map(row => [row.name, row]));
  const today = new Map(dailyGatewaySales.map(row => [row.name, row]));
  const best = journeyGatewaySales.filter(row => row.orders)
    .toSorted((a, b) => rate(b.paid, b.orders) - rate(a.paid, a.orders))[0];
  const base = numbers.format(traffic.sessions);
  const text = {
    'metric-base': 'Base: ' + base,
    'metric-total': base,
    'metric-active-gateway': configured,
    'gateway-priority-current': configured,
    'metric-best-gateway': best ? best.name + ' (' + rate(best.paid, best.orders) + '%)' : '—',
    'metric-updated': lastActivity ? dates.format(new Date(lastActivity)) : '—',
    'metric-pix': counts.testPaid,
    'metric-frete': funnel.selection,
    'metric-cep': funnel.postal,
    'metric-conv-pix': rate(funnel.paid, traffic.sessions) + '%',
    'metric-conv-frete': rate(funnel.selection, traffic.sessions) + '%',
    'metric-conv-cep': rate(funnel.postal, traffic.sessions) + '%',
  };
  for (const [id, value] of Object.entries(text)) root.querySelector('#' + id).textContent = value;

  const kpis = root.querySelector('#gateway-kpis');
  const priority = root.querySelector('#payments-gateway-order');
  const cards = root.querySelector('.gateway-card-list');
  gateways.forEach(({ name, enabled }, index) => {
    const total = period.get(name);
    const daily = today.get(name);
    const kpi = document.createElement('div');
    kpi.className = 'admin-kpi';
    kpi.append(Object.assign(document.createElement('span'), { textContent: name }),
      Object.assign(document.createElement('strong'), { textContent: rate(total.paid, total.orders) + '%' }),
      Object.assign(document.createElement('em'), { textContent: total.paid + ' confirmados / ' + total.orders + ' PIX de teste' }));
    kpis.append(kpi);
    const row = root.querySelector('#gateway-order-template').content.firstElementChild.cloneNode(true);
    row.dataset.gatewayOrderItem = name;
    row.classList.toggle('is-disabled', !enabled);
    row.querySelector('.gateway-order-index').textContent = index + 1;
    row.querySelector('.gateway-order-name').textContent = name;
    row.querySelector('[data-gateway-order-generated]').textContent = daily.orders;
    row.querySelector('[data-gateway-order-paid]').textContent = daily.paid;
    row.querySelector('[data-gateway-order-conversion]').textContent = rate(daily.converted, daily.orders) + '%';
    row.querySelector('meter').value = rate(daily.converted, daily.orders);
    const pill = row.querySelector('.gateway-order-state');
    pill.textContent = enabled ? 'Ligado' : 'Desligado';
    pill.classList.toggle('is-on', enabled);
    const [up, down] = row.querySelectorAll('.gateway-order-move');
    up.disabled = index === 0;
    down.disabled = index === gateways.length - 1;
    up.setAttribute('aria-label', 'Subir ' + name);
    down.setAttribute('aria-label', 'Descer ' + name);
    priority.append(row);

    const card = root.querySelector('#gateway-card-template').content.firstElementChild.cloneNode(true);
    card.dataset.gatewayCard = name;
    card.classList.toggle('is-current', name === configured);
    card.querySelector('h3').textContent = name;
    card.querySelector('.gateway-card-heading p').textContent = 'Roteamento e diagnóstico de PIX no ambiente de teste.';
    const toggle = card.querySelector('input');
    const inputId = 'gateway-enabled-' + index;
    toggle.id = inputId;
    toggle.checked = enabled;
    toggle.dataset.gatewayEnabled = name;
    toggle.setAttribute('aria-label', 'Ativar ' + name);
    card.querySelector('label').htmlFor = inputId;
    const switchText = card.querySelector('.gateway-switch-text');
    switchText.removeAttribute('id');
    switchText.textContent = pill.textContent;
    switchText.classList.toggle('is-on', enabled);
    const body = card.querySelector('.gateway-card-body');
    body.id = 'gateway-config-' + index;
    card.querySelector('.gateway-config-toggle').setAttribute('aria-controls', body.id);
    setGatewayCardOpen(card, expanded.has(name));
    card.querySelector('[data-provider-fields]').innerHTML = integrationForms[name];
    card.querySelector('[data-test-provider]').dataset.testProvider = name;
    cards.append(card);
  });
}

export function setGatewayCardOpen(card, open) {
  card.classList.toggle('is-open', open);
  const button = card.querySelector('.gateway-config-toggle');
  button.textContent = open ? 'Fechar' : 'Configurar';
  button.setAttribute('aria-expanded', String(open));
  card.querySelector('.gateway-card-body').inert = !open;
}
