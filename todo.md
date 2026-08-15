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

## Melhorias solicitadas (rodada 3)
- [x] Gerador de roteiro estendido a partir de uma sugestão (roteiro 1.500–3.000 palavras com tela, B-roll e CTAs)
- [x] Botão "Gerar roteiro" no card de cada sugestão no dashboard de resultado
- [x] Modal de visualização do roteiro gerado (ScriptDialog) com abas e exportação (copiar + TXT)
- [x] Comparador de nichos: analisar 2 nichos lado a lado (vídeos em alta + padrões + veredito)
- [x] Rota /comparador com interface de seleção de 2 nichos e relatório comparativo
- [x] Agenda de conteúdo: transformar sugestões numa agenda de 4 semanas (1 vídeo/semana)
- [x] Visualização da agenda no dashboard (nova aba "Agenda do mês")
- [x] Testes vitest das novas funcionalidades (27 testes passando)
- [x] Verificação visual (screenshots desktop)
