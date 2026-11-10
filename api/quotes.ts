import { STOCKS, type Stock, type IndexQuote, type MarketBar, type ChartRange } from '../contracts/market';

type QuoteState={stocks:Stock[];indices:IndexQuote[];updatedAt:Date;liveCount:number;errors:string[]};
const yahooSymbols:Record<string,string>={
 RELIANCE:'RELIANCE.NS',HDFCBANK:'HDFCBANK.NS',TCS:'TCS.BO',INFY:'INFY.NS',BHARTIARTL:'BHARTIARTL.NS',ICICIBANK:'ICICIBANK.NS',LT:'LT.BO',SUNPHARMA:'SUNPHARMA.BO',
 ASML:'ASML.AS',SAP:'SAP.DE',NESN:'NESN.SW','7203':'7203.T','0700':'0700.HK'
};
const fxPairs:Record<string,string>={INR:'INRUSD=X',EUR:'EURUSD=X',CHF:'CHFUSD=X',JPY:'JPYUSD=X',HKD:'HKDUSD=X'};
const benchmarks=[
 {symbol:'^NSEI',name:'NIFTY 50',currency:'INR',market:'India' as const},
 {symbol:'^GSPC',name:'S&P 500',currency:'USD',market:'US' as const},
 {symbol:'^STOXX50E',name:'EURO STOXX 50',currency:'EUR',market:'Europe' as const},
 {symbol:'^N225',name:'NIKKEI 225',currency:'JPY',market:'Asia' as const},
];
const rangeConfig:Record<ChartRange,{range:string;period:string;interval:string}>= {
 '1D':{range:'1d',period:'1d',interval:'5m'},'5D':{range:'5d',period:'5d',interval:'15m'},'1M':{range:'1mo',period:'1mo',interval:'1d'},
 '6M':{range:'6mo',period:'6mo',interval:'1d'},'1Y':{range:'1y',period:'1y',interval:'1wk'},'5Y':{range:'5y',period:'5y',interval:'1mo'},
};
let cache:QuoteState|undefined;let pending:Promise<QuoteState>|undefined;
const historyCache=new Map<string,{bars:MarketBar[];currency:string;updatedAt:number}>();

