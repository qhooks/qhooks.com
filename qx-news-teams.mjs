// Finite disambiguation list, not a feed or an admission allowlist. League
// directories checked 2026-11-14; ambiguous nicknames require sports context.
// https://www.nfl.com/teams/  https://www.nhl.com/info/teams/
// https://www.nba.com/teams  https://www.mlb.com/team
const names=['chicago bears','philadelphia eagles','detroit lions','miami dolphins','pittsburgh penguins','anaheim ducks','san jose sharks','chicago bulls','memphis grizzlies','atlanta hawks','detroit tigers','chicago cubs','baltimore orioles','golden seals'];
const aliases=/\b(bears|eagles|lions|dolphins|seals|penguins|ducks|tigers|bulls|cubs|sharks|hawks|cardinals|ravens|rams|broncos|panthers|jaguars|bengals|falcons|seahawks|bucks|raptors|hornets|pelicans|timberwolves|orioles|blue jays|marlins|rays|bruins|badgers|bulldogs|huskies|wolverines|wolves)\b/i;
const sports=/\b(nfl|nba|nhl|mlb|ncaa|football|basketball|baseball|hockey|soccer|rugby|quarterbacks?|qb|dt|rosters?|trades?|traded|trading|draft\w*|vs|versus|scores?|scoring|standings|signs|signed|signing|lineups?|touchdowns?|playoffs?|coaches?)\b/i;
const key=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function sportsAnimalContext(topic,context=''){
 const text=' '+key(topic+' '+context)+' ';
 return names.some(name=>text.includes(' '+name+' '))||aliases.test(text)&&sports.test(text);
}
