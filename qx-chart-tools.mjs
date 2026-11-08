export function ema(bars,period){
 const out=[];let sum=0,value=null;const alpha=2/(period+1);
 bars.forEach((b,i)=>{sum+=b.close;if(i===period-1)value=sum/period;else if(i>=period)value=b.close*alpha+value*(1-alpha);if(value!==null)out.push({time:b.time,value});});return out;
}
export function sessionVwap(bars){
 const out=[];let session=null,volume=0,weighted=0;
 for(const b of bars){const day=Math.floor(b.time/86400);if(day!==session){session=day;volume=weighted=0;}const typical=(b.high+b.low+b.close)/3,quoted=Number.isFinite(b.quoteVolume)?b.quoteVolume:b.volume,base=Number.isFinite(b.baseVolume)&&b.baseVolume>0?b.baseVolume:b.volumeKind==='quote'&&typical>0?quoted/typical:b.volume;if(Number.isFinite(base)&&base>0){weighted+=Number.isFinite(b.baseVolume)&&b.baseVolume>0&&Number.isFinite(b.quoteVolume)?b.quoteVolume:typical*base;volume+=base;}if(volume)out.push({time:b.time,value:weighted/volume});}return out;
}
export function rsi(bars,period=14){
 const out=[];let gain=0,loss=0;for(let i=1;i<bars.length;i++){const delta=bars[i].close-bars[i-1].close,g=Math.max(0,delta),l=Math.max(0,-delta);if(i<=period){gain+=g;loss+=l;if(i===period){gain/=period;loss/=period;}}else{gain=(gain*(period-1)+g)/period;loss=(loss*(period-1)+l)/period;}if(i>=period)out.push({time:bars[i].time,value:loss===0?(gain===0?50:100):100-100/(1+gain/loss)});}return out;
}
const TYPES=['horizontal','trend','fib','measure'];
export function validateDrawing(raw){
 if(!raw||!TYPES.includes(raw.type)||!Array.isArray(raw.points)||raw.points.length!==(raw.type==='horizontal'?1:2))throw Error('Choose valid drawing anchors.');
 const points=raw.points.map(p=>{if(!Number.isFinite(p.time)||p.time<=0||p.time>4e9||!Number.isFinite(p.price)||p.price<=0)throw Error('Drawing times and prices must be positive.');return {time:p.time,price:p.price};});
 return {type:raw.type,points};
}
const KEY='qhooks:terminal:chart-tools:v1';
const defaults=()=>({ema20:false,ema50:false,vwap:false,rsi:false,volume:true,log:false});
const cleanSettings=value=>Object.fromEntries(Object.keys(defaults()).map(k=>[k,typeof value?.[k]==='boolean'?value[k]:defaults()[k]]));
export function createChartMemory(storage){
 function read(){try{const raw=storage?.getItem(KEY);if(!raw||raw.length>200000)return {version:1,settings:defaults(),drawings:{}};const value=JSON.parse(raw);if(value.version!==1||!value.drawings||typeof value.drawings!=='object')throw Error();return {version:1,settings:cleanSettings(value.settings),drawings:value.drawings};}catch{return {version:1,settings:defaults(),drawings:{}};}}
 const write=value=>{const text=JSON.stringify(value);if(text.length>200000)throw Error('Drawing storage is full. Remove an older drawing before saving.');if(!storage?.setItem)throw Error('Chart storage is unavailable.');storage.setItem(KEY,text);};
 return {settings:()=>read().settings,drawings(key){try{const rows=read().drawings[key];return Array.isArray(rows)&&rows.length<=50?rows.map(validateDrawing):[];}catch{return [];}},saveSettings(value){const record=read();record.settings=cleanSettings(value);write(record);},saveDrawings(key,rows){if(rows.length>50)throw Error('Keep at most fifty drawings per token and chart unit.');const record=read();record.drawings[key]=rows.map(validateDrawing);write(record);}};
}
export function mountChartTools({h,chart,candles,volume,element,storage}){
 const memory=createChartMemory(storage),settings=memory.settings(),series={};let bars=[],asset=null,drawings=[],mode=null,anchor=null,undo=[],frame=null,anchorsSeeded=false;
 const toolbar=h('div',{class:'qxt-chart-tools',ariaLabel:'Chart tools'}),indicators=h('details',{},h('summary',{},'Indicators')),draw=h('details',{},h('summary',{},'Draw'));
 const chartLabel=h('b',{class:'qxt-chart-asset'});
 const status=h('span',{class:'qxt-chart-tool-status',role:'status',ariaLive:'polite'}),stage=h('section',{class:'qxt-chart-stage',ariaLabel:'Token chart'});
 element.before(stage);stage.append(toolbar,element);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','qxt-chart-drawings');svg.setAttribute('aria-hidden','true');element.append(svg);
 function line(name,color,scale='right'){return chart.addLineSeries({color,lineWidth:1,priceScaleId:scale,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false});}
 series.ema20=line('ema20','#d6b578');series.ema50=line('ema50','#8fa7e7');series.vwap=line('vwap','#b39bd1');series.rsi=line('rsi','#8cbea7','rsi');
 chart.priceScale('rsi').applyOptions({scaleMargins:{top:.68,bottom:.08}});series.rsi.applyOptions({autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:100}})});
 for(const price of [30,70])series.rsi.createPriceLine({price,color:'#627365',lineWidth:1,lineStyle:2,axisLabelVisible:false});
 function save(){try{memory.saveSettings(settings);}catch(e){status.textContent=e.message;}}
 function updateIndicators(){
  series.ema20.setData(settings.ema20?ema(bars,20):[]);series.ema50.setData(settings.ema50?ema(bars,50):[]);series.vwap.setData(settings.vwap?sessionVwap(bars):[]);const values=settings.rsi?rsi(bars):[];series.rsi.setData(values);
  volume.applyOptions({visible:settings.volume&&!settings.rsi});chart.priceScale('right').applyOptions({mode:settings.log?1:0,scaleMargins:{top:.12,bottom:settings.rsi ? .4 : .24}});
  if(values.length)status.textContent='RSI 14 · '+values.at(-1).value.toFixed(1)+' · Volume hidden while RSI is open';
  else if(settings.rsi)status.textContent='RSI 14 needs fifteen candles.';else if(!mode)status.textContent='Drawings saved per token and chart unit.';
  schedule();
 }
 for(const [key,label]of [['ema20','EMA 20'],['ema50','EMA 50'],['vwap','VWAP · UTC / bar estimate'],['rsi','RSI 14'],['volume','Volume']]){
  const input=h('input',{type:'checkbox',checked:settings[key],ariaLabel:label});input.addEventListener('change',()=>{settings[key]=input.checked;save();updateIndicators();});indicators.append(h('label',{},input,label));
 }
 const tools=h('div',{class:'qxt-drawing-modes'});for(const [key,label]of [['horizontal','Level'],['trend','Trend'],['fib','Fib'],['measure','Measure']]){
  const b=h('button',{type:'button','data-drawing':key,ariaPressed:'false'},label);b.addEventListener('click',()=>{mode=mode===key?null:key;anchor=null;for(const b of tools.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.drawing===mode));status.textContent=mode?'Tap '+(mode==='horizontal'?'one price':'two anchors')+' on the chart, or enter anchors below.':'Drawing cancelled.';});tools.append(b);
 }
 const form=h('div',{class:'qxt-drawing-form'}),kind=h('select',{ariaLabel:'Drawing type'},...TYPES.map(v=>h('option',{value:v},v==='fib'?'Fibonacci':v[0].toUpperCase()+v.slice(1))));
 const inputs={};for(const [key,label,type]of [['timeA','Start time','datetime-local'],['priceA','Start price','text'],['timeB','End time','datetime-local'],['priceB','End price','text']]){inputs[key]=h('input',{type,ariaLabel:label,...(type==='text'?{inputmode:'decimal'}:{step:1})});form.append(h('label',{},h('span',{},label),inputs[key]));}
 const add=h('button',{type:'button'},'Add drawing'),remove=h('button',{type:'button'},'Undo'),clear=h('button',{type:'button'},'Clear drawings');
 const dateString=time=>{const d=new Date(time*1000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19);};
 const commit=row=>{if(!asset)return;const next=[...drawings,validateDrawing(row)];memory.saveDrawings(asset,next);undo.push(drawings);undo=undo.slice(-20);drawings=next;schedule();status.textContent='Drawing saved.';};
 add.addEventListener('click',()=>{try{const point=(time,price)=>({time:Date.parse(time)/1000,price:Number(price)});commit({type:kind.value,points:[point(inputs.timeA.value,inputs.priceA.value),...(kind.value==='horizontal'?[]:[point(inputs.timeB.value,inputs.priceB.value)])]});}catch(e){status.textContent=e.message;}});
 remove.addEventListener('click',()=>{try{if(!asset||!undo.length)return;const next=undo.at(-1);memory.saveDrawings(asset,next);drawings=undo.pop();schedule();status.textContent='Drawing change undone.';}catch(e){status.textContent=e.message;}});
 clear.addEventListener('click',()=>{try{if(!asset||!drawings.length)return;memory.saveDrawings(asset,[]);undo.push(drawings);drawings=[];schedule();status.textContent='Drawings cleared. Undo restores them.';}catch(e){status.textContent=e.message;}});
 draw.append(tools,h('details',{},h('summary',{},'Enter anchors'),h('label',{},'Type',kind),form,add),remove,clear);
 const log=h('button',{type:'button',ariaPressed:String(settings.log)},'Log'),fit=h('button',{type:'button'},'Fit'),full=h('button',{type:'button'},'Expand');
 log.addEventListener('click',()=>{settings.log=!settings.log;log.setAttribute('aria-pressed',String(settings.log));save();updateIndicators();});fit.addEventListener('click',()=>{chart.timeScale().fitContent();schedule();});full.addEventListener('click',async()=>{try{if(document.fullscreenElement===stage)await document.exitFullscreen();else await stage.requestFullscreen();}catch{status.textContent='Use your browser’s full-screen control to expand this chart.';}});
 document.addEventListener('fullscreenchange',()=>{const on=document.fullscreenElement===stage;full.textContent=on?'Collapse':'Expand';full.setAttribute('aria-pressed',String(on));full.title=on?'Exit fullscreen':'Enter fullscreen';schedule();});
 toolbar.append(chartLabel,indicators,draw,log,fit,full,status);
 function node(type,attrs,text){const n=document.createElementNS('http://www.w3.org/2000/svg',type);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.append(n);return n;}
 function timeCoordinate(time){const direct=chart.timeScale().timeToCoordinate(time);if(direct!==null||bars.length<2)return direct;let i=bars.findIndex(b=>b.time>=time);if(i<0)i=bars.length-1;else if(i===0)i=1;const a=bars[i-1],b=bars[i],logical=i-1+(time-a.time)/(b.time-a.time);return chart.timeScale().logicalToCoordinate(logical);}
 function render(){frame=null;const width=Math.max(0,element.clientWidth-65),height=Math.max(0,element.clientHeight-28);svg.setAttribute('viewBox','0 0 '+element.clientWidth+' '+element.clientHeight);svg.replaceChildren();
  for(const d of drawings){const points=d.points.map(p=>({x:timeCoordinate(p.time),y:candles.priceToCoordinate(p.price)})),a=points[0],b=points[1];if(a.y===null)continue;
   const attrs={stroke:'#d6b578','stroke-width':1.2,fill:'none'};
   if(d.type==='horizontal'){node('line',{...attrs,x1:0,y1:a.y,x2:width,y2:a.y});node('text',{x:8,y:Math.max(13,Math.min(height-3,a.y-5)),fill:'#d6b578','font-size':11},Number(d.points[0].price.toPrecision(7)).toString());}
   else if(a.x!==null&&b?.x!==null&&b?.y!==null){
    if(d.type==='trend')node('line',{...attrs,x1:a.x,y1:a.y,x2:b.x,y2:b.y});
    if(d.type==='measure'){node('rect',{...attrs,x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:'#d6b57815','stroke-dasharray':'4 3'});node('text',{x:Math.max(8,Math.min(width-110,Math.min(a.x,b.x)+5)),y:Math.max(14,Math.min(height-4,Math.min(a.y,b.y)-6)),fill:'#d6b578','font-size':11},((d.points[1].price/d.points[0].price-1)*100).toFixed(2)+'% · '+Math.round(Math.abs(d.points[1].time-d.points[0].time)/60)+'m');}
    if(d.type==='fib')for(const level of [0,.236,.382,.5,.618,1]){const y=a.y+(b.y-a.y)*level;node('line',{...attrs,x1:Math.min(a.x,b.x),y1:y,x2:Math.max(a.x,b.x),y2:y,opacity:.7});node('text',{x:Math.min(a.x,b.x)+4,y:y-4,fill:'#d6b578','font-size':10},String(level));}
   }
  }
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(render);}
 chart.subscribeClick(param=>{if(!mode||!asset||!param.point||typeof param.time!=='number')return;const price=candles.coordinateToPrice(param.point.y);if(!(price>0))return;const point={time:param.time,price};try{if(mode==='horizontal')commit({type:mode,points:[point]});else if(!anchor){anchor=point;status.textContent='First anchor set. Tap the second anchor.';return;}else commit({type:mode,points:[anchor,point]});mode=null;anchor=null;for(const b of tools.querySelectorAll('button'))b.setAttribute('aria-pressed','false');}catch(e){status.textContent=e.message;}});
 chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);element.addEventListener('pointermove',schedule,{passive:true});element.addEventListener('wheel',schedule,{passive:true});const resize=new ResizeObserver(schedule);resize.observe(element);
 return {update({key,data,label='Token chart'}){chartLabel.textContent=label;stage.setAttribute('aria-label',label+' chart');if(key!==asset){asset=key;anchorsSeeded=false;drawings=memory.drawings(key);undo=[];mode=null;anchor=null;for(const b of tools.querySelectorAll('button'))b.setAttribute('aria-pressed','false');}bars=data;if(bars.length&&!anchorsSeeded){anchorsSeeded=true;const a=bars[Math.max(0,bars.length-30)],b=bars.at(-1);inputs.timeA.value=dateString(a.time);inputs.timeB.value=dateString(b.time);inputs.priceA.value=String(a.close);inputs.priceB.value=String(b.close);}updateIndicators();},clear(){asset=null;anchorsSeeded=false;bars=[];drawings=[];for(const s of Object.values(series))s.setData([]);schedule();},element:toolbar};
}
