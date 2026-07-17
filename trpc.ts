import { initTRPC, TRPCError } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createContext = ({ req, res }: CreateExpressContextOptions) => {
  return { req, res, prisma, user: null };
};

const t = initTRPC.context<typeof createContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  return next({ ctx: { ...ctx, user: { id: 'test-user' } } });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);