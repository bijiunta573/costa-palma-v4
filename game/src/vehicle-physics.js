// Costa Palma — arcade car physics: throttle, steering, drifting, and the
// collisions that make the city feel solid. stepCar moves one car for one
// frame and reports crashes through the events object so the game can add
// heat, sparks, shake and sound.

import { colliders } from './city-layout.js';
import { circleVsBox, clamp } from './util.js';
import { forwardOf } from './vehicles.js';

const WORLD = { minX: -224, maxX: 206, minZ: -224, maxZ: 224 };

// ctl: {throttle: -1..1, steer: -1..1, handbrake: bool}
// events: {onCrash(car, impactSpeed, what)} what: 'building' | 'car'
// allCars: every car entity, for car-to-car bumps.
export function stepCar(car, ctl, dt, events, allCars) {
  const topSpeed = car.maxSpeed * (car.damage > 85 ? 0.45 : 1);
  // Longitudinal: throttle, drag and brakes.
  if (ctl.throttle > 0) car.speed += car.accel * ctl.throttle * dt;
  else if (ctl.throttle < 0) {
    // Braking while moving forward, reversing once stopped.
    car.speed += (car.speed > 0.4 ? 26 : car.accel * 0.55) * ctl.throttle * dt;
  }
  const drag = ctl.handbrake ? 3.2 : 0.55;
  car.speed -= car.speed * drag * dt;
  if (!ctl.throttle && Math.abs(car.speed) < 0.25) car.speed = 0;
  car.speed = clamp(car.speed, -9, topSpeed);

  // Steering bites harder at low speed and washes out at high speed; the
  // handbrake lets the tail step out.
  const speedRatio = clamp(Math.abs(car.speed) / 12, 0, 1);
  const steerAuthority = (0.62 - 0.3 * clamp(Math.abs(car.speed) / topSpeed, 0, 1)) * (ctl.handbrake ? 1.5 : 1);
  if (car.speed !== 0) {
    car.heading += ctl.steer * steerAuthority * dt * Math.sign(car.speed) * (0.35 + 0.65 * speedRatio);
  }
  car.steerVis += ((ctl.steer * 0.45) - car.steerVis) * Math.min(1, dt * 10);

  const fwd = forwardOf(car.heading);
  const beforeX = car.x;
  const beforeZ = car.z;
  const beforeSpeed = Math.abs(car.speed);
  car.x += fwd.x * car.speed * dt;
  car.z += fwd.z * car.speed * dt;

  // Buildings: circle vs box, push out and kill the speed that hit it.
  for (const box of colliders) {
    const hit = circleVsBox(car.x, car.z, car.radius, box);
    if (hit) {
      car.x += hit.x * hit.depth;
      car.z += hit.z * hit.depth;
      if (beforeSpeed > 5) events.onCrash(car, beforeSpeed, 'building');
      car.speed *= beforeSpeed > 5 ? 0.25 : 0.7;
      car.damage = Math.min(100, car.damage + beforeSpeed * 0.55);
    }
  }

  // World bounds: the sea and the city edge are walls.
  if (car.x < WORLD.minX || car.x > WORLD.maxX || car.z < WORLD.minZ || car.z > WORLD.maxZ) {
    car.x = clamp(car.x, WORLD.minX, WORLD.maxX);
    car.z = clamp(car.z, WORLD.minZ, WORLD.maxZ);
    if (beforeSpeed > 6) events.onCrash(car, beforeSpeed, 'building');
    car.speed *= 0.4;
  }

  // Other cars: soft circles, a shove and a shared speed cut.
  for (const other of allCars) {
    if (other === car) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const d2 = dx * dx + dz * dz;
    const min = car.radius + other.radius - 0.7;
    if (d2 > min * min || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const push = (min - d) / 2;
    car.x += (dx / d) * push;
    car.z += (dz / d) * push;
    other.x -= (dx / d) * push;
    other.z -= (dz / d) * push;
    if (beforeSpeed > 4) {
      events.onCrash(car, beforeSpeed, 'car', other);
      car.damage = Math.min(100, car.damage + beforeSpeed * 0.3);
    }
    car.speed *= 0.55;
    other.speed *= 0.7;
    other.syncMesh();
  }

  // Wheel spin for the eye.
  const spin = (car.speed * dt) / 0.37;
  for (const w of car.wheels) w.rotation.x += spin;
  void beforeX;
  void beforeZ;
  car.syncMesh();
  return Math.abs(car.speed) > 14 && ctl.handbrake; // drifting?
}
