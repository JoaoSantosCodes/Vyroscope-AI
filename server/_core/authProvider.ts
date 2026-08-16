/**
 * Auth provider modular — permite trocar o mecanismo de login sem tocar no
 * restante do app. Controlado pela env `AUTH_PROVIDER`:
 *
 * - `manus` (padrão): OAuth da plataforma Manus via `server/_core/oauth.ts`
 *   e `server/_core/sdk.ts` (requer VITE_APP_ID, OAUTH_SERVER_URL, etc.).
 * - `local`: login por código pessoal (um segredo definido pelo dono do
 *   site em AUTH_SECRET_CODE). Gera o MESMO cookie de sessão `app_session_id`
 *   e o MESMO JWT — todo o resto do app (tRPC, protectedProcedure, useAuth)
 *   continua funcionando sem mudanças.
 *
 * Usuário local é identificado por `openId = "local_<nome>"` (único por
 * código), registrado via `upsertUser` com `loginMethod = "local"`.
 *
 * Para hospedar na Vercel (ou qualquer lugar): defina
 * AUTH_PROVIDER=local, AUTH_SECRET_CODE=seu-segredo-forte e
 * DATABASE_URL com o seu MySQL. O fluxo OAuth da Manus simplesmente não
 * é registrado quando o provider é `local`.
 */
import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE } from "@shared/const";
import crypto from "crypto";
import type { Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type AuthProviderKind = "manus" | "local";

export function getAuthProvider(): AuthProviderKind {
  const raw = (process.env.AUTH_PROVIDER ?? "manus").toLowerCase().trim();
  if (raw === "local") return "local";
  return "manus";
}

export function isLocalAuthEnabled(): boolean {
  return (
    getAuthProvider() === "local" &&
    (isNonEmptyString(process.env.AUTH_SECRET_CODE) ||
      isNonEmptyString(process.env.AUTH_ALLOW_PERSONAL_CODES))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * POST /api/local-auth — fluxo de login local: envia `code` e `name` no body.
 * Se o código corresponder ao AUTH_SECRET_CODE configurado, grava a sessão
 * no cookie `app_session_id` e redireciona para `/`.
 */
export async function handleLocalAuth(req: Request, res: Response) {
  if (!isLocalAuthEnabled()) {
    res.status(404).json({ error: "Local auth is not enabled" });
    return;
  }
  const code =
    typeof req.body?.code === "string" ? req.body.code.trim() : "";
  const name =
    typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!code || !name) {
    res.status(400).json({ error: "code and name are required" });
    return;
  }
  try {
    // (Rodada 31) O código pode ser o global (AUTH_SECRET_CODE, comparação
    // timing-safe) OU o código pessoal do usuário (hash SHA-256 salvo em
    // users.localCodeHash via perfil). O usuário pessoal vence quando ambos
    // existem; em ambos os casos a identificação final usa o hash.
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const globalSecret = process.env.AUTH_SECRET_CODE ?? "";
    const constantMatch =
      code.length === globalSecret.length &&
      crypto.timingSafeEqual(Buffer.from(code), Buffer.from(globalSecret));
    const globalOpenId = `local_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${hashForOpenId(globalSecret)}`;
    const personalOpenId = `local_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${hashForOpenId(code)}`;

    let openId = constantMatch ? globalOpenId : null;
    if (!openId) {
      const personal = await db.getUserByOpenId(personalOpenId);
      if (personal?.localCodeHash && personal.localCodeHash === codeHash) {
        openId = personalOpenId;
      }
    }
    if (!openId) {
      res.status(401).json({ error: "invalid code" });
      return;
    }
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(openId);
    if (!user) {
      await db.upsertUser({
        openId,
        name: name || null,
        email: null,
        loginMethod: "local",
        lastSignedIn: signedInAt,
        localCodeHash: constantMatch ? null : codeHash,
      });
      user = await db.getUserByOpenId(openId);
    } else {
      await db.upsertUser({
        id: user.id,
        openId,
        name: name || null,
        email: user.email ?? null,
        loginMethod: "local",
        lastSignedIn: signedInAt,
        localCodeHash: user.localCodeHash ?? (constantMatch ? null : codeHash),
      });
    }
    if (!user) {
      res.status(500).json({ error: "failed to register local user" });
      return;
    }
    const sessionToken = await sdk.signSession(
      { openId, appId: ENV.appId, name: name },
      { expiresInMs: ONE_YEAR_MS }
    );
    res.clearCookie(OAUTH_STATE_COOKIE, {
      path: "/",
      secure: true,
      sameSite: "none",
    });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS,
    });
    res.json({ success: true, name: user.name });
  } catch (error) {
    console.error("[LocalAuth] Login failed", error);
    res.status(500).json({ error: "local login failed" });
  }
}

/** Hash (SHA-256, 16 chars) usado para estabilizar o openId do usuário local. */
function hashForOpenId(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

/**
 * Registra (ou não) as rotas de login conforme o provider ativo.
 * - `manus`: registra o callback do OAuth da Manus.
 * - `local`: registra POST /api/local-auth.
 */
// O módulo `oauth.ts` do template usa `require()` internamente, que quebra
// em servidor ESM puro (o registro é feito via express() do módulo).
// Carregamos apenas no caminho Manus, com import() dinâmico.
export async function registerAuthRoutes(app: any) {
  if (getAuthProvider() === "local") {
    app.post("/api/local-auth", expressLikeJsonGuard(handleLocalAuth));
    // O OAuth da Manus não é registrado — sem dependência externa.
    return;
  }
  // Caminho Manus: rotas OAuth (callback) e logout continuam funcionando.
  const { registerOAuthRoutes } = await import("./oauth");
  registerOAuthRoutes(app);
}

/** Garante que o body já foi parseado (express.json roda antes nas rotas /api). */
function expressLikeJsonGuard(
  handler: (req: Request, res: Response) => Promise<void>
) {
  return async (req: Request, res: Response) => {
    if (req.body === undefined) {
      res.status(400).json({ error: "request body missing" });
      return;
    }
    await handler(req, res);
  };
}

/** Hash (SHA-256) de um código para comparação com users.localCodeHash. */
export function hashSecretCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Logout local: limpa o cookie de sessão e o estado do OAuth (se houver).
 */
export function handleLocalLogout(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/", maxAge: -1 });
  res.clearCookie(OAUTH_STATE_COOKIE, {
    path: "/",
    secure: true,
    sameSite: "none",
  });
}
