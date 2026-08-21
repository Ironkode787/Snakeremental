// ============================================================
// Snakeremental — persistent state, derived stats, save system
// ============================================================

const SAVE_KEY = 'snakeremental_save_v1';

let S = null; // persistent state
let D = null; // derived stats (recomputed from S)

function defaultState() {
  return {
    v: 1,
    gold: 0,
    lifetimeGold: 0,     // never resets
    goldSinceShed: 0,    // resets on shed
    scales: 0,
    eggs: 0,
    prestiges: 0,
    up: {},              // upgradeId -> level
    boons: {},           // boonId -> count (shiny counts as 3)
    stats: {
      runs: 0, bestRun: 0, bestCombo: 0, bestLen: 0, totalFood: 0,
      bestRate: 0,       // best gold/sec in a run (for Séance)
      playMs: 0, eggsHatched: 0, deaths: 0, longestRunMs: 0,
    },
    flags: { seenTutorial: false },
    settings: { sound: true, dpad: false },
    lastSeen: Date.now(),
  };
}

function save() {
  S.lastSeen = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}

function load() {
  let s = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) s = JSON.parse(raw);
  } catch (e) { s = null; }
  const d = defaultState();
  if (s && typeof s === 'object') {
    // shallow-merge with defaults so new fields appear on old saves
    S = Object.assign(d, s);
    S.stats = Object.assign(defaultState().stats, s.stats || {});
    S.flags = Object.assign(defaultState().flags, s.flags || {});
    S.settings = Object.assign(defaultState().settings, s.settings || {});
  } else {
    S = d;
  }
  recalc();
}

function upLvl(id) { return S.up[id] || 0; }

// ---- derived stats ----
function baseDerived() {
  return {
    baseFood: 1, foodMult: 1, globalMult: 1, extraFood: 0,
    every10: 0, goldenBonus: 1, lengthIncome: 0, leftovers: 0, hoard: 0, wallFood: 0,
    startLen: 4,
    comboWindow: 3.5, comboPower: 0.10, comboFreeze: 0,
    feverReq: 12, feverDur: 6, feverMult: 3, eternalFever: false,
    intervalMult: 1, bulletTime: 0, queue: 1, noGrow: 0, bounces: 0,
    dash: false, dashFood: 1, dashTank: 1, oil: false, oilRate: 1,
    ouro: 0, shield: 0, phase: 0,
    luck: 1, critC: 0, critM: 2, eggC: 0.008,
    wheel: false, wheelLuck: 0, deja: 0, tierJump: 0, gambleWin: 0, slot: 0,
    cookie: false, insurance: 0,
    startCombo: 0, overtime: 0,
    ghosts: 0, ghostPower: 1, peer: 0, seance: 0, helpful: 0,
    offlineCap: 2 * 3600, mediumEgg: 0, afterlife: 0,
    portal: false, mobius: 0, magnet: 0, quantum: 0, bigbang: 0, schro: 0,
    timeloop: 0, note: 0, chili: 0, boardPlus: 0, mirrorUnlocked: false, snake2: 0,
    scaleMult: 1, moltWisdom: 0, ancientHunger: 0, cosmicOuro: 0,
    shedBonus: 1, incubator: 0,
  };
}

function recalc() {
  D = baseDerived();
  for (const u of UPGRADES) {
    let l = upLvl(u.id);
    if (l > 0) u.apply(D, l);
  }
  // Molt Wisdom: free virtual levels of two early upgrades
  if (D.moltWisdom > 0) {
    const freeBites = Math.max(0, D.moltWisdom - upLvl('bigBites'));
    const freeJuicy = Math.max(0, D.moltWisdom - upLvl('juicy'));
    if (freeBites > 0) D.baseFood += freeBites;
    if (freeJuicy > 0) D.foodMult *= 1 + 0.10 * freeJuicy;
  }
  for (const b of BOONS) {
    const n = S.boons[b.id] || 0;
    if (n > 0) b.apply(D, n);
  }
  // prestige-scaling effects
  D.baseFood += D.ancientHunger * S.prestiges;
  if (D.cosmicOuro > 0) D.globalMult *= Math.pow(1 + D.cosmicOuro, S.prestiges);
  D.globalMult *= D.scaleMult;
}

