// ============================================================
// Snakeremental — core snake gameplay, rendering, effects
// ============================================================

const BASE_COLS = 19, BASE_ROWS = 27;
const BASE_INTERVAL = 150; // ms per cell at speed 1
const BEAT_MS = 480;       // Snake Charmer beat

let canvas, ctx;
let afterlifeUntil = 0;

const Game = {
  active: false, paused: false,
  cols: BASE_COLS, rows: BASE_ROWS, cell: 20, ox: 0, oy: 0,
  snake: [], prev: [], growing: 0,
  dir: { x: 0, y: -1 }, queue: [],
  foods: [],
  acc: 0, time: 0, stepCount: 0,
  combo: 0, comboT: 0, comboFreezeT: 0,
  feverMeter: 0, fever: false, feverT: 0,
  danger: 0,
  runGold: 0, foodCount: 0,
  bounces: 0, shields: 0, ouroUses: 0, timeloopUsed: false,
  dashMeter: 0, dashHeld: false, dashing: false, chiliT: 0,
  mobiusStack: 0, wraps: 0,
  cookieBuff: null,
  mirror: false,
  snake2: null, snake2Timer: 0,
  quantumT: 0,
  history: [], histT: 0,
  invulnT: 0,
  // fx
  particles: [], floaters: [], shake: 0, flash: 0, hue: 130,
  deathInfo: null,
};

// ---------------- audio ----------------
let AC = null;
function beep(freq, dur = 0.08, type = 'square', vol = 0.04, slide = 0) {
  if (!S.settings.sound) return;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), AC.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { /* audio unavailable */ }
}
const SFX = {
  eat: (combo) => beep(300 + Math.min(combo, 30) * 24, 0.07, 'square', 0.045),
  rare: () => { beep(660, 0.1, 'triangle', 0.06); setTimeout(() => beep(990, 0.12, 'triangle', 0.06), 70); },
  crit: () => beep(180, 0.12, 'sawtooth', 0.07, 500),
  danger: () => beep(950, 0.03, 'sine', 0.02),
  death: () => beep(220, 0.5, 'sawtooth', 0.08, -180),
  fever: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'triangle', 0.06), i * 70)); },
  bounce: () => beep(140, 0.08, 'square', 0.06, 80),
  egg: () => beep(500, 0.15, 'sine', 0.06, 300),
  ouro: () => beep(100, 0.3, 'sawtooth', 0.07, 150),
  buy: () => beep(700, 0.06, 'triangle', 0.05, 200),
  wheel: () => beep(400, 0.04, 'square', 0.03),
  loop: () => beep(800, 0.4, 'sine', 0.07, -600),
};

// ---------------- layout ----------------
function layoutCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  Game.cell = Math.floor(Math.min(w / Game.cols, h / Game.rows));
  Game.ox = Math.floor((w - Game.cell * Game.cols) / 2);
  Game.oy = Math.floor((h - Game.cell * Game.rows) / 2);
}

// ---------------- run lifecycle ----------------
function startRun() {
  recalc();
  Game.cols = BASE_COLS + D.boardPlus * 2;
  Game.rows = BASE_ROWS + D.boardPlus * 2;
  layoutCanvas();
  const cx = Math.floor(Game.cols / 2), cy = Math.floor(Game.rows / 2) + 4;
  Game.snake = [];
  for (let i = 0; i < D.startLen; i++) Game.snake.push({ x: cx, y: cy + i });
  Game.prev = Game.snake.map(p => ({ ...p }));
  Game.growing = 0;
  Game.dir = { x: 0, y: -1 };
  Game.queue = [];
  Game.foods = [];
  Game.acc = 0; Game.time = 0; Game.stepCount = 0;
  Game.combo = D.startCombo; Game.comboT = 0; Game.comboFreezeT = 0;
  Game.feverMeter = D.eternalFever ? (Game.feverMeterPersist || 0) : 0;
  Game.fever = false; Game.feverT = 0;
  Game.danger = 0;
  Game.runGold = 0; Game.foodCount = 0;
  Game.bounces = D.bounces; Game.shields = D.shield; Game.ouroUses = D.ouro;
  Game.timeloopUsed = false;
  Game.dashMeter = 100 * D.dashTank; Game.dashHeld = false; Game.dashing = false; Game.chiliT = 0;
  Game.mobiusStack = 0; Game.wraps = 0;
  Game.cookieBuff = null;
  Game.quantumT = 0;
  Game.history = []; Game.histT = 0;
  Game.invulnT = 0;
  Game.particles = []; Game.floaters = []; Game.shake = 0; Game.flash = 0;
  Game.deathInfo = null;
  Game.snake2 = D.snake2 > 0 ? spawnSnake2() : null;
  Game.snake2Timer = 0;
  const nFood = 1 + D.extraFood;
  for (let i = 0; i < nFood; i++) spawnFood();
  Game.active = true; Game.paused = false;
}

