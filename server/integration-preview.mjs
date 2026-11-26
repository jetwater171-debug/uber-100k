import { HttpError } from './errors.mjs';
import { integrationFields } from './integration-fields.mjs';

function invalid(field) {
  throw new HttpError(400, `Configuração de teste inválida em ${field}.`);
}

function validated(field, type, value) {
  if (type === 'secret' || type === 'flag') {
    if (typeof value !== 'boolean') invalid(field);
    return value;
  }
  if (typeof value !== 'string' || value.length > 320) invalid(field);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (Array.isArray(type)) {
    const [min, max, step] = type;
    const number = Number(trimmed);
    if (!Number.isInteger(number) || number < min || number > max || (number - min) % step !== 0) invalid(field);
    return String(number);
  }
  if (type === 'url') {
    const url = URL.parse(trimmed);
    if (url?.protocol !== 'https:' || !url.hostname.endsWith('.test') || url.username || url.password || url.search || url.hash) invalid(field);
    return url.href;
  }
  return trimmed;
}

export function amendIntegrationPreview(settings, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) invalid('integrações');
  const next = structuredClone(settings.integrationPreview || {});
  for (const [scope, values] of Object.entries(patch)) {
    if (!Object.hasOwn(integrationFields, scope) || !values || typeof values !== 'object' || Array.isArray(values)) invalid(scope);
    const allowed = integrationFields[scope];
    const record = next[scope] ||= {};
    for (const [field, value] of Object.entries(values)) {
      if (!Object.hasOwn(allowed, field)) invalid(field);
      const clean = validated(field, allowed[field], value);
      if (clean === undefined || clean === false) delete record[field];
      else record[field] = clean;
    }
  }
  settings.integrationPreview = next;
}
