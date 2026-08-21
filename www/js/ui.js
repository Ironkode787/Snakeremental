// ============================================================
// Snakeremental — menus, upgrade tree, modals, HUD
// ============================================================

const UI = {
  screen: 'home',
  branch: 'appetite',
  lastGold: -1, lastScales: -1, lastEggs: -1,
};

function $(id) { return document.getElementById(id); }

// ---------------- navigation ----------------
function showScreen(name) {
  UI.screen = name;
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  $(`screen-${name}`).classList.remove('hidden');
  for (const b of document.querySelectorAll('#nav button')) {
    b.classList.toggle('active', b.dataset.screen === name);
  }
  if (name === 'tree') renderTree();
  if (name === 'nest') renderNest();
  if (name === 'shed') renderShed();
  if (name === 'stats') renderStats();
  if (name === 'home') renderHome();
}

function enterRun() {
  $('menu').classList.add('hidden');
  $('nav').classList.add('hidden');
  $('runHud').classList.remove('hidden');
  $('runControls').classList.remove('hidden');
  $('btnDash').classList.toggle('hidden', !D.dash);
  $('btnSell').classList.toggle('hidden', !D.oil);
  $('btnMirror').classList.toggle('hidden', !D.mirrorUnlocked);
  $('btnMirror').classList.remove('on');
  $('dpad').classList.toggle('hidden', !S.settings.dpad);
  startRun();
}

function exitRun() {
  $('menu').classList.remove('hidden');
  $('nav').classList.remove('hidden');
  $('runHud').classList.add('hidden');
  $('runControls').classList.add('hidden');
  $('dpad').classList.add('hidden');
  Game.active = false;
  Game.mirror = false;
  showScreen('home');
  save();
}

// ---------------- HUD (called every frame) ----------------
function updateHUD() {
  if (S.gold !== UI.lastGold) { $('goldVal').textContent = fmt(S.gold); UI.lastGold = S.gold; }
  if (S.scales !== UI.lastScales) {
    $('scalesVal').textContent = fmt(S.scales);
    $('scalesBox').classList.toggle('hidden', S.scales <= 0 && S.prestiges === 0);
    UI.lastScales = S.scales;
  }
  if (S.eggs !== UI.lastEggs) {
    $('eggsVal').textContent = fmt(S.eggs);
    $('eggsBox').classList.toggle('hidden', S.eggs <= 0 && S.stats.eggsHatched === 0);
    UI.lastEggs = S.eggs;
  }
  if (!Game.active) return;

  const comboMult = 1 + Game.combo * D.comboPower;
  $('comboLabel').textContent = `×${comboMult.toFixed(1)}${Game.combo > 0 ? ` (${Game.combo})` : ''}`;
  const cw = Game.combo > 0 ? Math.max(0, 1 - Game.comboT / D.comboWindow) : 0;
  $('comboFill').style.width = `${cw * 100}%`;
  $('comboFill').classList.toggle('frozen', Game.comboFreezeT > 0);

  const fv = Game.fever ? Game.feverT / D.feverDur : Game.feverMeter / D.feverReq;
  $('feverFill').style.width = `${Math.min(1, fv) * 100}%`;
  $('feverFill').classList.toggle('active', Game.fever);

  $('runGoldLabel').textContent = `+${fmt(Game.runGold)}`;

  const badges = [];
  if (Game.danger > 2) badges.push(`😈 ${Game.danger}`);
  if (Game.shields > 0) badges.push(`🛡 ${Game.shields}`);
  if (Game.bounces > 0) badges.push(`🏐 ${Game.bounces}`);
  if (Game.ouroUses > 0) badges.push(`♾ ${Game.ouroUses}`);
  if (Game.mirror) badges.push('🪞 ×3');
  if (Game.chiliT > 0) badges.push('🌶🔥');
  $('runBadges').textContent = badges.join('  ');

  if (D.dash) $('dashFill').style.height = `${(Game.dashMeter / (100 * D.dashTank)) * 100}%`;
  if (D.oil) $('sellVal').textContent = Game.snake.length > 6 ? fmt(sellValue()) : '';
}

function sellValue() {
  const segs = Math.floor(Game.snake.length / 2);
  return Math.floor(segs * effFoodValue() * 3 * D.oilRate);
}

function doSell() {
  if (!Game.active || Game.snake.length <= 6) return;
  const segs = Math.floor(Game.snake.length / 2);
  const gain = sellValue();
  Game.snake = Game.snake.slice(0, Game.snake.length - segs);
  Game.prev = Game.prev.slice(0, Game.snake.length);
  const tail = Game.snake[Game.snake.length - 1];
  earn(gain, cellX(tail.x), cellY(tail.y), '#ffd75d', `🧴 SOLD ${segs} +${fmt(gain)}`);
  SFX.buy();
}