function spawnSnake2() {
  return { cells: [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 2, y: 5 }], prev: null };
}

function freeCell() {
  for (let tries = 0; tries < 400; tries++) {
    const x = Math.floor(Math.random() * Game.cols);
    const y = Math.floor(Math.random() * Game.rows);
    if (Game.snake.some(s => s.x === x && s.y === y)) continue;
    if (Game.foods.some(f => f.x === x && f.y === y)) continue;
    return { x, y };
  }
  return null;
}

function runLuck() { return D.luck * (Game.cookieBuff === 'ck_luck' ? 3 : 1); }

function pickTier() {
  const luck = runLuck();
  // special chaos foods first
  if (D.note > 0 && Math.random() < 0.05) return 'note';
  if (D.chili > 0 && Math.random() < 0.04) return 'chili';
  if (D.schro > 0 && Math.random() < 0.04) return 'box';
  if (Math.random() < Math.min(0.15, D.eggC * luck)) return 'egg';
  let tier = 'apple';
  if (Math.random() < Math.min(0.5, FOOD_TIERS.rainbow.p * luck)) tier = 'rainbow';
  else if (Math.random() < Math.min(0.6, FOOD_TIERS.crystal.p * luck)) tier = 'crystal';
  else if (Math.random() < Math.min(0.7, FOOD_TIERS.golden.p * luck)) tier = 'golden';
  // Four-Leaf Cobra: chance to jump one rarity tier
  if (D.tierJump > 0 && Math.random() < D.tierJump) {
    const i = TIER_ORDER.indexOf(tier);
    if (i >= 0 && i < TIER_ORDER.length - 1) tier = TIER_ORDER[i + 1];
  }
  return tier;
}

function spawnFood() {
  const pos = freeCell();
  if (!pos) return;
  Game.foods.push({ x: pos.x, y: pos.y, tier: pickTier(), t: 0 });
}

// ---------------- input ----------------
function pushDir(x, y) {
  if (!Game.active || Game.paused) return;
  if (Game.mirror) { x = -x; y = -y; }
  const last = Game.queue.length ? Game.queue[Game.queue.length - 1] : Game.dir;
  if (last.x === x && last.y === y) return;
  if (last.x === -x && last.y === -y) return; // no 180s
  if (Game.queue.length >= D.queue) Game.queue.shift();
  Game.queue.push({ x, y });
}

// ---------------- stepping ----------------
function currentInterval() {
  let iv = BASE_INTERVAL * D.intervalMult;
  if (Game.cookieBuff === 'ck_slow') iv *= 1.15;
  if (Game.dashing) iv *= 0.55;
  // bullet time: if continuing straight would kill, slow down
  if (D.bulletTime > 0 && !Game.dashing) {
    const h = Game.snake[0];
    const nx = h.x + Game.dir.x, ny = h.y + Game.dir.y;
    if (wouldDie(nx, ny)) iv *= 1 + D.bulletTime * 2;
  }
  return iv;
}

function wouldDie(nx, ny) {
  if (nx < 0 || ny < 0 || nx >= Game.cols || ny >= Game.rows) return !D.portal && Game.bounces <= 0;
  return Game.snake.some((s, i) => i < Game.snake.length - 1 && s.x === nx && s.y === ny);
}

function snapshot() {
  Game.history.push({
    snake: Game.snake.map(p => ({ ...p })),
    dir: { ...Game.dir },
    combo: Game.combo, danger: Game.danger,
  });
  if (Game.history.length > 10) Game.history.shift();
}

