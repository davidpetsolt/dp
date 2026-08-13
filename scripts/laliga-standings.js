// laliga-standings.js
// Builds laliga-standings.json for the LaLiga guide page. Writes ONLY the
// volatile fields (rank, pts, s, p, gd, form, mv, last, next) plus the season
// stamp. Static team data (nicknames, map coordinates, last-season finish)
// lives in the page and is never touched here.
//
// D1 = football-data.org PD (free tier), plus a matches window for each
// team's last result and next fixture.
// D2 = football-data.org SD when the tier allows (403 on free); otherwise
// ESPN's public standings JSON for esp.2 (same source the old manual patcher
// used). If ESPN also fails — or hasn't started the season yet — any d2 block
// already in laliga-standings.json is carried forward unchanged.
//
// mv = rank movement vs the previous run of the same season (positive = up).
//
// The page only applies this JSON when season.start >= 2026-07-01, so a feed
// still serving a previous season can never stomp the current page.
//
// Token comes from the FD_TOKEN GitHub Actions secret. No keys in code.

const fs = require("fs");

const TOKEN = process.env.FD_TOKEN;
if (!TOKEN) { console.error("Missing FD_TOKEN"); process.exit(1); }

const BASE = "https://api.football-data.org/v4";
const ESPN_D2 = "https://site.api.espn.com/apis/v2/sports/soccer/esp.2/standings";
const OUT_FILE = "laliga-standings.json";

// football-data API name -> page display name (must match the names in the page arrays)
const NAME_MAP = {
  // D1 2026/27
  "FC Barcelona":"FC Barcelona", "Real Madrid CF":"Real Madrid", "Villarreal CF":"Villarreal CF",
  "Club Atlético de Madrid":"Atlético de Madrid", "Real Betis Balompié":"Real Betis",
  "RC Celta de Vigo":"RC Celta de Vigo", "Real Sociedad de Fútbol":"Real Sociedad",
  "Getafe CF":"Getafe CF", "CA Osasuna":"CA Osasuna", "RCD Espanyol de Barcelona":"RCD Espanyol",
  "Athletic Club":"Athletic Club", "Rayo Vallecano de Madrid":"Rayo Vallecano",
  "Valencia CF":"Valencia CF", "Sevilla FC":"Sevilla FC",
  "Deportivo Alavés":"Deportivo Alavés", "Elche CF":"Elche CF", "Levante UD":"Levante UD",
  "Real Racing Club":"Racing de Santander", "Real Racing Club de Santander":"Racing de Santander",
  "RC Deportivo de La Coruña":"RC Deportivo La Coruña", "Málaga CF":"Málaga CF",
  // D2 2026/27 (used when the tier covers SD)
  "Girona FC":"Girona FC", "RCD Mallorca":"RCD Mallorca", "Real Oviedo":"Real Oviedo",
  "CD Castellón":"CD Castellón", "UD Almería":"UD Almería",
  "UD Las Palmas":"UD Las Palmas", "Córdoba CF":"Córdoba CF",
  "Burgos CF":"Burgos CF", "Sporting de Gijón":"Sporting Gijón", "AD Ceuta FC":"AD Ceuta FC",
  "Cádiz CF":"Cádiz CF", "Albacete Balompié":"Albacete Balompié", "SD Eibar":"SD Eibar",
  "CD Leganés":"CD Leganés", "Granada CF":"Granada CF", "Real Valladolid CF":"Real Valladolid",
  "FC Andorra":"FC Andorra", "Real Sociedad B":"Real Sociedad B",
  "CD Tenerife":"CD Tenerife", "CD Eldense":"CD Eldense",
  "CE Sabadell FC":"CE Sabadell", "CE Sabadell":"CE Sabadell",
  "RC Celta de Vigo B":"Celta Fortuna", "Celta Fortuna":"Celta Fortuna",
  // Relegated to Primera Federación for 26/27 — kept for a possible return
  "CD Mirandés":"CD Mirandés", "SD Huesca":"SD Huesca", "Real Zaragoza":"Real Zaragoza",
  "Cultural y Deportiva Leonesa":"Cultural y Dep. Leonesa",
};

