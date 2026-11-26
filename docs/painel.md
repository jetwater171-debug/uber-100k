# Painel da campanha

O painel tem quinze seções. Visão geral, funil, cadastros, público, vendas, catálogo, gateways PIX, tracking, UTMfy e Pushcut, SMS, fila de testes, eventos da jornada, saídas e retornos, domínios e auditoria. O [inventário do iFoodbag](auditoria-admin.md) lista o comportamento original e as dependências.

## Sessão de quem abre o site

Ao abrir qualquer uma das seis páginas, o navegador recebe uma sessão temporária do próprio site, válida por uma hora. A opção **Privacidade** permite compartilhar ou interromper as métricas. Depois da autorização, páginas e marcos do formulário chegam ao Supabase e aparecem em Visão geral, Páginas, Leads e Eventos da jornada. O navegador pode solicitar privacidade com GPC ou DNT. O catálogo usa os mesmos preços e disponibilidade configurados no painel independentemente dessa preferência.

Em **Tracking → Eventos do site**, PageView conta páginas visitadas, ViewContent conta aberturas da apresentação da oferta, Lead conta formulários concluídos e InitiateCheckout conta aberturas do resumo da seleção. Cada contagem considera uma ocorrência por sessão, página, evento e dia. Esses totais incluem também as jornadas abertas pelo operador. Os cartões de Meta e TikTok são diagnósticos de simulação. As rotas públicas aceitam somente nomes de páginas e ações previstos e não recebem os campos do cadastro.

## Abrir no computador

