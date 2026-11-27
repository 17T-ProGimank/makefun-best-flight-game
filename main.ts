// Entry point for "NUSA SKY RUN — Island Air Post" (round 2), Node 22, stdlib only.
//
// Copies the static game (game/) and the screenshots (screenshots/) from beside
// this file into the output directory, then writes dossier.json there with the
// vendored make.fun library. The scorer reads dossier.json; nothing else here
// has any behaviour. Run locally with MAKEFUN_OUTPUT_DIR set:
//   MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
// Inside the grader the output directory defaults to /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game tree first, then the screenshots (created by the headless shot run).
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps straight from the competition's gate.json. Only text_max_bytes shapes
// the dossier bytes; the rest make this program refuse exactly where the
// scorer would (over 4 screenshots or one over 256 KiB; over 993 game files
// or 48 MiB of game files; a game path over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
