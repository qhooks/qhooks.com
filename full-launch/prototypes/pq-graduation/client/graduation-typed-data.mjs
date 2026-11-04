import {encodeGraduationAction} from './graduation-codec.mjs';
export function typedGraduationAction(action) {
  const bytes = encodeGraduationAction(action);
  const fields = [
    ['schemaVersion','uint256'],['chainId','uint256'],['controller','address'],
    ['moduleId','bytes32'],['profileId','bytes32'],['accountId','bytes32'],
    ['owner','address'],['publicKey','bytes32'],['actionType','uint256'],
    ['authEpoch','uint256'],['policyVersion','uint256'],['policyHash','bytes32'],
    ['operationHash','bytes32'],['nonce','uint256'],['validAfter','uint64'],['validUntil','uint64']
  ];
  const message = Object.fromEntries(fields.map(([name,type],i) => {
    const word = Array.from(bytes.subarray(i*32,(i+1)*32),b=>b.toString(16).padStart(2,'0')).join('');
    return [name,type==='address'?'0x'+word.slice(24):type==='bytes32'?'0x'+word:BigInt('0x'+word).toString()];
  }));
  const freeze = value => {
    if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
  };
  return freeze({
    types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},
      {name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],
      GraduationAction:fields.map(([name,type])=>({name,type}))},
    primaryType:'GraduationAction',
    domain:{name:'QHooks QGraduation',version:'1',chainId:message.chainId,verifyingContract:message.controller},
    message
  });
}
