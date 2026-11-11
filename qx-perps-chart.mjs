import {candles} from './qx-perps-data.mjs';
import {el,usd,num} from './qx-perps-ui.mjs';

// The locally vendored chart is v4. Size the chart from the card's content box.
export function createPerpsChart({lib,container,color,onStatus,loadSnapshot=candles,ResizeObserverImpl=ResizeObserver}) {
  const chart=lib.createChart(container,{
    autoSize:false,
    layout:{background:{type:lib.ColorType.Solid,color:'transparent'},textColor:color('--qx-muted'),fontFamily:'ui-monospace, monospace'},
    grid:{vertLines:{visible:false},horzLines:{color:color('--qxt-grid')}},
    timeScale:{timeVisible:true,borderVisible:false},rightPriceScale:{borderVisible:false},handleScroll:{vertTouchDrag:false},
    ...(lib.TrackingModeExitMode?{trackingMode:{exitMode:lib.TrackingModeExitMode.OnTouchEnd}}:{})
  });
  const series=chart.addCandlestickSeries({upColor:color('--qxt-up'),downColor:color('--qxt-down'),borderVisible:false,wickUpColor:color('--qxt-up'),wickDownColor:color('--qxt-down')});
  let sequence=0,lastBar=0,disposed=false,latest=null,hoverTime=null,coinUnit='',barsByTime=new Map();
  const legend=container.append?el('div','',{class:'qxt-chart-ohlc',hidden:true,'aria-label':'Candle values'}):null;
  function renderReadout(){
    if(!legend)return;
    const bar=barsByTime.get(hoverTime)||latest;
    legend.hidden=!bar;if(!bar)return;
    const change=bar.open!==0?(bar.close/bar.open-1)*100:null;
    legend.replaceChildren(...['open','high','low','close'].map(key=>{
      const field=el('span','',{class:'qxt-chart-ohlc-field'});field.append(el('span',key[0].toUpperCase()+' ',{class:'qxt-chart-ohlc-label'}),usd(bar[key]));return field;
    }),el('span',Number.isFinite(change)?(change>0?'+':'')+change.toFixed(2)+'%':'—',{class:'qxt-chart-ohlc-change '+(bar.close>=bar.open?'up':'down')}),
    ...(Number.isFinite(bar.volume)?[el('span','Vol '+num(bar.volume)+' '+coinUnit,{class:'qxt-chart-ohlc-volume'})]:[]));
    legend.style.right=(chart.priceScale('right').width()+8)+'px';
  }
  const resetReadout=()=>{hoverTime=null;renderReadout();};
  const crosshair=param=>{
    const point=param.point,scale=chart.timeScale();
    hoverTime=point&&point.x>=0&&point.x<scale.width()&&point.y>=0&&point.y<container.clientHeight-scale.height()&&param.seriesData?.has(series)?param.time:null;
    renderReadout();
  };
  if(legend){
    container.append(legend);chart.subscribeCrosshairMove(crosshair);chart.timeScale().subscribeSizeChange(renderReadout);
    container.addEventListener('mouseleave',resetReadout);
    container.addEventListener('touchend',resetReadout,{passive:true});
    container.addEventListener('touchcancel',resetReadout,{passive:true});
  }
  const resize=()=>{const {width,height}=container.getBoundingClientRect();if(width>0&&height>0)chart.resize(Math.floor(width),Math.floor(height));};
  resize();
  const observer=new ResizeObserverImpl(resize);observer.observe(container);
  return {
    chart,series,get lastBar(){return lastBar;},
    async load(coin,interval,{reset=true}={}) {
      const request=++sequence;
      if(reset){lastBar=0;latest=null;hoverTime=null;barsByTime.clear();coinUnit=coin;series.setData([]);if(legend)chart.clearCrosshairPosition();renderReadout();container.dataset.candleCount='0';}
      onStatus('Refreshing');
      try {
        const bars=await loadSnapshot(coin,interval);
        if(disposed||request!==sequence)return;
        series.setData(bars);lastBar=bars.at(-1)?.time||0;
        barsByTime=new Map(bars.map(bar=>[bar.time,bar]));latest=bars.at(-1)||null;renderReadout();
        resize();if(reset)chart.timeScale().fitContent();
        container.dataset.candleCount=String(bars.length);
        onStatus(bars.length?'':'No candles yet.');
      } catch {
        if(!disposed&&request===sequence)onStatus('Could not load candles. Try another timeframe.');
      }
    },
    update(bar){if(!disposed&&lastBar&&bar.time>=lastBar){series.update(bar);lastBar=bar.time;barsByTime.set(bar.time,bar);latest=bar;renderReadout();}},
    dispose(){disposed=true;sequence++;observer.disconnect();if(legend){chart.unsubscribeCrosshairMove(crosshair);chart.timeScale().unsubscribeSizeChange(renderReadout);for(const event of ['mouseleave','touchend','touchcancel'])container.removeEventListener(event,resetReadout);legend.remove();}chart.remove();}
  };
}

export function feedStatus(requests,socketStatus){return requests>0||socketStatus==='Refreshing'?'Refreshing':'Live';}
