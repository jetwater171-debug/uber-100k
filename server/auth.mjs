import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { HttpError } from './errors.mjs';

const cookieName = 'campaign-admin';
const hostedCookieName = '__Secure-campaign-admin';
const sameSite = 'Path=/api/admin; HttpOnly; SameSite=Strict';
const hostedOperator = { id: '00000000-0000-4000-8000-000000000001', name: 'Administrador' };
const lifetime = 1800;

function cookie(request, value, seconds, name = cookieName) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; ${sameSite}; Max-Age=${seconds}${secure}`;
}

function token(request, name = cookieName) {
  const cookies = request.headers.get('Cookie') || '';
  return cookies.split(';').map(entry => entry.trim()).find(entry => entry.startsWith(`${name}=`))?.slice(name.length + 1);
}

function digest(secret) {
  return createHash('sha256').update(secret).digest();
}

function hostedToken(request) {
  if (new URL(request.url).protocol !== 'https:') throw new HttpError(403, 'Acesse o painel hospedado por HTTPS.');
  const value = token(request, hostedCookieName);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

export function localAuth() {
  let session;
  const who = { id: 'local-demo', name: 'Operador local' };
  function requireLoopback(request) {
    if (!['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)) {
      throw new HttpError(403, 'O modo de demonstração local exige acesso pelo próprio computador.');
    }
  }
  return {
    demo: true,
    async login(request) {
      requireLoopback(request);
      session = { token: randomBytes(32).toString('hex'), until: Date.now() + 1800000 };
      return { who, cookie: cookie(request, session.token, 1800) };
    },
    async verify(request) {
      requireLoopback(request);
      if (!session || session.until < Date.now() || session.token !== token(request)) {
        throw new HttpError(401, 'Entre no painel para continuar.');
      }
      return who;
    },
    async logout(request) {
      requireLoopback(request);
      session = undefined;
      return cookie(request, '', 0);
    },
  };
}

export function passwordAuth({ password, secret, sessions, trustVercel = false, now = Date.now }) {
  const verifier = digest(password);
  const sessionKey = createHmac('sha256', secret).update(verifier).digest();
  const sessionDigest = value => createHmac('sha256', sessionKey).update(value).digest('hex');

  return {
    demo: false,
    async login(request, { password: candidate }) {
      hostedToken(request);
      if (typeof candidate !== 'string' || !candidate || candidate.length > 256) {
        throw new HttpError(400, 'Informe a senha do painel.');
      }
      const forwarded = trustVercel ? request.headers.get('x-vercel-forwarded-for')?.trim() : '';
      const source = isIP(forwarded || '') ? forwarded : 'default';
      const bucket = createHmac('sha256', secret).update(`login:${source}`).digest('hex');
      if (!await sessions.allowLoginAttempt(bucket)) {
        throw new HttpError(429, 'Limite de tentativas atingido. Aguarde alguns minutos.');
      }
      if (!timingSafeEqual(verifier, digest(candidate))) throw new HttpError(401, 'Senha incorreta.');
      const value = randomBytes(32).toString('hex');
      await sessions.replaceAdminSession({
        operator_id: hostedOperator.id,
        token_digest: sessionDigest(value),
        expires_at: new Date(now() + lifetime * 1000).toISOString(),
      });
      return { who: hostedOperator, cookie: cookie(request, value, lifetime, hostedCookieName) };
    },
    async verify(request) {
      const session = hostedToken(request);
      if (!session) throw new HttpError(401, 'Entre no painel para continuar.');
      const row = await sessions.readAdminSession(sessionDigest(session), new Date(now()).toISOString());
      if (row?.operator_id !== hostedOperator.id) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
      return hostedOperator;
    },
    async logout(request) {
      const session = hostedToken(request);
      if (session) await sessions.revokeAdminSession(sessionDigest(session));
      return cookie(request, '', 0, hostedCookieName);
    },
  };
}
