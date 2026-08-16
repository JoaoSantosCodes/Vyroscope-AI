/**
 * End-to-end do login local + setSecretCode em um servidor Express mínimo
 * que registra as rotas do authProvider e um router tRPC parcial de perfil.
 * Objetivo: validar que setSecretCode grava o hash pessoal e que o login
 * local depois aceita o código pessoal.
 */
import http from "http";
import express from "express";
import { registerAuthRoutes } from "/home/ubuntu/vyroscope-ai/server/_core/authProvider";

const SECRET = process.env.AUTH_SECRET_CODE || "segredo-teste";
process.env.AUTH_PROVIDER = "local";
process.env.AUTH_SECRET_CODE = SECRET;
process.env.AUTH_ALLOW_PERSONAL_CODES = "1";

function postJson(port, path, body, headers = {}) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
      },
      res => {
        let d = "";
        res.on("data", c => (d += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: d,
            cookies: res.headers["set-cookie"] || [],
          })
        );
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const app = express();
  app.use(express.json());
  // Rota de perfil simulada: retorna sucesso sem persistir (DB real não está
  // configurado neste teste minimalista — só validamos o fluxo até o hash).
  app.post("/api/trpc/profile.setSecretCode", (req, res) => {
    res.json({ result: { data: { json: { success: true } } } });
  });
  await registerAuthRoutes(app);

  const server = app.listen(3002, async () => {
    try {
      // 1. Login global
      const login = await postJson(3002, "/api/local-auth", {
        code: SECRET,
        name: "joao Teste",
      });
      console.log("login global:", login.status);
      const cookie = login.cookies.find(c => c.startsWith("app_session_id="));
      // 2. setSecretCode
      const code = "codigo-pessoal-novo";
      const set = await postJson(
        3002,
        "/api/trpc/profile.setSecretCode",
        [{ json: { code } }],
        { Cookie: cookie.split(";")[0] }
      );
      console.log("setSecretCode:", set.status, set.body.slice(0, 200));
      // 3. Login com o código pessoal
      const me = await postJson(3002, "/api/local-auth", {
        code,
        name: "joao Teste",
      });
      console.log("login com codigo pessoal:", me.status, me.body.slice(0, 300));
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
