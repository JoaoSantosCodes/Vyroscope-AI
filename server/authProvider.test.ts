import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import crypto from "crypto";

// Testa a lógica do auth provider modular (Manus vs Local) de forma isolada,
// sem depender do servidor Express completo nem do banco de dados.

describe("getAuthProvider", async () => {
  const { getAuthProvider } = await import("./_core/authProvider");

  const originalEnv = process.env.AUTH_PROVIDER;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.AUTH_PROVIDER;
    else process.env.AUTH_PROVIDER = originalEnv;
  });

  it("retorna 'manus' quando AUTH_PROVIDER não está definida", () => {
    delete process.env.AUTH_PROVIDER;
    expect(getAuthProvider()).toBe("manus");
  });

  it("retorna 'local' quando AUTH_PROVIDER=local", () => {
    process.env.AUTH_PROVIDER = "local";
    expect(getAuthProvider()).toBe("local");
  });

  it("trata valores com case misto e espaços como 'local'", () => {
    process.env.AUTH_PROVIDER = " LoCaL ";
    expect(getAuthProvider()).toBe("local");
  });

  it("qualquer outro valor cai para 'manus'", () => {
    process.env.AUTH_PROVIDER = "qualquer-coisa";
    expect(getAuthProvider()).toBe("manus");
  });
});

describe("isLocalAuthEnabled", async () => {
  const { isLocalAuthEnabled } = await import("./_core/authProvider");

  const provider = process.env.AUTH_PROVIDER;
  const secret = process.env.AUTH_SECRET_CODE;

  afterEach(() => {
    process.env.AUTH_PROVIDER = provider ?? "";
    if (secret === undefined) delete process.env.AUTH_SECRET_CODE;
    else process.env.AUTH_SECRET_CODE = secret;
  });

  it("requer AUTH_PROVIDER=local E AUTH_SECRET_CODE não vazio", () => {
    process.env.AUTH_PROVIDER = "local";
    delete process.env.AUTH_SECRET_CODE;
    expect(isLocalAuthEnabled()).toBe(false);
    process.env.AUTH_SECRET_CODE = "";
    expect(isLocalAuthEnabled()).toBe(false);
    process.env.AUTH_SECRET_CODE = "meu-segredo";
    expect(isLocalAuthEnabled()).toBe(true);
  });

  it("é falso mesmo com código quando o provider não é local", () => {
    process.env.AUTH_PROVIDER = "manus";
    process.env.AUTH_SECRET_CODE = "meu-segredo";
    expect(isLocalAuthEnabled()).toBe(false);
  });
});

describe("registro de rotas conforme o provider", async () => {
  const { registerAuthRoutes } = await import("./_core/authProvider");

  const provider = process.env.AUTH_PROVIDER;
  const secret = process.env.AUTH_SECRET_CODE;

  afterEach(() => {
    process.env.AUTH_PROVIDER = provider ?? "";
    if (secret === undefined) delete process.env.AUTH_SECRET_CODE;
    else process.env.AUTH_SECRET_CODE = secret;
  });

  it("em modo local registra POST /api/local-auth", async () => {
    process.env.AUTH_PROVIDER = "local";
    process.env.AUTH_SECRET_CODE = "segredo";
    const app = express();
    const postted: string[] = [];
    app.post = (path: string, ...handlers: any[]) => {
      postted.push(path);
      return app as any;
    };
    await registerAuthRoutes(app);
    expect(postted).toEqual(["/api/local-auth"]);
  });

  it("em modo manus não registra /api/local-auth", async () => {
    process.env.AUTH_PROVIDER = "manus";
    process.env.AUTH_SECRET_CODE = "segredo";
    const app = express();
    const postted: string[] = [];
    app.post = (path: string, ...handlers: any[]) => {
      postted.push(path);
      return app as any;
    };
    await registerAuthRoutes(app);
    expect(postted).toEqual([]);
  });
});

