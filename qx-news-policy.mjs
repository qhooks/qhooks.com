import {sportsAnimalContext} from './qx-news-teams.mjs';
export const NEWS_MIN_TRADE_USD=1000;
const WIRE_EVENTS=new Set(['launch','graduation','milestone','burn','splitter','buyback','callout','dev_update']);
export function newsworthy(event){return WIRE_EVENTS.has(event?.kind)||(['buy','sell'].includes(event?.kind)&&Number.isFinite(event.valueUsd)&&event.valueUsd>=NEWS_MIN_TRADE_USD);}
// Final Randall policy: ordinary scandal/arrest/drama is allowed. These are
// content-category signals, not an assertion that a linked claim is true.
export const TOPIC_TEXT_BLOCK=/\b(dead|death\w*|dying|killed|killings?|murder\w*|suicid\w*|self harm|shooting|massacre|terror\w*|war|wars|military|missiles?|air ?strikes?|drone strikes?|troops|invasion|ceasefire|hostilities|retaliat\w*|attacked|(?:us|u\.s\.|iran\w*|israel\w*|russia\w*|ukrain\w*)\s+(?:attack\w*|strike\w*)|missing|disappear\w*|memorial\w*|sank|sunk|sinking|shipwreck\w*|drown\w*|kidnap\w*|disaster\w*|earthquake\w*|hurricane\w*|flood\w*|crash\w*|explosions?|bombings?|bomb threats?|blasts?|incendie|incendies|injured|hospital\w*|cancer|traged\w*|human trafficking|domestic violence)\b/i;
const DISTRESS_CONTEXT=/\b(died|dies|die|passing of|his passing|her passing|their passing|passed away|gone too soon|rest in peace|rip|obituar\w*|funeral\w*|mourning|mourn\w*|grief|grieving|bereave\w*|unresponsive|lifeless|injur\w*|hurt|illness\w*|diagnos\w*|coma|surgery|surger\w*|health scare|stranded|evacuat\w*n|amber warning|yellow warning|red warning|allerta|codice giallo|temporali|morto|morta|morti|decedut\w*|muere|murio|falleci\w*|muerte|d[eé]c[eè]s|d[eé]c[eé]d\w*|gestorben)\b|\blate (actor|actress|singer|star|musician)\b|\bbrok(?:e|en) (?:his |her |their |an? |the )?(foot|leg|arm|ankle|rib|neck|back)\b/i;
const MINOR_CONTEXT=/\b(child(?:ren)?|kids?|toddlers?|students?|minors?|underage|teen(?:ager|age|s)?|school ?girls?|school ?boys?|high school|middle school|elementary school|under[ -]?18|u1[0-7]|baby (?:boy|girl)|newborn (?:boy|girl|child)|(?:[0-9]|1[0-7])(?:[ -]?(?:year|yr)[ -]?old|[ -]?y[.]?o[.]?)|aged? (?:[0-9]|1[0-7]))\b/i;
const SEXUAL_OFFENCES=/\b(sex trafficking|sexual (?:assault\w*|abuse\w*|harass\w*|misconduct|exploitation|offen[cs]es?|offenders?|violence)|sex (?:crimes?|offen[cs]es?|offenders?)|rape\w*|rapists?|molest\w*|pedophil\w*|paedophil\w*|csam|child pornography|indecent (?:assault|exposure)|revenge porn|non consensual (?:sex\w*|intimate|nude|images)|bestiality|zoophilia)\b/i;
const normalizeText=value=>String(value||'').normalize('NFKC').replaceAll('_',' ').replace(/[-–—]/g,' ');
// A reviewed sexual-case cue handles indirect headlines that say only crimes/conviction.
// Primary evidence: https://www.cps.gov.uk/national-news-london-south/news/russell-brand-convicted-non-recent-sexual-offences-against-four
// Scope is this named case + case wording, not every mention of the person.
const reviewedSexualCase=text=>/\brussell brand\b/i.test(text)&&/\b(crimes?|criminal|convict\w*|sentenc\w*|trial|victims?|case|prison)\b/i.test(text);
export const sexualOffenceText=value=>{const text=normalizeText(value);return SEXUAL_OFFENCES.test(text)||reviewedSexualCase(text);};
const CHILD_AWARDS_EVENT=/\b(?:nickelodeon\s+)?kids['’]?\s+choice\s+awards\b/gi;
function blockedContext(value,minorValue=value){const text=normalizeText(value);return TOPIC_TEXT_BLOCK.test(text)||DISTRESS_CONTEXT.test(text)||MINOR_CONTEXT.test(normalizeText(minorValue))||sexualOffenceText(text);}
export const blockedTopicText=value=>blockedContext(value);
export function topicId(value){return typeof value==='string'&&(/^(wiki|google):[^<>\p{C}]{1,160}$/u.test(value)||/^youtube:[A-Za-z0-9_-]{11}$/.test(value)||/^xpost:\d{1,22}$/.test(value));}

// Google-only exception: remove harm words only when their grammatical target is
// an explicit animal. A tag or an unqualified "Justice for <name>" is not proof.
const ANIMAL_SUBJECT='(?:animals?|dogs?|cats?|pupp(?:y|ies)|kittens?|squirrels?|raccoons?|otters?|rabbits?|bunn(?:y|ies)|horses?|ponies|pigs?|goats?|cows?|calves|hamsters?|parrots?|birds?|ducks?|penguins?|pandas?|bears?|elephants?|lions?|tigers?|monkeys?|orangutans?|hippos?|capybaras?|fox(?:es)?|seals?|sharks?|whales?|dolphins?|turtles?|tortoises|deer|kangaroos?|koalas?|beavers?)';
// A species word inside a person's name or a programme title is not animal evidence.
// Require a literal animal topic or an attached animal noun phrase/action.
export function animalStoryEvidence(topic,context=''){
 const text=normalizeText(topic+' '+context),subject=ANIMAL_SUBJECT;
 return new RegExp('^(?:(?:baby|viral|funny|cute|tiny|wild|pet|zoo)\\s+)*'+subject+'(?:\\s+(?:news|rescue|justice|death|injury|abuse|cruelty|attacks?|campaign|video|clip))?$','i').test(String(topic).trim())
  ||/\bmoo deng\b/i.test(topic)
  ||new RegExp('\\b(?:a|an|the|baby|young|old|pet|wild|rescued|injured|missing|abused|stranded|orphaned)\\s+'+subject+'\\b','i').test(text)
  ||new RegExp('\\b'+subject+'\\s+(?:was|were|is|are|has been|had been|named|called|rescue|rescued|injured|killed|died|death|abuse|cruelty|campaign|adopted|born|birth|escaped|escapes|saved|naps|plays|sleeps|swims|leaps)\\b','i').test(text);
}
const HARD_CONTENT=SEXUAL_OFFENCES;
const escapeRE=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const normalizeTopic=v=>String(v||'').normalize('NFKC').replaceAll('_',' ').replace(/[-–—]/g,' ');
export function googleTopicPolicy(topic,context='',{adultVerified=false}={}){
 const text=normalizeTopic(topic+' '+context);
 // The exact event title is ignored only for the minor-context check after
 // positive adult verification. The topic itself is never exempted.
 const isBlocked=value=>blockedContext(value,adultVerified===true?normalizeTopic(topic)+' '+normalizeText(value).replace(CHILD_AWARDS_EVENT,' '):value);
 if(text.length>50000||HARD_CONTENT.test(text))return {blocked:true,animalStory:false};
 if(sportsAnimalContext(topic,context))return {blocked:isBlocked(text),animalStory:false,sportsTeam:true};
 if(!animalStoryEvidence(topic,context))return {blocked:isBlocked(text),animalStory:false};
 const names=new Set(),proper="[\\p{Lu}][\\p{L}'’]*(?: [\\p{Lu}][\\p{L}'’]*){0,2}";
 for(const pattern of ['('+proper+') (?:the )'+ANIMAL_SUBJECT,ANIMAL_SUBJECT+' (?:named |called )?('+proper+')']){
  for(const m of text.matchAll(new RegExp('\\b'+pattern+'\\b','gu')))if(names.size<12)names.add(m[1]);
 }
 const named=[...names].map(escapeRE),ref='(?:'+(named.length?named.join('|')+'(?: the '+ANIMAL_SUBJECT+')?|':'')+ANIMAL_SUBJECT+(named.length?'(?: (?:named |called )?(?:'+named.join('|')+'))?':'')+')';
 const human='(?:man|woman|boy|girl|child|teenager|person|people|owner|family|rescuer|handler|ranger|activist)';
 const harm='(?:died|dies|dead|death|killed|murdered|injured|hurt|missing|drowned|poisoned|abused|euthanized|euthanised|attacked)';
 // Ambiguous mixed victims stay blocked, even if one of them is an animal.
 if(new RegExp('\\b(?:'+human+' (?:and|with) (?:the )?'+ref+'|'+ref+' (?:and|with) (?:the )?'+human+') (?:\\w+ ){0,2}'+harm+'\\b','i').test(text))return {blocked:true,animalStory:false};
 if(new RegExp('\\b[\\p{L}]+ (?:and|with) (?:the )?'+ref+' (?:\\w+ ){0,2}'+harm+'\\b','iu').test(text))return {blocked:true,animalStory:false};
 if(new RegExp('\\b'+ref+' (?:was |were |is |are )?'+harm+' (?:and|with|alongside|together with) (?:the |a |an |its |his |her |their )?'+human+'\\b','i').test(text))return {blocked:true,animalStory:false};
 let scoped=text;
 const mask=(pattern)=>{scoped=scoped.replace(new RegExp('\\b'+pattern+'\\b','gi'),' animal subject ');};
 // An animal's age is not the age of a child; retain its subject, remove only the attached age.
 scoped=text.replace(new RegExp('\\b(?:[0-9]{1,2} (?:year|yr) old|aged? [0-9]{1,2}) (?='+ref+'\\b)','gi'),'');
 mask(ref+' (?:was |were |is |are )?(?:rescued|injured|killed|died|stranded|hurt) (?:from|in|after|during) (?:the |a |an )?(?:flood\\w*|hurricane\\w*|earthquake\\w*|crash\\w*|shipwreck\\w*|wildfire\\w*)');
 mask('(?:dead|dying|missing|injured|hurt|abused|stranded|drowned|poisoned|euthanized|euthanised) '+ref);
 mask(ref+"(?:'s|’s)? (?:death|deaths|killing|murder|injuries|injury|abuse|rescue|disappearance)");
 mask('(?:heartbreaking |tragic )?(?:death|deaths|killing|murder|injuries|injury|abuse|rescue|disappearance) of (?:the |a |an )?'+ref);
 mask(ref+' (?:was|were|is|are|has been|had been|being) (?:killed|murdered|injured|hurt|abused|stranded|drowned|poisoned|euthanized|euthanised|attacked)');
 mask(ref+' (?:died|dies|passed away|went missing|disappeared|drowned)');
 mask(ref+' (?:killed|murdered|injured|hurt|abused|poisoned|euthanized|euthanised|attacked)(?=\\s*(?:by|after|during|following|[;:.,!]|$))');
 mask('(?:killed|killing|murdered|murdering|injured|injuring|abused|abusing|poisoned|poisoning|euthanized|euthanised) (?:the |a |an )?'+ref);
 mask('attacked (?:the |a |an |another )?'+ref);
 // Generic animal-abuse wording remains source text; no accusation is generated.
 mask('animal (?:abuse|cruelty)');
 const blocked=isBlocked(scoped);
 const animalSubject=animalStoryEvidence(topic)||named.some(name=>new RegExp('^(?:justice for )?'+name+'(?: campaign)?$','i').test(String(topic).trim()));
 return {blocked,animalStory:!blocked,animalSubject:!blocked&&animalSubject};
}
