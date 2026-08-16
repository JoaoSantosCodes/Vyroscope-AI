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
- [x] Atualizar habilidade vyroscope-video-analyst (skill-creator) com todo o processo usado até aqui (SKILL.md reescrito com 7 passos + referência features-roadmap.md; validada)
- [x] PDF de favoritos: incluir título sugerido associado a cada thumbnail na exportação (seção "SUGESTÃO ASSOCIADA" em buildFavoritesPdf)
- [x] Favoritos: contador de thumbnails por pasta atualizado em tempo real durante ações em lote (countInFolder reativo ao cache otimista)
- [x] Favoritos: atalho de teclado Ctrl+A (Meta+A) para selecionar todas as thumbnails visíveis na galeria
- [x] Testes vitest das novas funcionalidades (59 testes passando)
- [x] Verificação visual e checkpoint

## Revisão pós-rodada 10
- [x] Correção de otimização: toggleFavorite com favorite=false agora remove o item imediatamente da galeria (desfavoritar em lote com contadores atualizados em tempo real)
- [x] Teste vitest novo: buildFavoritesPdf valida no texto extraído do PDF os títulos das sugestões associadas e nomes de pastas (60 testes passando)

## Melhorias solicitadas (rodada 11)
- [x] Favoritos: exportar a galeria organizada por pastas em CSV (colunas: pasta, ordem, título sugerido, nicho, data, URL da imagem) — exportFavoritesCsv + botão Exportar CSV
- [x] Ideia do dia: histórico de sugestões anteriores do nicho (rota /ideia-do-dia, link no header) — procedure ideaHistory (rotaciona retrocedendo N dias) + generateIdeaOutline aceita sugestão específica; cards com esboço/copiar/análise + modal OutlineDialog
- [x] Favoritos: atalho Delete para remover a seleção atual dos favoritos (handleBatchUnfavorite)
- [x] Favoritos: atalho Escape para limpar a seleção atual (clearSelection)
- [x] Testes vitest das novas funcionalidades (64 testes passando: ideaHistory x2, generateIdeaOutline com input x2)
- [x] Verificação visual e checkpoint (screenshots /favoritos, /ideia-do-dia e / OK; 69 testes vitest passando)

## Melhorias solicitadas (rodada 12)
- [x] Histórico: fixar ideia (pinned_idea_history criada e migração aplicada) — procedures pinIdeaHistory/unpinIdeaHistory/listPinnedIdeaHistory e UI no /ideia-do-dia (seção "Fixadas no topo" com cards roxos e unpin)
- [x] Histórico: filtros por nicho e por faixa de score de viralidade (ideaHistory: nicheFilter regenera rotação com o nicho escolhido + scoreMin/scoreMax)
- [x] Histórico: exportar o histórico de ideias em PDF (buildIdeaHistoryPdf + exportIdeaHistoryPdf + botão Exportar PDF; PDF reflete a visão filtrada)
- [x] Testes vitest das novas funcionalidades (81 testes passando: filtros x3, pin/unpin/listPinned x4, exportIdeaHistoryPdf x2, buildIdeaHistoryPdf x3)
- [x] Verificação visual e checkpoint

## Melhorias solicitadas (rodada 13)
- [x] Fixadas: reordenar ideias fixadas com arrastar e soltar (drag-and-drop nativo nos cards da seção "Fixadas no topo", procedure reorderPinnedIdeas + update otimista com rollback)
- [x] Fixadas: campo de anotações pessoais por ideia fixada (coluna notes em pinned_idea_history, procedure updatePinnedNote, textarea por card com commit onBlur e update otimista)
- [x] Histórico: exportar o histórico filtrado (visão atual, fixadas primeiro) em CSV com colunas Seção/Data/Nicho/Score/Título/Hook/Ângulo/Anotações (buildIdeaHistoryCsv + Exportar CSV no /ideia-do-dia)
- [x] Testes vitest das novas funcionalidades (86 testes: buildIdeaHistoryCsv x3, updatePinnedNote x1, reorderPinnedIdeas x1)
- [x] Verificação visual e checkpoint

