import { createRouter, publicQuery } from './middleware';
import { marketRouter } from './marketRouter';
import { authRouter } from "./auth-router";
import { brokerageRouter } from "./brokerageRouter";
export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  brokerage: brokerageRouter,
  market: marketRouter,
});
export type AppRouter = typeof appRouter;
