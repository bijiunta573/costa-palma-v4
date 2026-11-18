// Costa Palma — the city's plan as data: building plots, colliders, palms,
// parked cars and road queries. Pure and deterministic (seeded), so the mesh
// builder in buildings.js and the AI systems all agree on one city.

import {
  AXES_X, AXES_Z, ROAD_HALF, SIDEWALK, CITY_MIN, CITY_MAX, WORLD_Z, PLACES,
} from './config.js';
import { makeRng } from './util.js';

const rng = makeRng(20261119);

// Building plots: {x, z, w, d, h, hue} plus their collision boxes.
export const buildings = [];
export const colliders = []; // {minX, maxX, minZ, maxZ, h}
export const palms = []; // {x, z, s} s = scale
export const parkedSpots = []; // {x, z, heading}
export const lampPosts = []; // {x, z}

function addBuilding(x, z, w, d, h, hue) {
  const b = { x, z, w, d, h, hue };
  buildings.push(b);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
  return b;
}

// Blocks between neighbouring axes; each block holds 1-4 towers set back
// behind its sidewalk, with the odd block left as a parking lot or plaza.
for (let i = 0; i < AXES_X.length - 1; i++) {
  for (let j = 0; j < AXES_Z.length - 1; j++) {
    const x0 = AXES_X[i] + ROAD_HALF + SIDEWALK;
    const x1 = AXES_X[i + 1] - ROAD_HALF - SIDEWALK;
    const z0 = AXES_Z[j] + ROAD_HALF + SIDEWALK;
    const z1 = AXES_Z[j + 1] - ROAD_HALF - SIDEWALK;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const roll = rng();
    if (roll < 0.14) {
      // Parking lot: a few parked cars, no tower.
      for (let k = 0; k < 3; k++) {
        parkedSpots.push({
          x: x0 + 6 + k * 9,
          z: cz + (rng() < 0.5 ? -6 : 6),
          heading: Math.PI / 2,
        });
      }
      continue;
    }
    if (roll < 0.2) continue; // open plaza
    const split = rng() < 0.55 ? 2 : 1;
    for (let sx = 0; sx < split; sx++) {
      for (let sz = 0; sz < split; sz++) {
        if (split === 2 && rng() < 0.18) continue;
        const px = split === 1 ? cx : x0 + (x1 - x0) * (0.27 + 0.46 * sx);
        const pz = split === 1 ? cz : z0 + (z1 - z0) * (0.27 + 0.46 * sz);
        const w = (x1 - x0) * (split === 1 ? 0.72 : 0.36);
        const d = (z1 - z0) * (split === 1 ? 0.72 : 0.36);
        const downtown = Math.hypot(cx - 0, cz - 0) < 110 ? 1 : 0.55;
        const h = (10 + rng() * 26) * downtown + 6;
        addBuilding(px, pz, w, d, h, rng());
      }
    }
  }
}

// Landmark buildings the story needs, placed on the city's edge plots.
addBuilding(PLACES.rosaGarage.x, PLACES.rosaGarage.z - 10, 16, 12, 9, 0.08); // Rosa's workshop block
addBuilding(PLACES.hospital.x, PLACES.hospital.z + 10, 18, 12, 14, 0.55); // hospital block
addBuilding(PLACES.hideout.x - 4, PLACES.hideout.z - 8, 14, 10, 8, 0.35); // hideout warehouse
addBuilding(196, 60, 12, 10, 7, 0.7); // marina office, west end of the piers

// Palms line the boulevards and the beach promenade.
for (const ax of AXES_X) {
  for (let z = CITY_MIN + 6; z < WORLD_Z - 4; z += 19) {
    if (AXES_Z.some((az) => Math.abs(z - az) < ROAD_HALF + 4)) continue;
    const side = rng() < 0.5 ? -1 : 1;
    palms.push({ x: ax + side * (ROAD_HALF + 1.6), z: z + rng() * 4, s: 0.85 + rng() * 0.5 });
  }
}
for (let z = -200; z <= 200; z += 17) {
  palms.push({ x: 156 + rng() * 3, z: z + rng() * 5, s: 0.9 + rng() * 0.6 });
}

// Lamp posts at intersection corners and along the marina apron.
for (const ax of AXES_X) {
  for (const az of AXES_Z) {
    lampPosts.push({ x: ax + ROAD_HALF + 1, z: az + ROAD_HALF + 1 });
    lampPosts.push({ x: ax - ROAD_HALF - 1, z: az - ROAD_HALF - 1 });
  }
}

// Parked cars also hug the kerbs on quieter streets.
for (let i = 0; i < 26; i++) {
  const vertical = rng() < 0.5;
  const axis = (vertical ? AXES_X : AXES_Z)[Math.floor(rng() * 6)];
  const along = CITY_MIN + 20 + rng() * (WORLD_Z * 2 - 40);
  const side = rng() < 0.5 ? -1 : 1;
  const off = side * (ROAD_HALF - 2.2);
  parkedSpots.push(
    vertical
      ? { x: axis + off, z: along, heading: side > 0 ? Math.PI : 0 }
      : { x: along, z: axis + off, heading: side > 0 ? -Math.PI / 2 : Math.PI / 2 },
  );
}

// --- Road queries used by traffic, police and the minimap -----------------

export function onRoad(x, z) {
  if (AXES_X.some((ax) => Math.abs(x - ax) <= ROAD_HALF)) return true;
  if (AXES_Z.some((az) => Math.abs(z - az) <= ROAD_HALF)) return true;
  return false;
}

// Nearest point on any road centre line; used to (re)place AI cars sensibly.
export function nearestRoadPoint(x, z) {
  let best = { x, z, d: Infinity };
  for (const ax of AXES_X) {
    const d = Math.abs(x - ax);
    if (d < best.d) best = { x: ax, z, d };
  }
  for (const az of AXES_Z) {
    const d = Math.abs(z - az);
    if (d < best.d) best = { x, z: az, d };
  }
  return best;
}

// Walking height: the marina pier decks sit half a unit over the water.
export function groundHeightAt(x, z) {
  if (x > 200 && [90, 110, 130].some((pz) => Math.abs(z - pz) <= 3.2)) return 0.5;
  return 0;
}

// Is this point inside any building collider (with a margin)?
export function insideBuilding(x, z, margin = 0) {
  for (const c of colliders) {
    if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) {
      return c;
    }
  }
  return null;
}