function step() {
  Game.stepCount++;
  if (Game.queue.length) Game.dir = Game.queue.shift();
  const h = Game.snake[0];
  let nx = h.x + Game.dir.x, ny = h.y + Game.dir.y;

  // walls
  if (nx < 0 || ny < 0 || nx >= Game.cols || ny >= Game.rows) {
    if (D.portal) {
      nx = (nx + Game.cols) % Game.cols;
      ny = (ny + Game.rows) % Game.rows;
      Game.wraps++;
      if (D.mobius > 0) Game.mobiusStack++;
      burst(cellX(nx), cellY(ny), '#ff5dd2', 10);
    } else if (Game.bounces > 0) {
      const d = bounceDir(h);
      if (d) {
        Game.bounces--;
        Game.dir = d;
        nx = h.x + d.x; ny = h.y + d.y;
        Game.shake = 8; SFX.bounce();
        floater(cellX(h.x), cellY(h.y), 'BOING!', '#5dff8a');
      } else { return die('wall'); }
    } else {
      return die('wall');
    }
  }

  // self collision (tail tip vacates unless growing)
  const hitIdx = Game.snake.findIndex((s, i) =>
    s.x === nx && s.y === ny && !(i === Game.snake.length - 1 && Game.growing <= 0));
  if (hitIdx >= 0 && Game.invulnT <= 0) {
    if (D.phase > 0 && Math.random() < D.phase) {
      burst(cellX(nx), cellY(ny), '#c95dff', 8);
      floater(cellX(nx), cellY(ny), 'PHASE', '#c95dff');
    } else if (Game.ouroUses > 0 && hitIdx > 2) {
      // Ouroboros: cut the tail at the bite point, severed bits become gold
      const cut = Game.snake.length - hitIdx;
      const gain = Math.floor(cut * effFoodValue() * 2);
      Game.snake = Game.snake.slice(0, hitIdx);
      Game.prev = Game.prev.slice(0, hitIdx);
      Game.ouroUses--;
      earn(gain, cellX(nx), cellY(ny), '#ffd75d', `OUROBOROS +${fmt(gain)}`);
      SFX.ouro(); Game.shake = 10;
    } else if (Game.shields > 0) {
      Game.shields--;
      Game.invulnT = 1.2;
      Game.flash = 0.5; Game.shake = 8;
      floater(cellX(h.x), cellY(h.y), 'SHIELDED', '#7dfff9');
      return; // skip this move entirely
    } else if (!Game.timeloopUsed && D.timeloop > 0 && Math.random() < D.timeloop && Game.history.length > 6) {
      return rewind();
    } else {
      return die('self');
    }
  }

  // move
  Game.prev = Game.snake.map(p => ({ ...p }));
  Game.snake.unshift({ x: nx, y: ny });
  if (Game.growing > 0) { Game.growing--; Game.prev.unshift({ ...Game.prev[0] || { x: nx, y: ny } }); }
  else Game.snake.pop();

  // near-miss danger bonus
  let nearMiss = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ax = nx + dx, ay = ny + dy;
    if (Game.snake.some((s, i) => i > 3 && s.x === ax && s.y === ay)) { nearMiss = true; break; }
  }
  if (nearMiss) {
    Game.danger = Math.min(Game.danger + 1, 60);
    if (Game.danger % 5 === 0) SFX.danger();
    spark(cellX(nx), cellY(ny), '#ffb84d');
  }

  // eat
  const fi = Game.foods.findIndex(f => f.x === nx && f.y === ny);
  if (fi >= 0) eatFood(fi);

  // magnet: food creeps toward head
  if (D.magnet > 0 && Game.stepCount % 2 === 0) {
    for (const f of Game.foods) {
      const dx = nx - f.x, dy = ny - f.y;
      if (Math.abs(dx) + Math.abs(dy) <= D.magnet && (dx !== 0 || dy !== 0)) {
        const mx = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0;
        const my = mx === 0 ? Math.sign(dy) : 0;
        const tx = f.x + mx, ty = f.y + my;
        if (!Game.snake.some(s => s.x === tx && s.y === ty) &&
            !Game.foods.some(o => o !== f && o.x === tx && o.y === ty)) {
          f.x = tx; f.y = ty;
        }
      }
    }
  }

  // Snake² buddy AI (moves every other player step)
  if (Game.snake2 && Game.stepCount % 2 === 0) stepSnake2();
}

function bounceDir(h) {
  // pick a perpendicular direction with the most open space
  const opts = Game.dir.x !== 0
    ? [{ x: 0, y: -1 }, { x: 0, y: 1 }]
    : [{ x: -1, y: 0 }, { x: 1, y: 0 }];
  const scored = opts.map(d => {
    let free = 0, x = h.x + d.x, y = h.y + d.y;
    while (x >= 0 && y >= 0 && x < Game.cols && y < Game.rows &&
           !Game.snake.some(s => s.x === x && s.y === y) && free < 8) {
      free++; x += d.x; y += d.y;
    }
    return { d, free };
  }).sort((a, b) => b.free - a.free);
  return scored[0].free > 0 ? scored[0].d : null;
}