Com Node.js 24 instalado, execute `npm run dev` na pasta do projeto e abra [o painel local](http://127.0.0.1:4280/admin). Use **Abrir painel de teste**. A sessão e as mudanças de configuração são mantidas em memória durante essa execução. **Páginas e funil → Abrir jornada com tracking** abre o site e registra a passagem pelas seis páginas. Volte ao painel e use **Atualizar** para consultar as contagens. O tracking identifica apenas a sessão de teste e a página visitada.

Na jornada acompanhada, a lista de produtos aplica os preços e a disponibilidade do catálogo do painel. Selecione os produtos e use **Criar pedido de teste** no resumo. O servidor confere o total exibido e usa uma chave por seleção e total para impedir pedidos duplicados em tentativas repetidas.

Em **Vendas → Ver pedido**, gere um PIX de teste em um gateway ativo e simule a confirmação ou o cancelamento. Cada pedido mostrado foi criado pela jornada acompanhada. Os seis gateways emitem identificadores de simulação sem valor de cobrança. Os eventos do pedido entram na **Fila de testes** conforme a configuração de cada canal e podem ser processados em lotes de até vinte. A confirmação repetida mantém uma única entrada de compra por canal. Os testes de Meta, TikTok, UTMfy, Pushcut e SMSMais também podem ser enfileirados manualmente.

Em **SMS e remarketing**, enfileire um lembrete de teste para um pedido pendente ou selecione até 20 e enfileire o lote. A fila mantém um lembrete por pedido e cancela o lembrete pendente se o PIX encerrar antes do processamento. O histórico fica disponível na mesma seção e na auditoria.

**Gateways PIX** mostra os pedidos registrados com PIX de teste, as confirmações e o valor confirmado nas jornadas acompanhadas. **Saídas e retornos** mostra a etapa mais avançada por sessão e os retornos gerados pela navegação normal do navegador.

Na aba **Gateways**, arraste um provedor ou use as setas para ajustar a prioridade. Os cartões permitem ligar ou desligar cada gateway. Clique em **Salvar configurações** para gravar a lista inteira. **Testar gateways** usa a configuração salva e registra o diagnóstico dos provedores escolhidos. A consulta de pagamentos aceita o ID do pedido ou o código PIX de teste.

Os formulários de Gateways, Tracking, UTMfy, Pushcut e SMSMais registram configurações da simulação. URLs de teste usam HTTPS e domínios `.test`. Chaves fictícias usam o prefixo `teste_`. Para chaves, o servidor recebe apenas a indicação de que o campo foi configurado. Os diagnósticos são internos ao painel.

**Vendas** resume pedidos de teste registrados por estado com os mesmos filtros da tabela. Use **Gateways PIX → Consulta de transação** para localizar um pedido de teste pelo identificador ou pelo código gerado. **Público** exporta a distribuição das sessões registradas por etapa, sem métricas geradas.

**Eventos da jornada** registra a conclusão do cadastro, o avanço em cada pergunta, a conclusão do quiz, os resultados da consulta de CEP, a análise simulada e a seleção de ofertas. Cada ação é contabilizada uma vez por página, sessão e dia, sem armazenar campos do formulário, CEP ou respostas.

Use **Atualização automática** na Visão geral ou em Páginas e funil para atualizar os relatórios a cada 30 segundos enquanto a aba estiver ativa.

Em **Leads**, filtre as sessões por gateway ou estado do pedido. Clique na linha ou em **Detalhes** para abrir o overlay com resumo da sessão, páginas visitadas, eventos e pedidos. A consulta abre o estado atual do PIX de teste. O link copiado exige login no painel e o JSON contém os dados disponíveis nessa sessão de teste. A exportação CSV usa os filtros da lista.

A migração de arquivamento guarda o estado operacional anterior em `campaign_admin_archive` e tira as visitas e eventos antigos dos relatórios. O catálogo e as configurações continuam disponíveis. Os relatórios começam vazios e passam a mostrar as ações registradas no ambiente atual.

Na **Visão geral**, escolha um período padrão ou aplique um intervalo de até 90 dias. Os indicadores de conversão contam sessões únicas que alcançaram o CEP, abriram a seleção ou tiveram PIX confirmado em teste. As opções de catálogo, comparação de gateways e eventos de Meta e TikTok ficam pendentes na respectiva seção até clicar em **Salvar configurações**.

As novas visitas incluem data e hora na lista de Leads e no overlay. Visitas de versões anteriores exibem a data registrada. As tabelas de métricas preservam a proteção por linha e o acesso administrativo usa o servidor.

Os eventos configurados no painel entram na fila local durante a jornada acompanhada. `PageView` registra cada página uma vez por sessão e dia, `ViewContent` registra a abertura da oferta e `Lead` é enfileirado uma vez por sessão após o envio válido do formulário. A fila preserva os itens pendentes e mantém até 300 registros.

Selecione um cenário para testar Pixel, API de eventos, PIX gerado ou pago, venda manual, SMS, voz ou retorno de entrega. O diagnóstico é registrado na fila de simulação. **Domínios** executa testes locais da regra de origem com o domínio do painel e com um domínio reservado para testes.

## Publicar o painel autenticado

1. Crie um projeto Supabase para esta campanha e aplique as migrações em `supabase/migrations` em ordem de nome.
2. Cadastre `SUPABASE_URL`, `SUPABASE_ADMIN_SECRET_KEY` e `CAMPAIGN_ADMIN_PASSWORD` nas variáveis do projeto da Vercel. Guarde a chave e a senha com o tipo **Secret**.
3. Use Node.js 24 e o `vercel.json` do repositório. O build copia somente os arquivos públicos permitidos para `dist`. A função em `api/admin.mjs` serve as consultas e os comandos do painel.
4. Faça um novo deploy para aplicar as variáveis. Entre em `/admin` com a senha configurada, salve uma configuração, atualize a página e confira a persistência. Verifique a revogação depois de sair e a contagem do tracking de teste.

Configurações ausentes mantêm o painel hospedado indisponível.

O painel usa um login compartilhado por senha e limita as tentativas de entrada a dez por origem em cinco minutos. Há uma sessão ativa de até 30 minutos no ambiente. Entrar em outro navegador encerra a sessão anterior. O banco guarda um resumo criptográfico do identificador aleatório do cookie. Sair remove a sessão e alterar a senha invalida as sessões anteriores.

Use `npm run check:supabase` com as variáveis de conexão do projeto de teste no ambiente ou em `.env.local` para conferir a leitura das tabelas de configurações, sessões, visitas e eventos. O comando mostra nomes de variáveis ausentes e o resultado das consultas, preservando os valores das chaves.

## Verificações locais

- `npm test` verifica sessão, revogação, controle de origem, concorrência, tracking, relatórios, exportação, testes PIX, pedidos da jornada, reconciliação, deduplicação da fila e os contratos do adaptador Supabase.
- `npm run build` gera a publicação estática em `dist`.
