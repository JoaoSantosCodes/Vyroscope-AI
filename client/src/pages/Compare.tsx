import SiteLayout from "@/components/SiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, scoreLabel } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import type { NicheComparison } from "@vyroscope-ai-server/extended";
import { CheckCircle2, Flame, Loader2, Radar, Scale, Swords } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const NICHE_SUGGESTIONS = ["inteligência artificial", "fitness", "finanças", "games", "produtividade", "moda"];

export default function Compare() {
  const [, navigate] = useLocation();
  const [nicheA, setNicheA] = useState("");
  const [nicheB, setNicheB] = useState("");
  const [result, setResult] = useState<NicheComparison | null>(null);

  const compareMutation = trpc.extended.compare.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success("Comparação concluída.");
    },
    onError: (err) => toast.error(err.message),
  });

  const start = () => {
    if (!nicheA.trim() || !nicheB.trim()) {
      toast.error("Informe dois nichos para comparar.");
      return;
    }
    if (nicheA.trim().toLowerCase() === nicheB.trim().toLowerCase()) {
      toast.error("Os dois nichos precisam ser diferentes.");
      return;
    }
    setResult(null);
    compareMutation.mutate({ nicheA: nicheA.trim(), nicheB: nicheB.trim() });
  };

  return (
    <SiteLayout>
      <div className="container max-w-4xl py-10">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Comparador de nichos</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Qual nicho merece seu canal?</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Colete os vídeos em alta de dois nichos e receba um veredito objetivo baseado em
          engajamento, volume de visualizações e padrões de viralidade de cada mercado.
        </p>

        <Card className="mt-6 border-border/60">
          <CardContent className="p-6">
            <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr]">
              <div className="space-y-2">
                <Label htmlFor="nicheA">Nicho A</Label>
                <Input
                  id="nicheA"
                  placeholder="Ex: inteligência artificial"
                  value={nicheA}
                  onChange={(e) => setNicheA(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && start()}
                  disabled={compareMutation.isPending}
                />
              </div>
              <div className="hidden items-center md:flex">
                <Scale className="h-6 w-6 text-primary/60" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nicheB">Nicho B</Label>
                <Input
                  id="nicheB"
                  placeholder="Ex: finanças pessoais"
                  value={nicheB}
                  onChange={(e) => setNicheB(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && start()}
                  disabled={compareMutation.isPending}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {NICHE_SUGGESTIONS.map((n) => (
                <Badge
                  key={n}
                  variant="outline"
                  className="cursor-pointer capitalize hover:border-primary/50"
                  onClick={() => {
                    if (!nicheA.trim()) setNicheA(n);
                    else if (!nicheB.trim()) setNicheB(n);
                  }}
                >
                  {n}
                </Badge>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={start} disabled={compareMutation.isPending} className="px-6">
                {compareMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Comparando nichos…
                  </>
                ) : (
                  <>
                    <Swords className="mr-2 h-4 w-4" /> Comparar nichos
                  </>
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                A coleta leva alguns segundos (YouTube Data API + análise de IA).
              </span>
            </div>
          </CardContent>
        </Card>

        {compareMutation.isPending && !result && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-5">
            <Verdict result={result} />
            <div className="grid gap-4 md:grid-cols-2">
              {result.niches.map((n) => (
                <Card key={n.niche} className="border-border/60">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-xl font-semibold capitalize">{n.niche}</h3>
                      {result.verdict.winner.toLowerCase() === n.niche.toLowerCase() && (
                        <Badge className="bg-primary text-primary-foreground">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Vencedor
                        </Badge>
                      )}
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Views totais</dt>
                        <dd className="mt-0.5 font-semibold">{formatCompact(n.totalViews)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Views médias</dt>
                        <dd className="mt-0.5 font-semibold">{formatCompact(n.avgViews)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Engajamento médio</dt>
                        <dd className="mt-0.5 font-semibold">
                          {n.avgEngagementRate !== null ? `${n.avgEngagementRate.toFixed(2)}%` : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">Vídeo em alta</dt>
                        <dd className="mt-0.5 font-semibold">{formatCompact(n.topVideo?.viewCount ?? null)} views</dd>
                      </div>
                    </dl>
                    {n.topVideo && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{n.topVideo.title}</span>
                        {n.topVideo.channelTitle ? ` · ${n.topVideo.channelTitle}` : ""}
                      </p>
                    )}
                    <div className="mt-4 border-t border-border/40 pt-3">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                        <Flame className="h-3.5 w-3.5" /> Padrões dominantes
                      </p>
                      <ul className="space-y-1">
                        {n.topPatterns.map((p, i) => (
                          <li key={i} className="text-sm text-muted-foreground">
                            <span className="mr-1.5 text-primary">•</span>
                            {p.pattern}
                            {p.score !== undefined && (
                              <span className="ml-1 text-xs">(score {p.score})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {n.bestSuggestion && (
                      <div className="mt-3 rounded-lg border border-primary/30 bg-accent/20 p-3 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                          Melhor título possível
                        </span>
                        <p className="mt-1 font-medium">{n.bestSuggestion?.title}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => navigate("/")}>
                <Radar className="mr-2 h-4 w-4" /> Iniciar análise do nicho vencedor
              </Button>
            </div>
          </div>
        )}

        {!compareMutation.isPending && !result && (
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { title: "Engajamento real", desc: "Taxa média de (likes + comentários) ÷ views de cada mercado" },
              { title: "Volume de demanda", desc: "Total e média de visualizações dos vídeos em alta" },
              { title: "Padrões dominantes", desc: "Quais gatilhos de viralidade cada nicho mais premia" },
            ].map((f) => (
              <Card key={f.title} className="border-border/60 bg-card/60">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}

function Verdict({ result }: { result: NicheComparison }) {
  return (
    <Card className="border-primary/40 bg-accent/20">
      <CardContent className="p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Veredito</p>
        <h2 className="mt-1 font-display text-2xl font-semibold capitalize">
          {result.verdict.winner}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{scoreLabel(80)} — potencial superior</p>
        <ul className="mt-4 space-y-2">
          {result.verdict.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {r}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
