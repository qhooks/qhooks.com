// One ticker rule for launch admission and its editable form. Never strip invalid text.
export const LAUNCH_TICKER_HINT='Ticker: 1–10 A–Z / 0–9 characters. No spaces or $.';
export const LAUNCH_TICKER_ERROR='Use 1–10 letters or digits for the ticker.';
export function validLaunchTicker(value){return typeof value==='string'&&/^[A-Z0-9]{1,10}$/.test(value.toUpperCase());}
export function requireLaunchTicker(value){if(!validLaunchTicker(value))throw new TypeError(LAUNCH_TICKER_ERROR);return value.toUpperCase();}
const inputs=new WeakMap();
export function mountLaunchTickerInput(input,{id=input.id+'-rule'}={}){
 if(inputs.has(input))return inputs.get(input);
 const hint=input.ownerDocument.createElement('span');hint.id=id;hint.className='qq-ticker-hint';hint.textContent=LAUNCH_TICKER_HINT;
 input.after(hint);input.setAttribute('pattern','[A-Z0-9]{1,10}');input.setAttribute('maxlength','40');input.setAttribute('autocapitalize','characters');input.spellcheck=false;
 const described=new Set((input.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));described.add(id);input.setAttribute('aria-describedby',[...described].join(' '));
 const paint=()=>{const invalid=input.value!==''&&!validLaunchTicker(input.value);input.setAttribute('aria-invalid',String(invalid));hint.dataset.invalid=String(invalid);input.setCustomValidity(validLaunchTicker(input.value)?'':LAUNCH_TICKER_HINT);};
 input.addEventListener('input',paint);const api={paint};inputs.set(input,api);paint();return api;
}
