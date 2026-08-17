import { getUserLimits, recordUsageAlert } from "./db";

/** (Rodada 44) Alerta proativo in-app quando o custo de uma análise individual
 * ultrapassa o limite configurado (analysis_cost_cap_brl; 0 = sem limite).
 * Deduplica um alerta por dia (dayKey `${YYYY-MM-DD}|analysis_cost`).
 *
 * Vive em arquivo próprio (separado de db.ts) para ser testável: quando
 * importado de "./db" pelos testes, getUserLimits/recordUsageAlert passam a
 * ser as versões mockadas do módulo, permitindo controlar o cap e observar os
 * inserts. Dentro do módulo real de db.ts, chamadas internas usam os bindings
 * originais e não são interceptáveis pelo mock parcial. */
export async function emitAnalysisCostAlert(userId: number, costBrl: number): Promise<void> {
  if (costBrl <= 0) return;
  // Limite individual configurado pelo usuário (getUserLimits já retorna
  // analysisCostCapBrl; 0 = sem limite).
  let limits: Awaited<ReturnType<typeof getUserLimits>> | null = null;
  try {
    limits = await getUserLimits(userId);
  } catch {
    return;
  }
  const capBrl = (limits as { analysisCostCapBrl?: number }).analysisCostCapBrl ?? 0;
  if (!capBrl || costBrl <= capBrl) return;
  await recordUsageAlert(
    userId,
    "analysis_cost",
    "warn",
    Math.round(costBrl * 100),
    capBrl,
    `O custo da análise (R$ ${costBrl.toFixed(2).replace(".", ",")}) ultrapassou o seu limite individual de R$ ${capBrl.toFixed(2).replace(".", ",")}.`
  );
}