function rewind() {
  Game.timeloopUsed = true;
  const snap = Game.history[0];
  Game.snake = snap.snake.map(p => ({ ...p }));
  Game.prev = Game.snake.map(p => ({ ...p }));
  Game.dir = { ...snap.dir };
  Game.queue = [];
  Game.combo = snap.combo; Game.danger = snap.danger;
  Game.history = [];
  Game.invulnT = 1.0;
  Game.flash = 0.8; Game.shake = 12;
  SFX.loop();
  floater(cellX(Game.snake[0].x), cellY(Game.snake[0].y), '⏪ TIME LOOP', '#7dfff9');
}

function stepSnake2() {
  const s2 = Game.snake2;
  const head = s2.cells[0];
  let target = null, best = 1e9;
  for (const f of Game.foods) {
    const d = Math.abs(f.x - head.x) + Math.abs(f.y - head.y);
    if (d < best) { best = d; target = f; }
  }
  if (!target) return;
  const cand = [];
  if (target.x !== head.x) cand.push({ x: Math.sign(target.x - head.x), y: 0 });
  if (target.y !== head.y) cand.push({ x: 0, y: Math.sign(target.y - head.y) });
  cand.push({ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 });
  s2.prev = s2.cells.map(p => ({ ...p }));
  for (const d of cand) {
    const nx = head.x + d.x, ny = head.y + d.y;
    if (nx < 0 || ny < 0 || nx >= Game.cols || ny >= Game.rows) continue;
    if (s2.cells.some(c => c.x === nx && c.y === ny)) continue;
    const ph = Game.snake[0];
    if (Math.abs(nx - ph.x) + Math.abs(ny - ph.y) < 2) continue; // stay out of the player's face
    s2.cells.unshift({ x: nx, y: ny });
    s2.cells.pop();
    const fi = Game.foods.findIndex(f => f.x === nx && f.y === ny);
    if (fi >= 0) {
      const f = Game.foods[fi];
      const v = Math.floor(foodBaseValue(f) * D.snake2);
      Game.foods.splice(fi, 1);
      spawnFood();
      if (v > 0) earn(v, cellX(nx), cellY(ny), '#8dffd0', `+${fmt(v)}`);
    }
    return;
  }
}

// ---------------- eating & money ----------------
function foodBaseValue(f) {
  const tier = FOOD_TIERS[f.tier];
  let v = tier.v;
  if (f.tier === 'golden' || f.tier === 'crystal' || f.tier === 'rainbow') v *= D.goldenBonus;
  if (f.tier === 'box') v = Math.random() * D.schro; // Schrödinger: 0..N×
  if (f.tier === 'chili') v = D.chili;
  return D.baseFood * v * D.foodMult * D.globalMult;
}

