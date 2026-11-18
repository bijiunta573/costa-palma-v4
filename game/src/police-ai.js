// Costa Palma — the Costa Palma PD: cruisers spawn on the wanted level,
// hunt the player across the grid, ram, pin, and give up when the trail dies.

import { AXES_X, AXES_Z } from './config.js';
import { makeRng, clamp, angleDiff } from './util.js';
import { createCar, forwardOf } from './vehicles.js';
import { stepCar } from './vehicle-physics.js';

const MAX_CRUISERS = 6;

export class PoliceSystem {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.rng = makeRng(1357);
    this.cars = [];
    this.spawnT = 0;
  }

  desiredCount() {
    const stars = this.game.stars;
    return stars <= 0 ? 0 : Math.min(1 + stars, MAX_CRUISERS);
  }

  spawnCruiser() {
    const p = this.game.player.pos;
    // Enter from a road 110-150 units away, so they arrive, not appear.
    for (let tries = 0; tries < 10; tries++) {
      const vertical = this.rng() < 0.5;
      const axis = (vertical ? AXES_X : AXES_Z)[Math.floor(this.rng() * 6)];
      const along = -200 + this.rng() * 400;
      const x = vertical ? axis : along;
      const z = vertical ? along : axis;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 105 || d > 165) continue;
      const car = createCar(this.scene, { kind: 'police', color: 0xe8e8ea, x, z, heading: 0 });
      car.driver = 'police';
      car.heading = Math.atan2(p.x - x, p.z - z);
      car.syncMesh();
      this.cars.push(car);
      this.game.cars.push(car);
      return;
    }
  }

  releaseAll() {
    for (const car of this.cars) {
      this.scene.remove(car.group);
      this.game.cars = this.game.cars.filter((c) => c !== car);
    }
    this.cars = [];
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    const p = player.pos;
    this.spawnT -= dt;
    const want = this.desiredCount();
    if (this.cars.length < want && this.spawnT <= 0) {
      this.spawnCruiser();
      this.spawnT = 1.4;
    }
    // When the heat dies, cruisers that are far away peel off for good.
    if (want === 0) {
      for (const car of [...this.cars]) {
        if (Math.hypot(car.x - p.x, car.z - p.z) > 90) {
          this.scene.remove(car.group);
          game.cars = game.cars.filter((c) => c !== car);
          this.cars = this.cars.filter((c) => c !== car);
        }
      }
    }
    const flashPhase = Math.floor(performance.now() / 280) % 2;
    this.cars.forEach((car, idx) => {
      // Lights: alternate red/blue.
      if (car.flashMats) {
        car.flashMats[0].emissiveIntensity = flashPhase === 0 ? 2.6 : 0.25;
        car.flashMats[1].emissiveIntensity = flashPhase === 0 ? 0.25 : 2.6;
      }
      // Surround point: each cruiser aims at its own slot around the player.
      const slot = (idx / Math.max(1, this.cars.length)) * Math.PI * 2;
      const tx = p.x + Math.sin(slot) * 7;
      const tz = p.z + Math.cos(slot) * 7;
      const dist = Math.hypot(car.x - p.x, car.z - p.z);
      const aimX = dist > 16 ? p.x : tx;
      const aimZ = dist > 16 ? p.z : tz;
      const wantHeading = Math.atan2(aimX - car.x, aimZ - car.z);
      const err = angleDiff(car.heading, wantHeading);
      const ctl = { throttle: 1, steer: clamp(err * 1.9, -1, 1), handbrake: false };
      if (Math.abs(err) > 1.6) ctl.throttle = -0.7; // swing around
      if (dist < 8 && Math.abs(player.speedMag) < 1.5) ctl.throttle = 0.25; // pin, don't plough
      // Don't rear-end a fellow cruiser.
      const fwd = forwardOf(car.heading);
      for (const other of this.cars) {
        if (other === car) continue;
        const ahead = (other.x - car.x) * fwd.x + (other.z - car.z) * fwd.z;
        const side = (other.x - car.x) * fwd.z - (other.z - car.z) * fwd.x;
        if (ahead > 0 && ahead < 8 && Math.abs(side) < 3) ctl.throttle = Math.min(ctl.throttle, 0);
      }
      stepCar(car, ctl, dt, game.crashEvents, game.cars);
      // Sirens belong to the nearest cruiser; main reads this.
      car.distToPlayer = dist;
    });
    this.nearest = this.cars.reduce((m, c) => Math.min(m, c.distToPlayer ?? 999), 999);
  }
}
