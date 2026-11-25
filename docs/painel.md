# Painel da campanha

O painel tem treze seções. Visão geral, funil, cadastros, público, vendas, catálogo, gateways PIX, tracking, UTMfy e Pushcut, SMS, fila de testes, saídas por etapa e auditoria. O [inventário do iFoodbag](auditoria-admin.md) lista o comportamento original e as dependências.

## Abrir no computador

Com Node.js 24 instalado, execute `npm run dev` na pasta do projeto e abra [o painel local](http://127.0.0.1:4280/admin). Use **Abrir painel de teste**. A sessão e as mudanças de configuração são mantidas em memória durante essa execução. **Páginas e funil → Abrir jornada com tracking** abre o site e registra a passagem pelas seis páginas. Volte ao painel e use **Atualizar** para consultar as contagens. O tracking identifica apenas a sessão de teste e a página visitada.

Na jornada acompanhada, selecione os produtos e use **Criar pedido de teste** no resumo. O servidor registra o preço vigente do catálogo de teste e usa uma chave por seleção para impedir pedidos duplicados em tentativas repetidas.

Em **Vendas → Ver pedido**, gere um PIX de teste em um gateway ativo e simule a confirmação ou o cancelamento. A origem **Jornada acompanhada** identifica os pedidos criados no fluxo. Os demais registros são amostras. Os seis gateways emitem identificadores de simulação sem valor de cobrança. Os eventos do pedido entram na **Fila de testes** conforme a configuração de cada canal e podem ser processados em lotes de até vinte. A confirmação repetida mantém uma única entrada de compra por canal. Os testes de Meta, TikTok, UTMfy, Pushcut e SMSMais também podem ser enfileirados manualmente.

Em **SMS e remarketing**, enfileire um lembrete de teste para um pedido pendente. A fila mantém um lembrete por pedido e cancela o lembrete pendente se o PIX encerrar antes do processamento. O histórico fica disponível na mesma seção e na auditoria.

## Publicar o painel autenticado

1. Crie um projeto Supabase para esta campanha. Aplique a migração em `supabase/migrations/20261125000000_campaign_admin_state.sql`.
2. Crie as contas dos operadores no Supabase Auth e anote seus IDs. Configure `CAMPAIGN_ADMIN_USER_IDS` com os IDs autorizados separados por vírgula.
3. Cadastre `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_ADMIN_SECRET_KEY` nas variáveis do projeto da Vercel. A última variável é exclusiva do servidor.
4. Use Node.js 24 e o `vercel.json` do repositório. O build copia somente os arquivos públicos permitidos para `dist`. A função em `api/admin.mjs` serve as consultas e os comandos do painel.
5. Em uma prévia autorizada, entre em `/admin`, salve uma configuração, atualize a página e confira a persistência. Verifique o acesso bloqueado fora da lista de contas e a contagem do tracking de teste.

Configurações ausentes mantêm o painel hospedado indisponível. A persistência com um banco remoto, autenticação com uma conta Supabase real e o deploy da Vercel precisam ser verificados no projeto configurado.

## Verificações locais

- `npm test` verifica sessão, controle de origem, concorrência, tracking, relatórios, exportação, testes PIX, pedidos da jornada, reconciliação, deduplicação da fila e os contratos do adaptador Supabase.
- `npm run build` gera a publicação estática em `dist`.