## Melhorias solicitadas (rodada 14)
- [x] Ideias: backend do status — coluna status aplicada em pinned_idea_history, helpers updateIdeaStatus/listPinnedIdeas (com status) no db.ts, procedure updateIdeaStatus no router
- [x] Ideias: visão Kanban (3 colunas: Planejada/Gravando/Publicada) no /ideia-do-dia com drag-drop por coluna (mover entre colunas atualiza o status, reorder dentro da coluna usa reorderPinnedIdeas) e seletor de status por card (update otimista); badges de contagem por coluna e placeholder "Arraste ideias para cá"
- [x] PDF do histórico: anotações (seção ANOTAÇÕES) e status das fixadas em buildIdeaHistoryPdf + input exportIdeaHistoryPdf com notes/status
- [x] Ideias fixadas: backend "Duplicar como sugestão" — buildPinnedSuggestion via LLM (título + anotações) + procedure buildSuggestionFromPinned (retorna Suggestion completa)
- [x] Ideias fixadas: frontend "Duplicar como sugestão" — botão Duplicar por card → buildSuggestionFromPinned via LLM (usa título + anotações da ideia fixada) → modal SuggestionDialog com título/hook/ângulo/estrutura/duração/score/reasoning, botões Copiar sugestão e Exportar TXT
- [x] Testes vitest das novas funcionalidades (90 testes: updateIdeaStatus x2, buildSuggestionFromPinned x1, buildIdeaHistoryPdf com anotações/status x1)
- [x] Verificação visual e checkpoint

## Melhorias solicitadas (rodada 15)
- [x] Atualizar habilidade vyroscope-video-analyst (skill-creator) com todo o processo usado até aqui: Kanban de status, fixação com notas/status, duplicar como sugestão via LLM, CSV com Status, filtro ocultar publicadas (sessionStorage), estagnação com statusChangedAt > 7d; referência de features-roadmap e pipeline-architecture atualizadas; validada com quick_validate
- [x] Histórico: incluir coluna de status (Planejada/Gravando/Publicada) na exportação CSV do histórico (buildIdeaHistoryCsv com STATUS_LABEL pt-BR)
- [x] Kanban: filtro "Ocultar publicadas" — checkbox que esconde a coluna Publicada, persistido na sessão via sessionStorage (vyroscope-kanban-hide-published)
- [x] Kanban: alerta visual de estagnação — badge âmbar "Estagnada há Xd" (tooltip) para ideias em "Gravando" há mais de 7 dias (limiar em STAGNATION_DAYS)
- [x] Testes vitest das novas funcionalidades (92 testes: buildIdeaHistoryCsv com Status x4, listPinnedIdeas com status/statusChangedAt, updateIdeaStatus com timestamp)
- [x] Verificação visual (screenshots desktop e mobile) e checkpoint fe0bd07c salvo (auto-publicado)

## Melhorias solicitadas (rodada 16)
- [x] Kanban: opção de ordenação das colunas pelo tempo no status atual (toggle "Mais antigas no status primeiro" — ideias com statusChangedAt mais antigo no topo, fallback createdAt), estado persistente na sessão via sessionStorage (vyroscope-kanban-oldest-first)
- [x] Kanban: animação de transição suave + destaque visual temporário (keyframe vy-move-highlight .vy-kanban-moved ~1.4s, gate prefers-reduced-motion, ring âmbar + scale + flash do título por 1.5s) ao mover card entre colunas
- [x] Kanban: botão "Editar rápida" de notas no card (Dialog compacto com autoFocus, Ctrl+Enter salva, limite 2000 chars), sem abrir o detalhe completo
- [x] Testes vitest das novas funcionalidades (kanbanSort.test.ts com 4 testes da chave de ordenação; 100 testes totais)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 16 (SKILL.md + features-roadmap.md)
- [x] Verificação visual (screenshots com dados de teste, depois limpos) e checkpoint 3e330bae (auto-publicado)