// value of one plain apple after all passive multipliers (used for ghosts/oil)
function effFoodValue() {
  return D.baseFood * D.foodMult * D.globalMult;
}

// ghost gold per second
function ghostRate() {
  if (D.ghosts <= 0) return 0;
  let r = D.ghosts * 0.15 * effFoodValue() * D.ghostPower;
  if (D.peer > 0) r *= Math.pow(1 + D.peer, D.ghosts);
  r += D.seance * S.stats.bestRate;
  return r;
}

// ---- prestige ----
const SHED_BASE = 50000;
function scalesForGold(g) {
  if (g < SHED_BASE) return 0;
  return Math.floor(Math.pow(g / SHED_BASE, 0.65) * D.shedBonus);
}
function shedGain() { return scalesForGold(S.goldSinceShed); }

function doShed() {
  const gain = shedGain();
  if (gain <= 0) return false;
  S.scales += gain;
  S.prestiges += 1;
  S.gold = 0;
  S.goldSinceShed = 0;
  // wipe gold-bought upgrades; keep scale-bought ones
  for (const u of UPGRADES) {
    if (u.cur === 'gold') delete S.up[u.id];
  }
  recalc();
  save();
  return gain;
}

// ---- eggs ----
function hatchEgg() {
  if (S.eggs < 1) return null;
  S.eggs -= 1;
  S.stats.eggsHatched += 1;
  const results = [];
  let pulls = 1;
  if (Math.random() < D.incubator) pulls += 1;
  for (let i = 0; i < pulls; i++) {
    const b = BOONS[Math.floor(Math.random() * BOONS.length)];
    const shiny = Math.random() < 0.08;
    const n = shiny ? 3 : 1;
    S.boons[b.id] = (S.boons[b.id] || 0) + n;
    results.push({ boon: b, shiny });
  }
  recalc();
  save();
  return results;
}

// ---- offline gains ----
function offlineGains() {
  const now = Date.now();
  const elapsed = Math.max(0, (now - (S.lastSeen || now)) / 1000);
  if (elapsed < 60) return null;
  const capped = Math.min(elapsed, D.offlineCap);
  const rate = ghostRate();
  const gold = Math.floor(rate * capped);
  let eggs = 0;
  if (D.mediumEgg > 0) {
    const hours = Math.floor(capped / 3600);
    for (let i = 0; i < hours; i++) if (Math.random() < D.mediumEgg) eggs++;
  }
  if (gold <= 0 && eggs <= 0) return null;
  addGold(gold);
  S.eggs += eggs;
  return { gold, eggs, seconds: capped };
}

function addGold(g) {
  S.gold += g;
  S.lifetimeGold += g;
  S.goldSinceShed += g;
}

// ---- number formatting ----
const FMT_SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= FMT_SUFFIX.length) tier = FMT_SUFFIX.length - 1;
  const scaled = n / Math.pow(10, tier * 3);
  return (scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)) + FMT_SUFFIX[tier];
}

function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ---- upgrade purchasing ----
function canBuy(u) {
  const lvl = upLvl(u.id);
  if (lvl >= u.maxLvl) return false;
  if (!reqMet(u)) return false;
  const cost = u.cost(lvl);
  return u.cur === 'gold' ? S.gold >= cost : S.scales >= cost;
}

function reqMet(u) {
  if (!u.req) return true;
  for (const [id, need] of Object.entries(u.req)) {
    if (upLvl(id) < need) return false;
  }
  return true;
}

function buyUpgrade(u) {
  if (!canBuy(u)) return false;
  const cost = u.cost(upLvl(u.id));
  if (u.cur === 'gold') S.gold -= cost; else S.scales -= cost;
  S.up[u.id] = upLvl(u.id) + 1;
  recalc();
  save();
  return true;
}
