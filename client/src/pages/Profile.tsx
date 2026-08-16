import SiteLayout from "@/components/SiteLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import { BarChart3, Clapperboard, Loader2, Radar, Save, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Profile() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const meQuery = trpc.profile.me.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
  });

  // Preenche o formulário com os dados atuais do perfil
  const data = meQuery.data;
  useEffect(() => {
    if (data) {
      setName(data.name ?? "");
      setEmail(data.email ?? "");
    }
  }, [data]);

  const updateMutation = trpc.profile.update.useMutation({
    onSuccess: (updated) => {
      utils.profile.me.invalidate();
      utils.auth.me.invalidate();
      toast.success("Perfil atualizado com sucesso.");
      setName(updated.name ?? "");
      setEmail(updated.email ?? "");
    },
    onError: (err) => toast.error(err.message),
  });

  // (Rodada 31) Código secreto pessoal para o login local
  const [secretCode, setSecretCode] = useState("");
  const [secretConfirm, setSecretConfirm] = useState("");
  const secretMutation = trpc.profile.setSecretCode.useMutation({
    onSuccess: (res) => {
      utils.profile.me.invalidate();
      setSecretCode("");
      setSecretConfirm("");
      toast.success(
        res.hasPersonalCode
          ? "Código de acesso atualizado! Use-o para entrar em qualquer dispositivo."
          : "Código de acesso removido."
      );
    },
    onError: (err) => toast.error(err.message),
  });

  const isLocalUser = data?.loginMethod === "local";

  const handleSaveSecret = () => {
    if (secretCode !== secretConfirm) {
      toast.error("Os códigos não coincidem.");
      return;
    }
    secretMutation.mutate({ code: secretCode, confirm: secretConfirm });
  };

  if (loading || meQuery.isLoading) {
    return (
      <SiteLayout>
        <div className="container max-w-3xl py-10 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </SiteLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <SiteLayout>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <UserRound className="h-10 w-10 text-muted-foreground/50" />
          <h2 className="font-display text-2xl font-semibold">Faça login para ver seu perfil</h2>
          <Button onClick={() => navigate("/")}>Ir para a página inicial</Button>
        </div>
      </SiteLayout>
    );
  }

  if (!data) {
    return (
      <SiteLayout>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <Radar className="h-10 w-10 text-muted-foreground/50" />
          <h2 className="font-display text-2xl font-semibold">Não foi possível carregar o perfil</h2>
          <Button variant="outline" onClick={() => meQuery.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </SiteLayout>
    );
  }

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("O nome não pode ficar vazio.");
      return;
    }
    updateMutation.mutate({ name: name.trim(), email: email.trim() || undefined });
  };

  return (
    <SiteLayout>
      <div className="container max-w-3xl py-10 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Minha conta</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Perfil</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie seus dados e acompanhe seu uso do Vyroscope AI.
          </p>
        </div>

        {/* Resumo da conta */}
        <Card className="border-border/60">
          <CardContent className="flex flex-wrap items-center gap-5 p-6">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-gradient-to-br from-amber-400 to-orange-500 text-[oklch(0.2_0.05_60)] text-lg font-semibold">
                {(data.name ?? data.email ?? "U").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{data.name ?? "Sem nome"}</h2>
              <p className="text-sm text-muted-foreground">{data.email ?? "—"}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Login via {data.loginMethod === "manus" ? "Manus" : data.loginMethod ?? "conta"} · Conta criada em{" "}
                {formatDate(data.createdAt)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Estatísticas de uso */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-border/60">
            <CardContent className="flex items-center gap-4 p-5">
              <BarChart3 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{data.stats.total}</p>
                <p className="text-xs text-muted-foreground">Análises realizadas</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="flex items-center gap-4 p-5">
              <Clapperboard className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{data.stats.completed}</p>
                <p className="text-xs text-muted-foreground">Análises concluídas</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="flex items-center gap-4 p-5">
              <Radar className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {data.stats.total > 0 ? Math.round((data.stats.completed / data.stats.total) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground">Taxa de sucesso</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* (Rodada 31) Código de acesso pessoal para o login local */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Código de acesso local
            </CardTitle>
            <CardDescription>
              {isLocalUser
                ? "Defina ou altere seu código pessoal de login. Ele funciona mesmo se a senha global do site for trocada. O código é armazenado apenas como hash — não podemos exibi-lo depois."
                : "Login local não disponível nesta conta (você usa Manus OAuth)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLocalUser ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="secret-code">Novo código de acesso</Label>
                  <Input
                    id="secret-code"
                    type="password"
                    value={secretCode}
                    onChange={(e) => setSecretCode(e.target.value)}
                    placeholder={data.stats ? "Mínimo recomendado: 12 caracteres" : undefined}
                    autoComplete="new-password"
                    maxLength={120}
                    disabled={secretMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secret-confirm">Confirme o código</Label>
                  <Input
                    id="secret-confirm"
                    type="password"
                    value={secretConfirm}
                    onChange={(e) => setSecretConfirm(e.target.value)}
                    placeholder="Digite o mesmo código novamente"
                    autoComplete="new-password"
                    maxLength={120}
                    disabled={secretMutation.isPending}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSaveSecret} disabled={secretMutation.isPending}>
                    {secretMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    {secretMutation.isPending ? "Salvando..." : "Salvar código"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Dica: usar um código vazio remove o código pessoal e volta a usar o código global do site.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                O código de acesso local só se aplica a contas criadas pelo login local.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Editar dados */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg">Dados pessoais</CardTitle>
            <CardDescription>
              Seu identificador de login (openId) é gerenciado pela sua conta Manus e não pode ser alterado aqui.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nome</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">E-mail</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> Salvar alterações
            </Button>
          </CardContent>
        </Card>
      </div>
    </SiteLayout>
  );
}
