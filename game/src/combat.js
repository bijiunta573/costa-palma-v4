// Costa Palma — fists and the pistol: player attacks resolved with plain
// math (spheres and boxes, no physics engine), plus the rival gunmen of the
// marina finale who shoot back.

import * as THREE from 'three';
import { makeRng, clamp } from './util.js';
import { colliders, groundHeightAt } from './city-layout.js';
import { makeHumanoid } from './player-controller.js';

// Ray vs axis-aligned box (slab test); returns entry distance or Infinity.
function rayVsBox(ox, oy, oz, dx, dy, dz, box, height) {
  const minY = 0;
  const maxY = height;
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [ox, dx, box.minX, box.maxX],
    [oy, dy, minY, maxY],
    [oz, dz, box.minZ, box.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

function rayVsSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}

export class Combat {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.rng = makeRng(60606);
    this.gunmen = [];
    this.fireCooldown = 0;
  }

  spawnGunman(x, z) {
    const body = makeHumanoid({ shirt: 0x6e1423, pants: 0x1f2430, skin: 0xc98a54, hair: 0x0d0d0d });
    this.scene.add(body.group);
    const gunman = {
      body, x, z, heading: Math.PI, health: 30, state: 'engage',
      shootT: 1 + this.rng() * 1.4, walkPhase: this.rng() * 6, strafeDir: this.rng() < 0.5 ? 1 : -1,
    };
    this.gunmen.push(gunman);
    return gunman;
  }

  clearGunmen() {
    for (const g of this.gunmen) this.scene.remove(g.body.group);
    this.gunmen = [];
  }

  aliveGunmen() {
    return this.gunmen.filter((g) => g.state !== 'down').length;
  }

  // The player's pistol, fired from the camera through the crosshair.
  playerShoot(camera) {
    const game = this.game;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const o = camera.position;
    let bestT = 90;
    let hit = null;
    // Buildings cap the range first.
    for (const box of colliders) {
      const t = rayVsBox(o.x, o.y, o.z, dir.x, dir.y, dir.z, box, box.h);
      if (t < bestT) {
        bestT = t;
        hit = { kind: 'building' };
      }
    }
    if (dir.y < -0.001) {
      const t = -o.y / dir.y;
      if (t < bestT) {
        bestT = t;
        hit = { kind: 'ground' };
      }
    }
    const testPerson = (px, pz, who, ref) => {
      const head = rayVsSphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, px, 1.66, pz, 0.36);
      const bodyT = rayVsSphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, px, 1.05, pz, 0.62);
      const t = Math.min(head, bodyT);
      if (t < bestT) {
        bestT = t;
        hit = { kind: who, ref, crit: head < bodyT };
      }
    };
    for (const g of this.gunmen) if (g.state !== 'down') testPerson(g.x, g.z, 'gunman', g);
    for (const ped of game.peds.peds) if (ped.state !== 'down') testPerson(ped.x, ped.z, 'ped', ped);
    for (const car of game.cars) {
      const t = rayVsSphere(o.x, o.y, o.z, dir.x, dir.y, dir.z, car.x, 0.85, car.z, 2.3);
      if (t < bestT) {
        bestT = t;
        hit = { kind: 'car', ref: car };
      }
    }
    const hx = o.x + dir.x * bestT;
    const hy = o.y + dir.y * bestT;
    const hz = o.z + dir.z * bestT;
    // Muzzle at Leo's raised pistol, tracer to the impact, a puff of sparks.
    const p = game.player.pos;
    game.effects.muzzle(p.x + dir.x * 0.7, 1.42, p.z + dir.z * 0.7);
    game.effects.tracer(p.x + dir.x * 0.7, 1.42, p.z + dir.z * 0.7, hx, hy, hz);
    game.sfx.gunshot(false);
    game.commitCrime('gunshot', p.x, p.z);
    if (!hit) return;
    if (hit.kind === 'gunman') {
      hit.ref.health -= hit.crit ? 26 : 13;
      game.effects.sparks(hx, hy, hz);
      if (hit.ref.health <= 0) {
        hit.ref.state = 'down';
        hit.ref.body.setPose(0, false, false, true);
        hit.ref.body.group.position.set(hit.ref.x, groundHeightAt(hit.ref.x, hit.ref.z) + 0.25, hit.ref.z);
        game.onGunmanDown(hit.ref);
      }
    } else if (hit.kind === 'ped') {
      game.peds.knockDown(hit.ref);
      game.commitCrime('hitPed', hit.ref.x, hit.ref.z);
      game.effects.dust(hx, 0.4, hz);
    } else if (hit.kind === 'car') {
      hit.ref.damage = Math.min(100, hit.ref.damage + 5);
      game.effects.sparks(hx, hy, hz);
    } else {
      game.effects.dust(hx, Math.max(0.3, hy), hz);
    }
  }

  // A swing of the fist: short range, in front of Leo.
  playerPunch() {
    const game = this.game;
    const player = game.player;
    if (player.punchCooldown > 0) return;
    player.punchCooldown = 0.38;
    game.sfx.punch();
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const reach = (ox, oz) => {
      const dx = ox - player.x;
      const dz = oz - player.z;
      const d = Math.hypot(dx, dz);
      return d < 2.5 && (dx * fx + dz * fz) / (d || 1) > 0.35;
    };
    for (const g of this.gunmen) {
      if (g.state !== 'down' && reach(g.x, g.z)) {
        g.health -= 11;
        g.x += fx * 0.7;
        g.z += fz * 0.7;
        if (g.health <= 0) {
          g.state = 'down';
          g.body.setPose(0, false, false, true);
          g.body.group.position.set(g.x, groundHeightAt(g.x, g.z) + 0.25, g.z);
          game.onGunmanDown(g);
        }
        return;
      }
    }
    for (const ped of game.peds.peds) {
      if (ped.state !== 'down' && reach(ped.x, ped.z)) {
        game.peds.knockDown(ped);
        game.commitCrime('punchPed', ped.x, ped.z);
        return;
      }
    }
  }

  // Gunmen: close in, strafe, and shoot with distance-based accuracy.
  update(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    const game = this.game;
    const p = game.player.pos;
    for (const g of this.gunmen) {
      if (g.state === 'down') continue;
      const dx = p.x - g.x;
      const dz = p.z - g.z;
      const dist = Math.hypot(dx, dz);
      g.heading = Math.atan2(dx, dz);
      let mx = 0;
      let mz = 0;
      if (dist > 26) {
        mx = dx / dist;
        mz = dz / dist;
      } else if (dist < 10) {
        mx = -dx / dist;
        mz = -dz / dist;
      } else {
        mx = (-dz / dist) * g.strafeDir;
        mz = (dx / dist) * g.strafeDir;
        if (this.rng() < 0.004) g.strafeDir *= -1;
      }
      const speed = dist > 26 || dist < 10 ? 3.4 : 1.4;
      g.x += mx * speed * dt;
      g.z += mz * speed * dt;
      g.walkPhase += dt * speed * 1.9;
      g.body.setPose(g.walkPhase, true, dist < 48, false);
      g.body.group.position.set(g.x, groundHeightAt(g.x, g.z), g.z);
      g.body.group.rotation.y = g.heading;
      // Shooting.
      g.shootT -= dt;
      if (g.shootT <= 0 && dist < 46) {
        g.shootT = 1.15 + this.rng() * 0.95;
        game.sfx.gunshot(true);
        game.effects.muzzle(g.x + Math.sin(g.heading) * 0.6, 1.42, g.z + Math.cos(g.heading) * 0.6);
        const chance = clamp(0.78 - dist * 0.012, 0.22, 0.68);
        if (this.rng() < chance) {
          game.effects.tracer(g.x, 1.42, g.z, p.x, 1.2, p.z);
          game.damagePlayer(5 + this.rng() * 5);
        } else {
          game.effects.tracer(g.x, 1.42, g.z, p.x + (this.rng() - 0.5) * 5, 0.4, p.z + (this.rng() - 0.5) * 5);
        }
      }
    }
  }
}
