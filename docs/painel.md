# Painel da campanha

O painel tem treze seções. Visão geral, funil, cadastros, público, vendas, catálogo, gateways PIX, tracking, UTMfy e Pushcut, SMS, fila de testes, saídas por etapa e auditoria. O [inventário do iFoodbag](auditoria-admin.md) lista o comportamento original e as dependências.

## Abrir no computador

Com Node.js 24 instalado, execute `npm run dev` na pasta do projeto e abra [o painel local](http://127.0.0.1:4280/admin). Use **Abrir painel de teste**. A sessão e as mudanças de configuração são mantidas em memória durante essa execução. **Páginas e funil → Abrir jornada com tracking** abre o site e registra a passagem pelas seis páginas. Volte ao painel e use **Atualizar** para consultar as contagens. O tracking identifica apenas a sessão de teste e a página visitada.

Na jornada acompanhada, a lista de produtos aplica os preços e a disponibilidade do catálogo do painel. Selecione os produtos e use **Criar pedido de teste** no resumo. O servidor confere o total exibido e usa uma chave por seleção e total para impedir pedidos duplicados em tentativas repetidas.

Em **Vendas → Ver pedido**, gere um PIX de teste em um gateway ativo e simule a confirmação ou o cancelamento. A origem **Jornada acompanhada** identifica os pedidos criados no fluxo. Os demais registros são amostras. Os seis gateways emitem identificadores de simulação sem valor de cobrança. Os eventos do pedido entram na **Fila de testes** conforme a configuração de cada canal e podem ser processados em lotes de até vinte. A confirmação repetida mantém uma única entrada de compra por canal. Os testes de Meta, TikTok, UTMfy, Pushcut e SMSMais também podem ser enfileirados manualmente.

Em **SMS e remarketing**, enfileire um lembrete de teste para um pedido pendente. A fila mantém um lembrete por pedido e cancela o lembrete pendente se o PIX encerrar antes do processamento. O histórico fica disponível na mesma seção e na auditoria.

**Gateways PIX** mostra os pedidos registrados com PIX de teste, as confirmações e o valor confirmado nas jornadas acompanhadas. **Saídas por etapa** mostra a etapa mais avançada registrada para cada sessão no período selecionado.

Em **Leads**, use o filtro **Jornadas acompanhadas** para consultar as sessões de teste anônimas. **Detalhes** mostra as páginas registradas por dia e os pedidos da sessão. A exportação CSV usa o mesmo filtro da lista.

Os eventos configurados no painel entram na fila local durante a jornada acompanhada. `PageView` registra cada página uma vez por sessão e dia, `ViewContent` registra a abertura da oferta e `Lead` é enfileirado uma vez por sessão após o envio válido do formulário. A fila preserva os itens pendentes e mantém até 300 registros.

## Publicar o painel autenticado

1. Crie um projeto Supabase para esta campanha e aplique as migrações em `supabase/migrations` em ordem de nome.
2. Cadastre `SUPABASE_URL`, `SUPABASE_ADMIN_SECRET_KEY` e `CAMPAIGN_ADMIN_PASSWORD` nas variáveis do projeto da Vercel. Guarde a chave e a senha com o tipo **Secret**.
3. Use Node.js 24 e o `vercel.json` do repositório. O build copia somente os arquivos públicos permitidos para `dist`. A função em `api/admin.mjs` serve as consultas e os comandos do painel.
4. Faça um novo deploy para aplicar as variáveis. Entre em `/admin` com a senha configurada, salve uma configuração, atualize a página e confira a persistência. Verifique a revogação depois de sair e a contagem do tracking de teste.

Configurações ausentes mantêm o painel hospedado indisponível.

O painel usa um login compartilhado por senha e limita as tentativas de entrada a dez por origem em cinco minutos. Há uma sessão ativa de até 30 minutos no ambiente. Entrar em outro navegador encerra a sessão anterior. O banco guarda um resumo criptográfico do identificador aleatório do cookie. Sair remove a sessão e alterar a senha invalida as sessões anteriores.

Use `npm run check:supabase` com as variáveis de conexão do projeto de teste no ambiente ou em `.env.local` para conferir a leitura das tabelas de configurações, sessões e visitas. O comando mostra nomes de variáveis ausentes e o resultado das consultas, preservando os valores das chaves.

## Verificações locais

- `npm test` verifica sessão, revogação, controle de origem, concorrência, tracking, relatórios, exportação, testes PIX, pedidos da jornada, reconciliação, deduplicação da fila e os contratos do adaptador Supabase.
- `npm run build` gera a publicação estática em `dist`.
