export const labelBoxesIntersect=(a,b,gap=0)=>a.left<b.right+gap&&a.right+gap>b.left&&a.top<b.bottom+gap&&a.bottom+gap>b.top;

// The chart still owns and paints aboveBar/belowBar shapes. Labels use measured
// DOM dimensions so canvas text cannot overprint a neighbouring label.
export function markerLabelLayout(candidates,{width,height,gap=3}={}){
  const accepted=[];
  // Reserve the short personal trade labels before any optional wallet labels.
  for(const candidate of [...candidates].sort((a,b)=>(b.layer==='you')-(a.layer==='you')||a.time-b.time)){
    const {left,top,right,bottom}=candidate;
    if(![left,top,right,bottom].every(Number.isFinite)||left<0||top<0||right>width||bottom>height)continue;
    if(accepted.some(other=>labelBoxesIntersect(candidate,other,gap)))continue;
    accepted.push(candidate);
  }
  return accepted;
}

// Native series markers have no DOM hit box. Derive a generous touch rectangle
// around each bar/side's shape stack using the chart's public coordinate APIs.
// point is the first visible native shape centre, not the rectangle's centre.
export function markerTapLayout(markers,bars,{xFor,yFor,width,height,spacing=12}){
  const groups=new Map(),targets=[],rounded=Math.round(Math.min(30,Math.max(12,spacing))),base=rounded-rounded%2;
  for(const marker of markers){const id=marker.time+':'+marker.position,group=groups.get(id)||{id,time:marker.time,position:marker.position,markers:[]};group.markers.push(marker);groups.set(id,group);}
  for(const group of groups.values()){
    const bar=bars.find(b=>b.time===group.time),x=xFor(group.time);if(!bar||x==null||!Number.isFinite(x)||x<0||x>width||width<32||height<32)continue;
    const below=group.position==='belowBar',anchor=yFor(below?bar.low:bar.high);if(anchor==null||!Number.isFinite(anchor))continue;
    let offset=3;const centres=[];
    for(const marker of group.markers){const size=base*(Number.isFinite(marker.size)?Math.max(0,marker.size):1),y=anchor+(below?1:-1)*(offset+size/2);if(y>=0&&y<=height)centres.push(y);offset+=size+3;}
    if(!centres.length)continue;
    const left=Math.max(0,Math.min(width-32,x-16)),targetHeight=Math.min(height,Math.max(32,Math.max(...centres)-Math.min(...centres)+32)),top=Math.max(0,Math.min(height-targetHeight,Math.min(...centres)-16));
    targets.push({...group,left,top,right:left+32,bottom:top+targetHeight,point:{x,y:centres[0]}});
  }
  return targets;
}
export function markerTargetAtPoint(targets,point){
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return null;
  return targets.filter(t=>point.x>=t.left&&point.x<=t.right&&point.y>=t.top&&point.y<=t.bottom).sort((a,b)=>Math.abs(a.point.x-point.x)-Math.abs(b.point.x-point.x)||Math.abs(a.point.y-point.y)-Math.abs(b.point.y-point.y))[0]||null;
}
