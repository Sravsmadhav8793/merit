import { useMemo, useState } from 'react';
import { CandlestickChart, LineChart as LineIcon, RefreshCw } from 'lucide-react';
import { STOCKS, money, type ChartRange, type MarketBar, type Stock } from '@contracts/market';
import { trpc } from '@/providers/trpc';

type Bar=MarketBar&{sma20?:number;sma50?:number;rsi?:number;compare?:number};
function enrich(rows:MarketBar[]):Bar[]{return rows.map((b,i)=>{
 const avg=(n:number)=>i>=n-1?rows.slice(i-n+1,i+1).reduce((a,x)=>a+x.close,0)/n:undefined;
 let rsi:number|undefined;if(i>=14){let gains=0,losses=0;for(let j=i-13;j<=i;j++){const d=rows[j].close-rows[j-1].close;if(d>=0)gains+=d;else losses-=d}rsi=losses===0?100:100-100/(1+gains/losses)}
 return {...b,sma20:avg(20),sma50:avg(50),rsi};
})}
function pathFor(rows:Bar[],key:'close'|'sma20'|'sma50'|'compare',x:(i:number)=>number,y:(n:number)=>number){let started=false;return rows.map((r,i)=>{const v=r[key];if(typeof v!=='number')return '';const d=`${started?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;started=true;return d}).join(' ')}
const ranges:ChartRange[]=['1D','5D','1M','6M','1Y','5Y'];

export default function AdvancedChart({stock}:{stock:Stock}){
 const [range,setRange]=useState<ChartRange>('1M');const [type,setType]=useState<'area'|'candles'>('area');const [sma,setSma]=useState(true);const [rsi,setRsi]=useState(false);const [compare,setCompare]=useState('');const [hover,setHover]=useState<number|null>(null);
 const history=trpc.market.history.useQuery({symbol:stock.symbol,range},{staleTime:60_000,retry:1});
 const peer=trpc.market.history.useQuery({symbol:compare,range},{enabled:!!compare,staleTime:60_000,retry:1});
 const rows=useMemo(()=>enrich(history.data?.bars??[]),[history.data]);
 const peerRows=useMemo(()=>{if(!peer.data?.bars?.length||!rows.length)return [];const base=rows[0].close,pbase=peer.data.bars[0].close;return rows.map((r,i)=>({...r,compare:(peer.data!.bars[i]?.close??peer.data!.bars.at(-1)!.close)/pbase*base}))},[peer.data,rows]);
 const display=compare?peerRows:rows;const active=hover===null?display.at(-1):display[hover];
 const periodChange=rows.length>1?(rows.at(-1)!.close/rows[0].close-1)*100:0;
 const W=900,H=300,pad={l:12,r:70,t:18,b:30};const iw=W-pad.l-pad.r,ih=H-pad.t-pad.b;
 const values=display.flatMap(r=>type==='candles'&&!compare?[r.low,r.high]:[r.close,...(sma&&!compare?[r.sma20,r.sma50]:[]),...(compare?[r.compare]:[])]).filter((n):n is number=>typeof n==='number'&&Number.isFinite(n));
 const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1,spread=Math.max(max-min,max*.015);const lo=min-spread*.12,hi=max+spread*.12;
 const x=(i:number)=>pad.l+(display.length<=1?iw/2:i/(display.length-1)*iw),y=(n:number)=>pad.t+(hi-n)/(hi-lo)*ih;
 const date=(time:number)=>new Date(time*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:range==='5Y'?'numeric':undefined});
 const move=(e:React.PointerEvent<SVGSVGElement>)=>{if(!display.length)return;const rect=e.currentTarget.getBoundingClientRect();const px=(e.clientX-rect.left)/rect.width*W;setHover(Math.max(0,Math.min(display.length-1,Math.round((px-pad.l)/iw*(display.length-1)))))};
 if(history.isLoading)return <div className="chart-loading"><span className="loader"/><p>Loading {range} market history…</p></div>;
 if(history.error||!rows.length)return <div className="chart-loading"><p>Live chart history is unavailable.</p><button className="secondary-btn" onClick={()=>history.refetch()}><RefreshCw size={14}/> Retry</button></div>;
 if(compare&&peer.isLoading)return <div className="chart-loading"><span className="loader"/><p>Loading {compare} comparison history…</p></div>;
 if(compare&&(peer.error||!display.length))return <div className="chart-loading"><p>{compare} comparison history is unavailable.</p><button className="secondary-btn" onClick={()=>peer.refetch()}><RefreshCw size={14}/> Retry comparison</button><button className="text-btn" onClick={()=>setCompare('')}>Clear comparison</button></div>;
 return <div className="advanced-chart">
  <div className="chart-toolbar"><div className="range-tabs">{ranges.map(r=><button className={range===r?'active':''} onClick={()=>{setRange(r);setHover(null)}} key={r}>{r}</button>)}</div><div className="chart-tools"><button className={type==='area'?'active':''} onClick={()=>setType('area')} aria-label="Area chart"><LineIcon size={15}/></button><button className={type==='candles'?'active':''} disabled={!!compare} onClick={()=>setType('candles')} aria-label="Candlestick chart"><CandlestickChart size={15}/></button><button className={sma?'active':''} disabled={!!compare} onClick={()=>setSma(!sma)}>MA</button><button className={rsi?'active':''} disabled={!!compare} onClick={()=>setRsi(!rsi)}>RSI</button></div></div>
  <div className="compare-bar"><div><strong>{money(rows.at(-1)!.close,history.data?.currency??stock.currency)}</strong><span className={periodChange>=0?'text-mint':'text-red'}>{periodChange>=0?'+':''}{periodChange.toFixed(2)}% · {range}</span></div><label>COMPARE<select value={compare} onChange={e=>{setCompare(e.target.value);setHover(null)}}><option value="">None</option>{STOCKS.filter(s=>s.symbol!==stock.symbol).map(s=><option value={s.symbol} key={s.symbol}>{s.symbol} · {s.name}</option>)}</select></label></div>
  {compare&&<div className="compare-note"><i style={{background:'#22d3ee'}}/>{stock.symbol}<i style={{background:'#fbbf24'}}/>{compare} · normalized to the same starting price</div>}
  <div className="ohlc-readout">{active&&<><span>{date(active.time)}</span><span>O {money(active.open,stock.currency)}</span><span>H {money(active.high,stock.currency)}</span><span>L {money(active.low,stock.currency)}</span><span>C {money(active.close,stock.currency)}</span>{active.rsi!==undefined&&!compare&&<span>RSI {active.rsi.toFixed(1)}</span>}</>}</div>
  <div className="chart-canvas"><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={move} onPointerLeave={()=>setHover(null)} role="img" aria-label={`${stock.symbol} ${range} ${compare?'comparison':'price'} chart`}>
   {[0,.25,.5,.75,1].map((p,i)=>{const val=hi-(hi-lo)*p,yy=pad.t+ih*p;return <g key={i}><line x1={pad.l} x2={W-pad.r} y1={yy} y2={yy} stroke="#25303b" strokeWidth="1"/><text x={W-pad.r+8} y={yy+4} fill="#71818e" fontSize="11" fontFamily="IBM Plex Mono">{val>=1000?val.toFixed(0):val.toFixed(2)}</text></g>})}
   {!compare&&type==='area'&&<><defs><linearGradient id="advancedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity=".22"/><stop offset="1" stopColor="#22d3ee" stopOpacity="0"/></linearGradient></defs><path d={`${pathFor(display,'close',x,y)} L${x(display.length-1)},${pad.t+ih} L${x(0)},${pad.t+ih} Z`} fill="url(#advancedFill)"/></>}
   {!compare&&type==='candles'&&display.map((r,i)=>{const xx=x(i),up=r.close>=r.open,col=up?'#00bb7f':'#fb5c68',bodyY=y(Math.max(r.open,r.close)),bodyH=Math.max(1.5,Math.abs(y(r.open)-y(r.close)));return <g key={r.time}><line x1={xx} x2={xx} y1={y(r.high)} y2={y(r.low)} stroke={col} strokeWidth="1"/><rect x={xx-Math.max(1.5,iw/display.length*.3)} y={bodyY} width={Math.max(3,iw/display.length*.6)} height={bodyH} fill={col}/></g>})}
   <path d={pathFor(display,'close',x,y)} fill="none" stroke="#22d3ee" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
   {!compare&&sma&&<><path d={pathFor(display,'sma20',x,y)} fill="none" stroke="#fbbf24" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/><path d={pathFor(display,'sma50',x,y)} fill="none" stroke="#a78bfa" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/></>}
   {compare&&<path d={pathFor(display,'compare',x,y)} fill="none" stroke="#fbbf24" strokeWidth="2" vectorEffect="non-scaling-stroke"/>}
   {hover!==null&&display[hover]&&<g><line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t+ih} stroke="#8295a4" strokeDasharray="3 3"/><circle cx={x(hover)} cy={y(display[hover].close)} r="4" fill="#071014" stroke="#22d3ee" strokeWidth="2"/></g>}
   {[0,.25,.5,.75,1].map((p,i)=>{const idx=Math.min(display.length-1,Math.round((display.length-1)*p));return <text key={i} x={x(idx)} y={H-7} textAnchor={i===0?'start':i===4?'end':'middle'} fill="#71818e" fontSize="10" fontFamily="IBM Plex Mono">{date(display[idx].time)}</text>})}
  </svg></div>
  {rsi&&!compare&&<div className="rsi-chart"><div><span>RSI 14</span><b>{rows.at(-1)?.rsi?.toFixed(1)??'—'}</b></div><svg viewBox="0 0 900 90" preserveAspectRatio="none"><line x1="12" x2="830" y1="20" y2="20" stroke="#fb5c68" strokeDasharray="4 4"/><line x1="12" x2="830" y2="70" y1="70" stroke="#00bb7f" strokeDasharray="4 4"/><path d={rows.map((r,i)=>r.rsi===undefined?'':`${i===14?'M':'L'}${x(i)},${20+(100-r.rsi)*.5}`).join(' ')} fill="none" stroke="#a78bfa" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/><text x="840" y="24" fill="#fb5c68" fontSize="11">70</text><text x="840" y="74" fill="#00bb7f" fontSize="11">30</text></svg></div>}
  <div className="chart-legend">{!compare&&sma&&<><span><i style={{background:'#fbbf24'}}/>SMA 20</span><span><i style={{background:'#a78bfa'}}/>SMA 50</span></>}<span className="ml-auto">Yahoo Finance · {history.data?.bars.length} periods</span></div>
 </div>
}
