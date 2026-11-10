import { z } from 'zod';
import { asc, desc, eq } from 'drizzle-orm';
import { createRouter, authedQuery } from './middleware';
import { getDb } from './queries/connection';
import { watchlist, holdings, transactions, researchNotes, priceAlerts } from '@db/schema';
import { getStock, type ChartRange } from '../contracts/market';
import { getLiveStocks, getMarketHistory } from './quotes';
import { isReviewer } from './local-auth';

// Play review uses an isolated paper workspace. It never reads or writes the owner's tables.
const demo = {
  watchlist: [] as (typeof watchlist.$inferSelect)[],
  holdings: [
    { id: 1, symbol: 'NVDA', shares: '24', averageCost: '142.30', updatedAt: new Date() },
    { id: 2, symbol: 'MSFT', shares: '12', averageCost: '438.20', updatedAt: new Date() },
    { id: 3, symbol: 'GOOGL', shares: '18', averageCost: '214.60', updatedAt: new Date() },
  ] as (typeof holdings.$inferSelect)[],
  transactions: [] as (typeof transactions.$inferSelect)[],
  notes: [] as (typeof researchNotes.$inferSelect)[],
  alerts: [] as (typeof priceAlerts.$inferSelect)[],
  nextId: 4,
};

export const marketRouter = createRouter({
  quotes: authedQuery.input(z.object({force:z.boolean().optional()}).optional()).query(async ({input})=>getLiveStocks(input?.force)),
  history: authedQuery.input(z.object({symbol:z.string().min(1).max(16),range:z.enum(['1D','5D','1M','6M','1Y','5Y'])})).query(({input})=>getMarketHistory(input.symbol,input.range as ChartRange)),
  workspace: authedQuery.query(async ({ctx}) => {
    if (isReviewer(ctx.user.unionId)) return {
      watchlist: [...demo.watchlist], holdings: [...demo.holdings], transactions: [...demo.transactions].slice(0,20),
      notes: [...demo.notes], alerts: [...demo.alerts],
    };
    const db=getDb();
    const alerts=await db.select().from(priceAlerts).orderBy(desc(priceAlerts.createdAt));
    if(alerts.some(a=>a.active&&!a.triggeredAt)){
      const live=await getLiveStocks();
      await Promise.all(alerts.filter(a=>a.active&&!a.triggeredAt).map(async alert=>{
        const price=live.stocks.find(s=>s.symbol===alert.symbol)?.price??getStock(alert.symbol).price;const target=Number(alert.target);
        if((alert.direction==='ABOVE'&&price>=target)||(alert.direction==='BELOW'&&price<=target))await db.update(priceAlerts).set({triggeredAt:new Date(),active:false}).where(eq(priceAlerts.id,alert.id));
      }));
    }
    let positions=await db.select().from(holdings).orderBy(asc(holdings.symbol));
    if(positions.length===0){
      await db.insert(holdings).values([
        {symbol:'NVDA',shares:'24',averageCost:'142.30'},
        {symbol:'MSFT',shares:'12',averageCost:'438.20'},
        {symbol:'GOOGL',shares:'18',averageCost:'214.60'},
      ]);
      positions=await db.select().from(holdings).orderBy(asc(holdings.symbol));
    }
    return { watchlist:await db.select().from(watchlist).orderBy(desc(watchlist.createdAt)), holdings:positions,
      transactions:await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(20), notes:await db.select().from(researchNotes), alerts:await db.select().from(priceAlerts).orderBy(desc(priceAlerts.createdAt)) };
  }),
  toggleWatch: authedQuery.input(z.object({symbol:z.string().min(1).max(12)})).mutation(async ({ctx,input})=>{
    if(isReviewer(ctx.user.unionId)){
      const i=demo.watchlist.findIndex(w=>w.symbol===input.symbol);
      if(i>=0) demo.watchlist.splice(i,1); else demo.watchlist.push({id:demo.nextId++,symbol:input.symbol,createdAt:new Date()});
      return {watching:i<0};
    }
    const db=getDb(); const existing=await db.select().from(watchlist).where(eq(watchlist.symbol,input.symbol)).limit(1);
    if(existing.length) await db.delete(watchlist).where(eq(watchlist.symbol,input.symbol)); else await db.insert(watchlist).values({symbol:input.symbol});
    return {watching:!existing.length};
  }),
  trade: authedQuery.input(z.object({symbol:z.string().min(1).max(12),side:z.enum(['BUY','SELL']),shares:z.number().positive().max(100000)})).mutation(async ({ctx,input})=>{
    if(isReviewer(ctx.user.unionId)){
      const stock=getStock(input.symbol); const current=demo.holdings.find(h=>h.symbol===input.symbol);
      const oldShares=Number(current?.shares??0);
      if(input.side==='SELL'&&input.shares>oldShares) throw new Error('Sale exceeds your current position.');
      const nextShares=input.side==='BUY'?oldShares+input.shares:oldShares-input.shares;
      const nextCost=input.side==='BUY'?(oldShares*Number(current?.averageCost??0)+input.shares*stock.price)/nextShares:Number(current?.averageCost??stock.price);
      demo.transactions.unshift({id:demo.nextId++,symbol:input.symbol,side:input.side,shares:String(input.shares),price:String(stock.price),createdAt:new Date()});
      if(nextShares<0.00001) demo.holdings=demo.holdings.filter(h=>h.symbol!==input.symbol);
      else if(current){current.shares=String(nextShares);current.averageCost=String(nextCost);current.updatedAt=new Date();}
      else demo.holdings.push({id:demo.nextId++,symbol:input.symbol,shares:String(nextShares),averageCost:String(nextCost),updatedAt:new Date()});
      return {ok:true,shares:nextShares};
    }
    const db=getDb(); const live=await getLiveStocks(); const stock=live.stocks.find(s=>s.symbol===input.symbol)??getStock(input.symbol); const existing=await db.select().from(holdings).where(eq(holdings.symbol,input.symbol)).limit(1); const current=existing[0];
    const oldShares=Number(current?.shares??0); if(input.side==='SELL'&&input.shares>oldShares) throw new Error('Sale exceeds your current position.');
    const nextShares=input.side==='BUY'?oldShares+input.shares:oldShares-input.shares;
    const nextCost=input.side==='BUY'?((oldShares*Number(current?.averageCost??0)+input.shares*stock.price)/nextShares):Number(current?.averageCost??stock.price);
    await db.insert(transactions).values({symbol:input.symbol,side:input.side,shares:String(input.shares),price:String(stock.price)});
    if(nextShares<0.00001) await db.delete(holdings).where(eq(holdings.symbol,input.symbol));
    else if(current) await db.update(holdings).set({shares:String(nextShares),averageCost:String(nextCost),updatedAt:new Date()}).where(eq(holdings.symbol,input.symbol));
    else await db.insert(holdings).values({symbol:input.symbol,shares:String(nextShares),averageCost:String(nextCost)});
    return {ok:true,shares:nextShares};
  }),
  createAlert: authedQuery.input(z.object({symbol:z.string().min(1).max(12),direction:z.enum(['ABOVE','BELOW']),target:z.number().positive().max(100000000)})).mutation(async ({ctx,input})=>{
    if(isReviewer(ctx.user.unionId)){demo.alerts.unshift({id:demo.nextId++,...input,target:String(input.target),active:true,triggeredAt:null,createdAt:new Date()});return {ok:true};}
    await getDb().insert(priceAlerts).values({...input,target:String(input.target)});return {ok:true};
  }),
  deleteAlert: authedQuery.input(z.object({id:z.number().int().positive()})).mutation(async ({ctx,input})=>{
    if(isReviewer(ctx.user.unionId)){demo.alerts=demo.alerts.filter(a=>a.id!==input.id);return {ok:true};}
    await getDb().delete(priceAlerts).where(eq(priceAlerts.id,input.id));return {ok:true};
  }),
  saveNote: authedQuery.input(z.object({symbol:z.string().min(1).max(12),note:z.string().max(1200)})).mutation(async ({ctx,input})=>{
    if(isReviewer(ctx.user.unionId)){
      const existing=demo.notes.find(n=>n.symbol===input.symbol);
      if(existing){existing.note=input.note;existing.updatedAt=new Date();}
      else demo.notes.push({id:demo.nextId++,...input,updatedAt:new Date()});
      return {ok:true};
    }
    await getDb().insert(researchNotes).values(input).onDuplicateKeyUpdate({set:{note:input.note,updatedAt:new Date()}}); return {ok:true};
  }),
});