function eatFood(fi) {
  const f = Game.foods[fi];
  Game.foods.splice(fi, 1);
  Game.foodCount++;
  S.stats.totalFood++;

  const labels = [];
  let g = foodBaseValue(f);

  if (f.tier !== 'apple') { SFX.rare(); labels.push(FOOD_TIERS[f.tier].name.toUpperCase()); }

  // combo
  Game.combo++;
  Game.comboT = 0;
  Game.comboFreezeT = D.comboFreeze;
  if (Game.combo > S.stats.bestCombo) S.stats.bestCombo = Game.combo;
  g *= 1 + Game.combo * D.comboPower;

  // fever
  Game.feverMeter++;
  if (!Game.fever && Game.feverMeter >= D.feverReq) triggerFever();
  if (Game.fever) g *= D.feverMult;

  // danger streak cash-in
  if (Game.danger > 0) {
    const dm = 1 + Game.danger * 0.05 * D.dangerPower;
    g *= dm;
    if (Game.danger >= 5) labels.push(`DANGER ×${dm.toFixed(1)}`);
    Game.danger = 0;
  }

  // crit
  let critC = D.critC + (Game.cookieBuff === 'ck_crit' ? 0.25 : 0);
  if (Math.random() < critC) { g *= D.critM; labels.push('CRIT!'); SFX.crit(); Game.shake = Math.max(Game.shake, 6); }

  // Gambler's Fang
  if (D.gambleWin > 0) {
    const r = Math.random();
    if (r < 0.10) { g = 0; labels.push('DUD…'); }
    else if (r < 0.10 + D.gambleWin) { g *= 4; labels.push('JACKPOT ×4'); }
  }

  // positional / state multipliers
  if (D.wallFood > 0 && (f.x === 0 || f.y === 0 || f.x === Game.cols - 1 || f.y === Game.rows - 1)) {
    g *= 1 + D.wallFood; labels.push('WALL FOOD');
  }
  if (Game.dashing && D.dashFood > 1) g *= D.dashFood;
  if (Game.mobiusStack > 0) {
    g *= 1 + D.mobius * Game.mobiusStack;
    labels.push(`MÖBIUS ×${(1 + D.mobius * Game.mobiusStack).toFixed(1)}`);
    Game.mobiusStack = 0;
  }
  if (D.every10 > 0 && Game.foodCount % 10 === 0) { g *= D.every10; labels.push(`GOURMET ×${D.every10}`); }
  if (D.slot > 0 && Game.foodCount % 25 === 0) { g *= D.slot; labels.push(`\u{1F3B0} SLOT ×${D.slot}`); SFX.fever(); }
  if (D.hoard > 0) g *= 1 + D.hoard * Math.min(10, Math.floor(Game.foodCount / 10));
  if (D.lengthIncome > 0) g *= 1 + D.lengthIncome * Game.snake.length;
  if (D.overtime > 0 && Game.time > 60) g *= 1 + D.overtime * ((Game.time - 60) / 10);

  // Snake Charmer: eat a note on the beat pulse
  if (f.tier === 'note') {
    const phase = (performance.now() % BEAT_MS) / BEAT_MS;
    if (phase < 0.3 || phase > 0.85) { g *= D.note; labels.push(`\u{1F3B5} ON BEAT ×${D.note}`); SFX.fever(); }
    else labels.push('off beat…');
  }

  // Cursed Chili: big money, lose control
  if (f.tier === 'chili') {
    Game.chiliT = 2.0;
    labels.push('\u{1F336} TOO SPICY');
    Game.shake = Math.max(Game.shake, 10);
  }

  if (f.tier === 'box') labels.push(g < effFoodValue() ? 'the box was empty' : 'THE BOX DELIVERS');

  // Mystery egg → egg currency
  if (f.tier === 'egg') {
    S.eggs++;
    SFX.egg();
    floater(cellX(f.x), cellY(f.y) - 14, '+1 \u{1F95A}', '#f5ecd7');
  }

  // run blessings
  if (Game.cookieBuff === 'ck_gold') g *= 2;
  if (Game.mirror) g *= 3;

  // Fortune Cookie triggers on the very first food
  if (D.cookie && Game.foodCount === 1) {
    const b = COOKIE_BLESSINGS[Math.floor(Math.random() * COOKIE_BLESSINGS.length)];
    Game.cookieBuff = b.id;
    if (b.id === 'ck_fever') triggerFever();
    floater(cellX(f.x), cellY(f.y) - 28, `\u{1F960} ${b.name}!`, '#ffd75d');
    UI.toast(`\u{1F960} ${b.name}: ${b.desc}`);
  }

  // Déjà Chew: it happens again
  if (D.deja > 0 && Math.random() < D.deja) { g *= 2; labels.push('DÉJÀ CHEW'); }

  g = Math.max(0, Math.floor(g));
  earn(g, cellX(f.x), cellY(f.y), FOOD_TIERS[f.tier].color, `+${fmt(g)}`);
  for (const l of labels) floaterQueued(cellX(f.x), cellY(f.y), l, '#ffffff');

  // grow + dash refill
  if (!(D.noGrow > 0 && Math.random() < D.noGrow)) Game.growing++;
  Game.dashMeter = Math.min(100 * D.dashTank, Game.dashMeter + 22);

  SFX.eat(Game.combo);
  burst(cellX(f.x), cellY(f.y), FOOD_TIERS[f.tier].color, f.tier === 'apple' ? 8 : 16);

  // Big Bang Bite: hoover the whole board
  if (D.bigbang > 0 && Game.foodCount % D.bigbang === 0 && Game.foods.length > 0) {
    let total = 0;
    for (const bf of Game.foods) {
      total += Math.floor(foodBaseValue(bf) * (Game.fever ? D.feverMult : 1));
      burst(cellX(bf.x), cellY(bf.y), FOOD_TIERS[bf.tier].color, 12);
    }
    Game.foods = [];
    earn(total, cellX(f.x), cellY(f.y) - 20, '#ff5dd2', `\u{1F4A5} BIG BANG +${fmt(total)}`);
    Game.shake = 14; SFX.fever();
  }

  while (Game.foods.length < 1 + D.extraFood) spawnFood();
}

function earn(g, x, y, color, label) {
  if (g <= 0) { if (label) floater(x, y, label, color); return; }
  addGold(g);
  Game.runGold += g;
  if (label) floater(x, y, label, color);
}

function triggerFever() {
  Game.fever = true;
  Game.feverT = D.feverDur;
  Game.feverMeter = 0;
  Game.flash = 0.6;
  SFX.fever();
  UI.toast(`\u{1F525} FEVER! Everything ×${D.feverMult}`);
}

