import { supabaseStore } from '../server/store.mjs';

const required = ['SUPABASE_URL', 'SUPABASE_ADMIN_SECRET_KEY'];
const empty = required.filter(name => !process.env[name]?.trim());

if (empty.length) {
  console.error('Variáveis ausentes no ambiente', empty.join(', '));
  process.exitCode = 1;
} else {
  try {
    const url = new URL(process.env.SUPABASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('SUPABASE_URL deve ser a origem HTTPS do projeto.');
    }
    const store = supabaseStore({ url, secret: process.env.SUPABASE_ADMIN_SECRET_KEY, fetch });
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all([
      store.read(),
      store.readTraffic(today),
      store.readJourneyEvents(today),
      store.readAdminSession('0'.repeat(64), new Date().toISOString()),
    ]);
    console.log('As quatro tabelas do painel responderam às consultas de leitura.');
  } catch (error) {
    if (error.name === 'TypeError' || error.name === 'TimeoutError') {
      console.error('Falha de conexão com o Supabase. Confira a origem HTTPS e a disponibilidade do projeto.');
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  }
}