// ---------------- home ----------------
function renderHome() {
  const rate = ghostRate() * afterlifeMult();
  $('idleInfo').innerHTML = rate > 0
    ? `👻 <b>${fmt(rate)}</b> gold/sec while away${afterlifeMult() > 1 ? ' <span class="fever-text">(haunted ×' + afterlifeMult() + ')</span>' : ''}`
    : '';
  const st = S.stats;
  $('homeStats').innerHTML = st.runs > 0
    ? `Best run <b>${fmt(st.bestRun)}</b> · Best combo <b>×${st.bestCombo}</b> · Sheds <b>${S.prestiges}</b>`
    : '';
  $('homeHint').classList.toggle('hidden', st.runs > 3);
  // nav notification dots
  const affordable = UPGRADES.some(u => canBuy(u) && !branchLocked(u.branch));
  $('navTreeDot').classList.toggle('hidden', !affordable);
  $('navNestDot').classList.toggle('hidden', S.eggs < 1);
  $('navShedDot').classList.toggle('hidden', shedGain() < 1);
}

function branchLocked(bid) {
  const b = BRANCHES.find(x => x.id === bid);
  return b.locked(S);
}

// ---------------- upgrade tree ----------------
function renderTree() {
  const tabs = $('branchTabs');
  tabs.innerHTML = '';
  for (const b of BRANCHES) {
    const locked = b.locked(S);
    const btn = document.createElement('button');
    btn.className = 'branch-tab' + (UI.branch === b.id ? ' active' : '') + (locked ? ' locked' : '');
    btn.style.setProperty('--bc', b.color);
    btn.innerHTML = `${locked ? '🔒' : b.icon}<span>${b.name}</span>`;
    btn.onclick = () => { UI.branch = b.id; renderTree(); };
    tabs.appendChild(btn);
  }

  const b = BRANCHES.find(x => x.id === UI.branch);
  const info = $('branchInfo');
  const list = $('nodeList');
  list.innerHTML = '';
  if (b.locked(S)) {
    info.innerHTML = `<div class="locked-msg">🔒 ${b.lockText}</div>`;
    return;
  }
  const nodes = UPGRADES.filter(u => u.branch === b.id);
  const spent = nodes.reduce((a, u) => a + upLvl(u.id), 0);
  const total = nodes.reduce((a, u) => a + u.maxLvl, 0);
  info.innerHTML = `<span style="color:${b.color}">${b.icon} ${b.name}</span> — ${spent}/${total} levels`;

  let lastTier = 0;
  for (const u of nodes) {
    if (u.tier !== lastTier) {
      lastTier = u.tier;
      const sep = document.createElement('div');
      sep.className = 'tier-sep';
      sep.innerHTML = `<span>TIER ${'I'.repeat(u.tier)}</span>`;
      list.appendChild(sep);
    }
    list.appendChild(nodeCard(u, b));
  }
}

function nodeCard(u, b) {
  const lvl = upLvl(u.id);
  const maxed = lvl >= u.maxLvl;
  const unlocked = reqMet(u);
  const cost = maxed ? 0 : u.cost(lvl);
  const curIco = u.cur === 'gold' ? '🪙' : '🐚';
  const afford = !maxed && unlocked && (u.cur === 'gold' ? S.gold >= cost : S.scales >= cost);

  const el = document.createElement('div');
  el.className = 'node' + (maxed ? ' maxed' : '') + (!unlocked ? ' reqlock' : '') + (afford ? ' afford' : '');
  el.style.setProperty('--bc', b.color);

  let reqTxt = '';
  if (!unlocked) {
    reqTxt = Object.entries(u.req).map(([id, n]) =>
      `${UPGRADE_BY_ID[id].name} lvl ${n}`).join(', ');
  }

  el.innerHTML = `
    <div class="node-ico">${unlocked ? u.icon : '🔒'}</div>
    <div class="node-body">
      <div class="node-title">${u.name} <span class="node-lvl">${lvl}/${u.maxLvl}</span></div>
      <div class="node-desc">${unlocked ? u.desc(Math.max(lvl, 1)) : `Requires ${reqTxt}`}</div>
    </div>
    <button class="node-buy" ${afford ? '' : 'disabled'}>
      ${maxed ? 'MAX' : `${curIco}${fmt(cost)}`}
    </button>`;

  if (!maxed && unlocked) {
    el.querySelector('.node-buy').onclick = (e) => {
      e.stopPropagation();
      if (buyUpgrade(u)) {
        SFX.buy();
        renderTree();
        renderHome();
      }
    };
  }
  return el;
}

