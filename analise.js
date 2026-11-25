const flow = campaignFlow.read();
const reviewPage = document.querySelector('.review-page');
const reviewProgress = document.getElementById('review-progress');
const reviewMeter = document.getElementById('review-meter');
const reviewPanel = document.getElementById('review-panel');
const reviewSimulation = document.getElementById('review-simulation');
const reviewAnnouncement = document.getElementById('review-announcement');
const reviewMotion = matchMedia('(prefers-reduced-motion: reduce)');
const approvedPage = document.getElementById('approved-page');
const offerList = document.getElementById('ofertas');
const approvedCount = document.getElementById('approved-count');
const approvedTotal = document.getElementById('approved-total');
const approvedAction = document.getElementById('approved-action');
const selectionDialog = document.getElementById('selection-dialog');
const selectionItems = document.getElementById('selection-items');
const selectionTotal = document.getElementById('selection-total');
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

for (const card of offerList.querySelectorAll('.approved-card')) {
  const original = Number(card.querySelector('.approved-original-price').value);
  const current = Number(card.querySelector('.approved-price').value);
  const discount = percent.format((original - current) / original);
  card.querySelector('.approved-discount').textContent = `${discount} OFF`;
}

function selectedOffers() {
  return Array.from(offerList.querySelectorAll('.approved-option:checked'), option => {
    const card = option.closest('.approved-card');
    return {
      name: card.querySelector('strong').textContent,
      cents: Number(card.querySelector('data.approved-price').value),
    };
  });
}

function syncSelection() {
  const offers = selectedOffers();
  const cents = offers.reduce((total, offer) => total + offer.cents, 0);
  approvedCount.textContent = offers.length === 1 ? '1 item selecionado' : `${offers.length} itens selecionados`;
  approvedTotal.textContent = currency.format(cents / 100);
  return offers;
}

offerList.addEventListener('change', syncSelection);
window.addEventListener('pageshow', syncSelection);

approvedAction.addEventListener('click', () => {
  const rows = syncSelection().map(offer => {
    const row = document.createElement('li');
    const price = document.createElement('strong');
    price.textContent = currency.format(offer.cents / 100);
    row.append(offer.name, price);
    return row;
  });
  selectionItems.replaceChildren(...rows);
  selectionTotal.textContent = approvedTotal.textContent;
  selectionDialog.showModal();
});

const checks = [
  {
    title: 'Conferindo sua região.',
    result: flow.region?.city ? `Região do CEP: ${flow.region.city}.` : 'Região de exemplo conferida.',
    duration: 1750,
  },
  {
    title: 'Analisando sua rotina de corridas.',
    result: flow.answers === 6 ? 'Respostas conferidas.' : 'Respostas de exemplo conferidas.',
    duration: 2200,
  },
  {
    title: 'Simulando a validação do perfil, do histórico de corridas e das avaliações.',
    result: flow.profileComplete === true ? 'Validação simulada.' : 'Validação simulada com cadastro de exemplo.',
    duration: 2350,
  },
];

const scanDuration = checks.reduce((total, check) => total + check.duration, 0);
const approvalDuration = 1150;
const preparationDuration = 950;
const revealDuration = 850;
const totalDuration = scanDuration + approvalDuration + preparationDuration + revealDuration;

function advanceReview(elapsed, duration) {
  if (reviewMotion.matches) {
    reviewMeter.value = 100 * (elapsed + duration) / totalDuration;
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const start = performance.now();
    function update(now) {
      const phaseTime = Math.min(duration, Math.max(0, now - start));
      reviewMeter.value = 100 * (elapsed + phaseTime) / totalDuration;
      if (phaseTime < duration) requestAnimationFrame(update);
      else resolve();
    }
    requestAnimationFrame(update);
  });
}

async function runReview() {
  const rows = [...reviewPanel.querySelectorAll('.review-row')];
  reviewProgress.hidden = false;
  reviewPanel.hidden = false;

  let elapsed = 0;
  for (const [index, check] of checks.entries()) {
    const row = rows[index];
    const status = row.querySelector('.review-state');
    row.dataset.phase = 'checking';
    status.textContent = 'Em andamento';
    reviewAnnouncement.textContent = check.title;
    await advanceReview(elapsed, check.duration);
    elapsed += check.duration;
    row.dataset.phase = 'complete';
    status.textContent = check.result;
  }

  reviewPage.dataset.active = 'approved';
  reviewSimulation.textContent = 'Perfil aprovado na simulação';
  reviewAnnouncement.textContent = 'Perfil aprovado na simulação.';
  await advanceReview(elapsed, approvalDuration);
  elapsed += approvalDuration;

  const offerRow = rows[checks.length];
  const offerStatus = offerRow.querySelector('.review-state');
  offerRow.dataset.phase = 'checking';
  offerStatus.textContent = 'Em andamento';
  reviewSimulation.textContent = 'Preparando suas ofertas…';
  reviewAnnouncement.textContent = 'Preparando suas ofertas.';
  await advanceReview(elapsed, preparationDuration);
  elapsed += preparationDuration;

  offerRow.dataset.phase = 'complete';
  offerStatus.textContent = 'Ofertas liberadas na simulação.';
  reviewPage.dataset.active = 'reveal';
  reviewSimulation.textContent = 'Ofertas liberadas';
  reviewAnnouncement.textContent = 'Ofertas liberadas na simulação.';
  await advanceReview(elapsed, revealDuration);

  reviewPage.hidden = true;
  approvedPage.hidden = false;
  syncSelection();
  reviewAnnouncement.textContent = 'Perfil aprovado na simulação. Confira os itens disponíveis para seleção.';
}

runReview();