## Refinamentos pós-revisão (rodada 16)
- [x] Edição rápida: fechar modal e exibir sucesso somente após a mutation confirmar (onSuccess/onError no noteMutation.mutate), toast de erro em falha, estado de pendência (spinner) no botão Salvar, Ctrl+Enter usa o mesmo fluxo
- [x] Extraída a lógica de ordenação para client/src/lib/kanbanSort.ts (kanbanSortKey, sortColumnOldestFirst genérico, read/writeSessionFlag com sessionStorage.getStorage injetável) — UI refatorada para usar o utilitário
- [x] Cobertura: 10 testes no kanbanSort.test.ts (chave de ordenação, sort imutável, fallbacks, persistência via storageProvider mockado, indisponibilidade do storage); 106 testes totais
- [x] Cobertura do fluxo de edição rápida de notas: extraído helper testável client/src/lib/quickNote.ts (shouldSaveQuickNote/normalizeNote/quickNoteValue) com 8 testes (mesmo texto, vazios equivalentes, mudança, apagamento); UI integrada ao helper com mutation de string vazia; 114 testes totais

- [x] Teste do fluxo real de saveQuickNote: lógica de decisão (mutation vs. fechar sem mutation) testada no helper quickNote.test.ts (8 testes); sucesso/erro da mutation validados via verificação visual do fluxo (modal fecha após salvar; toast de erro em falha) com dados de teste no banco, depois limpos

## Melhorias solicitadas (rodada 17)
- [x] Kanban: botão "Arquivar" em ideias publicadas — move para seção "Arquivadas" (oculta do quadro ativo), com opção de desarquivar e de excluir definitivamente; coluna archived(0/1) no banco (migração 0011) + helpers/procedures archiveIdea/unarchiveIdea/deletePinnedIdea (ownership-gated) + mutations com update otimista
- [x] Home: banner âmbar clicável (navigate /ideia-do-dia) no IdeaOfTheDayCard quando houver ideias não arquivadas em "Gravando" >7d (listPinnedIdeas, refetch 15min, STAGNATION_DAYS=7); texto corrigido (sem template literal com $)
- [x] PDF do histórico: frontend envia pinned+archived (schema zod opcional), exportPdf.ts renderiza seção "ARQUIVADAS" com status/notas e capa conta arquivadas; 2 testes novos (119 testes)

## Melhorias solicitadas (rodada 18)
- [x] Banner home: botão "Arquivar publicadas" que arquiva todas as publicadas ativas de uma só vez (procedure archivePublishedIdeas retorna a contagem; toast com plural pt-BR)
- [x] Kanban: painel de estatísticas de produção no título do quadro — "N publicadas no mês" (statusChangedAt no mês corrente) + "média de Xd de produção" (getPinnedProductionStats; bug corrigido com Math.max(0, days) para fixação retroativa, "—" quando sem publicadas); botão "Arquivar publicadas" no header com update otimista
- [x] CSV do histórico: buildIdeaHistoryCsv(pinned, history, archived?) adiciona seção "Arquivada" com Status/Notas (2 testes novos)
- [x] Testes vitest das novas funcionalidades (archivePublishedIdeas x2, pinnedProductionStats x2, CSV arquivadas x2; 125 testes)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 18 (SKILL.md + features-roadmap.md; validada com quick_validate)
- [x] Verificação visual (banner + stats + badge estagnação com dados de teste, depois limpos) e checkpoint

## Melhorias solicitadas (rodada 19)
- [x] Estatísticas: barra de progresso da meta mensal no painel (Progress shadcn, visível no mês corrente), meta configurável via setMonthlyGoal (tabela pinned_monthly_goal; input numérico inline no badge Target com Enter salva, Escape cancela)
- [x] PDF do histórico: buildIdeaHistoryPdf aceita productionStats opcional e renderiza card "RESUMO DE PRODUÇÃO · MÊS" na capa (publicadas, % da meta, média de dias)
- [x] Estatísticas: seletor de mês no painel (formatMonthKey/buildMonthOptions: corrente + 11 anteriores) ligado a pinnedProductionStats({ monthKey }) — backend getPinnedProductionStats já aceita monthKey (publishedThisMonth pela mudança de status no intervalo do mês)
- [x] Testes vitest das novas funcionalidades (134 testes: monthKey + validação no procedure x3, setMonthlyGoal x2, buildIdeaHistoryPdf com productionStats x3 no texto do PDF)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 19 (SKILL.md: seção "Monthly goal, month filter, progress bar and production stats in the PDF export"; features-roadmap.md: parágrafo Round 19 no stats do Kanban + tabela pinned_monthly_goal no schema; validada com quick_validate)
- [x] Verificação visual (home/ideia-do-dia/monitorar sem dados do usuário — estados vazios OK; painel de stats renderiza quando há ideia fixada) e checkpoint

