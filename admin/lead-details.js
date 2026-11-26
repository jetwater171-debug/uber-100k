export function leadDetails({ request, openOrder, escape, money, date, table, period }) {
  const dialog = document.querySelector('#lead-details');
  const title = dialog.querySelector('#lead-title');
  const subtitle = dialog.querySelector('#lead-subtitle');
  const summary = dialog.querySelector('#lead-summary');
  const actions = dialog.querySelector('#lead-actions');
  const feedback = dialog.querySelector('#lead-feedback');
  const main = dialog.querySelector('#lead-main');
  let current;
  let reference = 0;

  const when = value => value ? date.format(new Date(value)) : '—';
  const day = value => value?.split('-').reverse().join('/') || '—';
  const part = name => main.querySelector('#lead-detail-' + name);
  const fields = rows => rows.map(([label, value]) =>
    `<div class="lead-detail-field"><strong>${escape(label)}</strong><span class="lead-detail-field__value">${escape(value ?? '—')}</span></div>`).join('');
  const metrics = (rows, className) => rows.map(([label, value]) =>
    `<div class="${className}"><span>${escape(label)}</span><strong>${escape(value ?? '—')}</strong></div>`).join('');
  const history = rows => rows.length ? '<ol class="lead-timeline lead-detail-history">' +
    rows.map(({ title, time }) => `<li><strong>${escape(title)}</strong><span>${escape(time)}</span></li>`).join('') + '</ol>'
    : '<p class="empty">Nenhum evento registrado no período.</p>';

  function render(data) {
    const { lead, orders } = data;
    const ordered = orders.toSorted((first, next) => next.createdAt.localeCompare(first.createdAt));
    const latest = ordered[0];
    const visits = lead.visits.map(row => ({ title: row.title, time: row.at ? when(row.at) : day(row.day) }));
    const activity = (lead.activity || []).map(row => ({ title: row.title, time: when(row.at) }));
    const region = activity.find(row => ['Região encontrada', 'CEP não encontrado', 'Consulta indisponível', 'Consulta de CEP iniciada'].includes(row.title));
    title.textContent = lead.name;
    subtitle.textContent = lead.origin;
    dialog.querySelector('#lead-detail-meta').innerHTML = [lead.steps.at(-1), latest?.status]
      .filter(Boolean).map(label => `<span class="badge">${escape(label)}</span>`).join('');
    summary.innerHTML = metrics([['Páginas', lead.steps.length], ['Eventos', activity.length], ['Pedidos', orders.length],
      ['Valor', latest ? money(latest.total) : '—']], 'lead-detail-summary-card');
    actions.innerHTML = `
      <button type="button" class="button primary" data-lead-action="lookup"${latest ? '' : ' disabled'}>Consultar transação</button>
      <button type="button" class="button secondary" data-lead-action="copy-link">Copiar link da sessão</button>
      <button type="button" class="button secondary" data-lead-action="refresh">Atualizar dados</button>`;
    part('overview').innerHTML = metrics([
      ['Primeiro registro', day(lead.startedOn)], ['Última visita', lead.updatedAt ? when(lead.updatedAt) : day(lead.updatedOn)],
      ['Etapa mais avançada', lead.steps.at(-1)], ['Pedido mais recente', latest?.status || 'Sem pedido'],
    ], 'lead-detail-stat');
    part('identity').innerHTML = fields([['Identificação', lead.name], ['ID da sessão', lead.id]]);
    part('address').innerHTML = fields([['Resultado', region?.title || 'Sem consulta registrada'], ['Quando', region?.time]]);
    part('tracking').innerHTML = fields([['Origem', lead.origin], ['Páginas visitadas', lead.steps.length]]);
    part('device').innerHTML = fields([['Último evento registrado', activity[0]?.title], ['Horário', activity[0]?.time]]);
    part('technical').innerHTML = fields([['Eventos no período', activity.length], ['Registros de visita', visits.length]]);
    part('payment').innerHTML = latest ? fields([['Gateway', latest.gateway || '—'], ['Valor', money(latest.total)]]) +
      '<details><summary>Ver pedidos</summary>' + table(['Pedido', 'Estado', 'Ação'], ordered.map(order => [
        escape(order.id), escape(order.status), `<button type="button" class="button secondary" data-lead-action="lookup"
          data-lead-order="${escape(order.id)}">Consultar</button>`,
      ])) + '</details>' : '<p class="empty">Nenhum pedido nesta sessão.</p>';
    part('transaction-status').textContent = latest ? 'Aguardando consulta' : 'Sem pedido';
    part('transaction-summary').textContent = '';
    part('pages').innerHTML = `<div class="columns"><div><h3>Páginas</h3>${history(visits)}</div>
      <div><h3>Eventos</h3>${history(activity)}</div></div>`;
    part('payload').textContent = JSON.stringify(data, null, 2);
    main.hidden = false;
    main.scrollTop = 0;
  }

  async function open(id) {
    const attempt = ++reference;
    current = null;
    title.textContent = 'Sessão';
    subtitle.textContent = 'Carregando detalhes…';
    feedback.textContent = '';
    summary.replaceChildren();
    actions.replaceChildren();
    dialog.querySelector('#lead-detail-meta').replaceChildren();
    main.hidden = true;
    if (!dialog.open) dialog.showModal();
    try {
      const data = await request('lead', { id });
      if (reference !== attempt || !dialog.open) return;
      current = data;
      render(data);
    } catch (error) {
      if (reference === attempt && dialog.open) subtitle.textContent = error.message;
    }
  }

  dialog.addEventListener('close', () => { reference++; current = null; });
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('button[data-lead-action]');
    if (!button || !current) return;
    const { leadAction, leadOrder } = button.dataset;
    const data = current;
    const attempt = reference;
    button.disabled = true;
    try {
      if (leadAction === 'refresh') { await open(data.lead.id); return; }
      if (leadAction === 'copy-link') {
        const url = new URL('/admin/leads', location.origin);
        url.hash = `leads/${encodeURIComponent(data.lead.id)}`;
        for (const [key, value] of Object.entries(period())) {
          if (value) url.searchParams.set(key, value);
        }
        await navigator.clipboard.writeText(url.href);
        feedback.textContent = 'Link privado copiado.';
      }
      if (leadAction === 'copy-json') {
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        feedback.textContent = 'JSON copiado.';
      }
      if (leadAction === 'lookup') {
        const selected = leadOrder
          ? data.orders.find(order => order.id === leadOrder)
          : data.orders.toSorted((first, next) => next.createdAt.localeCompare(first.createdAt))[0];
        if (!selected) return;
        const order = selected.items ? (await request('order', { id: selected.id })).order : selected;
        if (reference !== attempt || !dialog.open) return;
        const transaction = part('transaction-summary');
        part('transaction-status').textContent = order.status;
        transaction.innerHTML = fields([
          ['Pedido', order.id], ['Gateway', order.gateway], ['Estado', order.status],
          ['Valor', money(order.total)], ['Código PIX de teste', order.payment?.code],
        ]) + (order.items ? `<div class="lead-actions"><button type="button" class="button secondary"
          data-lead-action="open-order" data-lead-order="${escape(order.id)}">Abrir pedido de teste</button></div>` : '');
        transaction.scrollIntoView({ block: 'nearest' });
      }
      if (leadAction === 'open-order') await openOrder(leadOrder);
    } catch (error) {
      if (reference === attempt && dialog.open) feedback.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  return { open, close: () => { if (dialog.open) dialog.close(); } };
}
