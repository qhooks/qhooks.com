import{chainById}from'./chains.mjs';
// Presentation of the received stage, never a claim of complete chain coverage.
export function pulseStageStatus(record={}, {stage='new',count=0,chain='all',filtered=false}={}){
 const data=record.data,failed=!!record.error||!!data?.error||data?.status==='unavailable',loading=!data&&!failed;
 const refreshing=failed||data?.stale===true||data?.refreshing===true||data?.coverage?.degraded===true;
 const name=String(chain)==='all'?'':String(chain)==='solana'?'Solana':chainById(String(chain))?.short||String(chain),where=name?' on '+name:'';
 const noun=stage==='bonding'?'near-bond tokens':stage==='migrated'?'migrations':'new tokens';
 const empty=count===0&&!loading;
 return{kind:loading?'loading':count>0?refreshing?'retained':'populated':failed?'failure':'empty',empty,refreshing,retry:failed,message:failed?'This stage is unavailable.':filtered?'No matches in this stage.':'No '+noun+' observed'+where+'.'};
}