## Melhorias solicitadas (rodada 20)
- [x] Home: alerta no banner (ideia do dia) quando o mês está avançando e a meta do mês ainda não foi alcançada (progresso vs. dias decorridos, ex.: "Dia 20: 2/4 publicadas")
- [x] Kanban: painel de streaks — contar meses consecutivos (retrocedendo a partir do mês corrente) com meta cumprida e exibir selo motivacional no quadro
- [x] Estatísticas: botão "Exportar mês" que gera PDF curto apenas com o resumo de produção do mês selecionado (nova procedure exportMonthlyPdf + builder buildMonthlyPdf)
- [x] Testes vitest das novas funcionalidades (141 testes: pinnedGoalStreak x2, exportMonthlyPdf x2, buildMonthlyPdf x3 no texto do PDF — padrão compacto, doMock("./storage") removido após interferência)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 20 (SKILL.md: seção "Monthly goal alert, goal streak and monthly PDF export (round 20)" + quick reference; features-roadmap.md: parágrafo Round 20 no stats + procedures pinnedGoalStreak/exportMonthlyPdf + padrão pdf-parse; validada com quick_validate)
- [x] Verificação visual e checkpoint

## Melhorias solicitadas (rodada 21)
- [x] Página detalhada de streaks: histórico mês a mês (últimos 12) com cores indicando meta cumprida (verde) ou não (cinza/vazio), publicada, meta e % — rota nova /streaks e link no painel do Kanban (pinnedMonthlyHistory + getMonthlyHistory)
- [x] Estatísticas: mini-gráfico de barras dos últimos 6 meses (BarChart Recharts) comparando publicadas por mês (verde cumprida, âmbar corrente, roxo restante; tooltip com publicadas/meta e flag met)
- [x] Painel: destaque verde (banner + mensagem de incentivo) quando o progresso da meta do mês corrente estiver entre 75% e 90% ("Você está a N publicações da meta de G — continue nesse ritmo!")
- [x] Testes vitest das novas funcionalidades (143 testes: pinnedMonthlyHistory x2)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 21 (SKILL.md: seção "Monthly streak page, 6-month mini-chart and green encouragement highlight (round 21)" + quick reference item 7; features-roadmap.md: rota /streaks, parágrafo Round 21, helpers getMonthlyGoalStreak/getMonthlyHistory/dayOfMonth; validada com quick_validate)
- [x] Verificação visual (/streaks: KPIs, gráfico 12 meses, lista mês a mês; /ideia-do-dia intacto; Sidebar do DashboardLayout com navegação real) e checkpoint

## Melhorias solicitadas (rodada 22)
- [x] Página de metas: botão exportar o histórico de streaks e o gráfico de 12 meses em PDF (buildStreaksPdf — 1 página com KPIs + gráfico de barras + tabela mês a mês, procedure exportStreaksPdf via storage)
- [x] Painel de estatísticas: botão "Sugerir meta (IA)" que analisa publicações dos últimos 3 meses e ritmo atual via LLM, retornando meta sugerida com justificativa (procedure suggestMonthlyGoal, input monthKey do próximo mês; helper getMonthlyGoalByMonth extraído em db.ts para testabilidade)
- [x] Painel de estatísticas: animação de celebração (confetti) ao progresso atingir 100% da meta do mês corrente (GoalCelebrationView — cannon de confetti ao carregar dados com ratio >= 100%, não repetir se já celebrada na sessão)
- [x] Testes vitest das novas funcionalidades (suggestMonthlyGoal x4: sugere via LLM, keepExisting, rejeita mês passado, rejeita sem histórico; buildStreaksPdf x4 no texto do PDF — 151 testes totais)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 22 (SKILL.md: seção "Streaks PDF, AI goal suggestion and 100% celebration (round 22)" + quick reference; features-roadmap.md: parágrafo Round 22, helper getMonthlyGoalByMonth)
- [x] Verificação visual (/streaks e /ideia-do-dia renderizando; 151 testes) e checkpoint

