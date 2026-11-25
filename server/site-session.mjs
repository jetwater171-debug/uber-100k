import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.mjs';
import { journeyPages, journeyTitle } from './journey.mjs';
import { demoCatalog } from './operations.mjs';

const lifetime = 60 * 60 * 1000;
const cookieName = 'campaign-visit';

export function siteSessionHandler({ secret, store, now }) {
  const sign = payload => createHmac('sha256', secret).update('campaign-site/v1/' + payload).digest('base64url');

  function readSession(request) {
    const cookie = (request.headers.get('cookie') || '').split(';').map(item => item.trim())
      .find(item => item.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    const match = /^([a-f0-9-]{36})\.(\d{13})\.(off|on)\.([A-Za-z0-9_-]{43})$/.exec(cookie || '');
    if (!match) return null;
    const [, id, expiry, mode, signature] = match;
    const expected = sign([id, expiry, mode].join('.'));
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) || Number(expiry) <= now()) return null;
    return { id, expiry: Number(expiry), mode };
  }

  function respond(request, session) {
    const payload = [session.id, session.expiry, session.mode].join('.');
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    return Response.json({ metrics: session.mode === 'on' }, { headers: {
      'Cache-Control': 'no-store',
      'Set-Cookie': cookieName + '=' + payload + '.' + sign(payload) +
        '; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=' + Math.ceil((session.expiry - now()) / 1000) + secure,
    } });
  }

  return async function handle(request, route, body) {
    if (route === 'site-catalog' && request.method === 'GET') {
      const items = demoCatalog(await store.readCatalog()).map(({ id, cents }) => ({ id, cents }));
      return Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.method !== 'POST') throw new HttpError(405, 'Use POST para esta operação.');
    const data = await body(request);
    const current = readSession(request);
    const fresh = () => ({ id: randomUUID(), expiry: now() + lifetime, mode: 'off' });
    if (route === 'site-session' && !Object.keys(data).length) {
      if (current) return Response.json({ metrics: current.mode === 'on' }, { headers: { 'Cache-Control': 'no-store' } });
      return respond(request, fresh());
    }
    if (route === 'site-preference' && Object.keys(data).length === 1 && typeof data.metrics === 'boolean') {
      if (!current) throw new HttpError(401, 'Inicie a sessão antes de escolher as métricas.');
      const blocked = request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1';
      const session = data.metrics || current.mode === 'off' ? current : fresh();
      session.mode = data.metrics && !blocked ? 'on' : 'off';
      return respond(request, session);
    }
    if (route !== 'site-event') throw new HttpError(400, 'Operação de sessão inválida.');
    if (!current) throw new HttpError(401, 'Sessão expirada.');
    if (current.mode !== 'on' || request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1') {
      throw new HttpError(403, 'Métricas desativadas.');
    }
    const { page, event } = data;
    if (Object.keys(data).length !== 2 || typeof page !== 'string' || !Object.hasOwn(journeyPages, page) ||
        typeof event !== 'string' || (event !== 'page_view' && !journeyTitle(page, event))) {
      throw new HttpError(400, 'Evento inválido.');
    }
    const at = new Date(now()).toISOString();
    const visit = { session: current.id, page, day: at.slice(0, 10) };
    if (event === 'page_view') await store.recordTraffic(visit);
    else await store.recordJourneyEvent({ ...visit, event, occurred_at: at });
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  };
}
