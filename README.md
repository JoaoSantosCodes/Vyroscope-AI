# Vyroscope AI

Ferramenta de pesquisa de ideias para YouTube: informe o nicho e o Vyroscope AI analisa os vídeos em alta, extrai padrões de viralidade e entrega sugestões prontas de temas, hooks e ângulos pontuados por probabilidade de viralização.

## Stack

React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM (MySQL) + Vitest, com autenticação modular (Manus OAuth ou login local por código secreto).

## Funcionalidades (roadmap completo em `todo.md`)

- Análise de nicho com LLM: virality score, temas, hooks e ângulos
- Roteiro estendido por sugestão (1.500–3.000 palavras)
- Gerador de thumbnails com IA + galeria de Favoritos com pastas, DnD e seleção múltipla
- Comparador de nichos, agenda de conteúdo mensal e monitoramento de vídeos publicados
- Painel "Ideia do dia" com histórico, fixação, anotações e quadro Kanban (Planejada / Gravando / Publicada)
- Meta mensal com streaks, celebração de 100%, "Ano em números" e galeria de conquistas (selos anuais, trimestrais e semestrais)
- Exportações em PDF e CSV (sugestões, agenda, história, favoritos, conquistas, streaks)
- Autenticação modular: Manus OAuth dentro da plataforma ou login local por código para deploy próprio

## Comandos

```bash
pnpm dev          # desenvolvimento (Vite + tsx watch)
pnpm build        # build de produção (frontend em dist/public, server em dist/index.js)
pnpm start        # serve de produção
pnpm test         # suíte vitest
pnpm check        # typecheck
pnpm db:push      # gerar + aplicar migrações (requer DATABASE_URL)
```

## Deploy próprio (Vercel, Railway, Render…)

Veja `DEPLOY_VERCEL.md` — resumo:

1. `AUTH_PROVIDER=local` + `AUTH_SECRET_CODE=<seu-código-secreto>` + `VITE_AUTH_PROVIDER=local`
2. `DATABASE_URL` apontando para seu MySQL/TiDB
3. `JWT_SECRET` com segredo próprio
4. Aplicar as migrações em `drizzle/migrations/`
5. Definir `OPENAI_API_KEY` (LLM + thumbnails) e `YOUTUBE_DATA_API_KEY` (consulta de vídeos) — sem elas as chamadas caem no fallback da plataforma Manus, que não existe fora dela
6. O `vercel.json` já está configurado (build + rotas)

## Autenticação modular (Rodada 30)

O provedor de auth é controlado pela env `AUTH_PROVIDER`:

| Provider | Login | Observação |
|---|---|---|
| `manus` (padrão) | Botão "Entrar" → OAuth da Manus | Requer envs da plataforma (`VITE_APP_ID`, `OAUTH_SERVER_URL`) |
| `local` | Nome + código secreto (`AUTH_SECRET_CODE`) | Sem dependências externas; mesmo cookie/JWT; comparação timing-safe |

Implementação em `server/_core/authProvider.ts` e fluxo frontend em `client/src/components/LocalLoginForm.tsx`. Testes: `server/authProvider.test.ts` (18 testes do provider).

### Providers próprios de IA e YouTube (Rodada 31)

Para deploy fora da Manus, os providers de LLM, imagem e YouTube escolhem automaticamente entre a chave própria (env) e o hub interno da Manus (fallback):

| Provider | Arquivo | Envs |
|---|---|---|
| Texto (análises, roteiros) | `server/_core/llm.ts` | `OPENAI_API_KEY`, `OPENAI_API_BASE`, `OPENAI_MODEL` |
| Imagem (thumbnails) | `server/_core/imageGeneration.ts` | `OPENAI_API_KEY`, `IMAGE_MODEL` (default `dall-e-3`) |
| YouTube (vídeos em alta) | `server/youtube.ts` | `YOUTUBE_DATA_API_KEY` |

Com `AUTH_ALLOW_PERSONAL_CODES=1`, usuários com conta criada pelo login local podem definir um código pessoal no perfil (card "Código de acesso local"), armazenado apenas como hash SHA-256 em `users.localCodeHash`. O login aceita o código global ou o pessoal; deixar o campo vazio remove o código pessoal.

### Status de APIs e provedores por usuário (Rodada 32)

O perfil exibe o card "Status das APIs" (LLM, imagem e YouTube com identificador e estado Ativo/Inativo) e o dialog "Configurar provedor", que permite trocar o provedor de texto/imagem por Groq, OpenRouter, OpenAI ou endpoint custom — o override fica salvo em `user_settings` por usuário, sem tocar nas envs do servidor. A consulta ao YouTube (env-only) tem retry automático com backoff (429 respeita `Retry-After`; 5xx/rede até 3 tentativas) e a tela de análise falhada oferece "Tentar novamente" (mesma análise) ou "Nova análise" com diagnóstico do erro.

## Repositório

<https://github.com/JoaoSantosCodes/Vyroscope-AI>
