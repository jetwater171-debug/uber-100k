import { adminHandler } from '../server/admin.mjs';
import { passwordAuth } from '../server/auth.mjs';
import { supabaseStore } from '../server/store.mjs';

export default {
  async fetch(request) {
    const env = process.env;
    const url = env.SUPABASE_URL;
    const secret = env.SUPABASE_ADMIN_SECRET_KEY;
    const password = env.CAMPAIGN_ADMIN_PASSWORD;
    if (!url || !secret || !password) {
      return Response.json({ error: 'Painel indisponível até a conclusão da configuração.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    const store = supabaseStore({ url, secret, fetch });
    const auth = passwordAuth({ password, secret, sessions: store, trustVercel: env.VERCEL === '1' });
    return adminHandler({ auth, store, siteSecret: secret })(request);
  },
};
