(() => {
  const pages = { '': 'inicio', index: 'inicio', 'sobre-a-oferta': 'oferta',
    eligibilidade: 'cadastro', questionario: 'questionario', disponibilidade: 'regiao', analise: 'analise' };
  const page = pages[location.pathname.split('/').pop().replace(/\.html$/, '')];
  if (!page) return;
  const catalog = async () => {
    const response = await fetch('/api/admin?route=site-catalog', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Catálogo indisponível.');
    return (await response.json()).items;
  };

  const price = document.querySelector('[data-camera-price]');
  if (price) {
    document.querySelector('main .primary-action').addEventListener('click', () => {
      window.campaignJourney?.track(page === 'inicio' ? 'offer_requested' : 'signup_started');
    });
    const updatePrice = async () => {
      const action = document.querySelector('main .primary-action');
      try {
        const camera = (await catalog()).find(item => item.id === 'camera');
        if (camera) {
          price.textContent = (camera.cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          action.hidden = false;
          return;
        }
        price.textContent = 'Indisponível';
      } catch { price.textContent = 'Preço indisponível'; }
      action.hidden = true;
    };
    updatePrice();
    window.addEventListener('pageshow', event => { if (event.persisted) updatePrice(); });
  }
  if (window.campaignDemo) {
    window.campaignJourney = window.campaignDemo;
    return;
  }

  const key = 'campaign-metrics-choice';
  function readChoice() {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  let choice = readChoice();
  const privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  if (privacySignal) choice = 'off';
  function post(route, data) {
    return fetch('/api/admin?route=site-' + route, {
      method: 'POST', credentials: 'same-origin', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true,
    });
  }
  async function sync() {
    const response = await post('session', {});
    if (!response.ok) return false;
    const { metrics } = await response.json();
    const enabled = choice === 'on';
    if (metrics !== enabled) {
      const updated = await post('preference', { metrics: enabled });
      return updated.ok && (await updated.json()).metrics;
    }
    return enabled;
  }
  let ready = sync().catch(() => false);
  async function send(event) {
    if (choice !== 'on' || !await ready || choice !== 'on') return;
    const data = { page, event };
    const response = await post('event', data);
    if (response.status === 401 && choice === 'on') {
      ready = sync().catch(() => false);
      if (await ready && choice === 'on') await post('event', data);
    }
  }
  function track(event) { send(event).catch(() => {}); }
  window.campaignJourney = Object.freeze({ catalog, track });

  const dialog = document.createElement('dialog');
  dialog.className = 'metrics-dialog';
  dialog.setAttribute('aria-labelledby', 'metrics-title');
  dialog.innerHTML = '<h2 id="metrics-title">Privacidade do protótipo</h2>' +
    '<p>Esta demonstração simula a análise do perfil e as ofertas. Podemos contar as páginas e etapas que você percorre para melhorar o site?</p>' +
    '<p>Os relatórios usam um código temporário. Nome, telefone, e-mail, CEP e respostas ficam fora das métricas.</p>' +
    '<div><button type="button" value="off">Continuar sem métricas</button><button type="button" value="on">Permitir métricas</button></div>';
  document.body.append(dialog);
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'metrics-settings';
  settings.textContent = 'Privacidade';
  settings.addEventListener('click', () => dialog.showModal());
  document.querySelector('.header-content').append(settings);

  function change(next, remember) {
    choice = privacySignal ? 'off' : next;
    if (remember) { try { localStorage.setItem(key, choice); } catch {} }
    ready = ready.then(sync).catch(() => false);
    if (choice === 'on') track('page_view');
    dialog.close();
  }
  if (privacySignal) {
    dialog.querySelector('[value="on"]').disabled = true;
    dialog.querySelector('p').textContent = 'Seu navegador solicitou privacidade. As métricas desta demonstração estão desativadas.';
  }
  dialog.addEventListener('click', event => {
    if (event.target.matches('button[value]')) change(event.target.value, true);
  });
  dialog.addEventListener('cancel', () => change('off', true));
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) change(readChoice(), false);
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      choice = privacySignal ? 'off' : readChoice();
      ready = ready.then(sync).catch(() => false);
      track('page_view');
    }
    if (event.persisted || performance.getEntriesByType('navigation')[0]?.type === 'back_forward') track('page_return');
  });
  track('page_view');
  if (!choice) {
    const opening = document.querySelector('.site-opening[open]');
    if (opening) opening.addEventListener('close', () => { if (!choice) dialog.showModal(); }, { once: true });
    else dialog.showModal();
  }
})();
