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

## Melhorias solicitadas (rodada 4)
- [x] Habilidade reutilizável do processo Vyroscope (skill-creator, /home/ubuntu/skills/vyroscope-video-analyst)
- [x] Gerador de thumbnails com IA baseado em título e padrões do nicho (buildThumbnailPrompt + generateImage)
- [x] Botão de gerar thumbnail no card de sugestão + exibição com download PNG
- [x] Exportação da agenda do mês em PDF (/api/export-agenda-pdf + buildAgendaPdf)
- [x] Monitoramento: vídeos publicados com desempenho real (performanceScore) vs. score previsto
- [x] Tela de monitoramento (/monitorar) com atualização de métricas do YouTube e comparação
- [x] Testes vitest das novas funcionalidades (35 testes passando)
- [x] Verificação visual (screenshots desktop)

## Melhorias solicitadas (rodada 5)
- [x] Entregar/validar a skill vyroscope-video-analyst (card de skill ao usuário)
- [x] Schema: tabela de histórico de métricas (evolução views/likes por vídeo) e coluna favorite em thumbnails
- [x] Backend: salvar ponto de métricas em cada refresh e retornar série temporal (watched.metrics)
- [x] Backend: gerador de títulos alternativos (5 variações com score via LLM, extended.generateAlternativeTitles)
- [x] Backend: endpoints de favoritos de thumbnails (toggleFavorite/listFavorites)
- [x] Frontend: gráfico interativo (Recharts) de views/likes ao longo do tempo na página /monitorar
- [x] Frontend: botão "Gerar títulos alternativos" por sugestão com modal/lista de 5 títulos pontuados
- [x] Frontend: galeria de favoritos (rota /favoritos + link no header) com botão de favoritar nas thumbnails
- [x] Testes vitest das novas funcionalidades (40 testes passando)
- [x] Verificação visual e checkpoint

## Melhorias solicitadas (rodada 6)
- [x] Backend: watched.metrics retorna médias diárias agregadas (agrupando múltiplos pontos do mesmo dia) e indicadores de crescimento % vs. semana anterior (views/likes)
- [x] Frontend: gráfico do /monitorar exibe médias diárias + card de crescimento percentual (↑/↓ X% vs semana anterior)
- [x] Schema: tabela thumbnail_folders (userId, name, color) + coluna folderId em suggestion_thumbnails
- [x] Backend: CRUD de pastas (create/rename/delete) e mover thumbnail entre pastas (extended.router)
- [x] Frontend: Favoritos com pastas (criar, renomear, excluir, mover thumbnail, filtro por pasta)
- [x] Backend: procedure ideaOfTheDay — retorna sugestão do dia baseada no nicho principal (maior número de análises do usuário) + rotação determinística pela data
- [x] Frontend: painel "Ideia do dia" na home (após login) com card de sugestão, score, hook, ângulo e atalhos (abrir análise completa/copiar)
- [x] Testes vitest das novas funcionalidades (49 testes passando)
- [x] Verificação visual (screenshots) e checkpoint

## Melhorias solicitadas (rodada 7)
- [x] Backend: endpoint para gerar esboço de roteiro (resumo estruturado, não o roteiro completo de 1.5k palavras) a partir da sugestão da ideia do dia (generateIdeaOutline)
- [x] Frontend: botão "Gerar esboço de roteiro" no painel Ideia do dia com modal de resultado (copiar/exportar TXT)
- [x] Frontend: drag-and-drop de thumbnails entre pastas na galeria de Favoritos (HTML5 DnD API: cards arrastáveis + pills como drop targets com destaque)
- [x] Frontend: tooltip nos growth cards do /monitorar com os números exatos (médias da semana atual e anterior usadas no cálculo %)
- [x] Testes vitest das novas funcionalidades (52 testes passando)
- [x] Verificação visual (screenshots) e checkpoint

## Melhorias solicitadas (rodada 8) — concluída: esboço editável no modal, toast ao mover via DnD, reordenação dentro da pasta (coluna sortOrder, procedure reorderThumbnails). Testes 56/56. Checkpoint salvo.

## Melhorias solicitadas (rodada 9)
- [x] Frontend: badge numérico na thumbnail mostrando a posição manual (1, 2, 3...) quando houver reordenação
- [x] Frontend: modo de seleção múltipla nos favoritos (checkbox nos cards, ações em lote: mover para pasta / remover dos favoritos)
- [x] Backend + Frontend: exportar galeria de Favoritos organizada por pastas em PDF (buildFavoritesPdf + rota /api/export-favorites-pdf + botão Exportar PDF)
- [x] Testes vitest das novas funcionalidades (59 testes passando)
- [x] Verificação visual e checkpoint

## Melhorias solicitadas (rodada 10)
- [ ] Atualizar habilidade vyroscope-video-analyst (skill-creator) com todo o processo usado até aqui (skill já existe em /home/ubuntu/skills/vyroscope-video-analyst)
- [ ] PDF de favoritos: incluir título sugerido associado a cada thumbnail na exportação (buildFavoritesPdf)
- [ ] Favoritos: contador de thumbnails por pasta atualizado em tempo real durante ações em lote
- [ ] Favoritos: atalho de teclado Ctrl+A para selecionar todas as thumbnails na galeria
- [ ] Testes vitest das novas funcionalidades
- [ ] Verificação visual e checkpoint