// ---------------- nest ----------------
function renderNest() {
  $('nestEggs').innerHTML = `You have <b class="egg-count">${S.eggs}</b> unhatched egg${S.eggs === 1 ? '' : 's'}`;
  $('btnHatch').disabled = S.eggs < 1;
  const list = $('boonList');
  const owned = BOONS.filter(bn => (S.boons[bn.id] || 0) > 0);
  list.innerHTML = owned.length
    ? '<h3>Hatched boons</h3>' + owned.map(bn =>
        `<div class="boon"><span>${bn.icon} ${bn.name} ×${S.boons[bn.id]}</span><span class="dim">${bn.desc} each</span></div>`).join('')
    : '<p class="dim">No boons yet. Eggs appear as pale ovals on the board — snag them!</p>';
}

function onHatch() {
  const results = hatchEgg();
  if (!results) return;
  SFX.egg();
  const html = results.map(r =>
    `<div class="hatch-result ${r.shiny ? 'shiny' : ''}">
      <div class="hatch-ico">${r.boon.icon}</div>
      <div><b>${r.shiny ? '✨ SHINY ' : ''}${r.boon.name}</b><br><span class="dim">${r.boon.desc}${r.shiny ? ' — ×3 potency!' : ''}</span></div>
    </div>`).join('');
  showModal(`<h2>🐣 Hatched!</h2>${html}<button class="btn-big" onclick="closeModal();renderNest()">Nice</button>`);
  renderNest();
}

// ---------------- shed (prestige) ----------------
function renderShed() {
  const gain = shedGain();
  const info = $('shedInfo');
  const pct = Math.min(1, S.goldSinceShed / SHED_BASE);
  info.innerHTML = `
    <p>Shed your skin to be reborn. You lose all <b>🪙 gold</b> and gold upgrades, but gain
    <b>🐚 Scales</b> — permanent currency for the Ascension branch.</p>
    <div class="shed-bar"><div style="width:${pct * 100}%"></div></div>
    <p class="shed-gain">${gain > 0
      ? `Shedding now grants <b>🐚 ${fmt(gain)}</b>`
      : `Earn <b>🪙 ${fmt(SHED_BASE - S.goldSinceShed)}</b> more this skin to shed`}</p>
    <p class="dim">Total sheds: ${S.prestiges} · Scales owned: ${fmt(S.scales)}</p>`;
  $('btnShed').disabled = gain < 1;
  $('ascendHint').textContent = S.prestiges === 0
    ? 'Your first shed unlocks the Ascension branch of the tree.'
    : '';
}

function onShed() {
  const gain = shedGain();
  if (gain < 1) return;
  showModal(`
    <h2>🐚 Shed your skin?</h2>
    <p>You will gain <b>🐚 ${fmt(gain)}</b> scales.</p>
    <p class="dim">Resets: gold, all gold-bought upgrades.<br>Keeps: scales, ascension upgrades, boons, eggs, stats.</p>
    <button class="btn-big btn-danger" id="confirmShed">SHED 🐍</button>
    <button class="btn-big" onclick="closeModal()">Not yet</button>`);
  $('confirmShed').onclick = () => {
    const got = doShed();
    closeModal();
    SFX.fever();
    UI.toast(`🐚 +${fmt(got)} scales! You feel… newer.`);
    showScreen('shed');
    renderShed();
  };
}

// ---------------- death modal & fortune wheel ----------------
function showDeath(info) {
  exitRunKeepModal();
  const causeTxt = info.cause === 'wall' ? 'You kissed a wall.' : 'You bit yourself.';
  const bonusHtml = info.bonuses.map(([label, amt]) =>
    `<div class="death-bonus">${label}: <b>+${fmt(amt)}</b></div>`).join('');
  const wheelBtn = D.wheel
    ? `<button class="btn-big btn-wheel" id="btnSpin">🎡 SPIN THE WHEEL</button>`
    : '';
  showModal(`
    <h2>💀 ${causeTxt}</h2>
    <div class="death-grid">
      <div><span class="dim">Gold</span><b>+${fmt(info.gold)}</b></div>
      <div><span class="dim">Time</span><b>${fmtTime(info.time)}</b></div>
      <div><span class="dim">Length</span><b>${info.len}</b></div>
      <div><span class="dim">Food</span><b>${info.food}</b></div>
    </div>
    ${bonusHtml}
    <div id="wheelArea">${wheelBtn}</div>
    <button class="btn-play" id="btnAgain">▶ AGAIN</button>
    <button class="btn-big" id="btnMenu">🌳 Upgrade</button>`, true);
  if (D.wheel) $('btnSpin').onclick = () => spinWheel(info.gold);
  $('btnAgain').onclick = () => { closeModal(); enterRun(); };
  $('btnMenu').onclick = () => { closeModal(); showScreen('tree'); };
}

