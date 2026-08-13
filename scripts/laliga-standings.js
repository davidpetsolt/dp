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
const ESPN_BASE = "https://site.api.espn.com/apis/v2/sports/soccer";
const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
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

// ESPN displayName -> page display name, D1 (esp.1). Used only to fill fixture
// gaps football-data leaves during its season rollover (e.g. promoted clubs
// missing from its matches feed). Explicit map required: canonName's fuzzy
// fallback would send ESPN's bare "Deportivo" to Deportivo Alavés.
const ESPN_D1_MAP = {
  "Alavés":"Deportivo Alavés", "Athletic Club":"Athletic Club",
  "Atlético Madrid":"Atlético de Madrid", "Barcelona":"FC Barcelona",
  "Celta Vigo":"RC Celta de Vigo", "Deportivo":"RC Deportivo La Coruña",
  "Elche":"Elche CF", "Espanyol":"RCD Espanyol", "Getafe":"Getafe CF",
  "Levante":"Levante UD", "Málaga":"Málaga CF", "Osasuna":"CA Osasuna",
  "Racing Santander":"Racing de Santander", "Rayo Vallecano":"Rayo Vallecano",
  "Real Betis":"Real Betis", "Real Madrid":"Real Madrid", "Real Sociedad":"Real Sociedad",
  "Sevilla":"Sevilla FC", "Valencia":"Valencia CF", "Villarreal":"Villarreal CF",
};

// ESPN displayName -> page display name, Liga F (esp.w.1). Page names follow
// ligaf.es. ESPN's "Dux Logroño" is stale (rebranded Logroño United Jul-2026)
// and its "CD Tenerife" is listed by Liga F as Costa Adeje Tenerife — both
// mapped here, with the fresh names included in case ESPN catches up.
const ESPN_F_MAP = {
  "Alavés":"Deportivo Alavés", "Athletic Club":"Athletic Club",
  "Atlético Madrid":"Atlético de Madrid", "FC Badalona":"FC Badalona Women",
  "Barcelona":"FC Barcelona", "Deportivo":"Deportivo Abanca", "Eibar":"SD Eibar",
  "Espanyol":"RCD Espanyol", "Granada":"Granada CF",
  "Dux Logroño":"Logroño United", "Logroño United":"Logroño United",
  "Madrid CFF":"Madrid CFF", "Real Madrid":"Real Madrid", "Real Sociedad":"Real Sociedad",
  "Sevilla":"Sevilla FC", "CD Tenerife":"Costa Adeje Tenerife",
  "Costa Adeje Tenerife":"Costa Adeje Tenerife", "Valencia":"Valencia CF",
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
// Liga F 26/27: 1-2 direct to UWCL league phase, 3rd to qualifying, bottom 2 down
const statusF  = r => r <= 2 ? "wcl" : r === 3 ? "wclq" : r >= 15 ? "rel" : "mid";

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
  const season = seasonOf(res.json);
  const totalGp = rows.reduce((s, r) => s + (r.p || 0), 0);
  // Pre-season detection. football-data has a transitional window where the
  // season block already says 26/27 but the table still carries last season's
  // final numbers (seen 13-Aug-2026: matchday 1 with 760 games on the books).
  // Emit name-only stub rows then: fixtures can still attach, but no stale
  // ranks/points ever reach the page.
  const notStarted = totalGp === 0
    || (season.start && new Date(season.start).getTime() > Date.now())
    || (season.matchday != null && season.matchday <= 1 && totalGp > rows.length * 3);
  if (rows.length && notStarted){
    console.log(`${label}: season not started (stale or empty table); emitting fixture stubs only.`);
    return { rows: rows.map(r => ({ name: r.name })), season, preseason: true };
  }
  console.log(`${label}: ${rows.length} teams`);
  return { rows, season };
}

