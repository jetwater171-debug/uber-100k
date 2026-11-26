// Field markup adapted from the original iFoodbag admin HTML.
export const integrationForms = {
  "GhostsPay": `<div class="integration-fields" data-integration="GhostsPay">
  <div class="input-group">
    <input type="url" id="gateway-ghostspay-base-url" class="floating-input" placeholder="https://exemplo.test" />
    <label for="gateway-ghostspay-base-url" class="floating-label">GhostsPay Base URL</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-ghostspay-secret-key" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-ghostspay-secret-key" class="floating-label">GhostsPay Secret Key</label>
  </div>
  <div class="input-group">
    <input type="text" id="gateway-ghostspay-company-id" class="floating-input" maxlength="320" placeholder=" " />
    <label for="gateway-ghostspay-company-id" class="floating-label">GhostsPay Company ID</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-ghostspay-webhook-token" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-ghostspay-webhook-token" class="floating-label">GhostsPay Webhook Token</label>
  </div>
</div>`,
  "Sunize": `<div class="integration-fields" data-integration="Sunize">
  <div class="input-group">
    <input type="url" id="gateway-sunize-base-url" class="floating-input" placeholder="https://exemplo.test" />
    <label for="gateway-sunize-base-url" class="floating-label">Sunize Base URL</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-sunize-api-key" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-sunize-api-key" class="floating-label">Sunize x-api-key</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-sunize-api-secret" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-sunize-api-secret" class="floating-label">Sunize x-api-secret</label>
  </div>
</div>`,
  "Paradise": `<div class="integration-fields" data-integration="Paradise">
  <div class="input-group">
    <input type="url" id="gateway-paradise-base-url" class="floating-input" placeholder="https://exemplo.test" />
    <label for="gateway-paradise-base-url" class="floating-label">Paradise Base URL</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-paradise-api-key" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-paradise-api-key" class="floating-label">Paradise X-API-Key</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-paradise-product-hash" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-paradise-product-hash" class="floating-label">Paradise Product Hash (opcional)</label>
  </div>
  <div class="input-group">
    <input type="text" id="gateway-paradise-orderbump-hash" class="floating-input" maxlength="320" placeholder=" " />
    <label for="gateway-paradise-orderbump-hash" class="floating-label">Paradise Orderbump Hash (opcional)</label>
  </div>
  <div class="input-group">
    <input type="text" id="gateway-paradise-source" class="floating-input" maxlength="320" placeholder=" " />
    <label for="gateway-paradise-source" class="floating-label">Paradise Source (padrão: api_externa)</label>
  </div>
  <div class="input-group">
    <input type="text" id="gateway-paradise-description" class="floating-input" maxlength="320" placeholder=" " />
    <label for="gateway-paradise-description" class="floating-label">Descrição padrão do pedido (opcional)</label>
  </div>
</div>`,
  "ClownPay": `<div class="integration-fields" data-integration="ClownPay">
  <div class="input-group">
    <input type="url" id="gateway-clownpay-base-url" class="floating-input" placeholder="https://exemplo.test" />
    <label for="gateway-clownpay-base-url" class="floating-label">ClownPay Base URL</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-clownpay-api-key" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-clownpay-api-key" class="floating-label">ClownPay X-API-Key</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-clownpay-subaccount-api-key" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-clownpay-subaccount-api-key" class="floating-label">Secret Key da subconta (opcional)</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-clownpay-product-hash" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-clownpay-product-hash" class="floating-label">ClownPay Product Hash (opcional)</label>
  </div>
  <div class="input-group">
    <input type="text" id="gateway-clownpay-orderbump-hash" class="floating-input" maxlength="320" placeholder=" " />
    <label for="gateway-clownpay-orderbump-hash" class="floating-label">ClownPay Orderbump Hash (opcional)</label>
  </div>
  <div class="input-group">
    <input type="text" id="gateway-clownpay-source" class="floating-input" maxlength="320" placeholder=" " />
    <label for="gateway-clownpay-source" class="floating-label">ClownPay Source (padrão: api_externa)</label>
  </div>
  <div class="input-group">
    <input type="text" id="gateway-clownpay-description" class="floating-input" maxlength="320" placeholder=" " />
    <label for="gateway-clownpay-description" class="floating-label">Descrição padrão do pedido (opcional)</label>
  </div>
</div>`,
  "AtomoPay": `<div class="integration-fields" data-integration="AtomoPay">
  <div class="input-group">
    <input type="url" id="gateway-atomopay-base-url" class="floating-input" placeholder="https://exemplo.test" />
    <label for="gateway-atomopay-base-url" class="floating-label">AtomoPay Base URL</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-atomopay-api-token" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-atomopay-api-token" class="floating-label">AtomoPay API Token</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-atomopay-offer-hash" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-atomopay-offer-hash" class="floating-label">Offer Hash Base</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-atomopay-product-hash" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-atomopay-product-hash" class="floating-label">Product Hash Base</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-atomopay-webhook-token" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-atomopay-webhook-token" class="floating-label">Webhook Token AtomoPay</label>
  </div>
</div>`,
  "Bravo Pay": `<div class="integration-fields" data-integration="Bravo Pay">
  <div class="input-group">
    <input type="url" id="gateway-bravopay-base-url" class="floating-input" placeholder="https://exemplo.test" />
    <label for="gateway-bravopay-base-url" class="floating-label">Bravo Pay Base URL</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-bravopay-api-key" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-bravopay-api-key" class="floating-label">Bravo Pay API Key</label>
  </div>
  <div class="input-group">
    <input type="password" id="gateway-bravopay-webhook-secret" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="gateway-bravopay-webhook-secret" class="floating-label">Webhook Secret HMAC</label>
  </div>
  <div class="input-group">
    <input type="number" id="gateway-bravopay-expires-in" class="floating-input" placeholder=" " min="60" max="86400" step="60" />
    <label for="gateway-bravopay-expires-in" class="floating-label">Expiração PIX em segundos</label>
  </div>
  <div class="input-group">
    <input type="text" id="gateway-bravopay-description" class="floating-input" maxlength="320" placeholder=" " />
    <label for="gateway-bravopay-description" class="floating-label">Descrição padrão do pedido</label>
  </div>
</div>`,
  "Meta": `<div class="integration-fields" data-integration="Meta">
  <label class="integration-flag" for="pixel-enabled"><input type="checkbox" id="pixel-enabled"> Ativar pixel na simulação</label>
  <label class="integration-flag" for="pixel-capi-enabled"><input type="checkbox" id="pixel-capi-enabled"> Ativar CAPI na simulação</label>
  <div class="input-group">
    <input type="text" id="pixel-id" class="floating-input" maxlength="320" placeholder=" " />
    <label for="pixel-id" class="floating-label">Pixel ID</label>
  </div>
  <div class="input-group">
    <input type="text" id="pixel-backup-id" class="floating-input" maxlength="320" placeholder=" " />
    <label for="pixel-backup-id" class="floating-label">Pixel reserva</label>
  </div>
  <div class="input-group">
    <input type="password" autocomplete="new-password" id="pixel-capi-token" class="floating-input" placeholder="teste_exemplo" />
    <label for="pixel-capi-token" class="floating-label">Token CAPI principal</label>
  </div>
  <div class="input-group">
    <input type="password" autocomplete="new-password" id="pixel-capi-backup-token" class="floating-input" placeholder="teste_exemplo" />
    <label for="pixel-capi-backup-token" class="floating-label">Token CAPI reserva</label>
  </div>
</div>`,
  "TikTok": `<div class="integration-fields" data-integration="TikTok">
  <label class="integration-flag" for="tiktok-pixel-enabled"><input type="checkbox" id="tiktok-pixel-enabled"> Ativar pixel na simulação</label>
  <div class="input-group">
    <input type="text" id="tiktok-pixel-id" class="floating-input" maxlength="320" placeholder=" " />
    <label for="tiktok-pixel-id" class="floating-label">Pixel Code</label>
  </div>
</div>`,
  "UTMfy": `<div class="integration-fields" data-integration="UTMfy">
  <label class="integration-flag" for="utmfy-enabled"><input type="checkbox" id="utmfy-enabled"> Ativar UTMfy na simulação</label>
  <div class="input-group">
    <input type="url" id="utmfy-endpoint" class="floating-input" placeholder="https://exemplo.test" />
    <label for="utmfy-endpoint" class="floating-label">Endpoint UTMfy</label>
  </div>
  <div class="input-group">
    <input type="password" autocomplete="new-password" id="utmfy-api" class="floating-input" placeholder="teste_exemplo" />
    <label for="utmfy-api" class="floating-label">Token (opcional)</label>
  </div>
</div>`,
  "Pushcut": `<div class="integration-fields" data-integration="Pushcut">
  <label class="integration-flag" for="pushcut-enabled"><input type="checkbox" id="pushcut-enabled"> Ativar notificações na simulação</label>
  <div class="input-group">
    <input type="url" id="pushcut-pix-created" class="floating-input" placeholder="https://exemplo.test" />
    <label for="pushcut-pix-created" class="floating-label">URL PIX gerado</label>
  </div>
  <div class="input-group">
    <input type="url" id="pushcut-pix-confirmed" class="floating-input" placeholder="https://exemplo.test" />
    <label for="pushcut-pix-confirmed" class="floating-label">URL pagamento confirmado</label>
  </div>
  <div class="input-group">
    <input type="text" id="pushcut-created-title" class="floating-input" maxlength="320" placeholder=" " />
    <label for="pushcut-created-title" class="floating-label">Título PIX gerado</label>
  </div>
  <div class="input-group">
    <input type="text" id="pushcut-confirmed-title" class="floating-input" maxlength="320" placeholder=" " />
    <label for="pushcut-confirmed-title" class="floating-label">Título PIX pago</label>
  </div>
  <div class="input-group">
    <textarea id="pushcut-created-message" class="floating-input floating-input--textarea" maxlength="320" placeholder=" "></textarea>
    <label for="pushcut-created-message" class="floating-label">Mensagem PIX gerado</label>
  </div>
  <div class="input-group">
    <textarea id="pushcut-confirmed-message" class="floating-input floating-input--textarea" maxlength="320" placeholder=" "></textarea>
    <label for="pushcut-confirmed-message" class="floating-label">Mensagem PIX pago</label>
  </div>
</div>`,
  "SMSMais": `<div class="integration-fields" data-integration="SMSMais">
  <label class="integration-flag" for="smsmais-enabled"><input type="checkbox" id="smsmais-enabled"> Ativar SMSMais na simulação</label>
  <div class="input-group">
    <input type="password" id="smsmais-token" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="smsmais-token" class="floating-label">Bearer Token</label>
  </div>
  <div class="input-group">
    <input type="url" id="smsmais-endpoint" class="floating-input" placeholder="https://exemplo.test" />
    <label for="smsmais-endpoint" class="floating-label">Endpoint de SMS</label>
  </div>
  <div class="input-group">
    <input type="url" id="smsmais-batch-endpoint" class="floating-input" placeholder="https://exemplo.test" />
    <label for="smsmais-batch-endpoint" class="floating-label">Endpoint de lote /send</label>
  </div>
  <div class="input-group">
    <input type="url" id="smsmais-status-endpoint" class="floating-input" placeholder="https://exemplo.test" />
    <label for="smsmais-status-endpoint" class="floating-label">Endpoint de status</label>
  </div>
  <div class="input-group">
    <input type="url" id="smsmais-balance-endpoint" class="floating-input" placeholder="https://exemplo.test" />
    <label for="smsmais-balance-endpoint" class="floating-label">Endpoint de saldo</label>
  </div>
  <div class="input-group">
    <input type="password" id="smsmais-webhook-token" class="floating-input" placeholder="teste_exemplo" autocomplete="new-password" />
    <label for="smsmais-webhook-token" class="floating-label">Token de autenticação do webhook</label>
  </div>
  <div class="input-group">
    <input type="number" id="smsmais-timeout" class="floating-input" min="1500" max="30000" step="500" placeholder=" " />
    <label for="smsmais-timeout" class="floating-label">Timeout da API (ms)</label>
  </div>
</div>`,
  "SMSMais remarketing": `<div class="integration-fields" data-integration="SMSMais remarketing">
  <label class="integration-flag" for="smsmais-remarketing-enabled"><input type="checkbox" id="smsmais-remarketing-enabled"> Ativar prévia do remarketing</label>
  <div class="input-group">
    <input type="number" id="smsmais-remarketing-delay" class="floating-input" min="1" max="1440" step="1" placeholder=" " />
    <label for="smsmais-remarketing-delay" class="floating-label">Minutos após gerar o PIX</label>
  </div>
  <div class="input-group">
    <textarea id="smsmais-remarketing-message" class="floating-input floating-input--textarea smsmais-remarketing-message" placeholder=" " maxlength="320"></textarea>
    <label for="smsmais-remarketing-message" class="floating-label">Mensagem de teste</label>
  </div>
</div>`,
};
