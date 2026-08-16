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
5. O `vercel.json` já está configurado (build + rotas)

## Autenticação modular (Rodada 30)

O provedor de auth é controlado pela env `AUTH_PROVIDER`:

| Provider | Login | Observação |
|---|---|---|
| `manus` (padrão) | Botão "Entrar" → OAuth da Manus | Requer envs da plataforma (`VITE_APP_ID`, `OAUTH_SERVER_URL`) |
| `local` | Nome + código secreto (`AUTH_SECRET_CODE`) | Sem dependências externas; mesmo cookie/JWT; comparação timing-safe |

Implementação em `server/_core/authProvider.ts` e fluxo frontend em `client/src/components/LocalLoginForm.tsx`. Testes: `server/authProvider.test.ts` (14 testes do provider).

## Repositório

<https://github.com/JoaoSantosCodes/Vyroscope-AI>
