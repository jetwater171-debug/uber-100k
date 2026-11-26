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
  const fields = rows => '<dl class="lead-fields">' + rows.map(([label, value]) =>
    `<div><dt>${escape(label)}</dt><dd>${escape(value ?? '—')}</dd></div>`).join('') + '</dl>';
  const card = (heading, body, wide = false) => `<section class="panel${wide ? ' lead-wide' : ''}">
    <div class="panel-head"><h2>${escape(heading)}</h2></div>${body}</section>`;
  const list = rows => rows.length ? '<ol class="lead-timeline">' +
    rows.map(row => `<li>${escape(row)}</li>`).join('') + '</ol>' : '<p class="empty">Nenhum evento registrado.</p>';

  function render(data) {
    const { lead, orders } = data;
    const ordered = orders.toSorted((first, next) => next.createdAt.localeCompare(first.createdAt));
    const latest = ordered[0];
    const journey = lead.visits
      ? lead.visits.map(row => `${row.at ? when(row.at) : day(row.day)} · ${row.title}`)
      : lead.steps;
    const activity = (lead.activity || []).map(row => `${when(row.at)} · ${row.title}`);
    title.textContent = lead.name;
    subtitle.textContent = 'Jornada acompanhada';
    summary.innerHTML = fields([['Sessão', lead.id], ['Etapa mais avançada', lead.steps.at(-1)], ['Pedidos', orders.length],
      ['Status do pedido', latest?.status], ['Valor', latest ? money(latest.total) : '—']]);
    actions.innerHTML = `
      <button type="button" class="button primary" data-lead-action="lookup"${latest ? '' : ' disabled'}>Consultar transação</button>
      <button type="button" class="button secondary" data-lead-action="copy-link">Copiar link da sessão</button>
      <button type="button" class="button secondary" data-lead-action="refresh">Atualizar dados</button>`;
    main.innerHTML = card('Visão geral', fields([
      ['Primeiro registro', lead.startedOn ? day(lead.startedOn) : when(lead.createdAt)],
      ['Páginas e etapas', lead.steps.length], ['Eventos da jornada', activity.length],
      ['Situação do último pedido', latest?.status || 'Sem pedido'],
    ]), true) +
      card('Identificação', fields([['Lead', lead.name], ['Identificador', lead.id]])) +
      card('Origem e tracking', fields([['Origem', lead.origin], ['Etapa', lead.steps.at(-1)]])) +
      card('Pagamento e oferta', table(['Pedido', 'Gateway', 'Valor', 'Estado', ''],
        ordered.map(order => [escape(order.id), escape(order.gateway || '—'), money(order.total), escape(order.status),
          `<button type="button" class="button secondary" data-lead-action="lookup" data-lead-order="${escape(order.id)}">Consultar</button>`])), true) +
      card('Consulta da transação', '<div id="lead-transaction" role="status"><p class="empty">Selecione um pedido para consultar.</p></div>', true) +
      card('Jornada registrada', `<div class="columns"><div><h3>Páginas</h3>${list(journey)}</div>
        <div><h3>Eventos</h3>${list(activity)}</div></div>`, true) +
      `<section class="panel lead-wide"><div class="panel-head"><h2>Dados da sessão</h2>
        <button type="button" class="button secondary" data-lead-action="copy-json">Copiar JSON</button></div>
        <details><summary>Ver JSON</summary><pre class="lead-data">${escape(JSON.stringify(data, null, 2))}</pre></details></section>`;
  }

  async function open(id) {
    const attempt = ++reference;
    current = null;
    title.textContent = 'Sessão';
    subtitle.textContent = 'Carregando detalhes…';
    feedback.textContent = '';
    summary.replaceChildren();
    actions.replaceChildren();
    main.replaceChildren();
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
        const url = new URL('/admin', location.origin);
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
        const transaction = main.querySelector('#lead-transaction');
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
