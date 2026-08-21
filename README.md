# 🐍 Snakeremental

**An addictive incremental snake game for Android.** Eat. Die. Upgrade. Repeat.

Skill-based snake runs earn gold. Gold feeds a huge upgrade tree. Upgrades make
runs richer, weirder, and faster — until you shed your skin and start over,
stronger. Luck is baked into every layer: rare food tiers, critical bites,
mystery eggs, a fortune wheel, and upgrades that are literally gambles.

---

## The core loop

```
      🎮 PLAY (skill)                    🌳 UPGRADE (strategy)
  swipe · combo · dash · risk   ──🪙──▶  7 branches, ~70 nodes,
  near-misses · fever mode               700+ purchasable levels
        ▲                                      │
        │            🐚 SHED (prestige)        │
        └──── permanent scales, chaos ◀────────┘
              upgrades, ghost snakes (idle)
```

### Skill
- **Swipe steering** with a turn queue (upgradeable) for tight cornering.
- **Combos** — eat quickly in succession for a growing multiplier.
- **Danger bonus** — skim your own tail without dying to bank a payout on your next bite.
- **Dash** — hold for a speed burst; food eaten mid-dash is worth more.
- **Fever mode** — fill the meter, everything ×3, the board goes disco.
- **Wall food, on-beat music notes, Mirror Dimension (reversed controls, ×3 gold)** — every gold source rewards play, not idle waiting.

### Chance
- Food rarity tiers: Apple → **Golden** (5%) → **Crystal** (1%) → **Rainbow** (0.2%), all scaled by Luck.
- **Critical bites**, **Gambler's Fang** (10% dud / chance of ×4), **Slot Stomach** jackpots.
- **Mystery Eggs** hatch into random permanent boons (8% shiny = ×3 potency).
- **Fortune Wheel** after each run: ×1 up to ×25.
- **Schrödinger's Snack**: a box worth anywhere from 0× to 500×.

### The tree (7 branches)
| Branch | Flavor | Highlights |
|---|---|---|
| 🍎 Appetite | income | Michelin Snake, Compound Appetite, Marinated Walls, Spice Rack (50 lvls) |
| 🐍 Body | skill & survival | Bullet-time Yoga, Rubber Walls, **Ouroboros Pact** (bite your tail → gold), Snake Oil Salesman, Contortionist |
| 🎲 Fortune | luck | Déjà Chew, Four-Leaf Cobra, Insurance Scam, Fortune Cookie |
| ⏱ Tempo | speed & combos | Cold vs Hot Blood (pick a build), Fever tree, Overtime, Chrono Snack |
| 👻 Spirits | idle | Ghost Snakes, Peer Pressure (compounding jealousy), Séance Sundays, Medium Rare |
| 🌀 Chaos | prestige-gated madness | Portal Walls, Quantum Tongue, Big Bang Bite, Time Loop rewind, Cursed Chili, Snake², Mirror Dimension |
| 🐚 Ascension | scales (prestige currency) | Iridescent Scales, Cosmic Ouroboros, the Chaos Key, Eternal Fever |

### Prestige — Shedding
At 50K gold per skin you can **shed**: lose gold and gold upgrades, gain 🐚
scales (permanent). Scales buy the Ascension branch, which unlocks Chaos, which
breaks the game open on purpose.

### Idle
Ghost snakes earn gold while the app is closed (capped, upgradeable to 24h),
can find eggs offline, and get a ×N speed haunt for 60s every time you die.

---

## Project layout

```
www/        the entire game — plain HTML5/canvas/JS, zero dependencies
android/    Android Studio project: a fullscreen WebView that bundles /www as assets
```

The game is a single-page canvas app: no frameworks, no build step, saves to
`localStorage`, sounds synthesized with WebAudio. It runs identically in any
browser, which makes development and testing instant.

## Run it in a browser (dev)

```bash
cd www && python3 -m http.server 8000
# open http://localhost:8000 — arrow keys / WASD steer, Space dashes
```

## Build the Android APK

1. Open the `android/` folder in **Android Studio** (Giraffe or newer).
2. Let Gradle sync (it pulls AGP 8.5 / Kotlin 1.9; `minSdk 24`, `targetSdk 34`).
3. **Run ▶** on a device or emulator, or **Build → Generate Signed APK** for release.

The `www/` folder is wired into the APK via `assets.srcDirs` — edit the web
game, rebuild, done. Saves live in the WebView's `localStorage`
(`domStorageEnabled`), so they survive app restarts and updates.

## Design notes

- **Every mechanic pays out through play.** Idle income exists but the best
  gold/sec always comes from a hot streak with danger bonuses — skill stays
  the point.
- **Upgrades change rules, not just numbers.** Portal walls, tail-cutting,
  rewinding deaths, an AI buddy snake, reversed controls — the late tree makes
  runs *feel* different, which is what keeps an incremental surprising.
- **Chance is layered, never pure slots.** Luck multiplies spawn tables the
  player then has to physically reach; even the fortune wheel multiplies a
  run the player earned.
