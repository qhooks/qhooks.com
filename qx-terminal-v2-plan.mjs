// What a scrollIntoView call should do on the re-laid-out token page (2026-11 redesign). Pure, so it is tested
// (lead/redesign/scroll-plan.test.mjs). Only the parts the new layout moved are special; everything else is 'native'.
//   'token'  put the token header at the top (a phone: the head has no box of its own)
//   'sheet'  open the trade sheet            'sheet-then-native'  open it, then let the browser scroll inside it
//   'none'   do nothing                      'info-then-native'   show the Info tab, then scroll as asked
export function scrollPlan({ phone, marketOpen, inMain, id, inTicket, isRailRow, railOnScreen, hasBox, inInfoGroup, infoOpen, sheetOpen }) {
  if (phone && id === 'qxt-head') return 'token';
  if (!marketOpen || !inMain) return 'native';
  if (phone && id === 'qxt-trade') return sheetOpen ? 'none' : 'sheet';
  if (phone && inTicket) return sheetOpen ? 'native' : 'sheet-then-native';
  if (phone && isRailRow && !railOnScreen) return 'none';   // the rail sits at the end of the page: never pull the page to it
  if (!hasBox && inInfoGroup && !infoOpen) return 'info-then-native';
  return 'native';
}
