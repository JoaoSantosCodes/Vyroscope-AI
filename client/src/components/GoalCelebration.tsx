import { useEffect, useMemo, useState } from "react";

/** Chave de sessão que registra a celebração já exibida para um mês
 *  (evita disparar o canhão de confete repetidamente na mesma sessão). */
const celebratedKey = (monthKey: string) => `vyroscope-goal-celebrated-${monthKey}`;

/** Props do GoalCelebrationView (rodada 23). `triggerKey` permite disparar
 *  manualmente a animação a partir do servidor ("rever confetes") — qualquer
 *  mudança no valor dispara um novo canhão de confete. */
export type GoalCelebrationProps = {
  /** Chave arbitrária: mudar o valor dispara a animação (rodada 23). */
  triggerKey?: number;
};

/** Partículas simples de confete que caem a partir do topo da faixa.
 *  Dispara uma vez por mês (registrado no sessionStorage) e respeita
 *  `prefers-reduced-motion` — nesse caso o banner aparece sem animação.
 *  Rodada 22: celebração visual ao atingir 100% da meta mensal. */
export default function GoalCelebrationView(props: GoalCelebrationProps = {}) {
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const [celebrated, setCelebrated] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(celebratedKey(currentMonthKey)) === "1";
  });
  const [visible, setVisible] = useState<boolean>(() => !celebrated);
  // Rodada 23: `triggerKey` aumenta a cada "rever confetes" (servidor ou botão),
  // reexibindo o canhão mesmo quando a celebração do mês já foi registrada.
  const [triggerKey, setTriggerKey] = useState<number>(props.triggerKey ?? 0);

  useEffect(() => {
    if (props.triggerKey !== undefined && props.triggerKey !== triggerKey) {
      setTriggerKey(props.triggerKey);
      setVisible(true);
      const hide = window.setTimeout(() => setVisible(false), 3500);
      return () => window.clearTimeout(hide);
    }
  }, [props.triggerKey, triggerKey]);

  useEffect(() => {
    if (!celebrated) {
      window.sessionStorage.setItem(celebratedKey(currentMonthKey), "1");
      setCelebrated(true);
      // Mantém o banner visível por ~3,5s após o canhão para reforçar a mensagem
      const hide = window.setTimeout(() => setVisible(false), 3500);
      return () => window.clearTimeout(hide);
    }
  }, [celebrated, currentMonthKey]);

  if (!visible) return null;

  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => {
        const left = 4 + (i * 37) % 92;
        const delay = (i % 8) * 0.09;
        const duration = 1.2 + (i % 5) * 0.12;
        const color = ["#E8A33D", "#4C9F70", "#C084FC", "#F59E0B", "#34D399"][i % 5];
        const size = 5 + (i % 4) * 2;
        const spin = i % 2 === 0 ? "vy-confetti-spin" : "vy-confetti-fall";
        return { id: i, left, delay, duration, color, size, spin };
      }),
    []
  );

  return (
    <div
      className="vy-goal-celebration relative mt-3 overflow-hidden rounded-lg border border-amber-400/50 bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-amber-500/15 px-4 py-3"
      role="status"
      aria-live="polite"
    >
      {/* Confete caindo (apenas quando o dispositivo permite movimento) */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        {particles.map((p) => (
          <span
            key={p.id}
            className={p.spin}
            style={{
              position: "absolute",
              left: `${p.left}%`,
              top: "-4px",
              width: `${p.size}px`,
              height: `${p.size * 1.6}px`,
              backgroundColor: p.color,
              borderRadius: p.id % 3 === 0 ? "50%" : "2px",
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              opacity: 0.9,
            }}
          />
        ))}
      </span>
      <div className="relative flex items-center gap-2 text-[11px] font-medium text-amber-400">
        <span className="vy-confetti-bounce inline-block">🎉</span>
        <span>
          Meta mensal atingida: 100% concluído! Parabéns pela consistência — aproveite o embalo e já planeje o próximo mês.
        </span>
      </div>
    </div>
  );
}