// A league table via ESPN's public standings JSON (no key). Returns rows or
// null. Pre-season ESPN lists teams alphabetically with 0 games played —
// refuse that so the page keeps its seeded "–" cards until real football
// happens.
async function espnTable(code, statusFn, nameMap, minTeams, label){
  try{
    const r = await fetch(`${ESPN_BASE}/${code}/standings`, { headers: { "User-Agent": "Mozilla/5.0 (laliga-guide)" } });
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
      const name = nameMap[disp] || canonName(disp);
      if (!name){ unmatched.push(disp); continue; }
      const rank = Math.round(stats.rank || 0);
      played += (stats.gamesPlayed || 0);
      rows.push({
        rank, name, pts: Math.round(stats.points || 0), s: statusFn(rank),
        p: Math.round(stats.gamesPlayed || 0), gd: Math.round(stats.pointDifferential || 0),
        form: null,
      });
    }
    if (unmatched.length) console.warn(`${label} (ESPN): unmatched names -> ${unmatched.join(", ")}`);
    if (rows.length < minTeams) throw new Error(`only ${rows.length} teams mapped`);
    if (played === 0){
      console.log(`${label} (ESPN): season not started (0 games played); emitting fixture stubs only.`);
      return { rows: rows.map(r => ({ name: r.name })), preseason: true };
    }
    rows.sort((a, b) => a.rank - b.rank);
    console.log(`${label} (ESPN): ${rows.length} teams`);
    return { rows, preseason: false };
  }catch(err){
    console.warn(`${label} (ESPN): failed (${err.message}); will carry forward previous table if present.`);
    return null;
  }
}

