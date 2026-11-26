import { HttpError } from './errors.mjs';
import { initialState } from './fixtures.mjs';

export function memoryStore() {
  let snapshot = initialState();
  const traffic = new Map();
  const journey = new Map();
  return {
    async readCatalog() {
      return { catalog: structuredClone(snapshot.catalog), settings: { offerExtras: snapshot.settings.offerExtras } };
    },
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
    async readTraffic(since, session, until) {
      return [...traffic.values()].filter(event => event.day >= since && (!until || event.day <= until) && (!session || event.session === session));
    },
    async recordJourneyEvent(event) {
      const key = [event.session, event.page, event.event, event.day].join('/');
      if (!journey.has(key)) journey.set(key, event);
    },
    async readJourneyEvents(since, session, until) {
      return [...journey.values()].filter(event => event.day >= since && (!until || event.day <= until) && (!session || event.session === session))
        .sort((first, next) => next.occurred_at.localeCompare(first.occurred_at)).slice(0, 1000);
    },
  };
}

export function supabaseStore({ url, secret, fetch }) {
  if (!url || !secret) throw new HttpError(503, 'Banco do painel ainda não configurado.');
  const endpoint = new URL('/rest/v1/campaign_admin_state', url);
  const sessions = new URL('/rest/v1/campaign_admin_sessions', url);
  const journey = new URL('/rest/v1/campaign_journey_events', url);
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
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new HttpError(503, 'Banco do painel indisponível.');
    const payload = await response.text();
    return payload ? JSON.parse(payload) : null;
  }

  return {
    async readCatalog() {
      const [row] = await request('id=eq.main&select=catalog:snapshot->catalog,extras:snapshot->settings->offerExtras&limit=1');
      if (!row) throw new HttpError(503, 'Catálogo indisponível.');
      const defaults = initialState();
      return { catalog: row.catalog ?? defaults.catalog, settings: { offerExtras: row.extras ?? defaults.settings.offerExtras } };
    },
    async read() {
      const [entry] = await request('id=eq.main&select=revision,snapshot&limit=1');
      if (!entry) throw new HttpError(503, 'A migração do painel ainda não foi aplicada.');
      return { ...initialState(), ...entry.snapshot, version: entry.revision };
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
        body: JSON.stringify({ ...event, reporting_visible: true }),
      }, new URL('/rest/v1/campaign_demo_traffic', url));
    },
    async readTraffic(since, session, until) {
      const filters = new URLSearchParams({ day: `gte.${since}`, reporting_visible: 'is.true', select: 'page,session,day,occurred_at', order: 'day.desc,occurred_at.desc.nullslast,session,page', limit: 1000 });
      if (session) filters.set('session', `eq.${session}`);
      if (until) filters.append('day', `lte.${until}`);
      return request(filters, {},
        new URL('/rest/v1/campaign_demo_traffic', url));
    },
    async recordJourneyEvent(event) {
      await request('on_conflict=session,page,event,day', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ ...event, reporting_visible: true }),
      }, journey);
    },
    async readJourneyEvents(since, session, until) {
      const filters = new URLSearchParams({
        day: `gte.${since}`, reporting_visible: 'is.true', select: 'page,event,session,occurred_at', order: 'day.desc,occurred_at.desc', limit: 1000,
      });
      if (session) filters.set('session', `eq.${session}`);
      if (until) filters.append('day', `lte.${until}`);
      return request(filters, {}, journey);
    },
    async allowLoginAttempt(bucket) {
      const allowed = await request('', {
        method: 'POST',
        body: JSON.stringify({ p_bucket: bucket }),
      }, new URL('/rest/v1/rpc/campaign_allow_admin_login', url));
      return allowed === true;
    },
    async replaceAdminSession(session) {
      await request('on_conflict=operator_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(session),
      }, sessions);
    },
    async readAdminSession(digest, at) {
      const query = new URLSearchParams({ token_digest: `eq.${digest}`, expires_at: `gt.${at}`, select: 'operator_id', limit: 1 });
      const [row] = await request(query, {}, sessions);
      return row;
    },
    async revokeAdminSession(digest) {
      await request(`token_digest=eq.${digest}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      }, sessions);
    },
  };
}