async function professionalChart(symbol:string,selected:ChartRange='1M'){
 const base=process.env.KIMI_AGENTGW_BASE_URL;const key=process.env.KIMI_AGENTGW_API_KEY;
 if(!base||!key)throw new Error('Professional market connection unavailable');
 const gateway=base.replace(/\/$/,'').replace(/\/v1(?:\/tools)?$/,'');const config=rangeConfig[selected];
 const response=await fetch(`${gateway}/v1/tools`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json','X-Kimi-Plugin':'yahoo_finance'},body:JSON.stringify({method:'call_data_source_tool',params:{data_source_name:'yahoo_finance',api_name:'get_historical_stock_prices',params:{ticker:symbol,period:config.period,interval:config.interval,file_path:`/tmp/merit-${symbol.replace(/[^a-z0-9]/gi,'')}-${selected}.csv`}}}),signal:AbortSignal.timeout(45_000)});
 if(!response.ok)throw new Error(`Professional provider returned ${response.status}`);
 const raw=await response.json() as any;if(!raw.is_success)throw new Error('Professional quote request failed');
 const csv=raw.files?.[0]?.content as string;if(!csv)throw new Error('Professional quote file missing');
 const rows=csv.trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
 const valid=rows.filter(r=>r[4]!==''&&Number.isFinite(Number(r[4]))&&Number(r[4])>0);if(!valid.length)throw new Error('Professional quote history empty');
 const latest=valid.at(-1)!;const previous=valid.length>1?valid.at(-2)!:latest;
 return {timestamp:valid.map(r=>Math.floor(new Date(r[0]).getTime()/1000)),meta:{regularMarketPrice:Number(latest[4]),chartPreviousClose:Number(previous[4]),currency:undefined},indicators:{quote:[{open:valid.map(r=>Number(r[1])),high:valid.map(r=>Number(r[2])),low:valid.map(r=>Number(r[3])),close:valid.map(r=>Number(r[4])),volume:valid.map(r=>Number(r[6])||0)}]}};
}
async function chart(symbol:string,selected:ChartRange='1M'){
 try{const config=rangeConfig[selected];const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}&includePrePost=false`;
 const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 MERIT-Research/1.0'},signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw new Error(`Provider returned ${response.status}`);
 const json=await response.json() as any;const result=json.chart?.result?.[0];
 if(!result?.meta?.regularMarketPrice)throw new Error('No current quote returned');return result;
 }catch(error){return professionalChart(symbol,selected)}
}
function toBars(r:any):MarketBar[]{
 const q=r.indicators?.quote?.[0]??{};const times=r.timestamp??[];
 return times.map((time:number,i:number)=>({time,open:Number(q.open?.[i]),high:Number(q.high?.[i]),low:Number(q.low?.[i]),close:Number(q.close?.[i]),volume:Number(q.volume?.[i])||0})).filter((b:MarketBar)=>[b.open,b.high,b.low,b.close].every(n=>Number.isFinite(n)&&n>0));
}
async function refresh():Promise<QuoteState>{
 const errors:string[]=[];const fx:Record<string,number>={USD:1};
 await Promise.all(Object.entries(fxPairs).map(async([currency,pair])=>{try{const r=await chart(pair);fx[currency]=r.meta.regularMarketPrice}catch{errors.push(`${currency} FX`);fx[currency]=STOCKS.find(s=>s.currency===currency)?.usdRate??1}}));
 let liveCount=0;
 const stocks=await Promise.all(STOCKS.map(async(base)=>{
  try{const r=await chart(yahooSymbols[base.symbol]??base.symbol);const closes=(r.indicators?.quote?.[0]?.close??[]).filter((n:unknown):n is number=>typeof n==='number'&&n>0);const price=r.meta.regularMarketPrice;const previous=r.meta.chartPreviousClose??r.meta.previousClose;
   liveCount++;return {...base,price,change:previous?(price-previous)/previous*100:base.change,spark:closes.length>5?closes.slice(-20):base.spark,currency:r.meta.currency??base.currency,usdRate:fx[base.currency]??base.usdRate};
  }catch{errors.push(base.symbol);return {...base,usdRate:fx[base.currency]??base.usdRate}}
 }));
 const indices=await Promise.all(benchmarks.map(async base=>{try{const r=await chart(base.symbol);const closes=(r.indicators?.quote?.[0]?.close??[]).filter((n:unknown):n is number=>typeof n==='number'&&n>0);const price=r.meta.regularMarketPrice;const previous=r.meta.chartPreviousClose??r.meta.previousClose;return {...base,price,change:previous?(price-previous)/previous*100:0,spark:closes.slice(-20)}}catch{errors.push(base.name);return {...base,price:0,change:0,spark:[]}}}));
 return {stocks,indices,updatedAt:new Date(),liveCount,errors};
}
export async function getLiveStocks(force=false){
 if(!force&&cache&&Date.now()-cache.updatedAt.getTime()<55_000)return cache;
 if(pending)return pending;
 pending=refresh().then(result=>{cache=result;return result}).catch(error=>{if(cache)return cache;throw error}).finally(()=>{pending=undefined});
 return pending;
}
export async function getMarketHistory(symbol:string,selected:ChartRange){
 const key=`${symbol}-${selected}`;const cached=historyCache.get(key);const ttl=selected==='1D'?55_000:15*60_000;
 if(cached&&Date.now()-cached.updatedAt<ttl)return cached;
 const r=await chart(yahooSymbols[symbol]??symbol,selected);const bars=toBars(r);if(bars.length<2)throw new Error('Not enough chart history returned');
 const result={bars,currency:r.meta.currency??'USD',updatedAt:Date.now()};historyCache.set(key,result);return result;
}
