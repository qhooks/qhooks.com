import{a as P}from"./chunk-VRAKDEGK.js";import{a as V}from"./chunk-FOHTQGYM.js";import{a as x}from"./chunk-WTOLCV55.js";import{a as Q}from"./chunk-GAEQQJUB.js";import{a as q}from"./chunk-LYZWEFNQ.js";import{d as j,n as z}from"./chunk-UNY5LEOQ.js";import{a as B}from"./chunk-QF2S6KQU.js";import"./chunk-2LL4DGRS.js";import"./chunk-ZNPSIS3H.js";import{f as W}from"./chunk-YF74YS5D.js";import"./chunk-RIEZVMUX.js";import"./chunk-WI5AQE6E.js";import"./chunk-G2EGVOAG.js";import"./chunk-BYYUZPEZ.js";import"./chunk-CNPS6EZS.js";import"./chunk-5F7MLAKI.js";import"./chunk-VFENHWBR.js";import"./chunk-WFJ2GFCZ.js";import"./chunk-TWTLXHVY.js";import"./chunk-X4YU7YGY.js";import"./chunk-SEOE7JA6.js";import{b as D}from"./chunk-VNJJKORL.js";import{b as i,f as M}from"./chunk-F6TWI4AD.js";import"./chunk-HBGI4LPK.js";import"./chunk-2TAOFRBU.js";import"./chunk-KT6SLALM.js";import"./chunk-WYLKJDZB.js";import"./chunk-W7MTMRCQ.js";import{a as Z}from"./chunk-ZOZKLYJZ.js";import"./chunk-J7Z5QZMX.js";import"./chunk-DQKGPX2I.js";import"./chunk-J37N74DQ.js";import"./chunk-L6TEW6A7.js";import{h as l,l as $}from"./chunk-FQFCO7FR.js";import"./chunk-7RYXL6MK.js";import{Cb as U,Ea as N,Ua as C,yb as I}from"./chunk-IBXJPBSU.js";import"./chunk-EZHXWC55.js";import"./chunk-ZA34AZXT.js";import{a as Y,b as G}from"./chunk-KC2EEYUX.js";import"./chunk-DACUWK4Z.js";import"./chunk-F2XTKQEC.js";import"./chunk-3U7ZGZNX.js";import"./chunk-24GAJID6.js";import"./chunk-LIZTGNAB.js";import"./chunk-V4KO6E7G.js";import"./chunk-VZLDHQLL.js";import"./chunk-IVAP4BKH.js";import"./chunk-FXDL2Q6E.js";import{f as L}from"./chunk-6DSDX2NM.js";var e=L(G(),1),s=L(Y(),1),y=L(Z(),1);var ee=i.div`
  width: 100%;
`,re=i.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem;
  height: 56px;
  background: ${r=>r.$disabled?"var(--privy-color-background-2)":"var(--privy-color-background)"};
  border: 1px solid var(--privy-color-foreground-4);
  border-radius: var(--privy-border-radius-md);

  &:hover {
    border-color: ${r=>r.$disabled?"var(--privy-color-foreground-4)":"var(--privy-color-foreground-3)"};
  }
