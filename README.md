[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://img.shields.io/badge/rank-blind%20round%204-lightgrey)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://img.shields.io/badge/reward-%24500-green)](https://make.fun/bounty/best-flight-game-20261126-0057)

# NUSA SKY RUN — Island Air Post

A 3D bush-plane game over a 4.2 km Indonesian archipelago. You are the island
air post: fly the mail, fight fires, carry patients, and land on short island
strips — in daylight or at dusk, with a real flight model (stall, coordinated
turns, graded landings) and a flight-recorder debrief after every sortie.

Bounty: [best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057) — $500.
Referral: [m4psg5rh](https://make.fun/r/m4psg5rh)

## Play

Open `game/index.html` in a browser (or `node serve.ts` then
http://localhost:8080). No build step, no network — Three.js is vendored under
`game/vendor/`. Pick a sortie on the title screen (click, or keys **1–8**).

## The 8 sorties

| Key | Sortie | The job |
|-----|--------|---------|
| 1 | Ring Run | Thread 8 rings over the islands against the clock. |
| 2 | Mail Run | Fly the mail through 3 island gates, then land home on runway 09. |
| 3 | Landing Challenge | Land on runway 09 as softly and centred as you can — graded S/A/B/C. |
| 4 | Free Flight | No objectives. Just fly, watch the sun, buzz the lighthouse. |
| 5 | Fire Attack | A wildfire burns on Nusa Selatan. Skim the sea low and slow (speed > 40, under 6 m, 2 s) to scoop water, then drop it on the fire below 120 m. 3 drops kill the fire. |
| 6 | Medevac | Land on the Mercusuar Islet strip, pick up the patient (5 s on the ground), fly home gently — hard banks and rough air hurt the patient, and landing grade × condition is your score. |
| 7 | Night Mail | The Mail Run at dusk: runway edge lights and strip flares are the only way to see the strips. Tighter clock, glowing instruments. |
| 8 | Island Hopper | Land at all three island strips in order — Timur, Selatan, Mercusuar — each landing graded, then land home. Fuel is the decision; you refuel only on a safe runway landing. |

## Controls

- **← →** roll · **↑ ↓** pitch · **Shift / Ctrl** or mouse wheel: throttle
- **Q / E** rudder · **V** chase / cockpit view · **P** pause · **R** restart
- **M** sound on/off · **1–8** pick a sortie · mouse: stick
- Touchdown is graded on softness (vertical speed, 55%), centreline offset
  (30%) and speed (15%). Stall speed is ~27 m/s — keep the nose honest.

## Flight-recorder debrief + pilot logbook

Every sortie is recorded at 1 Hz (time, altitude, speed, heading, position,
throttle, fuel) plus every event — rings, gates, drops, pickups, touchdowns,
crashes. When a sortie ends the debrief shows the score broken down per
objective, a mini-map trace of your flight path over the islands (rings,
strips and runway marked, crash point marked), your best landing broken into
softness / centreline / speed bars, max altitude, max speed, distance flown,
and the full event log. Your best scores live on in the pilot logbook on the
title screen (localStorage key `nusa-sky-run.logbook`): best score per sortie,
flights flown, total rings, total mail, best landing grade ever.

## Structure

```
game/
  index.html            title screen, HUD canvas, debrief screen
  src/
    config.js           world constants, palette, strips, rings, gates
    random.js           seeded RNG (seed 7 — same world every run)
    terrain.js          islands, sea, town, lighthouse, runway + PAPI,
                        fire zone + smoke, dusk lighting, edge/flare lights
    plane.js            bush plane mesh, prop, strobe, water tank, drop effect
    flight.js           flight model: thrust/drag, stall, touchdown/crash,
                        scooping, dropping, fuel, out-of-bounds
    missions.js         all 8 sorties: objectives, scoring, landing grades
    recorder.js         1 Hz flight recorder, debrief data, mini-map, logbook
    hud.js              instruments, compass tape, objective pointer, banners
    audio.js            WebAudio engine / wind / chimes (no audio files)
    input.js            keyboard, mouse stick, throttle wheel
    shots.js            deterministic ?shot= staging for the 4 screenshots
    main.js             game loop, views, ?selftest=1, ?missiontest=<id>
  vendor/
    three.module.min.js Three.js 0.170.0 (vendored library)
main.ts                 copies game/ + screenshots/ to the output dir and
                        writes dossier.json via vendor/makefun-game.ts
serve.ts                dev server: node serve.ts → http://localhost:8080
shots.json              the 4 screenshot scenes
```

## Headless checks

- `http://localhost:8080/?selftest=1` — runs takeoff, a ring pass and a fire
  scoop + drop, and reports JSON into `#selftest` (errors must be empty).
- `http://localhost:8080/?missiontest=<id>` — autopilot play-test for one
  sortie (`rings`, `mail`, `landing`, `free`, `fire`, `medevac`, `nightmail`,
  `hopper`), JSON into `#selftest`.
- `http://localhost:8080/?shot=<name>&seed=7` — stages a screenshot scene
  (`cover`, `cockpit`, `landing`, `islands`); see `shots.json`.

## Screenshots

1. `1-cover.jpg` — Fire Attack: banking over the Nusa Selatan fire, drop in progress.
2. `2-cockpit.jpg` — Night Mail: cockpit view on final to runway 09 at dusk.
3. `3-landing.jpg` — Medevac: flaring over the threshold onto runway 09.
4. `4-islands.jpg` — Island Hopper: banking turn over the sea, lighthouse islet off the wing.

Each is a real render of this game's own code, ≤ 256 KiB.

## License

MIT — see [LICENSE](LICENSE).
