import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isLocalAuthProvider, loginLocally } from "@/const";

/**
 * Formulário de login local — aparece quando AUTH_PROVIDER=local no backend.
 * O usuário informa o nome de exibição e o código secreto definido em
 * AUTH_SECRET_CODE no servidor. O login acontece via POST /api/local-auth.
 */
export function LocalLoginForm() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isLocalAuthProvider()) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !code.trim()) {
      setError("Informe o nome e o código.");
      return;
    }
    setLoading(true);
    const result = await loginLocally(code, name);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Falha no login. Verifique o código.");
    }
    // loginLocally já navega para "/" em caso de sucesso.
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 w-full max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="local-login-name">Seu nome</Label>
        <Input
          id="local-login-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Como você quer aparecer no app"
          maxLength={64}
          autoComplete="name"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="local-login-code">Código de acesso</Label>
        <Input
          id="local-login-code"
          type="password"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Código secreto definido pelo dono do site"
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
