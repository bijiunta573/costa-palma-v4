// Costa Palma — small math and randomness helpers shared by every system.

// A tiny deterministic generator (mulberry32) so the city, and the staged
// photo scenes, come out the same on every load.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Shortest-path angle interpolation, for steering and camera work.
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Circle vs axis-aligned box: returns a push-out vector {x, z, depth} or null.
// Colliders are {minX, maxX, minZ, maxZ} in world units.
export function circleVsBox(cx, cz, radius, box) {
  const nearX = clamp(cx, box.minX, box.maxX);
  const nearZ = clamp(cz, box.minZ, box.maxZ);
  const dx = cx - nearX;
  const dz = cz - nearZ;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: dx / d, z: dz / d, depth: radius - d };
  }
  // Centre inside the box: push out along the smallest exit distance.
  const exits = [
    { x: -1, z: 0, depth: cx - box.minX + radius },
    { x: 1, z: 0, depth: box.maxX - cx + radius },
    { x: 0, z: -1, depth: cz - box.minZ + radius },
    { x: 0, z: 1, depth: box.maxZ - cz + radius },
  ];
  exits.sort((p, q) => p.depth - q.depth);
  return exits[0];
}

// Format dollars the way the HUD shows them: $1,250.
export function money(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Pick a weighted-random entry from [value, weight] pairs.
export function pickWeighted(rng, pairs) {
  let total = 0;
  for (const [, w] of pairs) total += w;
  let roll = rng() * total;
  for (const [v, w] of pairs) {
    roll -= w;
    if (roll <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}
