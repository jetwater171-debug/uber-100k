export const gateways = ['ClownPay', 'GhostsPay', 'Sunize', 'Paradise', 'AtomoPay', 'Bravo Pay'];
export const channels = ['Meta', 'TikTok', 'UTMfy', 'Pushcut', 'SMSMais'];
export const eventTypes = ['PageView', 'ViewContent', 'Lead', 'InitiateCheckout', 'Purchase'];
export const diagnosticModes = {
  Meta: ['Pixel', 'API de conversões'],
  TikTok: ['Pixel', 'API de eventos'],
  UTMfy: ['PIX gerado', 'PIX pago', 'Venda manual'],
  Pushcut: ['PIX gerado', 'PIX pago'],
  SMSMais: ['SMS de teste', 'Torpedo de voz', 'Retorno de entrega'],
};

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
    orders: [],
    queue: [],
  };
}
