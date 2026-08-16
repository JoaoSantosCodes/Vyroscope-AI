import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getUserStats, updateUserProfile, updateLocalCode } from "../db";
import { hashSecretCode } from "../_core/authProvider";
import { protectedProcedure, router } from "../_core/trpc";

export const profileRouter = router({
  /** Dados da conta do usuário autenticado + estatísticas de uso. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const stats = await getUserStats(ctx.user.id);
    return {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      loginMethod: ctx.user.loginMethod,
      role: ctx.user.role,
      createdAt: ctx.user.createdAt.getTime(),
      lastSignedIn: ctx.user.lastSignedIn.getTime(),
      stats,
    };
  }),

  /** Atualiza nome/email do perfil (o openId não pode ser alterado). */
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "O nome não pode ficar vazio").max(100).optional(),
        email: z.string().email("E-mail inválido").max(320).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await updateUserProfile(ctx.user.id, input);
        if (!updated) throw new Error("user_not_found");
        return {
          id: updated.id,
          name: updated.name,
          email: updated.email,
        };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível atualizar o perfil." });
      }
    }),

  /**
   * (Rodada 31) Define, atualiza ou remove o código secreto pessoal do
   * usuário para o login local. O código é persistido apenas como hash
   * SHA-256 (users.localCodeHash); o código em si nunca é armazenado.
   * `code` vazio/remove=true remove o código pessoal (volta ao global).
   */
  setSecretCode: protectedProcedure
    .input(
      z.object({
        code: z.string().trim().min(0).max(120),
        confirm: z.string().trim(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.code !== input.confirm) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Os códigos não coincidem.",
        });
      }
      try {
        if (input.code.length === 0) {
          await updateLocalCode(ctx.user.id, null);
          return { hasPersonalCode: false };
        }
        await updateLocalCode(ctx.user.id, hashSecretCode(input.code));
        return { hasPersonalCode: true };
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível salvar o código de acesso.",
        });
      }
    }),
});