// ---------------- death ----------------
function die(cause) {
  SFX.death();
  Game.shake = 20; Game.flash = 1;
  Game.active = false;
  S.stats.deaths++;
  S.stats.runs++;

  const bonuses = [];
  // Leftovers: tail jerky
  if (D.leftovers > 0 && Game.runGold > 0) {
    const jerky = Math.floor(Game.runGold * D.leftovers * Game.snake.length);
    if (jerky > 0) { addGold(jerky); Game.runGold += jerky; bonuses.push([`\u{1F953} Leftovers (${Game.snake.length} segments)`, jerky]); }
  }
  // Insurance Scam
  if (D.insurance > 0 && Math.random() < D.insurance && Game.runGold > 0) {
    addGold(Game.runGold);
    bonuses.push(['\u{1F4DC} Insurance paid out ×2', Game.runGold]);
    Game.runGold *= 2;
  }
  // Afterlife Savings: ghosts speed up
  if (D.afterlife > 0) afterlifeUntil = Date.now() + 60000;

  if (Game.runGold > S.stats.bestRun) S.stats.bestRun = Game.runGold;
  if (Game.snake.length > S.stats.bestLen) S.stats.bestLen = Game.snake.length;
  if (Game.time > 5) {
    const rate = Game.runGold / Game.time;
    if (rate > S.stats.bestRate) S.stats.bestRate = rate;
  }
  if (Game.time * 1000 > S.stats.longestRunMs) S.stats.longestRunMs = Math.floor(Game.time * 1000);
  if (D.eternalFever) Game.feverMeterPersist = Game.feverMeter;

  Game.deathInfo = { cause, gold: Game.runGold, time: Game.time, len: Game.snake.length, food: Game.foodCount, bonuses };
  save();
  setTimeout(() => UI.showDeath(Game.deathInfo), 700);
}

// ---------------- frame update ----------------
function updateGame(dt) {
  if (!Game.active || Game.paused) return;
  Game.time += dt;
  S.stats.playMs += dt * 1000;

  // chili override: forced dash
  if (Game.chiliT > 0) { Game.chiliT -= dt; Game.dashing = true; }
  else {
    Game.dashing = D.dash && Game.dashHeld && Game.dashMeter > 0;
    if (Game.dashing) Game.dashMeter = Math.max(0, Game.dashMeter - 40 * dt);
  }

  // combo decay
  if (Game.comboFreezeT > 0) Game.comboFreezeT -= dt;
  else if (Game.combo > 0) {
    Game.comboT += dt;
    if (Game.comboT > D.comboWindow) { Game.combo = Math.max(0, D.startCombo); Game.comboT = 0; }
  }

  // fever countdown
  if (Game.fever) {
    Game.feverT -= dt;
    if (Game.feverT <= 0) Game.fever = false;
  }

  if (Game.invulnT > 0) Game.invulnT -= dt;

  // helpful spirits passive income during run
  if (D.helpful > 0) {
    const mult = (Game.cookieBuff === 'ck_ghost' ? 5 : 1) * afterlifeMult();
    Game.spiritAcc = (Game.spiritAcc || 0) + ghostRate() * D.helpful * mult * dt;
    if (Game.spiritAcc >= 1) {
      const gain = Math.floor(Game.spiritAcc);
      Game.spiritAcc -= gain;
      addGold(gain); Game.runGold += gain;
    }
  }

  // quantum tongue
  if (D.quantum > 0) {
    Game.quantumT += dt;
    if (Game.quantumT > 4) {
      Game.quantumT = 0;
      if (Math.random() < D.quantum && Game.foods.length) {
        const h = Game.snake[0];
        let nearest = Game.foods[0], best = 1e9;
        for (const f of Game.foods) {
          const d = Math.abs(f.x - h.x) + Math.abs(f.y - h.y);
          if (d < best) { best = d; nearest = f; }
        }
        const tx = h.x + Game.dir.x * 2, ty = h.y + Game.dir.y * 2;
        if (tx >= 0 && ty >= 0 && tx < Game.cols && ty < Game.rows &&
            !Game.snake.some(s => s.x === tx && s.y === ty)) {
          burst(cellX(nearest.x), cellY(nearest.y), '#7dfff9', 10);
          nearest.x = tx; nearest.y = ty;
          burst(cellX(tx), cellY(ty), '#7dfff9', 10);
          floater(cellX(tx), cellY(ty), '⚛ blip', '#7dfff9');
        }
      }
    }
  }

  // timeloop snapshots
  Game.histT += dt;
  if (Game.histT > 0.4) { Game.histT = 0; snapshot(); }

  // movement
  Game.acc += dt * 1000;
  const iv = currentInterval();
  let guard = 0;
  while (Game.acc >= iv && Game.active && guard++ < 6) {
    Game.acc -= iv;
    step();
  }
}

