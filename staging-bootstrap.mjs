// No site-wide status banner. Availability is shown at the relevant control.
// Unavailable controls are visibly labelled and remain inert even if local page
// code enables their disabled property while validating a draft.
document.addEventListener('click',event=>{
  if(event.target.closest?.('[data-staging-unavailable]')) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
},true);
document.addEventListener('submit',event=>{
  if(event.target.closest?.('[data-staging-readonly]')) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
},true);
