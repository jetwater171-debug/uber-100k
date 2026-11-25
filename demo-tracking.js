(() => {
  if (!globalThis.crypto?.randomUUID) return;
  const paths = {
    '': 'inicio',
    'index.html': 'inicio',
    'sobre-a-oferta.html': 'oferta',
    'eligibilidade.html': 'cadastro',
    'questionario.html': 'questionario',
    'disponibilidade.html': 'regiao',
    'analise.html': 'analise',
  };
  const page = paths[location.pathname.split('/').at(-1)];
  if (!page) return;
  const key = 'campaign-analytics-demo-v1';
  let session;
  try {
    if (new URLSearchParams(location.search).get('analytics') === 'demo') {
      sessionStorage.setItem(key, JSON.stringify({ id: crypto.randomUUID(), until: Date.now() + 3600000 }));
    }
    session = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (session && session.until <= Date.now()) {
      sessionStorage.removeItem(key);
      return;
    }
  } catch { return; }
  if (!session?.id) return;
  fetch('/api/admin?route=traffic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, session: session.id }),
    keepalive: true,
  }).catch(() => {});
})();
