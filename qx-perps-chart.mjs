import {candles} from './qx-perps-data.mjs';

// The locally vendored chart is v4. Size the chart from the card's content box.
export function createPerpsChart({lib,container,color,onStatus,loadSnapshot=candles,ResizeObserverImpl=ResizeObserver}) {
  const chart=lib.createChart(container,{
    autoSize:false,
    layout:{background:{type:lib.ColorType.Solid,color:'transparent'},textColor:color('--qx-muted'),fontFamily:'ui-monospace, monospace'},
    grid:{vertLines:{visible:false},horzLines:{color:color('--qxt-grid')}},
    timeScale:{timeVisible:true,borderVisible:false},rightPriceScale:{borderVisible:false},handleScroll:{vertTouchDrag:false}
  });
  const series=chart.addCandlestickSeries({upColor:color('--qxt-up'),downColor:color('--qxt-down'),borderVisible:false,wickUpColor:color('--qxt-up'),wickDownColor:color('--qxt-down')});
  let sequence=0,lastBar=0,disposed=false;
  const resize=()=>{const {width,height}=container.getBoundingClientRect();if(width>0&&height>0)chart.resize(Math.floor(width),Math.floor(height));};
  resize();
  const observer=new ResizeObserverImpl(resize);observer.observe(container);
  return {
    chart,series,get lastBar(){return lastBar;},
    async load(coin,interval,{reset=true}={}) {
      const request=++sequence;
      if(reset){lastBar=0;series.setData([]);container.dataset.candleCount='0';}
      onStatus('Refreshing');
      try {
        const bars=await loadSnapshot(coin,interval);
        if(disposed||request!==sequence)return;
        series.setData(bars);lastBar=bars.at(-1)?.time||0;
        resize();if(reset)chart.timeScale().fitContent();
        container.dataset.candleCount=String(bars.length);
        onStatus(bars.length?'':'No candles yet.');
      } catch {
        if(!disposed&&request===sequence)onStatus('Could not load candles. Try another timeframe.');
      }
    },
    update(bar){if(!disposed&&lastBar&&bar.time>=lastBar){series.update(bar);lastBar=bar.time;}},
    dispose(){disposed=true;sequence++;observer.disconnect();chart.remove();}
  };
}

export function feedStatus(requests,socketStatus){return requests>0||socketStatus==='Refreshing'?'Refreshing':'Live';}
