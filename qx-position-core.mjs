export function sellPortion(balance, percent) {
  if (typeof balance !== 'bigint' || balance < 0n || (!Number.isInteger(percent) || percent < 1 || percent > 100)) throw Error('invalid_sell_portion');
  return balance * BigInt(percent) / 100n;
}
export function positionChart(position, bars, tf, multiplier = 1) {
  const times = new Set(bars.map(b=>b.time));
  return {
    markers:(position?.markers||[]).map(t=>({time:Math.floor(t.at/1000/tf)*tf, position:t.side==='buy'?'belowBar':'aboveBar',
      color:t.side==='buy'?'#38b87c':'#ef625e', shape:t.side==='buy'?'arrowUp':'arrowDown', text:t.side==='buy'?'Buy':'Sell'})).filter(m=>times.has(m.time)),
    entry:position?.quantity>0 && position.averageEntryUsd>0 ? position.averageEntryUsd*multiplier : null,
  };
}

export const CHART_LAYERS=Object.freeze([['you','You'],['following','Following'],['smart','Smart'],['calls','Calls'],['dev','Dev']]);
export function layerPreferences(viewer='guest',{storage=()=>globalThis.localStorage}={}) {
  const key='qhooks:chart-layers:v1:'+String(viewer||'guest'),enabled=Object.fromEntries(CHART_LAYERS.map(([id])=>[id,true]));
  try{const value=JSON.parse(storage().getItem(key)||'{}');for(const [id]of CHART_LAYERS)if(typeof value[id]==='boolean')enabled[id]=value[id];}catch{}
  return {enabled,toggle(id){if(!CHART_LAYERS.some(([name])=>name===id))return;enabled[id]=!enabled[id];try{storage().setItem(key,JSON.stringify(enabled));}catch{}return enabled[id];}};
}
// Extend the existing candle marker adapter. Two shapes per bar/side, with the
// remaining records retained for the chart's +n buttons and accessible list.
export function layerChart(layers,bars,tf,enabled={}, {width=Infinity}={}) {
  const times=new Set(bars.map(b=>b.time)),groups=new Map(),colors={you:'#38b87c',following:'#548fd1',smart:'#aa79d6',calls:'#be8e36',dev:'#858b95'};
  for(const [layer,title]of CHART_LAYERS){if(enabled[layer]===false)continue;
    for(const row of layers?.[layer]||[]){const time=Math.floor(row.at/1000/tf)*tf;if(!times.has(time))continue;
      const side=row.side==='buy'?'belowBar':'aboveBar',key=time+':'+side,group=groups.get(key)||{id:key,time,position:side,rows:[]};
      const label=String(row.label||row.wallet||title).trim();
      const characters=[...label],shortLabel=/^0x[\da-f]{4}/i.test(label)?label.slice(0,6):characters.length>10?characters.slice(0,9).join('')+'…':label;
      const text=layer==='you'?(row.side==='buy'?'Buy':'Sell'):width<768?'':layer==='dev'?'Dev':layer==='calls'?'Call':shortLabel;
      group.rows.push({...row,layer,title,markerText:text});groups.set(key,group);
    }
  }
  const markers=[],clusters=[];
  for(const group of groups.values()){
    group.rows.sort((a,b)=>a.at-b.at||String(a.id).localeCompare(String(b.id)));
    for(const row of group.rows.slice(0,2))markers.push({id:group.id+':'+row.layer+':'+row.id,time:group.time,position:group.position,color:row.layer==='you'&&row.side==='sell'?'#ef625e':colors[row.layer],shape:row.side==='call'?'circle':row.side==='buy'?'arrowUp':'arrowDown',size:0.7,text:row.markerText,layer:row.layer,row,group:group.id});
    if(group.rows.length>2)clusters.push({...group,hidden:group.rows.length-2});
  }
  return {markers:markers.sort((a,b)=>a.time-b.time),clusters,groups:[...groups.values()]};
}
