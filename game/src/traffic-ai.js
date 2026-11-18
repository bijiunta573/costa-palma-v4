// Costa Palma — traffic: ordinary drivers following lanes around the grid,
// braking for whatever is in front of them, and panicking when the shooting
// starts. Cars are shared entities from vehicles.js; this system only drives.

import { AXES_X, AXES_Z, ROAD_HALF, CITY_MIN, WORLD_Z } from './config.js';
import { makeRng, clamp, angleDiff } from './util.js';
import { createCar, CAR_PAINTS, forwardOf } from './vehicles.js';
import { stepCar } from './vehicle-physics.js';

const TRAFFIC_COUNT = 14;

export class TrafficSystem {
  constructor(scene, game) {
    this.game = game;
    this.scene = scene;
    this.rng = makeRng(4242);
    this.cars = [];
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const car = createCar(scene, {
        kind: this.rng() < 0.18 ? 'convertible' : 'sedan',
        color: CAR_PAINTS[Math.floor(this.rng() * CAR_PAINTS.length)],
      });
      car.driver = 'traffic';
      this.placeOnRoad(car, 60 + this.rng() * 160);
      car.ai = this.newRoute(car);
      this.cars.push(car);
      game.cars.push(car);
    }
  }

  // Put a car on a random road, in a random lane, facing its lane's way.
  placeOnRoad(car, minDistFromPlayer = 0) {
    const p = this.game.player.pos;
    for (let tries = 0; tries < 12; tries++) {
      const vertical = this.rng() < 0.5;
      const axis = (vertical ? AXES_X : AXES_Z)[Math.floor(this.rng() * 6)];
      const along = CITY_MIN + 14 + this.rng() * (WORLD_Z * 2 - 28);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const lane = dir > 0 ? -4 : 4; // right-hand traffic (see newRoute)
      const x = vertical ? axis + lane : along;
      const z = vertical ? along : axis + lane;
      if (Math.hypot(x - p.x, z - p.z) < minDistFromPlayer) continue;
      car.x = x;
      car.z = z;
      car.heading = vertical ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.speed = 0;
      car.ai = { vertical, axis, dir, turnCooldown: 2 };
      car.syncMesh();
      return;
    }
  }

  newRoute(car) {
    return car.ai || { vertical: true, axis: 0, dir: 1, turnCooldown: 2 };
  }

  // The player stole this car: stop driving it, it is theirs now.
  release(car) {
    this.cars = this.cars.filter((c) => c !== car);
  }

  update(dt) {
    const game = this.game;
    const playerPos = game.player.pos;
    for (const car of this.cars) {
      const ai = car.ai;
      ai.turnCooldown -= dt;
      // Too far from the action? Recycle to a road nearer the player.
      const distPlayer = Math.hypot(car.x - playerPos.x, car.z - playerPos.z);
      if (distPlayer > 320) {
        this.placeOnRoad(car, 130 + this.rng() * 60);
        continue;
      }
      // Lane target: a point ahead on our lane line.
      const lane = ai.dir > 0 ? -4 : 4;
      let tx;
      let tz;
      if (ai.vertical) {
        tx = ai.axis + lane;
        tz = car.z + ai.dir * 24;
      } else {
        tx = car.x + ai.dir * 24;
        tz = ai.axis + lane;
      }
      // Near a crossing? Sometimes turn onto it: swap which axis we follow.
      const crossAxes = ai.vertical ? AXES_Z : AXES_X;
      const along = ai.vertical ? car.z : car.x;
      for (const ca of crossAxes) {
        const ahead = (ca - along) * ai.dir;
        if (ahead > 0 && ahead < 7 && ai.turnCooldown <= 0) {
          ai.turnCooldown = 3;
          if (this.rng() < 0.45) {
            const newDir = this.rng() < 0.5 ? 1 : -1;
            if (ai.vertical) {
              ai.vertical = false;
              ai.axis = ca;
            } else {
              ai.vertical = true;
              ai.axis = ca;
            }
            ai.dir = newDir;
          }
        }
      }
      // Steer toward the lane target.
      const want = Math.atan2(tx - car.x, tz - car.z);
      const err = angleDiff(car.heading, want);
      const ctl = { throttle: 0.75, steer: clamp(err * 1.7, -1, 1), handbrake: false };
      if (Math.abs(err) > 1.1) ctl.throttle = 0.25;
      // Brake for anything in front: cars, the player, pedestrians.
      const fwd = forwardOf(car.heading);
      const right = { x: fwd.z, z: -fwd.x };
      let blocked = 0;
      const test = (ox, oz, r) => {
        const dx = ox - car.x;
        const dz = oz - car.z;
        const ahead = dx * fwd.x + dz * fwd.z;
        const side = dx * right.x + dz * right.z;
        if (ahead > 0 && ahead < 11 + r && Math.abs(side) < 2.7) blocked = Math.max(blocked, ahead < 6 ? 2 : 1);
      };
      for (const other of game.cars) if (other !== car) test(other.x, other.z, 2);
      if (!game.player.inCar) test(playerPos.x, playerPos.z, 0);
      else if (game.player.inCar !== car) test(playerPos.x, playerPos.z, 2);
      for (const ped of game.peds.peds) if (ped.state !== 'down') test(ped.x, ped.z, 0);
      if (blocked === 2) ctl.throttle = -1;
      else if (blocked === 1) ctl.throttle = 0;
      // Panic: gunfire nearby means floor it and swerve.
      const danger = game.danger;
      if (danger && performance.now() - danger.t < 2600 && Math.hypot(car.x - danger.x, car.z - danger.z) < 30) {
        ctl.throttle = 1;
        ctl.steer = clamp(ctl.steer + Math.sin(performance.now() * 0.02 + car.x) * 0.4, -1, 1);
      }
      const cruising = car.speed > 13 && ctl.throttle > 0;
      if (cruising) ctl.throttle = 0; // coast at cruising speed
      stepCar(car, ctl, dt, game.crashEvents, game.cars);
      void ROAD_HALF;
    }
  }
}