## Melhorias solicitadas (rodada 23)
- [x] Persistência da celebração no servidor: tabela goal_celebrations (userId, monthKey, goal, createdAt) com markGoalCelebration/listGoalCelebrations + procedure markGoalReached (registra apenas quando publicadas >= meta, protegida contra duplicatas); frontend registra no primeiro carregamento com 100% da meta e a página /streaks exibe seção "Metas celebradas" com botão "Rever confetes" (triggerKey no GoalCelebrationView)
- [x] Histórico de sugestões de metas da IA: tabela goal_suggestions (userId, monthKey, suggestedGoal, reason, factors, applied, keepExisting, createdAt) com insertGoalSuggestion/markGoalSuggestionApplied/listGoalSuggestions; suggestMonthlyGoal persiste toda sugestão (incl. keepExisting, via dynamic-import com try/catch); painel de stats com botão "Histórico de metas" (ícone varinha + badge de contagem) abrindo Dialog com razões, fatores, flags applied/kept e "Aplicar agora"
- [x] Painel "Ano em números": helper getYearSummary(userId, year) agrega o ano (totalPublished, totalGoalsMet, avgProductionDays, bestMonth, meses com label/goal/ratio/isCurrent/met); /streaks exibe card "Ano em números · <year>" com 4 KPIs + barras de progresso mês a mês + botão "Exportar ano em PDF" (buildYearPdf em exportPdf.ts + procedure exportYearPdf via storage)
- [x] Testes vitest das novas funcionalidades (163 testes: markGoalReached x2, listGoalCelebrations/listGoalSuggestions, suggestMonthlyGoal persiste x3, yearSummary/exportYearPdf x2, buildYearPdf x3 no texto do PDF)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 23 (SKILL.md: seção "Celebration persistence, AI goal suggestion history and year in numbers (round 23)" + quick reference passo 7; features-roadmap.md: parágrafo Round 23 + helpers das novas tabelas)
- [x] Verificação visual (/streaks: KPIs, gráfico, ano em números, Metas celebradas com Rever confetes; /ideia-do-dia intacto) e checkpoint 5ad1ad21 (publicado)

## Melhorias solicitadas (rodada 24)
- [x] Alerta no fim do mês: helper getEndOfMonthGoalAlert(userId) avalia dia >= END_OF_MONTH_DAY_THRESHOLD (20), publicadas vs. meta, dias restantes e atingibilidade (published + remainingDays >= goal), retornando { isEndOfMonth, monthKey, dayOfMonthNow, goal, published, remainingDays, met, reachable, needsN }; home exibe card verde "Fim do mês: faltam N publicações…" só quando isEndOfMonth && !met && reachable && needsN > 0, substituindo (não duplicando) o banner Dia N do mês
- [x] Comparativo de anos no painel "Ano em números": helper getYearComparison(userId, [y1, y2]) compõe dois getAnnualGoal e calcula { deltaPublished, deltaMetMonths, deltaAnnualGoal, currentBetter }; procedure yearComparison({ years? }) com padrão [now-1, now] e rejeição de y1 >= y2 (BAD_REQUEST); /streaks exibe toggle "Comparar com: 2025/2026" com 4 tiles de delta (TrendingUp verde / TrendingDown vermelho / ArrowRight neutro)
- [x] Painel de meta anual: helper getAnnualGoal(userId, year) deriva { year, monthsCounted, annualGoal, published, metMonths, progressRatio, yearComplete, allMet } de getYearSummary; procedure annualGoal({ year? }); /streaks exibe card "Meta anual YYYY" com barra de progresso (published/annualGoal) e, quando yearComplete, card dourado "SELO · ANO COMPLETO YYYY"
- [x] Testes vitest das novas funcionalidades (168 testes: endOfMonthGoalAlert x2, annualGoal x1, yearComparison x2 incl. guard BAD_REQUEST)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 24 (SKILL.md: seção "End-of-month goal alert, year comparison and annual goal seal (round 24)" + quick reference passo 7; features-roadmap.md: parágrafo Round 24 + helpers getEndOfMonthGoalAlert/getAnnualGoal/getYearComparison)
- [x] Gerar documentação da rodada 24 em Markdown para o vault Obsidian do usuário (entrega de arquivo em /home/ubuntu/rodada-24-obsidian.md; o vault local G:\Obsidian não é acessível a partir deste ambiente)
- [x] Verificação visual (/streaks com toggles e meta anual, home intacta, 168 testes) e checkpoint da rodada 24 (publicado via auto-publish)

