const questions = [
  {
    route: 'experiencia',
    title: 'Há quanto tempo você dirige por aplicativo?',
    hint: 'Escolha a opção mais próxima.',
    options: ['Menos de 6 meses', 'De 6 meses a 2 anos', 'Mais de 2 anos'],
  },
  {
    route: 'frequencia',
    title: 'Com que frequência você faz corridas?',
    hint: 'Pense em uma semana comum.',
    options: ['Quase todos os dias', 'Alguns dias por semana', 'Só de vez em quando'],
  },
  {
    route: 'jornada',
    title: 'Num dia comum, quantas horas você roda?',
    hint: 'Pode ser uma estimativa.',
    options: ['Menos de 4 horas', 'De 4 a 8 horas', 'Mais de 8 horas'],
  },
  {
    route: 'renda',
    title: 'As corridas são sua principal fonte de renda?',
    hint: 'Escolha o que melhor descreve sua situação.',
    options: ['São minha renda principal', 'Complementam minha renda', 'Varia de mês para mês'],
  },
  {
    route: 'trajetos',
    title: 'Onde você costuma rodar mais?',
    hint: 'Pense nos trajetos que você mais faz.',
    options: ['Na região central da cidade', 'Entre bairros da cidade', 'Em regiões variadas'],
  },
  {
    route: 'camera',
    title: 'Você já tem uma câmera de segurança no carro?',
    hint: 'Depois desta resposta, vamos consultar seu CEP.',
    options: ['Sim, e ela funciona bem', 'Sim, mas quero trocar a minha', 'Não, seria a minha primeira câmera'],
  },
];

const form = document.querySelector('.question-form');
const title = document.getElementById('question-title');
const hint = document.getElementById('question-hint');
const step = document.getElementById('question-step');
const choices = document.querySelector('.quiz-options');
const actionLabel = form.querySelector('.primary-action > span');
const progress = document.querySelector('.step-progress');
const answers = new Map();
let currentIndex = 0;

function renderQuestion() {
  const route = window.location.hash.slice(1);
  currentIndex = Math.max(0, questions.findIndex(question => question.route === route));
  const question = questions[currentIndex];
  title.textContent = question.title;
  hint.textContent = question.hint;
  step.textContent = `Pergunta ${currentIndex + 1} de ${questions.length}`;
  progress.value = Math.round(42 + 24 * currentIndex / (questions.length - 1));
  actionLabel.textContent = currentIndex === questions.length - 1 ? 'Continuar para o CEP' : 'Continuar';

  const options = question.options.map((text, index) => {
    const label = document.createElement('label');
    label.className = 'quiz-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'answer';
    input.value = String(index);
    input.required = index === 0;
    input.checked = answers.get(question.route) === input.value;

    const optionText = document.createElement('span');
    optionText.textContent = text;
    label.append(optionText, input);
    return label;
  });
  choices.replaceChildren(...options);
}

form.addEventListener('change', event => {
  answers.set(questions[currentIndex].route, event.target.value);
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const nextQuestion = questions[currentIndex + 1];
  const pendingQuestion = nextQuestion ?? questions.find(question => !answers.has(question.route));
  if (pendingQuestion) {
    window.location.hash = pendingQuestion.route;
  } else {
    window.location.assign('disponibilidade.html');
  }
});

window.addEventListener('hashchange', () => {
  renderQuestion();
  title.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});

renderQuestion();