`,te=i.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
`,H=i.span`
  display: block;
  font-size: 16px;
  line-height: 24px;
  color: ${r=>r.$disabled?"var(--privy-color-foreground-2)":"var(--privy-color-foreground)"};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* Single-line truncation: as a flex item this would otherwise be floored at its
     min-content width, so min-width: 0 lets it shrink and the ellipsis land at the
     container edge. */
  min-width: 0;

  @media (min-width: 441px) {
    font-size: 14px;
    line-height: 20px;
  }
`,ae=i(H)`
  color: var(--privy-color-foreground-3);
  font-style: italic;
`,oe=i(V)`
  margin-bottom: 0.5rem;
`,ie=i(W)`
  && {
    gap: 0.375rem;
    font-size: 14px;
    flex-shrink: 0;
  }
`,ne=({value:r,title:m,placeholder:c,className:t,showCopyButton:d=!0,truncate:n,maxLength:u=40,disabled:p=!1})=>{let[h,w]=(0,s.useState)(!1),E=n&&r?((a,T,f)=>{if((a=a.startsWith("https://")?a.slice(8):a).length<=f)return a;if(T==="middle"){let b=Math.ceil(f/2)-2,k=Math.floor(f/2)-1;return`${a.slice(0,b)}...${a.slice(-k)}`}return`${a.slice(0,f-3)}...`})(r,n,u):r;return(0,s.useEffect)((()=>{if(h){let a=setTimeout((()=>w(!1)),3e3);return()=>clearTimeout(a)}}),[h]),(0,e.jsxs)(ee,{className:t,children:[m&&(0,e.jsx)(oe,{children:m}),(0,e.jsxs)(re,{$disabled:p,children:[(0,e.jsx)(te,{children:r?(0,e.jsx)(H,{$disabled:p,title:r,children:E}):(0,e.jsx)(ae,{$disabled:p,children:c||"No value"})}),d&&r&&(0,e.jsx)(ie,{onClick:function(a){a.stopPropagation(),navigator.clipboard.writeText(r).then((()=>w(!0))).catch(console.error)},size:"sm",children:(0,e.jsxs)(e.Fragment,h?{children:["Copied",(0,e.jsx)(j,{size:14})]}:{children:["Copy",(0,e.jsx)(z,{size:14})]})})]})]})},se=({connectUri:r,loading:m,success:c,errorMessage:t,onBack:d,onClose:n,onOpenFarcaster:u})=>(0,e.jsx)(B,y.isMobile||m?y.isIOS?{title:t?t.message:"Sign in with Farcaster",subtitle:t?t.detail:"To sign in with Farcaster, please open the Farcaster app.",icon:x,iconVariant:"loading",iconLoadingStatus:{success:c,fail:!!t},primaryCta:r&&u?{label:"Open Farcaster app",onClick:u}:void 0,onBack:d,onClose:n,watermark:!0}:{title:t?t.message:"Signing in with Farcaster",subtitle:t?t.detail:"This should only take a moment",icon:x,iconVariant:"loading",iconLoadingStatus:{success:c,fail:!!t},onBack:d,onClose:n,watermark:!0,children:r&&y.isMobile&&(0,e.jsx)(le,{children:(0,e.jsx)(P,{text:"Take me to Farcaster",url:r,color:"#8a63d2"})})}:{title:"Sign in with Farcaster",subtitle:"Scan with your phone's camera to continue.",onBack:d,onClose:n,watermark:!0,children:(0,e.jsxs)(ce,{children:[(0,e.jsx)(de,{children:r?(0,e.jsx)(Q,{url:r,size:275,squareLogoElement:x}):(0,e.jsx)(pe,{children:(0,e.jsx)(M,{})})}),(0,e.jsxs)(me,{children:[(0,e.jsx)(ue,{children:"Or copy this link and paste it into a phone browser to open the Farcaster app."}),r&&(0,e.jsx)(ne,{value:r,truncate:"end",maxLength:30,showCopyButton:!0,disabled:!0})]})]})}),Fe={component:()=>{let{authenticated:r,logout:m,ready:c,user:t}=U(),{lastScreen:d,navigate:n,navigateBack:u,setModalData:p}=D(),h=I(),{getAuthFlow:w,loginWithFarcaster:E,closePrivyModal:a,createAnalyticsEvent:T}=N(),[f,b]=(0,s.useState)(void 0),[k,J]=(0,s.useState)(!1),[S,K]=(0,s.useState)(!1),A=(0,s.useRef)([]),R=w(),F=R?.meta.connectUri;return(0,s.useEffect)((()=>{let g=Date.now(),O=setInterval((async()=>{let _=await R.pollForReady.execute(),X=Date.now()-g;if(_){clearInterval(O),J(!0);try{await E(),K(!0)}catch(o){let v={retryable:!1,message:"Authentication failed"};if(o?.privyErrorCode===l.ALLOWLIST_REJECTED)return void n("AllowlistRejectionScreen");if(o?.privyErrorCode===l.USER_LIMIT_REACHED)return console.error(new $(o).toString()),void n("UserLimitReachedScreen");if(o?.privyErrorCode===l.USER_DOES_NOT_EXIST)return void n("AccountNotFoundScreen");if(o?.privyErrorCode===l.LINKED_TO_ANOTHER_USER)v.detail=o.message??"This account has already been linked to another user.";else{if(o?.privyErrorCode===l.ACCOUNT_TRANSFER_REQUIRED&&o.data?.data?.nonce)return p({accountTransfer:{nonce:o.data?.data?.nonce,account:o.data?.data?.subject,displayName:o.data?.data?.account?.displayName,linkMethod:"farcaster",embeddedWalletAddress:o.data?.data?.otherUser?.embeddedWalletAddress,farcasterEmbeddedAddress:o.data?.data?.otherUser?.farcasterEmbeddedAddress}}),void n("LinkConflictScreen");o?.privyErrorCode===l.INVALID_CREDENTIALS?(v.retryable=!0,v.detail="Something went wrong. Try again."):o?.privyErrorCode===l.TOO_MANY_REQUESTS&&(v.detail="Too many requests. Please wait before trying again.")}b(v)}}else X>12e4&&(clearInterval(O),b({retryable:!0,message:"Authentication failed",detail:"The request timed out. Try again."}))}),2e3);return()=>{clearInterval(O),A.current.forEach((_=>clearTimeout(_)))}}),[]),(0,s.useEffect)((()=>{if(c&&r&&S&&t){if(h?.legal.requireUsersAcceptTerms&&!t.hasAcceptedTerms){let g=setTimeout((()=>{n("AffirmativeConsentScreen")}),C);return()=>clearTimeout(g)}S&&(q(t,h.embeddedWallets)?A.current.push(setTimeout((()=>{p({createWallet:{onSuccess:()=>{},onFailure:g=>{console.error(g),T({eventName:"embedded_wallet_creation_failure_logout",payload:{error:g,screen:"FarcasterConnectStatusScreen"}}),m()},callAuthOnSuccessOnClose:!0}}),n("EmbeddedWalletOnAccountCreateScreen")}),C)):A.current.push(setTimeout((()=>a({shouldCallAuthOnSuccess:!0,isSuccess:!0})),C)))}}),[S,c,r,t]),(0,e.jsx)(se,{connectUri:F,loading:k,success:S,errorMessage:f,onBack:d?u:void 0,onClose:a,onOpenFarcaster:()=>{F&&(window.location.href=F)}})}},le=i.div`
  margin-top: 24px;
`,ce=i.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,de=i.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,me=i.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,ue=i.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,pe=i.div`
  position: relative;
  width: 82px;
  height: 82px;
`;export{Fe as FarcasterConnectStatusScreen,se as FarcasterConnectStatusView,Fe as default};
