// World-space fit for the existing portrait word slot, including its 1.3x entrance.
export function portraitWordScale({width,height,cameraZ,maxScale=.48}){
 const halfWidth=Number(cameraZ)*Math.tan(25*Math.PI/180)*Number(width)/Math.max(1,Number(height));
 return Math.max(0,Math.min(maxScale,(halfWidth-.72-.16)/(2.9*1.3)));
}
// Scale around the projected center, retaining a real viewport inset at either camera angle.
export function projectedWordFit({left,right,width,pad=20}){
 const center=(left+right)/2,half=(right-left)/2;
 if(!(half>0)||!(width>2*pad))return 1;
 return Math.max(.01,Math.min(1,(center-pad)/half,(width-pad-center)/half));
}
