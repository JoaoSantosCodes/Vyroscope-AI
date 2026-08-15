import SiteLayout from "@/components/SiteLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import {
  Clock,
  Lightbulb,
  Radar,
  Sparkles,
  TrendingUp,
  Video,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const EXAMPLE_NICHES = ["inteligência artificial", "fitness", "finanças", "games", "produtividade", "moda"];

export default function Home() {
  const [niche, setNiche] = useState("");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const handleAnalyze = () => {
    const trimmed = niche.trim();
    if (trimmed.length < 2) {
      toast.error("Digite um nicho válido (mínimo 2 caracteres).");
      return;
    }
    if (trimmed.length > 120) {
      toast.error("O nicho é muito longo (máximo 120 caracteres).");
      return;
    }
    navigate(`/analise?niche=${encodeURIComponent(trimmed)}`);
  };

  return (
    <SiteLayout>
      {/* Hero */}
      <section className="texture-bg relative overflow-hidden">
        <div className="container relative z-10 flex flex-col items-start gap-10 pb-16 pt-16 md:pt-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Padrões reais, extraídos dos vídeos que estão explodindo agora
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
              O algoritmo esqueceu seu canal?
              <br />
              <span className="text-primary">Descubra o que faz um vídeo explodir.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              O Vyroscope AI analisa os vídeos em alta do seu nicho, identifica os
              padrões de viralidade por trás das métricas e entrega <strong className="text-foreground">sugestões
              prontas de temas, hooks e ângulos</strong> — para você gravar amanhã de manhã.
            </p>
          </div>

          {/* Input */}
            <Card className="w-full max-w-xl border-border/70 bg-card/80 shadow-2xl shadow-black/30 backdrop-blur">
            <CardContent className="p-3 sm:p-4">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
                <Input
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  placeholder="Ex: inteligência artificial, fitness, finanças…"
                  className="h-12 bg-background/60 text-base"
                  aria-label="Nicho do seu canal"
                />
                <Button
                  onClick={handleAnalyze}
                  className="h-12 shrink-0 px-7 text-base font-semibold"
                  size="lg"
                >
                  <Radar className="mr-2 h-5 w-5" />
                  Iniciar análise
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_NICHES.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setNiche(n);
                    }}
                    className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {!isAuthenticated && (
            <p className="max-w-xl text-sm text-muted-foreground">
              Análises ficam salvas no seu histórico pessoal.{" "}
              <button
                onClick={() => startLogin()}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Entre com sua conta
              </button>{" "}
              para começar.
            </p>
          )}
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-t border-border/50 py-20">
        <div className="container">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Como funciona</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            De nicho para roteiro em minutos
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Video,
                title: "Coleta vídeos em alta",
                text: "Buscamos os vídeos que estão performando acima da média no seu nicho e extraímos título, visualizações, likes, comentários, duração e data de publicação.",
              },
              {
                icon: TrendingUp,
                title: "Extraímos os padrões",
                text: "Uma IA analisa títulos, descrições e métricas de engajamento, pontua a probabilidade de viralização de cada vídeo e destila os padrões narrativos que estão vencendo agora.",
              },
              {
                icon: Lightbulb,
                title: "Sugestões prontas para gravar",
                text: "Você recebe temas, hooks de abertura e ângulos completos com estrutura narrativa e duração alvo — prontos para uso, sem edição adicional.",
              },
            ].map((step, i) => (
              <Card key={step.title} className="group border-border/60 bg-card/60 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                <CardContent className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <span className="font-display text-4xl font-medium text-muted-foreground/30 transition-colors group-hover:text-primary/40">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* O que você recebe */}
      <section className="border-t border-border/50 bg-secondary/30 py-20">
        <div className="container">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Entregáveis</p>
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Tudo o que o algoritmo recompensa, em um dashboard
              </h2>
              <p className="mt-4 text-muted-foreground">
                Cada análise devolve os vídeos analisados com seus <strong className="text-foreground">virality
                scores</strong>, os padrões de viralidade do nicho e cinco sugestões
                completas — com título, hook literal dos primeiros 5 segundos, ângulo,
                estrutura narrativa em três atos e duração ideal.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Virality score (0–100) para cada vídeo e sugestão",
                  "Padrões de título, hook e estrutura narrativa pontuados",
                  "Sugestões prontas para gravar, sem edição adicional",
                  "Histórico de análises salvo na sua conta",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Card className="border-border/60 bg-card/70 shadow-2xl shadow-black/30 backdrop-blur">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Análise em 4 etapas visíveis
                </div>
                {["Buscando vídeos em alta no nicho…", "Extraindo métricas de engajamento…", "Identificando padrões de viralidade…", "Gerando sugestões prontas para gravar…"].map(
                  (step, i) => (
                    <div key={step} className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-4 py-3 text-sm">
                      <Radar
                        className={`h-4 w-4 text-primary ${i === 2 ? "vy-step-pulse" : "opacity-40"}`}
                      />
                      <span className="text-foreground/80">{step}</span>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