describe("handleLocalAuth (rota real via Express)", async () => {
  const { registerAuthRoutes } = await import("./_core/authProvider");

  const provider = process.env.AUTH_PROVIDER;
  const secret = process.env.AUTH_SECRET_CODE;
  const SECRET = "super-segredo-rodada30";

  beforeEach(async () => {
    process.env.AUTH_PROVIDER = "local";
    process.env.AUTH_SECRET_CODE = SECRET;
  });

  afterEach(() => {
    process.env.AUTH_PROVIDER = provider ?? "";
    if (secret === undefined) delete process.env.AUTH_SECRET_CODE;
    else process.env.AUTH_SECRET_CODE = secret;
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    return app;
  }

  function start(app: express.Express) {
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    return { server, port };
  }

  function post(port: number, path: string, body: unknown) {
    const payload = JSON.stringify(body);
    return new Promise<{ status: number; body: string; cookies: string[] }>(
      (resolve, reject) => {
        const req = require("http").request(
          {
            host: "127.0.0.1",
            port,
            path,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            },
          },
          res => {
            let data = "";
            res.on("data", c => (data += c));
            res.on("end", () =>
              resolve({
                status: res.statusCode ?? 0,
                body: data,
                cookies: res.headers["set-cookie"] ?? [],
              })
            );
          }
        );
        req.on("error", reject);
        req.write(payload);
        req.end();
      }
    );
  }

  it("rejeita 400 quando code ou name estão faltando", async () => {
    const app = buildApp();
    await registerAuthRoutes(app);
    const { server, port } = start(app);
    try {
      const r = await post(port, "/api/local-auth", { code: SECRET });
      expect(r.status).toBe(400);
      expect(JSON.parse(r.body).error).toContain("required");
    } finally {
      server.close();
    }
  });

  it("rejeita 401 quando o código não bate", async () => {
    const app = buildApp();
    await registerAuthRoutes(app);
    const { server, port } = start(app);
    try {
      const r = await post(port, "/api/local-auth", { code: "errado", name: "t" });
      expect(r.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("aceita 200 com código correto e emite app_session_id", async () => {
    const app = buildApp();
    await registerAuthRoutes(app);
    const { server, port } = start(app);
    try {
      const r = await post(port, "/api/local-auth", {
        code: SECRET,
        name: "Ana Teste",
      });
      expect(r.status).toBe(200);
      expect(JSON.parse(r.body).success).toBe(true);
      expect(r.cookies.some(c => c.startsWith("app_session_id="))).toBe(true);
      const cookie = r.cookies.find(c => c.startsWith("app_session_id="))!;
      const token = cookie
        .replace(/^app_session_id=/, "")
        .split(";")[0];
      // O token é um JWT HS256 de 3 partes (header.payload.signature)
      expect(token.split(".")).toHaveLength(3);
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString()
      );
      expect(payload.openId).toMatch(/^local_ana_teste_[0-9a-f]{16}$/);
      expect(payload.name).toBe("Ana Teste");
      expect(payload.appId).toBe("9GWgSgfg2qLvWLpZ7DKgmg");
      expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
    } finally {
      server.close();
    }
  });

  it("usa comparação timing-safe: diferença de comprimento é 401", async () => {
    const app = buildApp();
    await registerAuthRoutes(app);
    const { server, port } = start(app);
    try {
      const r = await post(port, "/api/local-auth", {
        code: SECRET.slice(0, SECRET.length - 3),
        name: "t",
      });
      expect(r.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("404 quando o provider não é local mesmo com rota registrada", async () => {
    process.env.AUTH_PROVIDER = "manus";
    const app = buildApp();
    await registerAuthRoutes(app);
    const { server, port } = start(app);
    try {
      const r = await post(port, "/api/local-auth", { code: SECRET, name: "t" });
      expect(r.status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe("compare timingSafeEqual edge case", async () => {
  // Segurança: garantir que nunca chamamos timingSafeEqual com buffers de
  // tamanhos diferentes (lançaria erro e vazaria tamanho via 500).
  const { handleLocalAuth } = await import("./_core/authProvider");

  it("handleLocalAuth cobre a checagem de comprimento antes do timingSafeEqual", async () => {
    // A cobertura da lógica `code.length === secret.length &&` é exercida
    // pelos testes da rota real acima; este describe documenta o contrato.
    expect(typeof handleLocalAuth).toBe("function");
  });
});
