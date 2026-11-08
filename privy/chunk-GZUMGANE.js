import{a as H}from"./chunk-37BPIEBG.js";import{a as X}from"./chunk-7CRSEPHH.js";import{a as Y}from"./chunk-5KVPQMU3.js";import{a as Q}from"./chunk-I25SIHSK.js";import{c as Z}from"./chunk-JEBINBJH.js";import{a as z}from"./chunk-WC2EY42X.js";import"./chunk-MAUWKYZJ.js";import"./chunk-OHKBJT6X.js";import"./chunk-PEVEGWCU.js";import"./chunk-WSWME2X3.js";import"./chunk-QFAEJ5B7.js";import"./chunk-OTJJRMHE.js";import"./chunk-D2QO2267.js";import"./chunk-QFRKCQ3D.js";import"./chunk-NMSLQYW3.js";import"./chunk-73QNXXZR.js";import"./chunk-XLIAOHHT.js";import"./chunk-2UUNAQLR.js";import"./chunk-V5PDLNDW.js";import{b as K}from"./chunk-LQPDG4MJ.js";import{b as g}from"./chunk-P2R4JUPY.js";import"./chunk-XSJ4RMKU.js";import"./chunk-4LQPS3FR.js";import"./chunk-KGUKKP5O.js";import"./chunk-RFLRHFSS.js";import"./chunk-BPUZ6RLX.js";import{a as te}from"./chunk-P7F4Q3NS.js";import"./chunk-GA2OQGWH.js";import"./chunk-YS46ZIBJ.js";import"./chunk-KOYUBBGM.js";import"./chunk-JOVAO25S.js";import{b as f,h as v,l as V}from"./chunk-TVFDJZSL.js";import"./chunk-VAAWCP7Q.js";import{Cb as q,Ea as B,Ua as U,yb as P}from"./chunk-3ZOA7PGW.js";import"./chunk-WLTM2YAA.js";import"./chunk-IORXHIGS.js";import{a as F,b as ae}from"./chunk-SSB2RMIS.js";import"./chunk-PT4SHXEW.js";import"./chunk-4LGYWQQG.js";import"./chunk-ZVHCZI33.js";import"./chunk-47AAZFBS.js";import"./chunk-QIMRETM2.js";import"./chunk-LL5T6DPV.js";import"./chunk-UFZP3A3J.js";import"./chunk-TAR2MLNN.js";import"./chunk-V4MSKD3Y.js";import{f as k}from"./chunk-6DSDX2NM.js";var r=k(ae(),1);var w=k(F(),1);function ne({title:o,titleId:d,...S},u){return w.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 20 20",fill:"currentColor","aria-hidden":"true","data-slot":"icon",ref:u,"aria-labelledby":d},S),o?w.createElement("title",{id:d},o):null,w.createElement("path",{fillRule:"evenodd",d:"M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z",clipRule:"evenodd"}))}var ie=w.forwardRef(ne),G=ie;var s=k(F(),1),oe=k(te(),1);var se=({contactMethod:o,authFlow:d,emailDomain:S,appName:u="Privy",whatsAppEnabled:I=!1,onBack:E,onCodeSubmit:M,onResend:D,errorMessage:p,success:h=!1,resendCountdown:L=0,onInvalidInput:O,onClearError:N})=>{let[c,C]=(0,s.useState)(ee);(0,s.useEffect)((()=>{p||C(ee)}),[p]);let x=async y=>{y.preventDefault();let a=y.currentTarget.value.replace(" ","");if(a==="")return;if(isNaN(Number(a)))return void O?.("Code should be numeric");N?.();let m=Number(y.currentTarget.name?.charAt(5)),n=[...a||[""]].slice(0,J-m),i=[...c.slice(0,m),...n,...c.slice(m+n.length)];C(i);let b=Math.min(Math.max(m+n.length,0),J-1);isNaN(Number(y.currentTarget.value))||document.querySelector(`input[name=code-${b}]`)?.focus(),i.every((l=>l&&!isNaN(+l)))&&(document.querySelector(`input[name=code-${b}]`)?.blur(),await M?.(i.join("")))};return(0,r.jsx)(z,{title:"Enter confirmation code",subtitle:(0,r.jsxs)("span",d==="email"?{children:["Please check ",(0,r.jsx)(re,{children:o})," for an email from"," ",S??"privy.io"," and enter your code below."]}:{children:["Please check ",(0,r.jsx)(re,{children:o})," for a",I?" WhatsApp":""," message from ",u," and enter your code below."]}),icon:d==="email"?X:Y,onBack:E,showBack:!0,helpText:(0,r.jsxs)(me,{children:[(0,r.jsxs)("span",{children:["Didn't get ",d==="email"?"an email":"a message","?"]}),L?(0,r.jsxs)(fe,{children:[(0,r.jsx)(G,{color:"var(--privy-color-foreground)",strokeWidth:1.33,height:"12px",width:"12px"}),(0,r.jsx)("span",{children:"Code sent"})]}):(0,r.jsx)(Q,{as:"button",size:"sm",onClick:D,children:"Resend code"})]}),children:(0,r.jsx)(de,{children:(0,r.jsx)(Z,{children:(0,r.jsxs)(ue,{children:[(0,r.jsx)("div",{children:c.map(((y,a)=>(0,r.jsx)("input",{name:`code-${a}`,type:"text",value:c[a],onChange:x,onKeyUp:m=>{m.key==="Backspace"&&(n=>{N?.(),C([...c.slice(0,n),"",...c.slice(n+1)]),n>0&&document.querySelector(`input[name=code-${n-1}]`)?.focus()})(a)},inputMode:"numeric",autoFocus:a===0,pattern:"[0-9]",className:`${h?"success":""} ${p?"fail":""}`,autoComplete:oe.isMobile?"one-time-code":"off"},a)))}),(0,r.jsx)(pe,{$fail:!!p,$success:h,children:(0,r.jsx)("span",{children:p==="Invalid or expired verification code"?"Incorrect code":p||(h?"Success!":"")})})]})})})})},J=6,ee=Array(6).fill(""),A,T,le=((A=le||{})[A.RESET_AFTER_DELAY=0]="RESET_AFTER_DELAY",A[A.CLEAR_ON_NEXT_VALID_INPUT=1]="CLEAR_ON_NEXT_VALID_INPUT",A),ce=((T=ce||{})[T.EMAIL=0]="EMAIL",T[T.SMS=1]="SMS",T),_e={component:()=>{let{navigate:o,lastScreen:d,navigateBack:S,setModalData:u,onUserCloseViaDialogOrKeybindRef:I}=K(),E=P(),{closePrivyModal:M,resendEmailCode:D,resendSmsCode:p,getAuthMeta:h,loginWithCode:L,updateWallets:O,createAnalyticsEvent:N}=B(),{authenticated:c,logout:C,user:x}=q(),{whatsAppEnabled:y}=P(),[a,m]=(0,s.useState)(!1),[n,i]=(0,s.useState)(null),[b,l]=(0,s.useState)(null),[_,$]=(0,s.useState)(0);I.current=()=>null;let R=h()?.email?0:1,j=R===0?h()?.email||"":h()?.phoneNumber||"",W=U-500;return(0,s.useEffect)((()=>{if(_){let t=setTimeout((()=>{$(_-1)}),1e3);return()=>clearTimeout(t)}}),[_]),(0,s.useEffect)((()=>{if(c&&a&&x){if(E?.legal.requireUsersAcceptTerms&&!x.hasAcceptedTerms){let t=setTimeout((()=>{o("AffirmativeConsentScreen")}),W);return()=>clearTimeout(t)}if(H(x,E.embeddedWallets)){let t=setTimeout((()=>{u({createWallet:{onSuccess:()=>{},onFailure:e=>{console.error(e),N({eventName:"embedded_wallet_creation_failure_logout",payload:{error:e,screen:"AwaitingPasswordlessCodeScreen"}}),C()},callAuthOnSuccessOnClose:!0}}),o("EmbeddedWalletOnAccountCreateScreen")}),W);return()=>clearTimeout(t)}{O();let t=setTimeout((()=>M({shouldCallAuthOnSuccess:!0,isSuccess:!0})),U);return()=>clearTimeout(t)}}}),[c,a,x]),(0,s.useEffect)((()=>{if(n&&b===0){let t=setTimeout((()=>{i(null),l(null),document.querySelector("input[name=code-0]")?.focus()}),1400);return()=>clearTimeout(t)}}),[n,b]),(0,r.jsx)(se,{contactMethod:j,authFlow:R===0?"email":"sms",emailDomain:E?.appearance.emailDomain,appName:E?.name,whatsAppEnabled:y,onBack:()=>S(),onCodeSubmit:async t=>{try{await L(t),m(!0)}catch(e){if(e instanceof f&&e.privyErrorCode===v.INVALID_CREDENTIALS)i("Invalid or expired verification code"),l(0);else if(e instanceof f&&e.privyErrorCode===v.CANNOT_LINK_MORE_OF_TYPE)i(e.message);else{if(e instanceof f&&e.privyErrorCode===v.USER_LIMIT_REACHED)return console.error(new V(e).toString()),void o("UserLimitReachedScreen");if(e instanceof f&&e.privyErrorCode===v.USER_DOES_NOT_EXIST)return void o("AccountNotFoundScreen");if(e instanceof f&&e.privyErrorCode===v.LINKED_TO_ANOTHER_USER)return u({errorModalData:{error:e,previousScreen:d??"AwaitingPasswordlessCodeScreen"}}),void o("ErrorScreen",!1);if(e instanceof f&&e.privyErrorCode===v.DISALLOWED_PLUS_EMAIL)return u({inlineError:{error:e}}),void o("ConnectOrCreateScreen",!1);if(e instanceof f&&e.privyErrorCode===v.ACCOUNT_TRANSFER_REQUIRED&&e.data?.data?.nonce)return u({accountTransfer:{nonce:e.data?.data?.nonce,account:j,displayName:e.data?.data?.account?.displayName,linkMethod:R===0?"email":"sms",embeddedWalletAddress:e.data?.data?.otherUser?.embeddedWalletAddress}}),void o("LinkConflictScreen");i("Issue verifying code"),l(0)}}},onResend:async()=>{$(30),R===0?await D():await p()},errorMessage:n||void 0,success:a,resendCountdown:_,onInvalidInput:t=>{i(t),l(1)},onClearError:()=>{b===1&&(i(null),l(null))}})}},de=g.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: auto;
  gap: 16px;
  flex-grow: 1;
  width: 100%;
`,ue=g.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 12px;

  > div:first-child {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    border-radius: var(--privy-border-radius-sm);

    > input {
      border: 1px solid var(--privy-color-foreground-4);
      background: var(--privy-color-background);
      border-radius: var(--privy-border-radius-sm);
      padding: 8px 10px;
      height: 48px;
      width: 40px;
      text-align: center;
      font-size: 18px;
      font-weight: 600;
      color: var(--privy-color-foreground);
      transition: all 0.2s ease;
    }

    > input:focus {
      border: 1px solid var(--privy-color-foreground);
      box-shadow: 0 0 0 1px var(--privy-color-foreground);
    }

    > input:invalid {
      border: 1px solid var(--privy-color-error);
    }

    > input.success {
      border: 1px solid var(--privy-color-border-success);
      background: var(--privy-color-success-bg);
    }

    > input.fail {
      border: 1px solid var(--privy-color-border-error);
      background: var(--privy-color-error-bg);
      animation: shake 180ms;
      animation-iteration-count: 2;
    }
  }

  @keyframes shake {
    0% {
      transform: translate(1px, 0);
    }
    33% {
      transform: translate(-1px, 0);
    }
    67% {
      transform: translate(-1px, 0);
    }
    100% {
      transform: translate(1px, 0);
    }
  }
`,pe=g.div`
  line-height: 20px;
  min-height: 20px;
  font-size: 14px;
  font-weight: 400;
  color: ${o=>o.$success?"var(--privy-color-success-dark)":o.$fail?"var(--privy-color-error-dark)":"transparent"};
  display: flex;
  justify-content: center;
  width: 100%;
  text-align: center;
`,me=g.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--privy-color-foreground-2);
`,fe=g.div`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--privy-border-radius-sm);
  padding: 2px 8px;
  gap: 4px;
  background: var(--privy-color-background-2);
  color: var(--privy-color-foreground-2);
`,re=g.span`
  font-weight: 500;
  word-break: break-all;
  color: var(--privy-color-foreground);
`;export{_e as AwaitingPasswordlessCodeScreen,se as AwaitingPasswordlessCodeScreenView,_e as default};
