#!/usr/bin/env node
/*
 * wc-score.js — builds results.json (tournament "truth") for the family bracket page.
 * Source: football-data.org v4, competition WC (free tier covers it).
 * Env: FD_TOKEN = your football-data.org API token.
 * Output: results.json in the repo root (same folder as world-cup-2026.html).
 *
 * The page does the scoring; this script only outputs what actually happened,
 * normalized to the page's team-name vocabulary.
 */

const fs = require("fs");
const TOKEN = process.env.FD_TOKEN;
const BASE = "https://api.football-data.org/v4/competitions/WC";

if (!TOKEN) { console.error("Missing FD_TOKEN env var."); process.exit(1); }

// --- team-name normalization to the page's display vocabulary ---
const DISPLAY = ["Mexico","Korea Republic","Czechia","South Africa","Switzerland","Canada","Qatar",
  "Bosnia and Herzegovina","Brazil","Morocco","Scotland","United States","Paraguay","Türkiye","Australia",
  "Germany","Ecuador","Côte d'Ivoire","Netherlands","Japan","Sweden","Tunisia","Belgium","Egypt","IR Iran",
  "New Zealand","Spain","Uruguay","Cabo Verde","Saudi Arabia","France","Senegal","Norway","Argentina",
  "Austria","Algeria","Portugal","Colombia","England","Croatia","Panama","Ghana"];
const canon = s => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
const CANON2DISP = {}; DISPLAY.forEach(n => CANON2DISP[canon(n)] = n);
const SYN = {
  turkey:"Türkiye", czechrepublic:"Czechia",
  southkorea:"Korea Republic", korea:"Korea Republic", republicofkorea:"Korea Republic", korearep:"Korea Republic",
  ivorycoast:"Côte d'Ivoire", capeverde:"Cabo Verde", capeverdeislands:"Cabo Verde",
  iran:"IR Iran", usa:"United States", unitedstatesofamerica:"United States",
  bosnia:"Bosnia and Herzegovina", bosniaherzegovina:"Bosnia and Herzegovina"
};
const toDisp = name => { const c = canon(name); return SYN[c] || CANON2DISP[c] || name; };

// --- stage label -> internal key ---
function stageKey(stage){
  const u = (stage||"").toUpperCase();
  if (u.includes("GROUP")) return "GROUP";
  if (u.includes("32")) return "R32";
  if (u.includes("16")) return "R16";
  if (u.includes("QUARTER")) return "QF";
  if (u.includes("SEMI")) return "SF";
  if (u.includes("THIRD") || u.includes("3RD") || u.includes("PLAYOFF")) return "3P";
  if (u.includes("FINAL")) return "Final";
  return "OTHER";
}

async function get(path){
  const r = await fetch(BASE + path, { headers: { "X-Auth-Token": TOKEN } });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

(async () => {
  let matches = [], standings = null;
  try { matches = (await get("/matches")).matches || []; }
  catch (e) { console.error("matches fetch failed:", e.message); process.exit(1); }
  try { standings = (await get("/standings")).standings || []; }
  catch (e) { console.error("standings fetch failed (group scoring will stay pending):", e.message); }

  const real = t => t && t.name ? toDisp(t.name) : null;
  const reached = { R16: new Set(), QF: new Set(), SF: new Set(), Final: new Set() };
  const aliveR32 = new Set();
  const eliminated = new Set();
  let champion = null, anyFinished = false, finalFinished = false;
  const apiTeams = new Set();

  for (const m of matches) {
    const sk = stageKey(m.stage);
    const home = real(m.homeTeam), away = real(m.awayTeam);
    [home, away].forEach(t => { if (t) apiTeams.add(t); });
    if (m.status === "FINISHED") anyFinished = true;

    if (sk === "R32") { if (home) aliveR32.add(home); if (away) aliveR32.add(away); }
    if (reached[sk]) { if (home) reached[sk].add(home); if (away) reached[sk].add(away); }

    // KO eliminations + champion
    if (["R32","R16","QF","SF","Final","3P"].includes(sk) && m.status === "FINISHED" && m.score) {
      const w = m.score.winner;
      if (w === "HOME_TEAM" && away) eliminated.add(away);
      else if (w === "AWAY_TEAM" && home) eliminated.add(home);
      if (sk === "Final") { finalFinished = true; if (w === "HOME_TEAM") champion = home; else if (w === "AWAY_TEAM") champion = away; }
    }
  }

  // group standings -> order + final flag
  const groupOrder = {}, groupFinal = {};
  for (const s of (standings || [])) {
    if (s.type !== "TOTAL" || !s.group) continue;
    const letter = String(s.group).replace(/[^A-L]/gi, "").toUpperCase().slice(-1);
    if (!letter) continue;
    const table = (s.table || []).slice().sort((a,b)=>(a.position||0)-(b.position||0));
    groupOrder[letter] = table.map(r => real(r.team)).filter(Boolean);
    groupFinal[letter] = table.length >= 4 && table.every(r => (r.playedGames || 0) >= 3);
    table.forEach(r => { const t = real(r.team); if (t) apiTeams.add(t); });
  }

  // group-stage eliminations once the Round of 32 is fully drawn
  if (aliveR32.size >= 32) {
    for (const g of Object.keys(groupOrder)) {
      if (!groupFinal[g]) continue;
      groupOrder[g].forEach(t => { if (!aliveR32.has(t)) eliminated.add(t); });
    }
  }

  const status = finalFinished ? "complete" : (anyFinished ? "in_progress" : "not_started");
  const out = {
    updated: new Date().toISOString(),
    status,
    groupFinal,
    groupOrder,
    reached: {
      R16: [...reached.R16], QF: [...reached.QF], SF: [...reached.SF], Final: [...reached.Final]
    },
    champion,
    eliminated: [...eliminated],
    aliveR32: [...aliveR32]
  };

  fs.writeFileSync("results.json", JSON.stringify(out, null, 2) + "\n");

  // diagnostics
  console.log(`status=${status}  groupsFinal=${Object.values(groupFinal).filter(Boolean).length}/12  ` +
    `R16=${out.reached.R16.length} QF=${out.reached.QF.length} SF=${out.reached.SF.length} ` +
    `Final=${out.reached.Final.length} champion=${champion||"-"} eliminated=${out.eliminated.length}`);
  if (anyFinished) {
    const missing = DISPLAY.filter(n => !apiTeams.has(n));
    if (missing.length) console.warn("WARN names not seen in API feed (check normalization):", missing.join(", "));
  }
})();