// Last result + next fixture per D1 team from a +/-3 week matches window.
// createMissing: add name-only stub rows for teams seen in fixtures but absent
// from the table (pre-season, football-data's stale table lacks promoted clubs).
async function d1Fixtures(rows, createMissing){
  const day = 86400000, now = Date.now();
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const res = await get(`/competitions/PD/matches?dateFrom=${iso(now - 21 * day)}&dateTo=${iso(now + 21 * day)}`);
  if (!res.ok){ console.warn("D1 matches: unavailable; skipping last/next."); return; }
  const byName = {};
  rows.forEach(r => { byName[r.name] = r; });
  if (createMissing){
    for (const m of (res.json.matches || [])){
      for (const side of [m.homeTeam, m.awayTeam]){
        const n = canonName(side.name);
        if (n && !byName[n]){ byName[n] = { name: n }; rows.push(byName[n]); }
      }
    }
  }
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

// Last result, next fixture, and (when the table has none) last-5 form per
// team, from ESPN's scoreboard: finished games in the past 45 days, upcoming
// in the next 21.
async function espnFixtures(code, rows, nameMap, label, createMissing){
  const day = 86400000, now = Date.now();
  const ymd = t => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
  try{
    const url = `${ESPN_SITE}/${code}/scoreboard?dates=${ymd(now - 45 * day)}-${ymd(now + 21 * day)}&limit=400`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (laliga-guide)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const byName = {};
    rows.forEach(t => { byName[t.name] = t; });
    if (createMissing){
      for (const e of (json.events || [])){
        for (const x of (((e.competitions || [])[0] || {}).competitors || [])){
          const n = nameMap[x.team.displayName];
          if (n && !byName[n]){ byName[n] = { name: n }; rows.push(byName[n]); }
        }
      }
    }
    const hist = {};
    const events = (json.events || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    let nLast = 0, nNext = 0;
    for (const e of events){
      const c = (e.competitions || [])[0];
      if (!c) continue;
      const side = {};
      for (const x of (c.competitors || [])){
        side[x.homeAway] = { name: nameMap[x.team.displayName] || canonName(x.team.displayName), score: Number(x.score) };
      }
      const h = side.home, a = side.away;
      if (!h || !a || !h.name || !a.name) continue;
      const t = new Date(e.date).getTime();
      const state = e.status && e.status.type && e.status.type.state;
      if (state === "post" && !Number.isNaN(h.score) && !Number.isNaN(a.score)){
        // events are time-sorted, so the latest finished one wins
        if (byName[h.name]){ byName[h.name].last = { opp: a.name, hm: true,  gf: h.score, ga: a.score, date: e.date }; nLast++; }
        if (byName[a.name]){ byName[a.name].last = { opp: h.name, hm: false, gf: a.score, ga: h.score, date: e.date }; nLast++; }
        const res = (x, y) => x > y ? "W" : x < y ? "L" : "D";
        (hist[h.name] = hist[h.name] || []).push(res(h.score, a.score));
        (hist[a.name] = hist[a.name] || []).push(res(a.score, h.score));
      } else if (state === "pre" && t > now){
        if (byName[h.name] && !byName[h.name].next){ byName[h.name].next = { opp: a.name, hm: true,  date: e.date }; nNext++; }
        if (byName[a.name] && !byName[a.name].next){ byName[a.name].next = { opp: h.name, hm: false, date: e.date }; nNext++; }
      }
    }
    for (const [n, seq] of Object.entries(hist)){
      if (byName[n] && !byName[n].form) byName[n].form = seq.slice(-5).join(",");
    }
    console.log(`${label} fixtures (ESPN): last for ${nLast}, next for ${nNext} team-slots`);
  }catch(err){
    console.warn(`${label} fixtures (ESPN): failed (${err.message}); skipping.`);
  }
}

// Rank movement vs the previous run (same season only). Positive = climbed.
function addMovement(rows, prevRows){
  if (!Array.isArray(rows) || !Array.isArray(prevRows)) return;
  const prevRank = {};
  prevRows.forEach(t => { prevRank[t.name] = t.rank; });
  rows.forEach(t => {
    const p = prevRank[t.name];
    if (p != null && t.rank != null && p !== t.rank) t.mv = p - t.rank;
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
    await d1Fixtures(out.d1, !!d1.preseason);
    // ESPN fills fixture gaps football-data leaves mid-rollover (missing
    // promoted clubs); next is only set where football-data provided none.
    if (out.d1.some(r => !r.next)) await espnFixtures("esp.1", out.d1, ESPN_D1_MAP, "D1 fill", !!d1.preseason);
  }

  // A pre-season stub result must never replace a previous REAL table (e.g. a
  // source glitching back to zeros mid-season keeps yesterday's standings).
  const pick = (espn, prevRows, label) => {
    if (espn && !(espn.preseason && Array.isArray(prevRows) && prevRows.some(r => r.pts > 0))) return espn.rows;
    if (Array.isArray(prevRows)){ console.log(`${label}: carried forward previous table.`); return prevRows; }
    return espn ? espn.rows : undefined;
  };

  const d2 = await comp("SD", statusD2, "D2 (LaLiga Hypermotion)");
  if (d2){
    out.d2 = d2.rows;
  } else {
    out.d2 = pick(await espnTable("esp.2", statusD2, ESPN_MAP, 20, "D2"), prev.d2, "D2");
    if (!out.d2) delete out.d2;
  }

  out.f = pick(await espnTable("esp.w.1", statusF, ESPN_F_MAP, 14, "Liga F"), prev.f, "Liga F");
  if (!out.f) delete out.f;

  if (out.d2) await espnFixtures("esp.2",   out.d2, ESPN_MAP,   "D2");
  if (out.f)  await espnFixtures("esp.w.1", out.f,  ESPN_F_MAP, "Liga F");

  // movement arrows: only meaningful within one season
  const sameSeason = prev.season && out.season && prev.season.start === out.season.start;
  if (sameSeason){
    addMovement(out.d1, prev.d1);
    addMovement(out.d2, prev.d2);
    addMovement(out.f, prev.f);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote " + OUT_FILE);
})().catch(e => { console.error(e.message); process.exit(1); });
