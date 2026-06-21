// laliga-standings.js
// Pulls LaLiga standings from football-data.org and writes laliga-standings.json.
// Writes ONLY the volatile fields (rank, name, pts, s). Static team data
// (nicknames, map coordinates) lives in the page and is never touched here.
//
// D1 = PD (free tier). D2 = SD (paid tier; 403 on free -> omitted, page keeps
// its manual D2 data). When the tier covers SD, D2 appears automatically.
//
// Token comes from the FD_TOKEN GitHub Actions secret. No keys in code.

const fs = require("fs");

const TOKEN = process.env.FD_TOKEN;
if (!TOKEN) { console.error("Missing FD_TOKEN"); process.exit(1); }

const BASE = "https://api.football-data.org/v4";

// football-data API name -> page display name (must match the names in the page arrays)
const NAME_MAP = {
  // D1
  "FC Barcelona":"FC Barcelona", "Real Madrid CF":"Real Madrid", "Villarreal CF":"Villarreal CF",
  "Club Atlético de Madrid":"Atlético de Madrid", "Real Betis Balompié":"Real Betis",
  "RC Celta de Vigo":"RC Celta de Vigo", "Real Sociedad de Fútbol":"Real Sociedad",
  "Getafe CF":"Getafe CF", "CA Osasuna":"CA Osasuna", "RCD Espanyol de Barcelona":"RCD Espanyol",
  "Athletic Club":"Athletic Club", "Girona FC":"Girona FC", "Rayo Vallecano de Madrid":"Rayo Vallecano",
  "Valencia CF":"Valencia CF", "RCD Mallorca":"RCD Mallorca", "Sevilla FC":"Sevilla FC",
  "Deportivo Alavés":"Deportivo Alavés", "Elche CF":"Elche CF", "Levante UD":"Levante UD",
  "Real Oviedo":"Real Oviedo",
  // D2
  "Real Racing Club":"Racing de Santander", "CD Castellón":"CD Castellón",
  "RC Deportivo de La Coruña":"RC Deportivo La Coruña", "UD Almería":"UD Almería",
  "UD Las Palmas":"UD Las Palmas", "Málaga CF":"Málaga CF", "Córdoba CF":"Córdoba CF",
  "Burgos CF":"Burgos CF", "Sporting de Gijón":"Sporting Gijón", "AD Ceuta FC":"AD Ceuta FC",
  "Cádiz CF":"Cádiz CF", "Albacete Balompié":"Albacete Balompié", "SD Eibar":"SD Eibar",
  "CD Leganés":"CD Leganés", "Granada CF":"Granada CF", "Real Valladolid CF":"Real Valladolid",
  "FC Andorra":"FC Andorra", "Real Sociedad B":"Real Sociedad B", "Real Zaragoza":"Real Zaragoza",
  "SD Huesca":"SD Huesca", "CD Mirandés":"CD Mirandés", "Cultural y Deportiva Leonesa":"Cultural y Dep. Leonesa",
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

const statusD1 = r => r <= 5 ? "cl" : r === 6 ? "el" : r === 7 ? "conf" : r >= 18 ? "rel" : "mid";
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
    rows.push({ rank: e.position, name, pts: e.points, s: statusFn(e.position) });
  }
  rows.sort((a, b) => a.rank - b.rank);
  return { rows, unmatched };
}

async function comp(code, statusFn, label){
  const res = await get(`/competitions/${code}/standings`);
  if (!res.ok && res.status === 403){
    console.warn(`${label} (${code}): 403 not on this tier; skipping (page keeps manual data).`);
    return null;
  }
  const { rows, unmatched } = tableToRows(res.json, statusFn);
  if (unmatched.length) console.warn(`${label}: unmatched API names -> ${unmatched.join(", ")}`);
  console.log(`${label}: ${rows.length} teams`);
  return rows;
}

(async function main(){
  const out = { updated: new Date().toISOString() };
  const d1 = await comp("PD", statusD1, "D1 (LaLiga EA Sports)");
  if (d1) out.d1 = d1;
  const d2 = await comp("SD", statusD2, "D2 (LaLiga Hypermotion)");
  if (d2) out.d2 = d2;   // present only when the tier allows; otherwise page keeps manual D2
  fs.writeFileSync("laliga-standings.json", JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote laliga-standings.json");
})().catch(e => { console.error(e.message); process.exit(1); });