function afterlifeMult() {
  return Date.now() < afterlifeUntil ? 1 + D.afterlife : 1;
}

// ---------------- fx helpers ----------------
function cellX(gx) { return Game.ox + (gx + 0.5) * Game.cell; }
function cellY(gy) { return Game.oy + (gy + 0.5) * Game.cell; }

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 140;
    Game.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, t: 0, color, size: 2 + Math.random() * 3 });
  }
}
function spark(x, y, color) {
  Game.particles.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -60, life: 0.35, t: 0, color, size: 2 });
}

let floaterStagger = 0;
function floater(x, y, txt, color) {
  Game.floaters.push({ x, y, txt, color, t: 0, life: 1.1 });
}
function floaterQueued(x, y, txt, color) {
  floaterStagger = (floaterStagger + 1) % 4;
  Game.floaters.push({ x, y: y + 16 + floaterStagger * 15, txt, color, t: -0.12 * floaterStagger, life: 1.1 });
}

// ---------------- rendering ----------------
function render(dt) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.save();

  // shake
  if (Game.shake > 0) {
    Game.shake = Math.max(0, Game.shake - dt * 40);
    ctx.translate((Math.random() - 0.5) * Game.shake, (Math.random() - 0.5) * Game.shake);
  }

  // background
  ctx.fillStyle = '#080b14';
  ctx.fillRect(-20, -20, w + 40, h + 40);

  const { cell, ox, oy, cols, rows } = Game;
  const bw = cell * cols, bh = cell * rows;

  // board area
  const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.75);
  if (Game.fever) {
    const fh = (performance.now() / 8) % 360;
    grad.addColorStop(0, `hsla(${fh},60%,14%,1)`);
    grad.addColorStop(1, '#07080f');
  } else {
    grad.addColorStop(0, '#0d1322');
    grad.addColorStop(1, '#07080f');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(ox, oy, bw, bh);

  // grid dots
  ctx.fillStyle = 'rgba(120,150,255,0.06)';
  for (let gx = 1; gx < cols; gx++)
    for (let gy = 1; gy < rows; gy++)
      ctx.fillRect(ox + gx * cell - 1, oy + gy * cell - 1, 2, 2);

  // border — portal walls glow pink
  ctx.strokeStyle = D.portal ? 'rgba(255,93,210,0.7)' : 'rgba(90,120,220,0.35)';
  ctx.lineWidth = 2;
  if (D.portal) { ctx.shadowColor = '#ff5dd2'; ctx.shadowBlur = 12; }
  ctx.strokeRect(ox + 1, oy + 1, bw - 2, bh - 2);
  ctx.shadowBlur = 0;

  const lerpT = Game.active && !Game.paused ? Math.min(1, Game.acc / currentInterval()) : 1;

  // foods
  const now = performance.now();
  for (const f of Game.foods) {
    f.t = (f.t || 0) + dt;
    const tier = FOOD_TIERS[f.tier];
    const px = cellX(f.x), py = cellY(f.y);
    let pulse = 1 + Math.sin(f.t * 5) * 0.12;
    if (f.tier === 'note') {
      const phase = (now % BEAT_MS) / BEAT_MS;
      pulse = 1 + (phase < 0.3 || phase > 0.85 ? 0.5 : 0);
    }
    const r = cell * tier.r * pulse;
    ctx.shadowColor = tier.glow; ctx.shadowBlur = 14;
    if (f.tier === 'rainbow') {
      ctx.fillStyle = `hsl(${(now / 4) % 360},100%,65%)`;
      ctx.shadowColor = ctx.fillStyle;
    } else ctx.fillStyle = tier.color;
    ctx.beginPath();
    if (f.tier === 'egg') ctx.ellipse(px, py, r * 0.8, r, 0, 0, Math.PI * 2);
    else if (f.tier === 'box') { ctx.rect(px - r * 0.8, py - r * 0.8, r * 1.6, r * 1.6); }
    else ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (f.tier === 'note') { ctx.fillStyle = '#fff'; ctx.font = `${Math.floor(cell * 0.6)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('♪', px, py + cell * 0.2); }
    if (f.tier === 'chili') { ctx.fillStyle = '#fff'; ctx.font = `${Math.floor(cell * 0.55)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('\u{1F336}', px, py + cell * 0.2); }
    if (f.tier === 'box') { ctx.fillStyle = '#3a2a12'; ctx.font = `bold ${Math.floor(cell * 0.6)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('?', px, py + cell * 0.22); }
    if (f.tier === 'golden') { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.2, 0, Math.PI * 2); ctx.fill(); }
  }

  // Snake² buddy
  if (Game.snake2) drawMiniSnake(Game.snake2, lerpT);

  // the snake
  drawSnake(lerpT);

  // particles
  for (let i = Game.particles.length - 1; i >= 0; i--) {
    const p = Game.particles[i];
    p.t += dt;
    if (p.t >= p.life) { Game.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 60 * dt;
    const a = 1 - p.t / p.life;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // floaters
  ctx.textAlign = 'center';
  for (let i = Game.floaters.length - 1; i >= 0; i--) {
    const f = Game.floaters[i];
    f.t += dt;
    if (f.t >= f.life) { Game.floaters.splice(i, 1); continue; }
    if (f.t < 0) continue;
    const a = 1 - f.t / f.life;
    ctx.globalAlpha = Math.min(1, a * 2);
    ctx.font = `bold ${Math.floor(cell * 0.62)}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = f.color;
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
    ctx.fillText(f.txt, f.x, f.y - f.t * 46);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  // flash
  if (Game.flash > 0) {
    Game.flash = Math.max(0, Game.flash - dt * 2);
    ctx.fillStyle = `rgba(255,255,255,${Game.flash * 0.35})`;
    ctx.fillRect(-20, -20, w + 40, h + 40);
  }

  ctx.restore();
}

function drawSnake(t) {
  const { cell } = Game;
  const n = Game.snake.length;
  if (n === 0) return;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const cur = Game.snake[i];
    const prv = Game.prev[i] || cur;
    // if a segment wrapped through a portal, don't interpolate across the board
    const jump = Math.abs(cur.x - prv.x) + Math.abs(cur.y - prv.y) > 2;
    const px = jump ? cur.x : prv.x + (cur.x - prv.x) * t;
    const py = jump ? cur.y : prv.y + (cur.y - prv.y) * t;
    pts.push({ x: Game.ox + (px + 0.5) * cell, y: Game.oy + (py + 0.5) * cell });
  }

  const feverMode = Game.fever;
  const baseHue = feverMode ? (performance.now() / 4) % 360 : 135;

  // body: draw as connected strokes, split at portal jumps
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = n - 1; i > 0; i--) {
    const a = pts[i], b = pts[i - 1];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > cell * 2.5) continue; // portal seam
    const frac = i / n;
    const hue = (baseHue + frac * (feverMode ? 120 : 40)) % 360;
    const width = cell * (0.78 - 0.3 * frac);
    ctx.strokeStyle = `hsl(${hue},80%,${feverMode ? 60 : 48}%)`;
    ctx.shadowColor = `hsl(${hue},90%,60%)`;
    ctx.shadowBlur = feverMode ? 14 : 7;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // scale shimmer every few segments
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = 2; i < n; i += 3) {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, cell * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  // head
  const hp = pts[0];
  const blink = Game.invulnT > 0 && Math.floor(performance.now() / 80) % 2 === 0;
  ctx.shadowColor = `hsl(${baseHue},95%,65%)`; ctx.shadowBlur = Game.dashing ? 22 : 12;
  ctx.fillStyle = blink ? '#ffffff' : `hsl(${baseHue},85%,58%)`;
  ctx.beginPath();
  ctx.arc(hp.x, hp.y, cell * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // eyes
  const ex = Game.dir.x, ey = Game.dir.y;
  const off = cell * 0.16;
  ctx.fillStyle = '#0a0a12';
  for (const s of [-1, 1]) {
    const perpx = -ey * s, perpy = ex * s;
    ctx.beginPath();
    ctx.arc(hp.x + ex * off + perpx * off, hp.y + ey * off + perpy * off, cell * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  // tongue when dashing
  if (Game.dashing) {
    ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hp.x + ex * cell * 0.4, hp.y + ey * cell * 0.4);
    ctx.lineTo(hp.x + ex * cell * 0.85, hp.y + ey * cell * 0.85);
    ctx.stroke();
  }
}

function drawMiniSnake(s2, t) {
  const { cell } = Game;
  ctx.globalAlpha = 0.55;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#8dffd0';
  ctx.shadowColor = '#8dffd0'; ctx.shadowBlur = 8;
  ctx.lineWidth = cell * 0.4;
  ctx.beginPath();
  for (let i = 0; i < s2.cells.length; i++) {
    const cur = s2.cells[i], prv = (s2.prev && s2.prev[i]) || cur;
    const px = Game.ox + (prv.x + (cur.x - prv.x) * t + 0.5) * cell;
    const py = Game.oy + (prv.y + (cur.y - prv.y) * t + 0.5) * cell;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}
