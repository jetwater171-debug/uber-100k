export const stages = ['Início', 'Cadastro', 'Questionário', 'Região', 'Seleção', 'Pedido de teste'];
export const gateways = ['ClownPay', 'GhostsPay', 'Sunize', 'Paradise', 'AtomoPay', 'Bravo Pay'];
export const channels = ['Meta', 'TikTok', 'UTMfy', 'Pushcut', 'SMSMais'];
export const eventTypes = ['PageView', 'ViewContent', 'Lead', 'InitiateCheckout', 'Purchase'];

export const catalog = [
  { id: 'camera', name: 'Câmera veicular', cents: 3990, active: true },
  { id: 'suporte', name: 'Suporte + Carregador Turbo', cents: 2990, active: true },
  { id: 'compressor', name: 'Compressor Portátil 3 em 1', cents: 9990, active: true },
  { id: 'tablet', name: 'Tablet', cents: 14990, active: true },
  { id: 'capa', name: 'Capa de bancos', cents: 990, active: true },
  { id: 'powerbank', name: 'Powerbank', cents: 3590, active: true },
];

export function initialState() {
  return {
    version: 0,
    settings: {
      compareGateways: true,
      offerExtras: true,
      gateways: gateways.map(name => ({ name, enabled: true })),
      tracking: Object.fromEntries(channels.map(channel => [channel, []])),
    },
    catalog,
    audit: [],
  };
}

export function demoData(now = Date.now()) {
  const cities = ['São Paulo', 'Curitiba', 'Recife', 'Mogi das Cruzes', 'Belo Horizonte', 'Campinas'];
  const origins = ['Direto', 'Meta', 'TikTok', 'Busca'];
  const devices = ['Android', 'iPhone', 'Desktop'];
  const sessions = [];
  const orders = [];
  for (let index = 0; index < 168; index++) {
    const day = Math.floor(index / 12);
    const slot = index % 12;
    if (slot >= 9 + (day * 3 + 2) % 4) continue;
    const depth = (slot + day * 7) % 12;
    const step = depth < 2 ? 0 : depth < 4 ? 1 : depth < 6 ? 2 : depth < 8 ? 3 : depth < 9 ? 4 : 5;
    const id = `SIM-${String(index + 1).padStart(4, '0')}`;
    const time = new Date(now - (day * 86400000 + slot * 60000));
    const session = {
      id,
      name: `Motorista de teste ${index + 1}`,
      steps: stages.slice(0, step + 1),
      city: cities[index % cities.length],
      origin: origins[Math.floor(index / 3) % origins.length],
      device: devices[(index + day) % devices.length],
      createdAt: time.toISOString(),
    };
    sessions.push(session);
    if (step === 5) {
      orders.push({
        id: `PED-${id.slice(4)}`,
        sessionId: id,
        gateway: gateways[Math.floor(index / 3) % gateways.length],
        total: catalog[0].cents + catalog[index % catalog.length].cents,
        status: index % 5 < 3 ? 'Pago no teste' : 'Pendente no teste',
        createdAt: session.createdAt,
      });
    }
  }
  return { sessions, orders };
}
