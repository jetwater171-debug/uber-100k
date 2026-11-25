import { adminHandler } from '../server/admin.mjs';
import { supabaseAuth } from '../server/auth.mjs';
import { supabaseStore } from '../server/store.mjs';

export default {
  async fetch(request) {
    const env = process.env;
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    const secret = env.SUPABASE_ADMIN_SECRET_KEY;
    const users = new Set((env.CAMPAIGN_ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean));
    if (!url || !key || !secret || !users.size) {
      return Response.json({ error: 'Painel indisponível até a configuração do Supabase.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return adminHandler({
      auth: supabaseAuth({ url, key, users, fetch }),
      store: supabaseStore({ url, secret, fetch }),
    })(request);
  },
};
