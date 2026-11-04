export function mobileStatus(phase){
 const phases={
  idle:{label:'MetaMask Mobile',note:'Connect your phone with a QR code.',busy:false},
  loading:{label:'Loading MetaMask…',note:'Preparing the mobile connection.',busy:true},
  pairing:{label:'Waiting for your phone…',note:'Scan the QR code in MetaMask and approve the connection. No transaction is requested.',busy:true},
  connected:{label:'Reconnect MetaMask Mobile',note:'Your phone approves each signature and transaction.',busy:false},
  disconnecting:{label:'Disconnecting…',note:'Ending this mobile session.',busy:true},
  error:{label:'Try MetaMask Mobile again',note:'Connection did not finish. Try again or use an installed wallet.',busy:false}
 };
 if(typeof phase!=='string'||!Object.hasOwn(phases,phase))throw TypeError('Invalid phase');
 return Object.freeze({...phases[phase]});
}