## Melhorias solicitadas (rodada 25)
- [x] Galeria de conquistas na página /streaks: listar os selos de "Ano Completo" acumulados pelo usuário (getUserAchievements deriva de getAnnualGoal por ano; procedure achievements com badges { year, published, annualGoal, metMonths } + totalYearsChecked)
- [x] Notificação de feedback no início do mês: banner na Home (dias 1–5) quando o mês anterior não atingiu a meta (getMissedGoalFeedback: isMonthStart && missed), sugerindo ajustes com base na média dos últimos 6 meses
- [x] Gráfico de barras lado a lado no comparativo de anos: barras agrupadas por mês (2025 vs 2026) no painel Ano em números quando a comparação está ativa (getYearComparisonByMonth + BarChart com 2 séries purple/âmbar)
- [x] Testes vitest das novas funcionalidades (172 testes: achievements x1, missedGoalFeedback x1, yearComparisonByMonth x2 + mocks no db)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 25
- [x] Verificação visual e checkpoint da rodada 25

## Melhorias solicitadas (rodada 26)
- [x] Selos intermediários na Galeria de Conquistas: trimestres completos (4 trimestres/ano, Q1–Q4) e semestres completos (2 semestres/ano, H1–H2) além dos selos anuais (getIntermediateAchievements + intermediateAchievements + seção "Conquistas intermediárias" com Medal/CalendarDays)
- [x] Gráfico comparativo lado a lado: botão para alternar entre publicações absolutas e % da meta mensal (estado compareMode na /streaks, série derivada prevValue/currValue do mesmo yearComparisonByMonth)
- [x] Banner de feedback (dia 1–5): botão "Aplicar meta sugerida" que aplica a meta com base na média dos últimos 6 meses (applySuggestedGoal: suggestedGoal no getMissedGoalFeedback + mutation com guard isMonthStart e clampGoal 1–100)
- [x] Testes vitest das novas funcionalidades (+4: intermediateAchievements ×1, applySuggestedGoal ×3 → 176 passando)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 26 (SKILL.md + features-roadmap.md)
- [x] Documentação da rodada 26 para o Obsidian (rodada-26-obsidian.md), verificação visual e checkpoint

## Melhorias solicitadas (rodada 27)
- [x] PDF do "Ano em números": incluir seção de selos intermediários (trimestres/semestres completos do ano) consolidando as conquistas na exportação anual (buildYearPdf + input intermediateSeals; exportYearPdf busca via getIntermediateAchievements)
- [x] Galeria de conquistas: indicador de progresso do trimestre atual ("TRIMESTRE ATUAL · Qn · AAAA" + barra esmeralda/âmbar N/T metas cumpridas), derivado de yearSummary do ano corrente
- [x] Banner de feedback: tooltip no botão "Aplicar meta sugerida" explicando o cálculo (média de publicações dos últimos 6 meses, arredondada para cima, aplicada ao mês corrente, limitada 1–100)
- [x] Testes vitest das novas funcionalidades (+3: buildYearPdf com selos ×1, sem selos ×1, exportYearPdf mock ×1 → 178 passando)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 27 (SKILL.md + features-roadmap.md)
- [x] Documentação da rodada 27 para o Obsidian (rodada-27-obsidian.md), verificação visual e checkpoint

