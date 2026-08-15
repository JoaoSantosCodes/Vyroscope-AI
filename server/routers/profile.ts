import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getUserStats, updateUserProfile } from "../db";
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
});
