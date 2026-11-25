const form = document.querySelector('.data-form');
const fullName = document.getElementById('full-name');
const email = document.getElementById('email');
const phone = document.getElementById('phone');
const emailSuggestions = document.getElementById('email-suggestions');
const domains = ['gmail.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'yahoo.com.br'];
const emailFormat = /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i;
let activeSuggestion = null;

function positionSuggestions() {
  if (emailSuggestions.hidden) return;

  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
  const bottomPadding = parseFloat(getComputedStyle(form.closest('.data-page')).paddingBottom);
  const field = email.getBoundingClientRect();
  const above = field.top - Math.max(headerBottom, viewportTop) - 8;
  const below = viewportBottom - bottomPadding - field.bottom - 8;
  const preferredHeight = Math.min(340, window.innerHeight * 0.44, emailSuggestions.scrollHeight + 2);
  const opensAbove = below < preferredHeight && above > below;

  emailSuggestions.classList.toggle('opens-above', opensAbove);
  emailSuggestions.style.setProperty('--suggestion-space', `${Math.max(0, Math.floor(opensAbove ? above : below))}px`);
}

function closeSuggestions() {
  emailSuggestions.hidden = true;
  emailSuggestions.replaceChildren();
  email.setAttribute('aria-expanded', 'false');
  email.removeAttribute('aria-activedescendant');
  activeSuggestion = null;
}

function updateSuggestions() {
  closeSuggestions();
  const [address, domain = '', extra] = email.value.trim().split('@');
  const domainPrefix = domain.toLowerCase();

  if (!address || /\s/.test(address) || address.length > 64 || extra !== undefined || domains.includes(domainPrefix)) return;

  const matches = domains.filter(candidate => candidate.startsWith(domainPrefix));
  if (!matches.length) return;

  matches.forEach((candidate, index) => {
    const option = document.createElement('li');
    option.id = `email-option-${index}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.textContent = `${address}@${candidate}`;
    emailSuggestions.append(option);
  });
  emailSuggestions.hidden = false;
  email.setAttribute('aria-expanded', 'true');
  positionSuggestions();
}

function selectSuggestion(option) {
  email.value = option.textContent;
  email.dispatchEvent(new Event('input', { bubbles: true }));
}

email.addEventListener('input', updateSuggestions);
email.addEventListener('focus', updateSuggestions);
email.addEventListener('blur', closeSuggestions);
window.addEventListener('resize', positionSuggestions);
window.visualViewport?.addEventListener('resize', positionSuggestions);
window.visualViewport?.addEventListener('scroll', positionSuggestions);

email.addEventListener('keydown', event => {
  const moving = event.key === 'ArrowDown' || event.key === 'ArrowUp';
  if (moving && emailSuggestions.hidden) updateSuggestions();
  if (emailSuggestions.hidden) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeSuggestions();
  } else if (event.key === 'Enter' && activeSuggestion) {
    event.preventDefault();
    selectSuggestion(activeSuggestion);
  } else if (moving) {
    event.preventDefault();
    const options = [...emailSuggestions.children];
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const currentIndex = activeSuggestion ? options.indexOf(activeSuggestion) : (step > 0 ? -1 : 0);
    activeSuggestion?.setAttribute('aria-selected', 'false');
    activeSuggestion = options[(currentIndex + step + options.length) % options.length];
    activeSuggestion.setAttribute('aria-selected', 'true');
    email.setAttribute('aria-activedescendant', activeSuggestion.id);
    activeSuggestion.scrollIntoView({ block: 'nearest' });
  }
});

emailSuggestions.addEventListener('pointerdown', event => event.preventDefault());
emailSuggestions.addEventListener('click', event => {
  const option = event.target.closest('[role="option"]');
  if (option) selectSuggestion(option);
});

phone.addEventListener('input', () => {
  const digits = phone.value.replace(/\D/g, '').slice(0, 11);
  const local = digits.slice(2);
  const split = local.length > 8 ? 5 : 4;
  const formatted = [local.slice(0, split), local.slice(split)].filter(Boolean).join('-');
  phone.value = formatted ? `(${digits.slice(0, 2)}) ${formatted}` : digits;
});

form.addEventListener('input', event => {
  event.target.setCustomValidity('');
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const validEmail = emailFormat.test(email.value.trim());
  const validPhone = /^[1-9]\d{9,10}$/.test(phone.value.replace(/\D/g, ''));

  fullName.setCustomValidity(fullName.value.trim() ? '' : 'Preencha seu nome completo para continuar.');
  email.setCustomValidity(validEmail ? '' : 'Confira se seu e-mail está completo, como nome@exemplo.com.');
  phone.setCustomValidity(validPhone ? '' : 'Confira se você incluiu o DDD e o número da linha.');

  if (form.reportValidity()) {
    campaignFlow.save({ profileComplete: true });
    window.location.assign('questionario.html');
  }
});
