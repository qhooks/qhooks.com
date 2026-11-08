import{a as z,b as k}from"./chunk-ECBROGFZ.js";import{a as j}from"./chunk-KWXXC6GG.js";import{g as P}from"./chunk-JEBINBJH.js";import{F as M}from"./chunk-DM5NEEIC.js";import{a as O}from"./chunk-WC2EY42X.js";import"./chunk-MAUWKYZJ.js";import"./chunk-OHKBJT6X.js";import"./chunk-PEVEGWCU.js";import{b as N}from"./chunk-LQPDG4MJ.js";import{b as d}from"./chunk-P2R4JUPY.js";import{c as x,d as C}from"./chunk-KGUKKP5O.js";import"./chunk-BPUZ6RLX.js";import"./chunk-JOVAO25S.js";import"./chunk-TVFDJZSL.js";import"./chunk-VAAWCP7Q.js";import{Cb as A,Ea as _,S as f,Ua as U,qb as L}from"./chunk-3ZOA7PGW.js";import"./chunk-WLTM2YAA.js";import"./chunk-IORXHIGS.js";import{a as H,b as K}from"./chunk-SSB2RMIS.js";import"./chunk-PT4SHXEW.js";import{b as D}from"./chunk-4LGYWQQG.js";import"./chunk-ZVHCZI33.js";import"./chunk-47AAZFBS.js";import"./chunk-QIMRETM2.js";import{oa as v,v as R}from"./chunk-LL5T6DPV.js";import"./chunk-UFZP3A3J.js";import"./chunk-TAR2MLNN.js";import"./chunk-V4MSKD3Y.js";import{f as T}from"./chunk-6DSDX2NM.js";var t=T(K(),1);var o=T(H(),1);var B=d.img`
  && {
    height: ${e=>e.size==="sm"?"65px":"140px"};
    width: ${e=>e.size==="sm"?"65px":"140px"};
    border-radius: 16px;
    margin-bottom: 12px;
  }
`,G=e=>{if(!R(e))return e;try{let i=v(e);return i.includes("\uFFFD")?e:i}catch{return e}},X=e=>{try{let i=D.decode(e),r=new TextDecoder().decode(i);return r.includes("\uFFFD")?e:r}catch{return e}},Y=e=>{let{types:i,primaryType:r,...l}=e.typedData;return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(ie,{data:l}),(0,t.jsx)(j,{text:(n=e.typedData,JSON.stringify(n,null,2)),itemName:"full payload to clipboard"})," "]});var n},Z=({method:e,messageData:i,copy:r,iconUrl:l,isLoading:n,success:u,walletProxyIsLoading:g,errorMessage:h,isCancellable:m,onSign:c,onCancel:S,onClose:p})=>(0,t.jsx)(O,{title:r.title,subtitle:r.description,showClose:!0,onClose:p,icon:M,iconVariant:"subtle",helpText:h?(0,t.jsx)(te,{children:h}):void 0,primaryCta:{label:r.buttonText,onClick:c,disabled:n||u||g,loading:n},secondaryCta:m?{label:"Not now",onClick:S,disabled:n||u||g}:void 0,watermark:!0,children:(0,t.jsxs)(P,{children:[l?(0,t.jsx)(B,{style:{alignSelf:"center"},size:"sm",src:l,alt:"app image"}):null,(0,t.jsxs)(ee,{children:[e==="personal_sign"&&(0,t.jsx)(F,{children:G(i)}),e==="eth_signTypedData_v4"&&(0,t.jsx)(Y,{typedData:i}),e==="solana_signMessage"&&(0,t.jsx)(F,{children:X(i)})]})]})}),ye={component:()=>{let{authenticated:e}=A(),{initializeWalletProxy:i,closePrivyModal:r}=_(),{navigate:l,data:n,onUserCloseViaDialogOrKeybindRef:u}=N(),[g,h]=(0,o.useState)(!0),[m,c]=(0,o.useState)(""),[S,p]=(0,o.useState)(),[E,w]=(0,o.useState)(null),[I,b]=(0,o.useState)(!1);(0,o.useEffect)((()=>{e||l("LandingScreen")}),[e]),(0,o.useEffect)((()=>{i(L).then((a=>{h(!1),a||(c("An error has occurred, please try again."),p(new C(new x(m,f.E32603_DEFAULT_INTERNAL_ERROR.eipCode))))}))}),[]);let{method:q,data:V,confirmAndSign:J,onSuccess:Q,onFailure:W,uiOptions:s}=n.signMessage,$={title:s?.title||"Sign message",description:s?.description||"Signing this message will not cost you any fees.",buttonText:s?.buttonText||"Sign and continue"},y=a=>{a?Q(a):W(S||new C(new x("The user rejected the request.",f.E4001_USER_REJECTED_REQUEST.eipCode))),r({shouldCallAuthOnSuccess:!1}),setTimeout((()=>{w(null),c(""),p(void 0)}),200)};return u.current=()=>{y(E)},(0,t.jsx)(Z,{method:q,messageData:V,copy:$,iconUrl:s?.iconUrl&&typeof s.iconUrl=="string"?s.iconUrl:void 0,isLoading:I,success:E!==null,walletProxyIsLoading:g,errorMessage:m,isCancellable:s?.isCancellable,onSign:async()=>{b(!0),c("");try{let a=await J();w(a),b(!1),setTimeout((()=>{y(a)}),U)}catch(a){console.error(a),c("An error has occurred, please try again."),p(new C(new x(m,f.E32603_DEFAULT_INTERNAL_ERROR.eipCode))),b(!1)}},onCancel:()=>y(null),onClose:()=>y(E)})}},ee=d.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
`,te=d.p`
  && {
    margin: 0;
    width: 100%;
    text-align: center;
    color: var(--privy-color-error-dark);
    font-size: 14px;
    line-height: 22px;
  }
`,ie=d(k)`
  margin-top: 0;
`,F=d(z)`
  margin-top: 0;
`;export{ye as SignRequestScreen,Z as SignRequestView,ye as default};