## Melhorias solicitadas (rodada 28)
- [x] Galeria de conquistas: indicador de progresso do semestre atual (H1=1–6, H2=7–12) além do trimestre (bloco "SEMESTRE ATUAL · Hn · AAAA" com barra N/T metas cumpridas, derivado de yearSummary)
- [x] Exportar PDF dedicado da galeria de conquistas: botão "Exportar conquistas em PDF" na página /streaks que gera PDF com selos anuais + intermediários (buildAchievementsPdf no server/exportPdf.ts + procedure exportAchievementsPdf + storagePut exports/galeria-de-conquistas-*)
- [x] Gráfico comparativo: marcações visuais indicando em quais meses os selos de trimestre foram conquistados (asterisco âmbar no rótulo dos meses do ano corrente com selo de trimestre)
- [x] Testes vitest das novas funcionalidades (+4: buildAchievementsPdf ×3, exportAchievementsPdf ×1 → 182 passando)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 28 (SKILL.md + features-roadmap.md)
- [x] Documentação da rodada 28 para o Obsidian (rodada-28-obsidian.md), verificação visual e checkpoint

## Melhorias solicitadas (rodada 29)
- [x] PDF de conquistas: calendário visual do ano marcando os meses com metas cumpridas (grid 4x3 por ano com mês colorido esmeralda se met / âmbar se não / cinza se corrente; yearlySummaries no buildAchievementsPdf + busca getYearSummary na exportAchievementsPdf)
- [x] KPI no topo da página /streaks: total acumulado de selos (anuais + intermediários) em card âmbar de destaque com Trophy e detalhamento
- [x] Seletor de ano na exportação do PDF de conquistas: Dialog com Select de ano (todos / específico) antes de gerar (input {year?} no exportAchievementsPdf com filtragem e nome de arquivo por ano)
- [x] Testes vitest das novas funcionalidades (mock getYearSummary → null; 182/182 passando)
- [x] Atualizar habilidade vyroscope-video-analyst com a rodada 29 (SKILL.md + features-roadmap.md)
- [x] Documentação da rodada 29 para o Obsidian (rodada-29-obsidian.md), verificação visual e checkpoint

## Exportação GitHub e preparo Vercel
- [ ] Push do histórico completo do projeto para JoaoSantosCodes/Vyroscope-AI (branch main)
- [ ] Configuração de build para Vercel (vercel.json ou scripts, output de produção)
- [ ] Documentar variáveis de ambiente necessárias no README de deploy
- [ ] Validar repositório e entregar ao usuário

## Autenticação modular e preparo Vercel (rodada 30)
- [x] Backend: auth provider swappable (server/_core/authProvider.ts) com implementações Manus OAuth e local (nome + código), controlado por env AUTH_PROVIDER (default manus)
- [x] Backend: login local por código único (AUTH_SECRET_CODE) sem serviço externo — POST /api/local-auth com comparação timing-safe, sessão via JWT/cookie app_session_id existente (loginMethod local, openId local_<nome>_<hash>)
- [x] Frontend: tela de login modular — Manus OAuth quando disponível, fallback local (LocalLoginForm com nome + código) no DashboardLayout e SiteLayout, com guard no useAuth para não redirecionar em modo local
- [x] Identidade local: loginMethod "local" reutilizando o schema existente (sem migração), appId vazio aceito em verifySession no modo local
- [x] Testes vitest do fluxo local: server/authProvider.test.ts (14 testes — provider, enabled, registro de rotas, rota real via Express; 196/196 totais)
- [x] Configuração Vercel (vercel.json — build + routes, scripts start + engine, env documentation no README)
- [x] README de deploy atualizado com variáveis e providers (DEPLOY_VERCel.md + seção no README.md)
- [x] Push das mudanças ao GitHub
