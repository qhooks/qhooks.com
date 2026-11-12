// Ticket summary only; detailed evidence and risk warnings retain their coverage.
// 2026-11-12 (main's sheet notes): "refreshing" only while a check is actually running or being refreshed; a clear
// verdict reads "Checks: clear" (a missing check time is said in the evidence line instead); warnings give a count.
export function checksSummary(report,{flags=0}={}){
  if(!report)return 'Checks paused · retry';
  if(['queued','running','pending','checking'].includes(report.state)||report.stale)return 'Checks: refreshing';
  if(['danger','caution'].includes(report.level))return flags>0?'Checks: '+flags+(flags===1?' flag':' flags'):'Checks: review flags';
  if(!report.level)return report.state==='not_checked'?'Not checked yet · run a check below':'Checks paused · retry';
  return 'Checks: clear';
}
