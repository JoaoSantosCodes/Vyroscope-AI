# Rodada 43 — Detalhamento do custo semanal por modelo, custo individual das thumbnails e filtros de custo no histórico

**Projeto:** Vyroscope AI (vyrosai-9gwgsgfg.manus.space)
**Data:** 17 de agosto de 2026
**Testes:** 348/348 vitest passando | **Base:** checkpoint da R42 (d47d75bc)

## Resumo da rodada

Esta rodada deu **transparência granular** ao controle de custos do Vyroscope AI. O card de teto de custo semanal da página de uso agora mostra uma tabela de **detalhamento por modelo de IA** (LLM e imagens), com o consumo e o custo em reais de cada modelo e uma linha de total. As thumbnails geradas passaram a ter **custo exato e individual** — gravado no momento da geração com a cotação do dólar efetiva — visível no histórico de análises junto ao custo de cada análise. Por fim, o histórico ganhou **controles de ordenação e filtro por custo**, permitindo localizar rapidamente as análises mais caras.

## 1. Detalhamento do custo semanal por modelo de IA

O `profile.getUsageCost` passou a expor `weekCostByModel`, que é um alias do `costByModel` retornado por `estimateWeeklyCostBrl`: a função agrega os tokens LLM da janela de 7 dias por modelo (`groupWeekTokensByModel`, com o preço efetivo do usuário via `resolveLlmPrice` e conversão por `getUsdBrlRate`) e acrescenta uma linha por modelo de imagem com o custo real das thumbnails da semana. No frontend, o `WeeklyCostCapCard` da página `/uso` ganhou a tabela **"Detalhamento semanal por modelo de IA"** (modelo, consumo e custo, com linha de total) sempre que houver detalhamento disponível — o card continua oculto quando o teto é zero. Referências: `server/db.ts` (`groupWeekTokensByModel`, `estimateWeeklyCostBrl`, seção Rodada 43), `server/routers/profile.ts` (`getUsageCost`), `client/src/pages/Usage.tsx` (`WeeklyCostCapCard`).

## 2. Custo exato e individual de cada thumbnail

A geração de thumbnails deixou de ser estimada por contagem e passou a registrar o **custo real por imagem**. Foram adicionadas as colunas `cost_brl` (INTEGER, NOT NULL, DEFAULT 0) e `cost_detail` (VARCHAR) à tabela `suggestion_thumbnails` (migração drizzle 0025). O `saveSuggestionThumbnail` passou a retornar o id inserido, e o `extended.generateThumbnail` agora chama `setThumbnailCost(id, costBrl, costDetail)` imediatamente após a geração, usando o modelo de imagem resolvido pelo usuário (`resolveImageModel`) e a cotação efetiva (`getUsdBrlRate`); o custo também é devolvido ao cliente. O `groupWeekThumbnailsByModel` agrega as thumbnails da janela semanal — **priorizando o custo gravado** e recorrendo ao preço de referência (US$ 0,04) apenas para registros criados antes desta versão — e o `estimateWeeklyCostBrl` foi reescrito para usar esse agrupamento real, substituindo a estimativa por contagem × preço padrão. No histórico (`/historico`), o tooltip da coluna de custo ganhou a seção **"Thumbnails individuais"**, listando título da sugestão e custo em reais de cada imagem. Referências: `server/db.ts` (`setThumbnailCost`, `thumbnailCostForGeneration`, `groupWeekThumbnailsByModel`), `drizzle/schema.ts` + migração 0025, `server/routers/extended.ts` (`generateThumbnail`), `client/src/pages/History.tsx`.

## 3. Filtros e ordenação por custo no histórico

A procedure `analysis.list` passou a juntar `getThumbnailsByAnalysis` por análise e a expor `thumbnails[]` (título, `costBrl` e `costDetail`) para cada análise — análises falhadas ficam sem thumbnails e com custo zero, comportamento coerente com a R42. A página `/historico` ganhou uma barra de controles com **ordenação por custo** (mais recente, maior custo, menor custo) e **filtros de faixa** (todas, com custo, sem custo, até R$ 1,00, acima de R$ 1,00), aplicados no cliente sobre a lista já paginada. A escolha do usuário é **persistida em localStorage** (`vyro:historyCostSort` e `vyro:historyCostBand`) e restaurada ao reabrir a página; quando nenhum item corresponde ao filtro, a página mostra o estado vazio apropriado em vez de uma lista em branco. Referências: `server/routers/analysis.ts` (`analysis.list`), `server/db.ts` (`getThumbnailsByAnalysis`), `client/src/pages/History.tsx` (controles, persistência, tooltip).

## Base de dados

Uma única migração aditiva, sem perda de dados: **0025** — `ALTER TABLE suggestion_thumbnails ADD COLUMN cost_brl INTEGER NOT NULL DEFAULT 0` e `ADD COLUMN cost_detail VARCHAR`. Os registros criados antes da migração têm custo 0 e são tratados pelo fallback do preço de referência nos agregadores.

## Testes

Novo arquivo: `server/limits-r43.test.ts` (5 testes em 3 grupos — exposição de `weekCostByModel` pelo `profile.getUsageCost`; prioridade do custo real gravado das thumbnails no custo semanal, com mock reescrito que imita a computação de `estimateWeeklyCostBrl` e verifica que `groupWeekThumbnailsByModel` é consultado; gravação do custo na geração via `generateThumbnail`, recusa de acesso de outra conta e exposição de thumbnails no `history.list`; padrão de mock total do db da `limits-r42.test.ts` incluindo as constantes `LLM_MODEL_PRICES` e `LLM_DEFAULT_PRICE_PER_MILLION`). Aula técnica da rodada: o mock do custo semanal precisou reescrever o comportamento esperado da computação real (tokens × preço médio input/output × câmbio + thumbnails) para validar o total de R$ 4,64 esperado — uma expectativa inicial calculada na mão (R$ 0,74) usava o preço de input isolado em vez do preço médio, e foi corrigida. Suíte completa: **348/348 testes passando**. TypeScript limpo (tsc sem erros).

## Vercel

Nenhuma env nova nem ajuste de deploy: o custo das thumbnails usa o mesmo fluxo de imagem já configurado (`resolveImageModel`), a cotação vem da API pública com cache e fallback 5,40, e a nova coluna tem default seguro.

## Próximos passos sugeridos

Detalhamento do custo semanal por modelo também na seção semanal do PDF de uso; custo por thumbnail na exportação CSV do histórico; e orçamento de custo por análise individual (alerta quando uma análise específica ultrapassar um valor configurado).