// ESPN displayName -> page display name (ESPN uses short names)
const ESPN_MAP = {
  "Albacete":"Albacete Balompié", "Almería":"UD Almería", "Burgos":"Burgos CF",
  "Cádiz":"Cádiz CF", "Castellón":"CD Castellón", "RC Celta Fortuna":"Celta Fortuna",
  "Ceuta":"AD Ceuta FC", "Córdoba":"Córdoba CF", "Eibar":"SD Eibar", "Eldense":"CD Eldense",
  "FC Andorra":"FC Andorra", "Girona":"Girona FC", "Granada":"Granada CF",
  "Las Palmas":"UD Las Palmas", "Leganés":"CD Leganés", "Mallorca":"RCD Mallorca",
  "Real Oviedo":"Real Oviedo", "Real Sociedad II":"Real Sociedad B",
  "Real Valladolid":"Real Valladolid", "CD Sabadell":"CE Sabadell",
  "Sporting Gijón":"Sporting Gijón", "Tenerife":"CD Tenerife",
};

function canonName(apiName){
  if (NAME_MAP[apiName]) return NAME_MAP[apiName];
  const lo = apiName.toLowerCase();
  for (const [k, v] of Object.entries(NAME_MAP)){
    const kl = k.toLowerCase();
    if (lo.includes(kl) || kl.includes(lo)) return v;
  }
  return null;
}

// 26/27 European spots: CL 1-4, EL 5-6, Conference playoff 7 (back to 4 CL
// after the 25/26 coefficient bonus year).
const statusD1 = r => r <= 4 ? "cl" : r <= 6 ? "el" : r === 7 ? "conf" : r >= 18 ? "rel" : "mid";
const statusD2 = r => r <= 2 ? "aup" : r <= 6 ? "plo" : r >= 19 ? "rel" : "mid";

async function get(path, tries = 4){
  for (let i = 0; i < tries; i++){
    const r = await fetch(BASE + path, { headers: { "X-Auth-Token": TOKEN } });
    if (r.ok) return { ok: true, json: await r.json() };
    if (r.status === 403) return { ok: false, status: 403 };   // tier-gated; caller skips
    if (r.status === 429 || r.status >= 500){
      const ra = Number(r.headers.get("retry-after"));
      const wait = (ra > 0 ? ra : Math.min(60, 6 * (i + 1))) * 1000;
      console.warn(`${path} -> HTTP ${r.status}; retry ${i + 1}/${tries - 1} in ${wait / 1000}s`);
      if (i < tries - 1){ await new Promise(s => setTimeout(s, wait)); continue; }
    }
    throw new Error(`${path} -> HTTP ${r.status}`);
  }
  throw new Error(`${path} -> retries exhausted`);
}

function tableToRows(json, statusFn){
  const groups = (json.standings || []).filter(g => g.type === "TOTAL");
  const table = groups.length ? groups[0].table : [];
  const rows = [], unmatched = [];
  for (const e of table){
    const name = canonName(e.team.name);
    if (!name){ unmatched.push(e.team.name); continue; }
    rows.push({
      rank: e.position, name, pts: e.points, s: statusFn(e.position),
      p: e.playedGames, gd: e.goalDifference, form: e.form || null,
    });
  }
  rows.sort((a, b) => a.rank - b.rank);
  return { rows, unmatched };
}

function seasonOf(json){
  const s = json.season || {};
  return { start: s.startDate || null, end: s.endDate || null, matchday: s.currentMatchday || null };
}

async function comp(code, statusFn, label){
  const res = await get(`/competitions/${code}/standings`);
  if (!res.ok && res.status === 403){
    console.warn(`${label} (${code}): 403 not on this tier; skipping.`);
    return null;
  }
  const { rows, unmatched } = tableToRows(res.json, statusFn);
  if (unmatched.length) console.warn(`${label}: unmatched API names -> ${unmatched.join(", ")}`);
  console.log(`${label}: ${rows.length} teams`);
  return { rows, season: seasonOf(res.json) };
}