function exitRunKeepModal() {
  $('menu').classList.remove('hidden');
  $('nav').classList.remove('hidden');
  $('runHud').classList.add('hidden');
  $('runControls').classList.add('hidden');
  $('dpad').classList.add('hidden');
  Game.mirror = false;
  showScreen('home');
}

function spinWheel(runGold) {
  const area = $('wheelArea');
  // weighted pick, luck fattens the good slices
  const weights = WHEEL_SLICES.map(([, , w], i) => w * (i >= 2 ? 1 + D.wheelLuck * i : 1));
  const totalW = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalW, target = 0;
  for (let i = 0; i < weights.length; i++) { roll -= weights[i]; if (roll <= 0) { target = i; break; } }

  area.innerHTML = `<div id="wheelStrip">${WHEEL_SLICES.map(([l], i) =>
    `<span class="wslice" id="ws${i}">${l}</span>`).join('')}</div><div id="wheelResult"></div>`;

  let idx = 0, ticks = 0;
  const totalTicks = 20 + ((target - 20) % WHEEL_SLICES.length + WHEEL_SLICES.length) % WHEEL_SLICES.length;
  function tick() {
    // the modal may be gone (player hit AGAIN mid-spin) — keep the payout, skip the show
    const slice = $(`ws${idx % WHEEL_SLICES.length}`);
    ticks++;
    if (slice && ticks <= totalTicks) {
      document.querySelectorAll('.wslice').forEach(e => e.classList.remove('lit'));
      slice.classList.add('lit');
      SFX.wheel();
      idx++;
      setTimeout(tick, 40 + ticks * 9); // decelerating spin, ~2.5s total
    } else {
      const [label, mult] = WHEEL_SLICES[target];
      const bonus = Math.floor(runGold * (mult - 1));
      if (bonus > 0) addGold(bonus);
      save();
      const out = $('wheelResult');
      if (out) out.innerHTML = mult > 1
        ? `<b class="wheel-win">${label}! +${fmt(bonus)} 🪙</b>`
        : `<b class="dim">${label}… the house wins</b>`;
      if (mult >= 5) { SFX.fever(); }
    }
  }
  tick(); // starts at slice 0; tick count is tuned to land exactly on the target slice
}

// ---------------- stats & settings ----------------
function renderStats() {
  const st = S.stats;
  const rows = [
    ['Runs played', fmt(st.runs)],
    ['Total food eaten', fmt(st.totalFood)],
    ['Best run', fmt(st.bestRun) + ' 🪙'],
    ['Best gold/sec', fmt(st.bestRate)],
    ['Best combo', '×' + st.bestCombo],
    ['Longest snake', st.bestLen + ' segments'],
    ['Longest run', fmtTime(st.longestRunMs / 1000)],
    ['Lifetime gold', fmt(S.lifetimeGold)],
    ['Times shed', S.prestiges],
    ['Eggs hatched', st.eggsHatched],
    ['Play time', fmtTime(st.playMs / 1000)],
  ];
  $('statList').innerHTML = rows.map(([k, v]) =>
    `<div class="stat-row"><span>${k}</span><b>${v}</b></div>`).join('');
  $('setSound').textContent = S.settings.sound ? 'ON' : 'OFF';
  $('setSound').classList.toggle('off', !S.settings.sound);
  $('setDpad').textContent = S.settings.dpad ? 'ON' : 'OFF';
  $('setDpad').classList.toggle('off', !S.settings.dpad);
}

// ---------------- modal & toasts ----------------
function showModal(html, sticky) {
  $('modal').innerHTML = html;
  $('modalWrap').classList.remove('hidden');
  $('modalWrap').dataset.sticky = sticky ? '1' : '';
}
function closeModal() { $('modalWrap').classList.add('hidden'); }

UI.toast = function (msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2600);
};

UI.showDeath = showDeath;

// ---------------- offline gains modal ----------------
function showOffline(res) {
  showModal(`
    <h2>👻 While you were away…</h2>
    <p>Your ghost snakes slithered for <b>${fmtTime(res.seconds)}</b>.</p>
    <p class="offline-gold">+${fmt(res.gold)} 🪙${res.eggs > 0 ? ` &nbsp; +${res.eggs} 🥚` : ''}</p>
    <button class="btn-big" onclick="closeModal()">Collect</button>`);
}
