# Vyroscope AI — Guia de Deploy (Vercel / qualquer Node host)

Este guia cobre o deploy do Vyroscope AI fora da plataforma Manus (Vercel, Railway, Render, Fly.io, etc.) usando a **autenticação modular** da Rodada 30.

## Visão geral da arquitetura modular

O sistema de autenticação agora é trocável via variável de ambiente `AUTH_PROVIDER`. O cookie de sessão (`app_session_id`), o JWT e todo o fluxo tRPC permanecem **idênticos** nos dois modos — o que muda é apenas a porta de entrada do login.

| Modo | `AUTH_PROVIDER` | Como o usuário entra | Dependências externas |
|---|---|---|---|
| **Manus OAuth** (padrão) | `manus` | Botão "Entrar" → OAuth da Manus | `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` |
| **Local (código)** | `local` | Campo nome + código secreto | Nenhuma — apenas `AUTH_SECRET_CODE` |

## Passo a passo para a Vercel

1. **Fork/clone o repositório** e conecte-o na Vercel (botão "Add New Project" → import do GitHub).
2. **Configure o build**: a Vercel deve detectar `pnpm` automaticamente (vercel.json já existe). Settings → Build Command: `pnpm vercel:build`; Output Directory: `dist/public`; Install Command: `pnpm install`.
3. **Defina as variáveis de ambiente** (Settings → Environment Variables). Use `production`, `preview` e `development` conforme necessário:

| Variável | Obrigatória? | Descrição |
|---|---|---|
| `AUTH_PROVIDER` | Sim | `manus` ou `local`. Sem ela, o modo Manus é ativado |
| `AUTH_SECRET_CODE` | Sim (modo local) | O código secreto usado no login local. Use uma senha forte de 16+ caracteres. O login local só é ativado quando o provider é `local` **e** este código está definido |
| `DATABASE_URL` | Sim | Connection string MySQL/TiDB (ex.: `mysql://user:pass@host:3306/db`). O schema é compatível com MySQL 8+ e TiDB |
| `JWT_SECRET` | Sim | Segredo para assinar os JWTs da sessão (32+ caracteres aleatórios). Deve ser o mesmo em todas as instâncias |
| `VITE_AUTH_PROVIDER` | Sim (modo local) | Espelho de `AUTH_PROVIDER` para o frontend (`local` ou `manus`) — o build Vite precisa disso em tempo de compilação |
| `VITE_APP_TITLE` | Opcional | Título exibido no site |
| `VITE_APP_LOGO` | Opcional | Logo exibido no site |

**Modo Manus fora da Manus**: não é recomendado — as chaves `VITE_APP_ID`/`OAUTH_SERVER_URL` pertencem à plataforma Manus e não funcionam em outro host. Para hospedar por conta própria, use o modo `local`.

4. **Inicialize o banco**: após o primeiro deploy, aplique o schema. As migrações estão em `drizzle/migrations/` (SQL puro, ordene pelos números). Execute-as no seu MySQL:
   ```bash
   # Local (requer acesso ao banco):
   pnpm db:push
   ```
5. **Deploye** e teste o login local: acesse o site → campo "Acesso local" → digite seu nome + o `AUTH_SECRET_CODE`.

## Segurança do modo local

- A comparação do código usa `crypto.timingSafeEqual` (proteção contra timing attacks) e só é feita quando os comprimentos coincidem.
- O código nunca é armazenado no banco; ele é usado apenas para emitir o JWT, exatamente como um OAuth faria.
- O `openId` do usuário local é estável (`local_<nome_slug>_<hash16 do código>`) — trocar o código muda o usuário (comportamento intencional: use um código definitivo).
- O cookie é `HttpOnly`, `SameSite=None` e com `Secure` quando servido em HTTPS (a Vercel serve em HTTPS por padrão — necessário para `SameSite=None`).
- **Nunca exponha `AUTH_SECRET_CODE` no frontend**; o frontend só conhece o provider (`VITE_AUTH_PROVIDER`).

## Estrutura das rotas no vercel.json

- `POST /api/local-auth` — login local (modo `local`).
- `GET /api/oauth/callback` e `/api/logout` — OAuth/logout (modo `manus`).
- `/api/trpc/*` — todas as APIs da aplicação (tRPC).
- `/api/export-pdf`, `/api/export-agenda-pdf`, etc. — exportações PDF/CSV.
- Qualquer outra rota — static do `dist/public` (fallback `index.html`).

## Limitações conhecidas ao sair da plataforma Manus

- Geração de thumbnails e análises por IA usam as APIs internas da Manus (`BUILT_IN_FORGE_*`). Fora da Manus essas chamadas não existem — para hospedar por conta própria, substitua as chamadas de LLM/imagem em `server/_core/llm.ts` e `server/_core/imageGeneration.ts` por um provider próprio (OpenAI/Anthropic) com chave sua.
- Upload de arquivos usa S3 com helpers do template (`storagePut`/`storageGet`). Configure um bucket próprio se necessário.
