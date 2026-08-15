# Vyroscope AI — Project TODO

## Backend
- [x] Schema do banco: tabelas `analyses` (histórico por usuário) e `analysis_videos` (vídeos analisados)
- [x] Cliente Data API hub para YouTube Data API v3 (search + videos stats)
- [x] Serviço de análise com LLM: padrões de viralidade, virality score, temas, hooks e ângulos
- [x] Roteador tRPC: `analysis.run` (protegido), `analysis.list` (histórico do usuário), `analysis.get` (detalhe)
- [x] Testes vitest para roteadores de análise (9 testes passando)

## Frontend
- [x] Design system elegante (dark, tipografia sofisticada, hierarquia clara)
- [x] Landing page com campo de nicho + botão de análise e apresentação do produto
- [x] Página de análise: estado de carregamento com etapas visíveis (busca → padrões → score → sugestões)
- [x] Dashboard de resultados em cards: virality score, temas, hooks, ângulos prontos para gravar
- [x] Histórico de análises do usuário autenticado
- [x] Botão de login (Manus OAuth) + estados deslogado
- [x] Estados de erro/limite da API com mensagens claras

## Entrega
- [x] Verificação visual (screenshots desktop e mobile)
- [x] Testes rodando sem erros
- [x] Checkpoint final (versão 6349ffe0 salva)

## Melhorias solicitadas (rodada 2)
- [x] Exportação de sugestões em PDF (geração no servidor com layout elegante, /api/export-pdf)
- [x] Exportação de sugestões em CSV (download client-side)
- [x] Filtro/ordenação no dashboard por virality score
- [x] Filtro/ordenação no dashboard por duração
- [x] Barra de progresso detalhada durante a análise (etapas reais via backend, coluna progressStep)
- [x] Área de perfil do usuário (rota /perfil, dados da conta, estatísticas, edição de nome/email)
