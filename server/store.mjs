import { HttpError } from './errors.mjs';
import { initialState } from './fixtures.mjs';

export function memoryStore() {
  let snapshot = initialState();
  const traffic = new Map();
  return {
    async read() {
      return structuredClone(snapshot);
    },
    async save(expected, next) {
      if (expected !== snapshot.version) return false;
      snapshot = structuredClone(next);
      return true;
    },
    async recordTraffic(event) {
      const key = [event.session, event.page, event.day].join('/');
      if (!traffic.has(key)) traffic.set(key, event);
    },
    async readTraffic(since) {
      return [...traffic.values()].filter(event => event.day >= since);
    },
  };
}

export function supabaseStore({ url, secret, fetch }) {
  if (!url || !secret) throw new HttpError(503, 'Banco do painel ainda não configurado.');
  const endpoint = new URL('/rest/v1/campaign_admin_state', url);
  const headers = {
    apikey: secret,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  if (!secret.startsWith('sb_secret_')) headers.Authorization = `Bearer ${secret}`;

  async function request(query, options = {}, target = endpoint) {
    const response = await fetch(new URL(`?${query}`, target), {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new HttpError(503, 'Banco do painel indisponível.');
    const payload = await response.text();
    return payload ? JSON.parse(payload) : null;
  }

  return {
    async read() {
      const [entry] = await request('id=eq.main&select=revision,snapshot&limit=1');
      if (!entry) throw new HttpError(503, 'A migração do painel ainda não foi aplicada.');
      return entry.snapshot ? { ...entry.snapshot, version: entry.revision } : initialState();
    },
    async save(expected, next) {
      const rows = await request(`id=eq.main&revision=eq.${expected}&select=revision`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: next.version, snapshot: next }),
      });
      return rows.length === 1;
    },
    async recordTraffic(event) {
      await request('on_conflict=session,page,day', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(event),
      }, new URL('/rest/v1/campaign_demo_traffic', url));
    },
    async readTraffic(since) {
      return request(`day=gte.${since}&select=page,session,day&order=day.desc&limit=1000`, {},
        new URL('/rest/v1/campaign_demo_traffic', url));
    },
  };
}
