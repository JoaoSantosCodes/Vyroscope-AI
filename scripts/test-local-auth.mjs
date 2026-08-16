// Teste rápido do fluxo de login local contra o servidor em execução.
// Uso: AUTH_PROVIDER=local AUTH_SECRET_CODE=segredo node scripts/test-local-auth.mjs
import { createConnection } from "net";

const code = process.env.AUTH_SECRET_CODE ?? "segredo";
const PORT = process.env.PORT ?? 3000;

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = [
      `POST ${path} HTTP/1.1`,
      `Host: localhost:${PORT}`,
      `Content-Type: application/json`,
      `Content-Length: ${Buffer.byteLength(payload)}`,
      `Connection: close`,
    ];
    const req = createConnection(PORT, "127.0.0.1", () => {
      req.write(headers.join("\r\n") + "\r\n\r\n" + payload);
    });
    let data = Buffer.alloc(0);
    req.on("data", chunk => {
      data = Buffer.concat([data, chunk]);
    });
    req.on("end", () => {
      const text = data.toString("utf-8");
      const headerEnd = text.indexOf("\r\n\r\n");
      const head = text.slice(0, headerEnd);
      const body = text.slice(headerEnd + 4);
      const status = parseInt(head.match(/^HTTP\/1\.\d (\d+)/)?.[1] ?? "0");
      const cookie = (head.match(/^set-cookie:\s*([^;]+)/im)?.[1] ?? "").split("=");
      resolve({ status, head, body, cookie });
    });
    req.on("error", reject);
  });
}

async function main() {
  console.log(`== Testando auth local na porta ${PORT} ==`);

  const wrong = await post("/api/local-auth", { code: "errado", name: "t" });
  console.log(`[1] código errado → HTTP ${wrong.status} (esperado 401)`);
  if (wrong.status !== 401) {
    console.log("    resposta:", wrong.body.slice(0, 200));
  }

  const ok = await post("/api/local-auth", { code, name: "João Teste" });
  console.log(`[2] código correto → HTTP ${ok.status} (esperado 200)`);
  console.log("    corpo:", ok.body.slice(0, 300));
  const sessionId = ok.cookie[0] === "app_session_id" ? ok.cookie[1] : null;

  if (!sessionId) {
    console.log("[!] app_session_id não foi retornado — sessão não persiste");
    return;
  }
  console.log(`    cookie: app_session_id=${sessionId.slice(0, 24)}...`);

  // tRPC auth.me via GET /api/trpc/auth.me (formato sem input)
  const me = await new Promise((resolve, reject) => {
    const req = createConnection(PORT, "127.0.0.1", () => {
      req.write(
        `GET /api/trpc/auth.me HTTP/1.1\r\nHost: localhost:${PORT}\r\nCookie: app_session_id=${sessionId}\r\nConnection: close\r\n\r\n`
      );
    });
    let data = Buffer.alloc(0);
    req.on("data", chunk => {
      data = Buffer.concat([data, chunk]);
    });
    req.on("end", () => resolve(data.toString("utf-8")));
    req.on("error", reject);
  });
  const body = me.slice(me.indexOf("{"));
  const parsed = JSON.parse(body);
  const user = parsed?.result?.data?.json;
  console.log(`[3] tRPC auth.me com cookie → HTTP 200`);
  console.log("    usuário:", JSON.stringify(user));
  if (user && user.name) {
    console.log("[✓] Fluxo local end-to-end OK — sessão local funciona com tRPC");
  } else {
    console.log("[!] auth.me retornou null — verificar verifySession");
  }
}

main().catch(e => {
  console.error("[!] Falha:", e.message);
  process.exit(1);
});
