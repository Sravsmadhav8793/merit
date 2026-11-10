import { z } from 'zod';
import { createRouter, authedQuery, adminQuery } from './middleware';
import { authorizationUrl, brokerageStatus, cancelLiveOrder, createOauthState, disconnect, modifyGttOrder, modifyLiveOrder, orderBook, placeGttOrder, placeLiveOrder } from './upstox';
const token=z.string().min(8).max(100).regex(/^(NSE_EQ|BSE_EQ|NSE_FO|BSE_FO)\|[A-Za-z0-9]+$/,'Use an official Upstox NSE/BSE equity or F&O instrument token.');
const rules=z.array(z.object({strategy:z.enum(['ENTRY','TARGET','STOPLOSS']),triggerType:z.enum(['ABOVE','BELOW','IMMEDIATE']),triggerPrice:z.number().positive().max(10000000)})).min(1).max(3).superRefine((value,ctx)=>{if(value[0]?.strategy!=='ENTRY')ctx.addIssue({code:'custom',message:'ENTRY must be the first rule.'});if(new Set(value.map(v=>v.strategy)).size!==value.length)ctx.addIssue({code:'custom',message:'GTT strategies cannot repeat.'});value.slice(1).forEach(v=>{if(v.triggerType!=='IMMEDIATE')ctx.addIssue({code:'custom',message:'TARGET and STOPLOSS rules must be IMMEDIATE.'})})});
export const brokerageRouter=createRouter({
  status:authedQuery.query(({ctx})=>brokerageStatus(ctx.user)),
  connect:adminQuery.mutation(async({ctx})=>({url:authorizationUrl(await createOauthState(ctx.user))})),
  disconnect:adminQuery.mutation(({ctx})=>disconnect(ctx.user).then(()=>({ok:true}))),
  orders:adminQuery.query(({ctx})=>orderBook(ctx.user)),
  place:adminQuery.input(z.object({idempotencyKey:z.string().uuid(),instrumentToken:token,quantity:z.number().int().positive().max(100000),product:z.enum(['D','I']),validity:z.enum(['DAY','IOC']),price:z.number().nonnegative().max(10000000),orderType:z.enum(['MARKET','LIMIT','SL','SL-M']),side:z.enum(['BUY','SELL']),triggerPrice:z.number().nonnegative().max(10000000),isAmo:z.boolean(),marketProtection:z.number().int().min(-1).max(25),slice:z.boolean(),confirmation:z.string().max(30)})).mutation(({ctx,input})=>placeLiveOrder(ctx.user,input)),
  placeGtt:adminQuery.input(z.object({idempotencyKey:z.string().uuid(),instrumentToken:token,quantity:z.number().int().positive().max(100000),product:z.enum(['D','I']),side:z.enum(['BUY','SELL']),type:z.enum(['SINGLE','MULTIPLE']),rules,confirmation:z.string().max(30)})).mutation(({ctx,input})=>placeGttOrder(ctx.user,input)),
  cancel:adminQuery.input(z.object({id:z.string().min(3).max(50),kind:z.enum(['STANDARD','GTT']),confirmation:z.literal('CANCEL LIVE ORDER')})).mutation(({ctx,input})=>cancelLiveOrder(ctx.user,input.id,input.kind)),
  modify:adminQuery.input(z.object({orderId:z.string().min(3).max(50),quantity:z.number().int().positive(),validity:z.enum(['DAY','IOC']),price:z.number().nonnegative(),orderType:z.enum(['MARKET','LIMIT','SL','SL-M']),triggerPrice:z.number().nonnegative(),confirmation:z.literal('MODIFY LIVE ORDER')})).mutation(({ctx,input})=>modifyLiveOrder(ctx.user,input)),
  modifyGtt:adminQuery.input(z.object({gttOrderId:z.string().min(3).max(50),quantity:z.number().int().positive(),type:z.enum(['SINGLE','MULTIPLE']),rules,confirmation:z.literal('MODIFY LIVE ORDER')})).mutation(({ctx,input})=>modifyGttOrder(ctx.user,input)),
});
