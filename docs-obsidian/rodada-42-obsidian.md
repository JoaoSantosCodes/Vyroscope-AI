# Rodada 42 — Vyroscope AI

**Data:** 17 de agosto de 2026
**Escopo:** teto de custo semanal com ação configurável (Bloquear / Apenas avisar / Informar), custo exato de cada análise individual (tokens, modelo e valor em R$) no histórico, e alerta visual de mudança de cor quando a projeção de custo atinge 80% do teto.

## 1. Teto de custo semanal

Foram adicionadas as colunas `weekly_cost_cap_brl` (REAL, default 0) e `weekly_cost_cap_action` (VARCHAR, default `warn`) à tabela `user_limits` (migração drizzle 0024), seguindo exatamente o mesmo mecanismo do teto mensal da Rodada 41, porém operando sobre uma **janela fechada de 7 dias** (os últimos 7 dias, não o mês corrente). No `server/db.ts` foram criados os helpers `estimateWeeklyCostBrl(userId)` — que soma o custo de tokens LLM da semana, convertido com o câmbio dinâmico USD/BRL e o preço efetivo do modelo do usuário (`resolveLlmPrice`), com o custo das thumbnails geradas na semana (`countWeekThumbnails` × R$ 0,04 por imagem) — e `emitWeeklyCostCapAlert(userId, capBrl)`, que emite um alerta in-app por dia (dedup via dayKey `weekly_cost_cap` na tabela `usage_alerts`) quando o custo da semana atinge ≥80% (nível warn) ou ≥100% (nível blocked) do teto.

A dimensão `weekly_cost_cap` foi adicionada ao `checkAnalysisLimitsExtended`: quando o teto semanal é maior que zero e a ação configurada não é `alert`, um custo de semana ≥ 100% do teto gera bloqueio conforme a ação — `block` registra a tentativa em `blocked_attempts` e lança TOO_MANY_REQUESTS; `warn` mantém o mecanismo de confirmação de uso único (`needsConfirmation` + `consumeLimitOverride`); `alert` ignora o teto e apenas notifica. Uma falha na estimativa de custo nunca bloqueia a análise. Os routers `profile.getLimits`/`setLimits` foram estendidos para persistir e expor os dois campos semanais, e o dialog **Limites** do perfil ganhou um card dedicado (valor de R$ 0 a 10.000 e seletor de ação com as três opções). Referências: `server/db.ts`, `drizzle/schema.ts` + migração 0024, `server/routers/profile.ts`, `client/src/pages/Profile.tsx`.

## 2. Custo exato por análise

Foram adicionadas as colunas `cost_brl` (INTEGER) e `cost_detail` (VARCHAR) à tabela `analyses` (migração 0024). O helper `recordAnalysisCostFor(analysisId, userId, tokens, youtubeUnits, model)` é chamado ao final de cada execução de análise (`runAnalysisAsync`) e grava o custo total em reais — tokens de LLM no preço efetivo do modelo + thumbnails da análise (quantidade × R$ 0,04) — junto com um detalhamento textual legível (tokens, modelo utilizado, câmbio aplicado). A procedure `history.list` passou a expor `costBrl` e `costDetail` para cada análise; análises que falharam antes dessa versão permanecem com custo 0 e sem tooltip, comportamento correto. Na página `/historico`, cada análise exibe o valor em R$ em um tooltip com o detalhamento tokens/modelo. Referências: `server/db.ts` (`recordAnalysisCostFor`, `listAnalysesByUser`), `drizzle/schema.ts` + migração 0024, `server/routers/analysis.ts`, `client/src/pages/History.tsx`.

## 3. Alerta visual de 80% do teto

A página `/uso` ganhou o card **Teto de custo semanal** (`WeeklyCostCapCard`), com o custo dos últimos 7 dias contra o teto configurado e uma barra de progresso com mudança de cor: **verde** abaixo de 80%, **âmbar** a partir de 80% (o alerta visual solicitado) e **vermelho** a partir de 100%, com texto adaptado a cada faixa e a descrição do modo de ação vigente (bloqueio automático, confirmação de uso único ou apenas notificação). O card se oculta automaticamente quando nenhum teto semanal está configurado. O `UsageAlertsBanner` global passou a reconhecer as dimensões `cost_cap` e `weekly_cost_cap` com formatação monetária em R$ nos rótulos de consumo. O PDF de uso (`buildUsagePdf`) ganhou a seção "Teto de custo semanal" com custo da semana, teto e modo configurado. Referências: `client/src/pages/Usage.tsx` (`WeeklyCostCapCard`), `client/src/components/UsageAlertsBanner.tsx`, `server/usagePdf.ts`.

## Base de dados

Uma migração única e aditiva (sem perda de dados): **0024** — `ALTER TABLE user_limits ADD COLUMN weekly_cost_cap_brl REAL NOT NULL DEFAULT 0`, `ADD COLUMN weekly_cost_cap_action VARCHAR(16) NOT NULL DEFAULT 'warn'`; `ALTER TABLE analyses ADD COLUMN cost_brl INTEGER` e `ADD COLUMN cost_detail VARCHAR(255)`.

## Testes

Novo arquivo: `server/limits-r42.test.ts` (6 testes — bloqueio semanal com ação `block` registra a tentativa bloqueada e lança TOO_MANY_REQUESTS; ação `warn` exige confirmação de uso único e libera a análise; ação `alert` não bloqueia e a análise prossegue; `setLimits` persiste e `getLimits` expõe `weeklyCostCapBrl`/`weeklyCostCapAction`; `recordAnalysisCostFor` é chamado com os argumentos corretos ao final da análise; `history.list` expõe o custo exato). Atualizados: `server/usagePdf.test.ts` e `server/analysis-limits.test.ts` (mocks para o `run` não cair em falha simulada), `server/limits-r39.test.ts`. Nesta rodada o mock foi feito de forma **total** (`vi.mock("./db", () => db)` com todos os stubs, padrão `analysis-limits.test.ts`), pois spies sobre o módulo mockado não interceptam chamadas internas do db real. Suíte completa: **343/343 testes passando**. TypeScript limpo (tsc sem erros).

## Vercel

Nenhuma env nova nem ajuste de deploy: a cotação continua via API pública (AwesomeAPI, sem chave), as novas colunas têm defaults seguros e o comportamento padrão do teto (aviso) é preservado. Envs permanecem as mesmas da R41.

## Próximos passos sugeridos

Notificação por e-mail quando a projeção semanal ou mensal ultrapassar o teto; custo por thumbnail individual no histórico (não apenas o total da análise); detalhamento do custo semanal por modelo de IA na página de uso; e exportação CSV do histórico com a coluna de custo.
