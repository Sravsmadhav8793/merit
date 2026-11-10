import { z } from 'zod';
import { asc, desc, eq } from 'drizzle-orm';
import { createRouter, publicQuery } from './middleware';
import { getDb } from './queries/connection';
import { watchlist, holdings, transactions, researchNotes, priceAlerts } from '@db/schema';
import { getStock, type ChartRange } from '../contracts/market';
import { getLiveStocks, getMarketHistory } from './quotes';

export const marketRouter = createRouter({
  quotes: publicQuery.input(z.object({force:z.boolean().optional()}).optional()).query(async ({input})=>getLiveStocks(input?.force)),
  history: publicQuery.input(z.object({symbol:z.string().min(1).max(16),range:z.enum(['1D','5D','1M','6M','1Y','5Y'])})).query(({input})=>getMarketHistory(input.symbol,input.range as ChartRange)),
  workspace: publicQuery.query(async () => {
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
  toggleWatch: publicQuery.input(z.object({symbol:z.string().min(1).max(12)})).mutation(async ({input})=>{
    const db=getDb(); const existing=await db.select().from(watchlist).where(eq(watchlist.symbol,input.symbol)).limit(1);
    if(existing.length) await db.delete(watchlist).where(eq(watchlist.symbol,input.symbol)); else await db.insert(watchlist).values({symbol:input.symbol});
    return {watching:!existing.length};
  }),
  trade: publicQuery.input(z.object({symbol:z.string().min(1).max(12),side:z.enum(['BUY','SELL']),shares:z.number().positive().max(100000)})).mutation(async ({input})=>{
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
  createAlert: publicQuery.input(z.object({symbol:z.string().min(1).max(12),direction:z.enum(['ABOVE','BELOW']),target:z.number().positive().max(100000000)})).mutation(async ({input})=>{
    await getDb().insert(priceAlerts).values({...input,target:String(input.target)});return {ok:true};
  }),
  deleteAlert: publicQuery.input(z.object({id:z.number().int().positive()})).mutation(async ({input})=>{
    await getDb().delete(priceAlerts).where(eq(priceAlerts.id,input.id));return {ok:true};
  }),
  saveNote: publicQuery.input(z.object({symbol:z.string().min(1).max(12),note:z.string().max(1200)})).mutation(async ({input})=>{
    await getDb().insert(researchNotes).values(input).onDuplicateKeyUpdate({set:{note:input.note,updatedAt:new Date()}}); return {ok:true};
  }),
});
