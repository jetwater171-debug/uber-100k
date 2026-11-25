# Auditoria e port do painel administrativo

Referência auditada em `Desktop/sync/ifoodbag`, commit `188959e`. O inventário cruza os onze HTML administrativos, os controles do `script.js`, o despachante em `lib/admin-api-handler.js`, as funções públicas, as migrações e os testes existentes.

## Inventário funcional

| Área | Funções da referência | Dependências |
| --- | --- | --- |
| Visão geral | Monitoramento ao vivo, filtros de data, métricas, conversão por gateway, funil nativo e controle de etapas | Leads, eventos, pagamentos e configurações |
| Páginas | Contagem de visitas, visitantes, conversão por etapa e análise de saídas | Sessões e pageviews |
| Leads | Busca, filtros, detalhe com jornada, consulta de transação, revalidação PIX, exportação Excel por segmentos, gestão pontual de IP | Banco, histórico de pagamentos e perfis do operador |
| Público | Público pago, origens, posicionamentos, cidades, aparelhos e exportação de agregados | Eventos atribuídos e pagamentos confirmados |
| Vendas | Consolidação por gateway e período, auditoria de faturamento, lista de transações e reconciliação | Consultas autenticadas de cada provedor |
| Gateways | Roteamento e prioridade, desempenho, teste PIX, configurações e diagnóstico de seis provedores | GhostsPay, Sunize, Paradise, ClownPay, AtomoPay e Bravo Pay |
| Tracking | Chaves principal e alternativa do Meta, CAPI, TikTok, acionamento por etapa e testes | Sessão, configuração, scripts de navegador e eventos de servidor |
| UTMfy | Configuração, teste, envio manual, fila, status e notificações Pushcut | UTMfy, Pushcut e processamento assíncrono |
| SMS | API, saldo, teste SMS e voz, webhook, fila, envio selecionado, automático e histórico de recuperação | SMSMais, estados de pagamento, tokens e filas |
| Backredirects | Totais, etapas e detalhe dos redirecionamentos ligados à navegação de retorno | Script de navegação e eventos |
| Clonadores | Detecções recentes, agrupamento por domínio e página, volume e análise | Endpoint de sinalização e tabela de eventos |

## Controles identificados

- O servidor usa sessão administrativa assinada, cookies e verificações de acesso por rota. A referência tem valores padrão no código para senha e assinatura, que devem ser tratados como configuração insegura.
- Requisições públicas passam por validação de host, origem, sessão e lista de IPs. O sinal de cópia é armazenado em tabela própria. Um relato do navegador é um sinal de auditoria e pode ser falsificado.
- O fluxo PIX distingue criação, consulta, webhook e reconciliação. A confirmação depende do provedor e deve ser idempotente. O ambiente financeiro da referência inclui etapas de cobrança apresentadas como IOF e Correios.
- O remarketing filtra leads pendentes, revalida a venda e tem limites de lote, histórico e callbacks. Uma ação de envio pode ter efeitos externos e exige uma operação autorizada.
- O banco da referência reúne dados pessoais e técnicos em leads, além de configurações, pageviews, fila e sinais de cópia. A nova estrutura usa dados de demonstração próprios e eventos de exemplo.

## Etapas do port

1. Inventário e extração dos contratos de UI e API.
2. Painel de protótipo com isolamento de credenciais, sessão de operador, persistência de configurações e tabela de auditoria.
3. Relatórios, catálogo, filtros, busca, exportação e diagnóstico com registros sintéticos.
4. Validação local do painel e da fronteira pública, build da Vercel e publicação do código no GitHub.

O painel demonstra a operação com exemplos, incluindo pagamentos, eventos de marketing, fila e códigos de status. O fluxo comercial público continua como protótipo. Ativação comercial depende de autorização da marca, identificação do vendedor, regras reais de elegibilidade, dados próprios e revisão das integrações. Cobranças atribuídas a terceiros, manipulação do botão de voltar, geração de vendas artificiais em plataformas de anúncios e contatos sem consentimento ficam fora da base.

## Cobertura do protótipo

| Página de referência | Funcionalidade disponível neste painel |
| --- | --- |
| Visão geral | Atualização a cada 30 segundos, sessões, visitas e transações de teste, com controles de catálogo e gateways. |
| Páginas | Visitas por etapa, conclusão do cadastro, seis perguntas, resultados da consulta de CEP, análise e seleção. |
| Leads | Busca, período, tipo de sessão, exportação CSV, histórico por página e pedido vinculado. As sessões acompanhadas usam identificadores anônimos. |
| Público | Agrupamentos de exemplo por origem, posicionamento, cidade e aparelho, com exportação agregada. |
| Vendas | Filtros, auditoria de valores por estado, exportação CSV, consulta e reconciliação de pedidos de teste. |
| Gateways | Prioridade, ativação, diagnósticos simulados dos seis provedores, comparação e consulta por código de teste. |
| Tracking | Matriz de eventos por integração, testes de Pixel e API, deduplicação e fila simulada. |
| UTMfy e Pushcut | Cenários de PIX gerado e pago, venda manual de teste para UTMfy e histórico da fila. |
| SMSMais | Diagnóstico de SMS, voz e entrega, lembretes individuais ou em lote e cancelamento de lembrete quando o pedido encerra. |
| Backredirects | Retornos do navegador registrados por página e progresso por sessão, preservando a navegação normal. |
| Clonadores | Diagnóstico da regra de origem com casos simulados e histórico por página. |

## Referências de implantação

- [Funções Node.js na Vercel](https://vercel.com/docs/functions/runtimes/node-js)
- [Configuração do build e do diretório público](https://vercel.com/docs/builds/configure-a-build)
- [Variáveis de ambiente da Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables)
- [Privilégios e RLS no Supabase](https://supabase.com/docs/guides/api/securing-your-api)
