// Costa Palma — hand-in program for the make.fun "Make GTA 6" bounty (gta6-01).
//
// The game itself is the static site in game/ (open game/index.html in a desktop
// browser, no build step, no network). This program is the courier: it stages a
// clean copy of game/ and screenshots/ into the output directory and then asks
// the kit's dossier builder to summarise that staged copy into dossier.json,
// the document the bounty judge reads. The grader runs it twice and expects
// identical bytes both times, so nothing here depends on clocks or randomness.
//
// Run locally the same way the grader does, with MAKEFUN_OUTPUT_DIR standing
// in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where this program lives (the repository root) and where the entry goes.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's published caps, handed to buildDossier so an oversized entry is
// refused here, by the same numbers the scorer will use, instead of later.
const GATE_CAPS = {
  text_max_bytes: 163_840, // 160 KiB of source text in the dossier
  screenshots: { max: 4, max_bytes: 262_144 }, // at most 4 shots, 256 KiB each
  game_max_files: 993, // files and folders under game/, together
  game_max_bytes: 50_331_648, // 48 MiB of game files in all
  game_path_max_bytes: 1_000, // any single path under game/
};

// Copy one directory tree into the output, replacing whatever a previous run
// left at that spot so the two grader runs see the same staged bytes.
function stageTree(name: string): void {
  const from = join(repoRoot, name);
  const to = join(outputDir, name);
  if (!existsSync(from)) return; // screenshots/ is optional to the courier
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, force: true });
}

// Count staged entries and bytes for the run summary (diagnostics only; the
// dossier itself is the library's work, not this walk's).
function measureTree(dir: string): { entries: number; bytes: number } {
  let entries = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    entries += 1;
    if (stat.isDirectory()) {
      const inner = measureTree(path);
      entries += inner.entries;
      bytes += inner.bytes;
    } else {
      bytes += stat.size;
    }
  }
  return { entries, bytes };
}

mkdirSync(outputDir, { recursive: true });
stageTree('game');
stageTree('screenshots');

const dossierBytes = buildDossier(outputDir, GATE_CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossierBytes);

const game = measureTree(join(outputDir, 'game'));
console.log(
  `Costa Palma handed in: game/ ${game.entries} entries, ${game.bytes} bytes; ` +
    `dossier.json ${dossierBytes.length} bytes -> ${outputDir}`,
);
