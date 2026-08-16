import SiteLayout from "@/components/SiteLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDate } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import { BarChart3, Clapperboard, Loader2, Radar, Save, ShieldCheck, Settings2, UserRound } from "lucide-react";
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

  // (Rodada 32) Status e configuração de provedores de API
  const providerQuery = trpc.profile.apiProviderStatus.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const providerMutation = trpc.profile.setProviderSettings.useMutation({
    onSuccess: () => {
      utils.profile.apiProviderStatus.invalidate();
      toast.success("Provedores atualizados. As próximas análises já usarão a nova configuração.");
    },
    onError: (err) => toast.error(err.message),
  });

  // Estado do dialog de provedores (presets: openai | groq | openrouter | custom)
  const [providerPreset, setProviderPreset] = useState("auto");
  const [llmApiBase, setLlmApiBase] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [imageApiKey, setImageApiKey] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);

  useEffect(() => {
    if (providerDialogOpen && providerQuery.data) {
      const { llm } = providerQuery.data;
      setProviderPreset(llm.provider ?? "auto");
      // Base exibida sem o sufixo do endpoint
      const base = llm.apiUrl
        .replace(/\/v1\/chat\/completions$/, "")
        .replace(/\/chat\/completions$/, "");
      setLlmApiBase(base === "https://api.openai.com" ? "" : base);
      setLlmModel(llm.model ?? "");
      // Chave atual nunca é revelada; mostrar apenas se o override é do usuário
      setLlmApiKey("");
      setImageApiKey("");
      setImageModel("");
    }
  }, [providerDialogOpen, providerQuery.data]);

  const PRESETS = [
    { value: "openai", label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o", imageModel: "dall-e-3" },
    { value: "groq", label: "Groq (mais barato)", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", imageModel: "dall-e-3" },
    { value: "openrouter", label: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", imageModel: "openai/dall-e-3" },
    { value: "custom", label: "Personalizado", base: "", model: "", imageModel: "" },
  ];
  const currentPreset = PRESETS.find((p) => p.value === providerPreset);

  const applyProvider = () => {
    const base =
      providerPreset === "custom"
        ? llmApiBase.trim()
        : currentPreset
          ? currentPreset.base
          : providerQuery.data?.llm.apiUrl?.replace(/\/v1\/chat\/completions$/, "").replace(/\/chat\/completions$/, "");
    const key = (llmApiKey || imageApiKey).trim();
    if (key && !base) {
      toast.error("Informe a URL base da API ou escolha um provedor pré-configurado.");
      return;
    }
    const model =
      llmModel.trim() || (providerPreset === "custom" ? undefined : currentPreset?.model);
    const imgModel = imageModel.trim() || undefined;
    providerMutation.mutate({
      llmApiBase: base || undefined,
      llmApiKey: key || undefined,
      llmModel: model || undefined,
      imageApiKey: (imageApiKey || llmApiKey).trim() || undefined,
      imageModel: imgModel,
    });
    setProviderDialogOpen(false);
  };

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

        {/* (Rodada 32) Status e configuração de provedores de API */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Status das APIs
              </CardTitle>
              <CardDescription>
                Veja quais provedores de LLM, imagem e YouTube estão ativos e configure
                provedores alternativos (Groq, OpenRouter ou endpoint próprio) para reduzir custos.
              </CardDescription>
            </div>
            <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={providerMutation.isPending}>
                  {providerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Settings2 className="mr-2 h-4 w-4" />
                  Configurar provedor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Provedor alternativo (economia de custos)</DialogTitle>
                  <DialogDescription>
                    Escolha um provedor compatível com a API da OpenAI. Suas análises,
                    roteiros, títulos, thumbnails e agendas passarão a usar o provider
                    configurado. Campos vazios voltam ao padrão do servidor.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Provedor</Label>
                    <Select value={providerPreset} onValueChange={setProviderPreset}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha o provedor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Padrão do servidor (sem override)</SelectItem>
                        {PRESETS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {providerPreset === "custom" && (
                    <div className="space-y-2">
                      <Label htmlFor="provider-base">URL base da API (https)</Label>
                      <Input
                        id="provider-base"
                        value={llmApiBase}
                        onChange={(e) => setLlmApiBase(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground">
                        Deve apontar para um endpoint compatível com OpenAI (ex.: /v1/chat/completions).
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="provider-key">Chave da API (LLM)</Label>
                    <Input
                      id="provider-key"
                      type="password"
                      value={llmApiKey}
                      onChange={(e) => setLlmApiKey(e.target.value)}
                      placeholder="sk-... (obrigatória para ativar o override)"
                      autoComplete="off"
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground">
                      A mesma chave é usada para thumbnails, salvo campo próprio abaixo.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-model">Modelo de LLM (opcional)</Label>
                    <Input
                      id="provider-model"
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      placeholder={currentPreset?.model ?? "ex.: gpt-4o-mini"}
                      autoComplete="off"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-image-key">Chave da API de imagem (opcional)</Label>
                    <Input
                      id="provider-image-key"
                      type="password"
                      value={imageApiKey}
                      onChange={(e) => setImageApiKey(e.target.value)}
                      placeholder="Use a chave do LLM se for a mesma"
                      autoComplete="off"
                      maxLength={2000}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-image-model">Modelo de imagem (opcional)</Label>
                    <Input
                      id="provider-image-model"
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                      placeholder={currentPreset?.imageModel ?? "ex.: dall-e-3"}
                      autoComplete="off"
                      maxLength={120}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setProviderDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={applyProvider} disabled={providerMutation.isPending}>
                    {providerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Aplicar configuração
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3">
            {providerQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : providerQuery.data ? (
              <>
                <StatusRow
                  name="LLM (análises, roteiros, títulos, agendas)"
                  provider={providerQuery.data.llm.provider}
                  model={providerQuery.data.llm.model}
                  active={providerQuery.data.llm.active}
                  base={providerQuery.data.llm.apiUrl.replace(/\/v1\/chat\/completions$/, "").replace(/\/chat\/completions$/, "")}
                />
                <StatusRow
                  name="Imagem (thumbnails)"
                  provider={providerQuery.data.image.provider}
                  model={providerQuery.data.image.model}
                  active={providerQuery.data.image.active}
                  base={providerQuery.data.image.apiUrl.replace(/\/images\/generations$/, "")}
                />
                <StatusRow
                  name="YouTube (dados dos vídeos)"
                  provider={providerQuery.data.youtube.provider}
                  active={providerQuery.data.youtube.keyConfigured}
                  base="YouTube Data API v3"
                />
                <p className="text-xs text-muted-foreground">
                  A consulta ao YouTube usa a chave do projeto ({" "}
                  <code>YOUTUBE_DATA_API_KEY</code>) configurada no servidor — por segurança,
                  ela não pode ser definida por usuário. Se estiver usando o hub de dados
                  interno da Manus, a análise só funciona dentro da plataforma.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar o status das APIs.
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

/** Linha de status de um provider (Rodada 32). */
function StatusRow(props: {
  name: string;
  provider: string;
  model?: string;
  active: boolean;
  base?: string;
}) {
  const { name, provider, model, active, base } = props;
  const label =
    provider === "manus-forge"
      ? "Forge interno (padrão)"
      : provider === "youtube-data-api-direct"
        ? "YouTube Data API (chave do projeto)"
        : provider === "manus-data-hub"
          ? "Hub de dados Manus"
          : provider === "groq"
            ? "Groq"
            : provider === "openrouter"
              ? "OpenRouter"
              : provider === "openai"
                ? "OpenAI"
                : "Personalizado";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {label}
          {model ? ` · ${model}` : ""}
          {base && provider !== "manus-data-hub" ? ` · ${base}` : ""}
        </p>
      </div>
      <Badge variant={active ? "default" : "secondary"} className={active ? "bg-emerald-500/90 hover:bg-emerald-500/90" : undefined}>
        {active ? "Ativo" : "Inativo"}
      </Badge>
    </div>
  );
}
