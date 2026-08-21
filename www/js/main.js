// ============================================================
// Snakeremental — boot, main loop, input wiring
// ============================================================

let lastFrame = 0;
let idleAcc = 0;
let saveTimer = 0;
let homeTimer = 0;

function boot() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  load();
  layoutCanvas();
  window.addEventListener('resize', layoutCanvas);

  wireNav();
  wireInput();
  wireButtons();
  showScreen('home');

  const off = offlineGains();
  if (off) showOffline(off);

  requestAnimationFrame(frame);
}

function frame(ts) {
  // clamp: some devices hand back stale/backwards timestamps after sleep
  const dt = Math.min(0.1, Math.max(0, (ts - lastFrame) / 1000 || 0.016));
  lastFrame = ts;

  if (Game.active && !Game.paused) {
    updateGame(dt);
  } else {
    // idle ghost income while in menus
    const rate = ghostRate() * afterlifeMult();
    if (rate > 0) {
      idleAcc += rate * dt;
      if (idleAcc >= 1) {
        const g = Math.floor(idleAcc);
        idleAcc -= g;
        addGold(g);
      }
    }
  }

  render(dt);
  updateHUD();

  // autosave every 15s
  saveTimer += dt;
  if (saveTimer > 15) { saveTimer = 0; save(); }

  // keep the home screen's idle-rate readout fresh
  homeTimer += dt;
  if (homeTimer > 1 && !Game.active && UI.screen === 'home') { homeTimer = 0; renderHome(); }

  requestAnimationFrame(frame);
}

// ---------------- navigation & buttons ----------------
function wireNav() {
  for (const b of document.querySelectorAll('#nav button')) {
    b.addEventListener('click', () => showScreen(b.dataset.screen));
  }
}

function wireButtons() {
  $('btnPlay').addEventListener('click', () => {
    if (!S.flags.seenTutorial) {
      S.flags.seenTutorial = true;
      save();
      showModal(`
        <h2>🐍 How to slither</h2>
        <p>👆 <b>Swipe</b> anywhere to steer (or use arrow keys).</p>
        <p>🍎 Eat fast to build <b>combos</b>. Fill the pink bar for <b>FEVER</b>.</p>
        <p>😈 Skimming past your own tail builds a <b>danger bonus</b> — cash it in with your next bite.</p>
        <p>💀 Death is not the end. It's the business model.</p>
        <button class="btn-play" id="btnTutGo">LET'S EAT</button>`, true);
      $('btnTutGo').onclick = () => { closeModal(); enterRun(); };
    } else {
      enterRun();
    }
  });

  $('btnPause').addEventListener('click', () => {
    if (!Game.active) return;
    Game.paused = !Game.paused;
    if (Game.paused) {
      showModal(`
        <h2>⏸ Paused</h2>
        <button class="btn-play" id="btnResume">▶ RESUME</button>
        <button class="btn-big" id="btnGiveUp">🏳 End run (keep gold)</button>`, true);
      $('btnResume').onclick = () => { closeModal(); Game.paused = false; };
      $('btnGiveUp').onclick = () => { closeModal(); die('wall'); };
    }
  });

  $('btnHatch').addEventListener('click', onHatch);
  $('btnShed').addEventListener('click', onShed);
  $('btnSell').addEventListener('click', doSell);

  $('btnMirror').addEventListener('click', () => {
    Game.mirror = !Game.mirror;
    $('btnMirror').classList.toggle('on', Game.mirror);
    UI.toast(Game.mirror ? '🪞 MIRROR ON — controls reversed, gold ×3' : '🪞 Mirror off');
  });

  // dash: press & hold
  const dash = $('btnDash');
  const dashOn = (e) => { e.preventDefault(); Game.dashHeld = true; };
  const dashOff = () => { Game.dashHeld = false; };
  dash.addEventListener('touchstart', dashOn, { passive: false });
  dash.addEventListener('touchend', dashOff);
  dash.addEventListener('touchcancel', dashOff);
  dash.addEventListener('mousedown', dashOn);
  dash.addEventListener('mouseup', dashOff);
  dash.addEventListener('mouseleave', dashOff);

  $('setSound').addEventListener('click', () => {
    S.settings.sound = !S.settings.sound; save(); renderStats();
  });
  $('setDpad').addEventListener('click', () => {
    S.settings.dpad = !S.settings.dpad; save(); renderStats();
  });
  $('btnReset').addEventListener('click', () => {
    showModal(`
      <h2>☠ Wipe everything?</h2>
      <p class="dim">All gold, scales, upgrades, boons and stats will be lost forever.</p>
      <button class="btn-big btn-danger" id="confirmWipe">YES, WIPE IT</button>
      <button class="btn-big" onclick="closeModal()">No!</button>`);
    $('confirmWipe').onclick = () => {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      location.reload();
    };
  });

  // modal backdrop click closes non-sticky modals
  $('modalWrap').addEventListener('click', (e) => {
    if (e.target === $('modalWrap') && !$('modalWrap').dataset.sticky) closeModal();
  });

  // d-pad
  for (const b of document.querySelectorAll('#dpad button')) {
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const d = dirs[b.dataset.dir];
    const h = (e) => { e.preventDefault(); pushDir(d[0], d[1]); };
    b.addEventListener('touchstart', h, { passive: false });
    b.addEventListener('mousedown', h);
  }
}

// ---------------- steering input ----------------
function wireInput() {
  // keyboard
  window.addEventListener('keydown', (e) => {
    const map = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    };
    if (map[e.key]) { e.preventDefault(); pushDir(...map[e.key]); }
    if (e.key === ' ') { Game.dashHeld = true; e.preventDefault(); }
    if (e.key === 'Escape' && Game.active) $('btnPause').click();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') Game.dashHeld = false;
  });

  // swipe on canvas — origin resets after each registered swipe so you can
  // chain multiple direction changes without lifting your finger
  let tx = null, ty = null;
  const THRESH = 22;
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (tx === null) return;
    const dx = e.touches[0].clientX - tx;
    const dy = e.touches[0].clientY - ty;
    if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
    if (Math.abs(dx) > Math.abs(dy)) pushDir(Math.sign(dx), 0);
    else pushDir(0, Math.sign(dy));
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: false });
  canvas.addEventListener('touchend', () => { tx = null; });

  // mouse drag steering for desktop testing
  let mdown = false;
  canvas.addEventListener('mousedown', (e) => { mdown = true; tx = e.clientX; ty = e.clientY; });
  canvas.addEventListener('mousemove', (e) => {
    if (!mdown) return;
    const dx = e.clientX - tx, dy = e.clientY - ty;
    if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
    if (Math.abs(dx) > Math.abs(dy)) pushDir(Math.sign(dx), 0);
    else pushDir(0, Math.sign(dy));
    tx = e.clientX; ty = e.clientY;
  });
  window.addEventListener('mouseup', () => { mdown = false; });

  // save when the app is backgrounded
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  window.addEventListener('pagehide', save);
}

document.addEventListener('DOMContentLoaded', boot);
