import { randomBytes } from 'node:crypto';
import { HttpError } from './errors.mjs';

const cookieName = 'campaign-admin';
const sameSite = 'Path=/api/admin; HttpOnly; SameSite=Strict';

function cookie(request, value, seconds) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${value}; ${sameSite}; Max-Age=${seconds}${secure}`;
}

function token(request) {
  const cookies = request.headers.get('Cookie') || '';
  return cookies.split(';').map(entry => entry.trim()).find(entry => entry.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}

export function localAuth() {
  let session;
  const who = { id: 'local-demo', email: 'Operador local' };
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

export function supabaseAuth({ url, key, users, fetch }) {
  async function auth(path, options = {}) {
    const response = await fetch(new URL(`/auth/v1/${path}`, url), {
      ...options,
      headers: { apikey: key, 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 429) throw new HttpError(429, 'Aguarde antes de tentar entrar novamente.');
    if (response.status >= 500) throw new HttpError(503, 'Autenticação indisponível.');
    return response;
  }

  function operator(user) {
    if (!users.has(user?.id)) throw new HttpError(401, 'Conta sem acesso ao painel.');
    return { id: user.id, email: user.email };
  }

  if (!url || !key || !users.size) throw new HttpError(503, 'A autenticação do painel ainda não foi configurada.');
  return {
    demo: false,
    async login(request, { email, password }) {
      if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || !password || password.length > 256) {
        throw new HttpError(400, 'Informe e-mail e senha válidos.');
      }
      const response = await auth('token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) throw new HttpError(401, 'E-mail ou senha inválidos.');
      const data = await response.json();
      if (!/^[\w.-]+$/.test(data.access_token || '') || !Number.isInteger(data.expires_in) || data.expires_in <= 0) {
        throw new HttpError(503, 'A sessão não pôde ser iniciada.');
      }
      return { who: operator(data.user), cookie: cookie(request, data.access_token, Math.min(data.expires_in, 3600)) };
    },
    async verify(request) {
      const session = token(request);
      if (!session) throw new HttpError(401, 'Entre no painel para continuar.');
      const response = await auth('user', { headers: { Authorization: `Bearer ${session}` } });
      if (!response.ok) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
      return operator(await response.json());
    },
    async logout(request) {
      const session = token(request);
      if (session) await auth('logout?scope=local', { method: 'POST', headers: { Authorization: `Bearer ${session}` } });
      return cookie(request, '', 0);
    },
  };
}
