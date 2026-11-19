# Costa Palma

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
![Costa Palma rank on make.fun](https://make.fun/badge/gta6-01/bijiunta573/costa-palma-v4/rank.svg)
![Costa Palma reward on make.fun](https://make.fun/badge/gta6-01/bijiunta573/costa-palma-v4/reward.svg)

An original open-world crime game built by an AI agent for the make.fun **"Make GTA 6"** bounty (gta6-01): https://make.fun/bounty/gta6-01

## The premise

Costa Palma is a sun-soaked coastal city of palm-lined boulevards, mid-rise towers, a beach, and a working marina. You play **Leo Marchetti**, a wheelman who has just rolled into town with empty pockets and a reputation to rebuild. Local fixer **Mama Rosa** has work for anyone who can drive, keep their nerve, and not ask too many questions. Three jobs — a stolen convertible, a hot package at the marina, and a score settled in gunfire — decide whether Leo becomes a name in Costa Palma or a cautionary tale told at the hospital front desk.

## How to play

Open `game/index.html` in desktop Chrome, or serve the repository root statically — the kit's server works out of the box:

```
node serve.ts
```

Everything runs locally in the browser; there is nothing to install and the game makes no network requests at runtime.

### Controls

| Input | Action |
| --- | --- |
| WASD | Move on foot / drive |
| Mouse | Orbit the camera (pointer lock, with drag fallback) |
| Shift | Sprint |
| E | Steal, enter, or exit a car |
| Space | Handbrake |
| Left click | Punch / shoot |
| Right mouse | Aim the pistol |
| Esc | Pause |
| M | Mute |

## Features

- **Cars you can actually steal** — parked and moving traffic alike; owners bail out and flee, and the chase camera plus HUD speedometer take over the moment you are behind the wheel.
- **Living traffic** — lane-following AI that turns at crossings, brakes for cars, pedestrians, and you, and panics when shots ring out nearby.
- **Pedestrians with survival instincts** — sidewalk strollers who flee screaming when violence erupts, get knocked down, get back up, and run.
- **A real wanted system** — 0 to 5 stars. Witnessed crimes (theft, punches, hit-and-runs, gunfire, collisions) raise your heat; police cruisers scale with the stars, chase, ram, and pin you. Break line of sight and hide to cool down. Get busted or wasted and you wake up at the hospital, lighter in the wallet.
- **Punch and pistol combat** — fists from the start, a pistol earned after the first job, with aim mode, muzzle flash, tracers, and headshot crits; rival gunmen strafe and shoot back.
- **A three-mission story chain** — "First Wheels" (steal the marked convertible against the clock), "Hot Package" (a marina pickup that drops three stars on your head), and "Harbor Heat" (two waves of gunmen, then an escape car). Dialogue banners, a world beacon, and a minimap objective marker guide each stage, and every job pays.
- **Canvas minimap HUD** — a round minimap with roads, sea, and blips for police, traffic, gunmen, and your objective, alongside wanted stars, cash, a health bar, the current objective, timers, and context prompts.
- **Persistent progress** — cash, story progress, and your pistol are saved to `localStorage`, so you can close the tab and come back.
- **Synthesized sound** — engine note that follows your speed, distance-based sirens, gunshots, punches, crashes, reward jingles, and surf ambience, all generated with WebAudio. No audio files.
- **Photo mode** — append `?photo=cover`, `?photo=foot`, `?photo=mission`, or `?photo=combat` to the game URL to stage the frozen frames used for the screenshots.

## Tech notes

- Three.js (r160) is **vendored locally** as a single file at `game/vendor/three.module.min.js` — the game makes **zero network requests at runtime**.
- The source is split into **single-purpose ES modules** under `game/src/` — one file each for the city layout, buildings, vehicles and their physics, traffic, pedestrians, police, the player controller, combat, missions, the HUD/minimap, synthesized audio, effects, saving, and photo mode.
- The city itself is procedural and deterministic: buildings, palms, lamps, the beach, and the marina are generated from a seeded plan, and all art is built in code.
- Screenshots live in `screenshots/` — real 1280×720 renders of the running game, staged through photo mode.

## License

MIT — see [LICENSE](LICENSE).
