export const journeyPages = {
  inicio: 'Início',
  oferta: 'Sobre a oferta',
  cadastro: 'Cadastro',
  questionario: 'Questionário',
  regiao: 'Disponibilidade por região',
  analise: 'Análise e ofertas',
};

const milestones = {
  inicio: { offer_requested: 'Apresentação da oferta solicitada' },
  oferta: { signup_started: 'Formulário iniciado' },
  cadastro: { profile_submitted: 'Cadastro concluído' },
  questionario: {
    ...Object.fromEntries(Array.from({ length: 6 }, (_, index) =>
      [`quiz_${index + 1}`, `Resposta ${index + 1} registrada`])),
    quiz_completed: 'Questionário concluído',
  },
  regiao: {
    lookup_started: 'Consulta de CEP iniciada',
    lookup_resolved: 'Região encontrada',
    lookup_not_found: 'CEP não encontrado',
    lookup_failed: 'Consulta indisponível',
    lookup_changed: 'Alteração do CEP solicitada',
  },
  analise: {
    review_started: 'Análise simulada iniciada',
    review_completed: 'Análise simulada concluída',
    selection_changed: 'Itens da oferta alterados',
    selection_opened: 'Resumo da seleção aberto',
    selection_failed: 'Falha ao criar pedido de teste',
  },
};

export function journeyTitle(page, event) {
  if (!Object.hasOwn(journeyPages, page)) return null;
  if (event === 'page_return') return 'Retorno pelo navegador';
  const allowed = milestones[page];
  return allowed && Object.hasOwn(allowed, event) ? allowed[event] : null;
}

export function summarizeJourney(events) {
  const counts = new Map();
  const returns = new Map();
  for (const { page, event } of events) {
    const target = event === 'page_return' ? returns : counts;
    const label = event === 'page_return' ? journeyPages[page] : journeyTitle(page, event);
    if (label) target.set(label, (target.get(label) || 0) + 1);
  }
  const rank = items => [...items].map(([name, count]) => ({ name, count }))
    .sort((first, next) => next.count - first.count || first.name.localeCompare(next.name));
  return { milestones: rank(counts), returns: rank(returns), limited: events.length >= 1000 };
}
