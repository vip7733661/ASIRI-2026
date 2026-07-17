import express from 'express';
import cors from 'cors';
import { router, publicProcedure, createContext } from './trpc';
import * as trpcExpress from '@trpc/server/adapters/express';
import { stockRouter } from './routers/stock.router';
import { userRouter } from './routers/user.router';
import { alertRouter } from './routers/alert.router';

const app = express();
app.use(cors());
app.use(express.json());

const appRouter = router({
  stock: stockRouter,
  user: userRouter,
  alert: alertRouter,
});

export type AppRouter = typeof appRouter;

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Asiri Capital Server running on http://localhost:${PORT}`);
});