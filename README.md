[![make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/17T-ProGimank/makefun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/17T-ProGimank/makefun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# NUSA SKY RUN — Island Air Post

A 3D bush-plane flight game for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057). One bush plane, four islands, one short runway: race eight glowing rings around the archipelago against the clock, drop the mail at three island strips and land back home, or take off, climb to 800 ft and grease a landing on runway 09 — graded on softness, centreline and speed. Fuel burns with the throttle, the wing stalls below 52 kt, and the sea below does not forgive a glide.

## How to play

Serve the game and open it in a desktop browser:

```
node serve.ts
```

Then open http://localhost:8080. No build step, no network requests — every file the game loads lives under `game/` (Three.js is vendored as a minified build under `game/vendor/`).

- **← →** roll, **↑ ↓** pitch — or drag the mouse like a stick
- **Shift / Ctrl** or **mouse wheel** — throttle
- **Q / E** — rudder
- **V** — cockpit / chase view
- **P** — pause, **R** — restart, **M** — sound
- **1–4** or click — pick a sortie on the title screen

## The sorties

- **Ring Run** — 8 rings around the islands against a 150-second clock; every ring adds 15 seconds and 1,000 points.
- **Mail Run** — drop the mail at the Nusa Timur, Nusa Selatan and Mercusuar strips, then land back home on runway 09. Fuel is the decision.
- **Landing Challenge** — take off, climb to 800 ft, come back and land it. Touchdown is graded S/A/B/C on vertical speed, centreline offset and speed.
- **Free Flight** — no clock, no score. Just you, the plane and the islands.

Land on the runway and the plane refuels. Fly into terrain or ditch in the sea and the sortie ends with a flight-recorder debrief: score, time, rings, mail, landings and the flight log.

## What you see

Chase or cockpit view over a procedural archipelago — main island with a town, a lighthouse on the hill, two more islands and a lighthouse islet, drifting clouds, a low sun and the sea. The HUD carries altitude, speed and heading in big numerals, a compass tape, a pointer to the next ring or strip with its distance, PAPI glideslope lights beside the runway, and a lit instrument cluster: attitude indicator, airspeed dial, altimeter, heading dial, fuel and throttle. In cockpit view the gauges sit in a dark console panel. Engine hum and wind are synthesized with WebAudio — no audio files.

## Structure

- `game/index.html` — the page, two canvases (WebGL + HUD overlay) and the DOM menus
- `game/src/config.js` — tuning numbers, world constants, missions, palette
- `game/src/random.js` — seeded random and value noise
- `game/src/terrain.js` — heightfield islands, sea, sky, clouds, town, lighthouse, runway + PAPI, rings
- `game/src/plane.js` — the bush plane mesh: fuselage, canopy, wings, prop, gear, nav lights
- `game/src/flight.js` — flight model: thrust/drag, coordinated turns, stall, landings, crashes
- `game/src/missions.js` — the four sorties, scoring, landing grades, debrief
- `game/src/hud.js` — HUD, compass tape, lit instruments, target pointer, warnings, banners
- `game/src/audio.js` — procedural engine, wind, chimes, thuds (WebAudio, no files)
- `game/src/input.js` — keyboard + mouse stick + wheel throttle
- `game/src/shots.js` — deterministic `?shot=` staging for screenshots
- `game/src/main.js` — boot, fixed-step loop, cameras, screens, self-test
- `main.ts` — the make.fun hand-in program (Node 22, stdlib only)

## Screenshots

`?shot=cover`, `?shot=cockpit`, `?shot=landing` and `?shot=islands` put the game into fixed, good-looking states; the four JPEGs in `screenshots/` are real renders of the game's own code. `?selftest=1` flies the physics headlessly and reports into `#selftest`.

## Referral

Built for make.fun — sign up through my referral link: https://make.fun/r/m4psg5rh (code `m4psg5rh`).
