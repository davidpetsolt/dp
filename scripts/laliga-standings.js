// laliga-standings.js
// Pulls LaLiga standings from football-data.org and writes laliga-standings.json.
// Writes ONLY the volatile fields (rank, name, pts, s, p, gd, form) plus the
// season stamp. Static team data (nicknames, map coordinates, last-season
// finish) lives in the page and is never touched here.
//
// D1 = PD (free tier). D2 = SD (Standard tier, ~EUR 49/mo; 403 on free).
// When SD 403s, any d2 block already present in laliga-standings.json is
// carried forward unchanged — so a manually patched D2 table survives the
// daily run. When the tier covers SD, live D2 replaces it automatically.
//
// The page only applies this JSON when season.start >= 2026-07-01, so a feed
// still serving a previous season can never stomp the current page.
//
// Token comes from the FD_TOKEN GitHub Actions secret. No keys in code.

const fs = require("fs");

const TOKEN = process.env.FD_TOKEN;
if (!TOKEN) { console.error("Missing FD_TOKEN"); process.exit(1); }

const BASE = "https://api.football-data.org/v4";
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
  "Real Racing Club":"Racing de Santander", "RC Deportivo de La Coruña":"RC Deportivo La Coruña",
  "Málaga CF":"Málaga CF",
  // D2 2026/27 (unused until the tier covers SD, but ready)
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
  "Real Racing Club de Santander":"Racing de Santander",
  "CD Mirandés":"CD Mirandés", "SD Huesca":"SD Huesca", "Real Zaragoza":"Real Zaragoza",
  "Cultural y Deportiva Leonesa":"Cultural y Dep. Leonesa",
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

(async function main(){
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUT_FILE, "utf8")); } catch (e) { /* first run */ }

  const out = { updated: new Date().toISOString() };
  const d1 = await comp("PD", statusD1, "D1 (LaLiga EA Sports)");
  if (d1){ out.d1 = d1.rows; out.season = d1.season; }
  const d2 = await comp("SD", statusD2, "D2 (LaLiga Hypermotion)");
  if (d2){
    out.d2 = d2.rows;
  } else if (Array.isArray(prev.d2)){
    // SD not on this tier: keep the manually maintained D2 table so the daily
    // run never wipes it. Patch d2 in the JSON by hand (or via a script) and
    // it survives here until a live SD source takes over.
    out.d2 = prev.d2;
    console.log("D2: carried forward existing manual table from previous JSON.");
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote " + OUT_FILE);
})().catch(e => { console.error(e.message); process.exit(1); });
