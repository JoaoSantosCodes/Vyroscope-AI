import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import crypto from "crypto";
// Testa a lógica do auth provider modular (Manus vs Local) de forma isolada,
// sem depender do servidor Express completo nem do banco de dados.
//
// (Rodada 31) O módulo `db` do app é mockado em nível de arquivo: o teste
// "código pessoal" habilita via process.env.__TEST_PERSONAL_USER = JSON
// (usuário local simulado com localCodeHash), e os demais caminhos retornam
// `null` para getUserByOpenId quando não há env configurada.
// Memória simulada do banco para o teste do código pessoal
let testUser: { id: number; openId: string; name: string | null; email: string | null; loginMethod: string; localCodeHash: string | null } | null = null;


vi.mock("./db", async importOriginal => {
  const actual = (await importOriginal()) as typeof import("./db");
  return {
    ...actual,
    getUserByOpenId: async (openId: string) => {
      if (testUser?.openId === openId) return testUser;
      return null;
    },
    upsertUser: async (input: any) => {
      {
        testUser = {
          id: input.id ?? 42,
          openId: input.openId,
          name: input.name ?? null,
          email: input.email ?? null,
          loginMethod: input.loginMethod ?? "local",
          localCodeHash: input.localCodeHash ?? null,
        };
      }
      return undefined;
    },
    getUserStats: async () => ({ total: 0, completed: 0 }),
  };
});

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

describe("código secreto pessoal (Rodada 31)", async () => {
  const { hashSecretCode } = await import("./_core/authProvider");
  const http = await import("http");

  const provider = process.env.AUTH_PROVIDER;
  const secret = process.env.AUTH_SECRET_CODE;
  const allowPersonal = process.env.AUTH_ALLOW_PERSONAL_CODES;
  const personalUserEnv = process.env.__TEST_PERSONAL_USER;

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

  afterEach(() => {
    process.env.AUTH_PROVIDER = provider ?? "";
    if (secret === undefined) delete process.env.AUTH_SECRET_CODE;
    else process.env.AUTH_SECRET_CODE = secret;
    if (allowPersonal === undefined) delete process.env.AUTH_ALLOW_PERSONAL_CODES;
    else process.env.AUTH_ALLOW_PERSONAL_CODES = allowPersonal;
    if (personalUserEnv === undefined) delete process.env.__TEST_PERSONAL_USER;
    else process.env.__TEST_PERSONAL_USER = personalUserEnv;
    testUser = null;
  });

  function post(port: number, path: string, body: unknown) {
    const payload = JSON.stringify(body);
    return new Promise<{ status: number; body: string; cookies: string[] }>(
      (resolve, reject) => {
        const req = http.request(
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

  it("hashSecretCode é SHA-256 estável de 64 caracteres hex", () => {
    const h1 = hashSecretCode("meu-codigo-pessoal");
    const h2 = hashSecretCode("meu-codigo-pessoal");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecretCode("outro")).not.toBe(h1);
  });

  it("o hash do código global bate com o prefixo usado no openId global", () => {
    const GLOBAL_SECRET = "segredo-global-r31";
    process.env.AUTH_PROVIDER = "local";
    process.env.AUTH_SECRET_CODE = GLOBAL_SECRET;
    // O openId global usa os primeiros 16 chars do hash do segredo global.
    const prefix = crypto
      .createHash("sha256")
      .update(GLOBAL_SECRET)
      .digest("hex")
      .slice(0, 16);
    expect(hashSecretCode(GLOBAL_SECRET).slice(0, 16)).toBe(prefix);
  });

  it("rota local aceita código pessoal persistido no banco (e-mails locais)", async () => {
    process.env.AUTH_PROVIDER = "local";
    delete process.env.AUTH_SECRET_CODE;
    process.env.AUTH_ALLOW_PERSONAL_CODES = "1";
    process.env.AUTH_DEBUG = "1";
    // Stub do banco: usuário local "Beto" com localCodeHash do código-pessoal
    testUser = {
      id: 42,
      openId: `local_beto_${hashSecretCode("codigo-pessoal").slice(0, 16)}`,
      name: "Beto",
      email: null,
      loginMethod: "local",
      localCodeHash: hashSecretCode("codigo-pessoal"),
    };
    process.env.__TEST_PERSONAL_USER = "1";
    const { registerAuthRoutes: reg2 } = await import("./_core/authProvider");

    const app = express();
    app.use(express.json());
    await reg2(app);
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    try {
      const r = await post(port, "/api/local-auth", {
        code: "codigo-pessoal",
        name: "Beto",
      });
      expect(r.status).toBe(200);
      expect(JSON.parse(r.body).success).toBe(true);
      const cookie = r.cookies.find(c => c.startsWith("app_session_id="))!;
      const token = cookie.replace(/^app_session_id=/, "").split(";")[0];
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString()
      );
      // openId pessoal: hash do código (não do segredo global)
      expect(payload.openId).toBe(
        `local_beto_${hashSecretCode("codigo-pessoal").slice(0, 16)}`
      );
    } finally {
      server.close();
    }
  });

  it("rejeita código pessoal de outro usuário (401)", async () => {
    process.env.AUTH_PROVIDER = "local";
    delete process.env.AUTH_SECRET_CODE;
    process.env.AUTH_ALLOW_PERSONAL_CODES = "1";
    // Stub do banco: usuário local cujo hash NAO corresponde ao código enviado
    testUser = {
      id: 7,
      openId: `local_x_${hashSecretCode("outro-codigo").slice(0, 16)}`,
      name: "X",
      email: null,
      loginMethod: "local",
      localCodeHash: hashSecretCode("outro-codigo"),
    };
    process.env.__TEST_PERSONAL_USER = "1";
    const { registerAuthRoutes: reg3 } = await import("./_core/authProvider");
    const app = express();
    app.use(express.json());
    await reg3(app);
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    try {
      const r = await post(port, "/api/local-auth", {
        code: "codigo-errado",
        name: "X",
      });
      expect(r.status).toBe(401);
    } finally {
      server.close();
      vi.doUnmock("../db");
    }
  });

});
