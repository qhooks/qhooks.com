// Ticket summary only; detailed evidence and risk warnings retain their coverage.
export function checksSummary(report,{hasTimestamp=!!(report?.checkedAt||report?.completedAt||report?.retrievedAt)}={}){
  if(!report)return 'Checks paused · retry';
  if(['queued','running','pending','checking'].includes(report.state)||report.stale)return 'Checks: refreshing';
  if(['danger','caution'].includes(report.level))return 'Checks: review flags';
  if(!report.level)return report.state==='not_checked'?'Not checked yet · run a check below':'Checks paused · retry';
  return hasTimestamp?'Checks: no flags':'Checks: refreshing';
}