// D2 via ESPN's public standings JSON (no key). Returns rows or null.
// Pre-season ESPN lists teams alphabetically with 0 games played — refuse
// that so the page keeps its seeded "–" cards until real football happens.
async function espnD2(){
  try{
    const r = await fetch(ESPN_D2, { headers: { "User-Agent": "Mozilla/5.0 (laliga-guide)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const entries = (((json.children || [])[0] || {}).standings || {}).entries || [];
    if (!entries.length) throw new Error("no entries");
    const rows = [], unmatched = [];
    let played = 0;
    for (const e of entries){
      const stats = {};
      for (const s of (e.stats || [])) stats[s.name] = s.value;
      const disp = e.team.displayName;
      const name = ESPN_MAP[disp] || canonName(disp);
      if (!name){ unmatched.push(disp); continue; }
      const rank = Math.round(stats.rank || 0);
      played += (stats.gamesPlayed || 0);
      rows.push({
        rank, name, pts: Math.round(stats.points || 0), s: statusD2(rank),
        p: Math.round(stats.gamesPlayed || 0), gd: Math.round(stats.pointDifferential || 0),
        form: null,
      });
    }
    if (unmatched.length) console.warn(`D2 (ESPN): unmatched names -> ${unmatched.join(", ")}`);
    if (rows.length < 20) throw new Error(`only ${rows.length} teams mapped`);
    if (played === 0){ console.log("D2 (ESPN): season not started (0 games played); skipping."); return null; }
    rows.sort((a, b) => a.rank - b.rank);
    console.log(`D2 (ESPN): ${rows.length} teams`);
    return rows;
  }catch(err){
    console.warn(`D2 (ESPN): failed (${err.message}); will carry forward previous d2 if present.`);
    return null;
  }
}

// Last result + next fixture per D1 team from a +/-3 week matches window.
async function d1Fixtures(rows){
  const day = 86400000, now = Date.now();
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const res = await get(`/competitions/PD/matches?dateFrom=${iso(now - 21 * day)}&dateTo=${iso(now + 21 * day)}`);
  if (!res.ok){ console.warn("D1 matches: unavailable; skipping last/next."); return; }
  const byName = {};
  rows.forEach(r => { byName[r.name] = r; });
  const seen = { last: {}, next: {} };
  const matches = (res.json.matches || []).slice()
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  for (const m of matches){
    const home = canonName(m.homeTeam.name), away = canonName(m.awayTeam.name);
    if (!home || !away) continue;
    const t = new Date(m.utcDate).getTime();
    if (m.status === "FINISHED"){
      const ft = m.score && m.score.fullTime;
      if (!ft || ft.home == null) continue;
      // matches are time-sorted, so the latest finished one wins
      if (byName[home]) byName[home].last = { opp: away, hm: true,  gf: ft.home, ga: ft.away, date: m.utcDate };
      if (byName[away]) byName[away].last = { opp: home, hm: false, gf: ft.away, ga: ft.home, date: m.utcDate };
      seen.last[home] = seen.last[away] = true;
    } else if ((m.status === "SCHEDULED" || m.status === "TIMED") && t > now){
      if (byName[home] && !seen.next[home]){ byName[home].next = { opp: away, hm: true,  date: m.utcDate }; seen.next[home] = true; }
      if (byName[away] && !seen.next[away]){ byName[away].next = { opp: home, hm: false, date: m.utcDate }; seen.next[away] = true; }
    }
  }
  console.log(`D1 fixtures: last for ${Object.keys(seen.last).length}, next for ${Object.keys(seen.next).length} teams`);
}

// Rank movement vs the previous run (same season only). Positive = climbed.
function addMovement(rows, prevRows){
  if (!Array.isArray(rows) || !Array.isArray(prevRows)) return;
  const prevRank = {};
  prevRows.forEach(t => { prevRank[t.name] = t.rank; });
  rows.forEach(t => {
    const p = prevRank[t.name];
    if (p != null && p !== t.rank) t.mv = p - t.rank;
  });
}

(async function main(){
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch (e) { /* first run */ }

  const out = { updated: new Date().toISOString() };

  const d1 = await comp("PD", statusD1, "D1 (LaLiga)");
  if (d1){
    out.d1 = d1.rows;
    out.season = d1.season;
    await d1Fixtures(out.d1);
  }

  const d2 = await comp("SD", statusD2, "D2 (LaLiga Hypermotion)");
  if (d2){
    out.d2 = d2.rows;
  } else {
    const espn = await espnD2();
    if (espn){
      out.d2 = espn;
    } else if (Array.isArray(prev.d2)){
      out.d2 = prev.d2;
      console.log("D2: carried forward previous table.");
    }
  }

  // movement arrows: only meaningful within one season
  const sameSeason = prev.season && out.season && prev.season.start === out.season.start;
  if (sameSeason){
    addMovement(out.d1, prev.d1);
    addMovement(out.d2, prev.d2);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote " + OUT_FILE);
})().catch(e => { console.error(e.message); process.exit(1); });
