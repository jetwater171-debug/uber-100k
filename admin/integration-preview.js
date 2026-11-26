const scopeSelector = '[data-integration]';
const fieldSelector = 'input, textarea';
const testKey = /^teste_[A-Za-z0-9_-]{3,64}$/;

export function previewFields(root, stored, onChange) {
  const changes = new Map();

  function fieldState(element) {
    const scope = element.closest(scopeSelector)?.dataset.integration;
    if (!scope) return null;
    const saved = stored()[scope]?.[element.id];
    return { scope, saved, key: element.id, edit: changes.get(element.id) };
  }

  function hydrate() {
    for (const element of root.querySelectorAll(scopeSelector + ' :is(' + fieldSelector + ')')) {
      const { scope, saved, edit } = fieldState(element);
      if (element.type === 'checkbox') element.checked = edit?.value ?? Boolean(saved);
      else element.value = edit?.display ?? (element.type === 'password' ? '' : saved ?? '');
      if (element.type !== 'password') continue;
      const savedMask = saved === true && edit?.value !== false;
      element.placeholder = savedMask ? '•••••••• · Teste salvo' : 'teste_exemplo';
      element.parentElement.querySelector('.integration-clear')?.remove();
      if (savedMask) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'integration-clear';
        clear.textContent = 'Limpar';
        clear.setAttribute('aria-label', 'Limpar ' + element.labels[0].textContent);
        clear.addEventListener('click', () => {
          changes.set(element.id, { scope, value: false, display: '' });
          element.value = '';
          element.placeholder = 'teste_exemplo';
          clear.remove();
          element.focus();
          onChange();
        });
        element.parentElement.append(clear);
      }
    }
  }

  root.addEventListener('input', event => {
    const input = event.target;
    if (!input.matches(fieldSelector)) return;
    const field = fieldState(input);
    if (!field) return;
    const { scope, key, saved, edit } = field;
    const label = input.labels[0]?.textContent.trim() || key;
    const display = input.type === 'checkbox' ? '' : input.value;
    const value = input.type === 'checkbox' ? input.checked : display.trim();
    if (input.type === 'password') {
      const valid = testKey.test(value);
      if (value) changes.set(key, { scope, display: valid ? value : '', value: true, error: !valid ? 'Use um valor fictício começando com teste_ em ' + label + '.' : '' });
      else if (edit?.value !== false) changes.delete(key);
    } else {
      const previous = saved ?? (input.type === 'checkbox' ? false : '');
      if (value === previous) changes.delete(key);
      else changes.set(key, { scope, display, value, error: input.validity.valid ? '' : 'Confira o campo ' + label + '.' });
    }
    onChange();
  });

  function fields(scopes) {
    return [...changes].filter(([, entry]) => scopes.includes(entry.scope));
  }

  return {
    hydrate,
    dirty: scopes => fields(scopes).length > 0,
    patch(scopes) {
      const patch = {};
      for (const [key, entry] of fields(scopes)) {
        if (entry.error) throw new Error(entry.error);
        (patch[entry.scope] ||= {})[key] = entry.value;
      }
      return Object.keys(patch).length ? patch : undefined;
    },
    clear(scopes) {
      if (!scopes) changes.clear();
      else for (const [key] of fields(scopes)) changes.delete(key);
    },
  };
}
