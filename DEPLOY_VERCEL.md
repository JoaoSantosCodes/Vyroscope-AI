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
| `OPENAI_API_KEY` | Sim (deploy externo) | Chave OpenAI para as análises de IA e geração de thumbnails. Sem ela, as chamadas de LLM/imagem caem no fallback da Manus (que não existe fora da plataforma) |
| `OPENAI_API_BASE` | Opcional | Base da API OpenAI (default `https://api.openai.com/v1`); use para serviços compatíveis (Groq, OpenRouter, LM Studio...) |
| `OPENAI_MODEL` | Opcional | Modelo de texto (default `gpt-4o`) |
| `IMAGE_MODEL` | Opcional | Modelo de imagem (default `dall-e-3`) |
| `YOUTUBE_DATA_API_KEY` | Sim (deploy externo) | Chave da YouTube Data API v3 para a consulta de vídeos em alta. Sem ela, a consulta cai no hub de dados da Manus (que não existe fora da plataforma) |
| `AUTH_ALLOW_PERSONAL_CODES` | Opcional | `1` para habilitar o login por código pessoal definido por cada usuário no perfil (além do código global) |

**Modo Manus fora da Manus**: não é recomendado — as chaves `VITE_APP_ID`/`OAUTH_SERVER_URL` pertencem à plataforma Manus e não funcionam em outro host. Para hospedar por conta própria, use o modo `local`.

4. **Inicialize o banco**: após o primeiro deploy, aplique o schema. As migrações estão em `drizzle/migrations/` (SQL puro, ordene pelos números). Execute-as no seu MySQL:
   ```bash
   # Local (requer acesso ao banco):
   pnpm db:push
   ```
5. **Deploye** e teste o login local: acesse o site → campo "Acesso local" → digite seu nome + o `AUTH_SECRET_CODE`.

## Segurança do modo local

- A comparação do código usa `crypto.timingSafeEqual` (proteção contra timing attacks) e só é feita quando os comprimentos coincidem.
- O código global nunca é armazenado no banco; ele é usado apenas para emitir o JWT, exatamente como um OAuth faria.
- O `openId` do usuário local é estável (`local_<nome_slug>_<hash16 do código>`) — trocar o código muda o usuário (comportamento intencional: use um código definitivo).
- O cookie é `HttpOnly`, `SameSite=None` e com `Secure` quando servido em HTTPS (a Vercel serve em HTTPS por padrão — necessário para `SameSite=None`).
- **Nunca exponha `AUTH_SECRET_CODE` no frontend**; o frontend só conhece o provider (`VITE_AUTH_PROVIDER`).

### Código pessoal por usuário (Rodada 31)

Com `AUTH_ALLOW_PERSONAL_CODES=1`, cada usuário com conta criada pelo login local pode definir um código pessoal no perfil (card "Código de acesso local"). O código pessoal é armazenado apenas como hash SHA-256 (`users.localCodeHash`, 64 caracteres hex). O login aceita o código global **ou** o pessoal; o pessoal persiste no banco e sobrevive a trocas do código global. Deixar o campo vazio no perfil remove o código pessoal.

## Estrutura das rotas no vercel.json

- `POST /api/local-auth` — login local (modo `local`).
- `GET /api/oauth/callback` e `/api/logout` — OAuth/logout (modo `manus`).
- `/api/trpc/*` — todas as APIs da aplicação (tRPC).
- `/api/export-pdf`, `/api/export-agenda-pdf`, etc. — exportações PDF/CSV.
- Qualquer outra rota — static do `dist/public` (fallback `index.html`).

## Limitações conhecidas ao sair da plataforma Manus

- Upload de arquivos usa S3 com helpers do template (`storagePut`/`storageGet`). Configure um bucket próprio se necessário.
- Rodada 31 (providers próprios): LLM, imagem e YouTube já funcionam com providers próprios via envs — não é mais preciso trocar código. Com `OPENAI_API_KEY` e `YOUTUBE_DATA_API_KEY` definidas, o app usa OpenAI (texto e dall-e-3) e a YouTube Data API diretamente; sem elas, cai no fallback da Manus. Defina ambas para um deploy externo funcional.

| Provider | Arquivo | Como escolher |
|---|---|---|
| Texto (análises, sugestões, roteiros) | `server/_core/llm.ts` | `OPENAI_API_KEY` presente → OpenAI; ausente → Forge Manus |
| Imagem (thumbnails) | `server/_core/imageGeneration.ts` | `OPENAI_API_KEY` presente → dall-e-3; ausente → Forge Manus |
| YouTube (trending/search) | `server/youtube.ts` | `YOUTUBE_DATA_API_KEY` presente → API direta; ausente → hub de dados Manus |

### Rodada 32: status de APIs e provedores alternativos por usuário

Além das envs do servidor, cada usuário autenticado pode **sobrescrever o provedor** individualmente pelo perfil (card "Status das APIs" → "Configurar provedor"). As configurações ficam na tabela `user_settings` (chave/valor por usuário) e são aplicadas em todas as chamadas de LLM/imagem daquele usuário — sem alterar as envs nem afetar os demais.

| Camada | Ordem de resolução | Observações |
|---|---|---|
| LLM (texto) | usuário > `OPENAI_API_KEY/BASE/MODEL` > Forge Manus | Base pode apontar para Groq (`https://api.groq.com/openai/v1`), OpenRouter (`https://openrouter.ai/api/v1`) ou endpoint custom (deve ser `https`) |
| Imagem | `image_api_key` do usuário > `llm_api_key` do usuário > env > Forge Manus | Modelos compatíveis com a API de imagens escolhida; default `dall-e-3` |
| YouTube | `YOUTUBE_DATA_API_KEY` (env) > hub de dados Manus | Não há override por usuário — a chave pertence ao projeto |

O card de status no perfil mostra cada provider com o identificador (openai, groq, openrouter, manus-forge, custom) e o estado Ativo/Inativo. O tratamento de erros da API do YouTube inclui retry automático com backoff exponencial (até 3 tentativas, respeita `Retry-After` do 429); a tela de resultado falhado mostra o motivo (cota, chave, rede) com botão "Tentar novamente" (mesma análise) e "Nova análise".

**Custo**: para reduzir gastos, aponte o provedor para a Groq (planos gratuitos) ou OpenRouter (agregador com modelos baratos) diretamente na UI do perfil — não é preciso reiniciar o servidor.
