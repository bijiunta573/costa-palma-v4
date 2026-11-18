// Costa Palma — pedestrians: citizens strolling the sidewalks who run
// screaming when violence finds them, and stay down when a car does.

import * as THREE from 'three';
import { AXES_X, AXES_Z, ROAD_HALF } from './config.js';
import { makeRng, clamp, lerpAngle } from './util.js';
import { colliders } from './city-layout.js';
import { circleVsBox } from './util.js';
import { makeHumanoid } from './player-controller.js';

const PED_COUNT = 26;
const SHIRTS = [0xd96c2c, 0x4a7fb5, 0xd8d5cc, 0x77a832, 0xb5446e, 0x546e7a, 0xe0a51f, 0x8c6d4f];
const SCREAMS = ['Aaa!', 'Help!', '!!', 'Run!'];

function screamTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(255,251,235,0.92)';
  g.beginPath();
  g.roundRect(6, 6, 116, 40, 12);
  g.fill();
  g.fillStyle = '#263238';
  g.font = 'bold 26px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 64, 36);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PedestrianSystem {
  constructor(scene, game) {
    this.game = game;
    this.rng = makeRng(90210);
    this.textures = SCREAMS.map(screamTexture);
    this.peds = [];
    for (let i = 0; i < PED_COUNT; i++) {
      const body = makeHumanoid({
        shirt: SHIRTS[Math.floor(this.rng() * SHIRTS.length)],
        pants: 0x3a4152,
        skin: [0xd9a066, 0x8c5a2e, 0xf0c8a0][Math.floor(this.rng() * 3)],
        hair: 0x241a12,
      });
      scene.add(body.group);
      const popup = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.textures[i % this.textures.length], transparent: true }),
      );
      popup.scale.set(2.3, 1.15, 1);
      popup.visible = false;
      scene.add(popup);
      const ped = {
        body, popup,
        x: 0, z: 0, heading: this.rng() * Math.PI * 2,
        state: 'walk', // walk | flee | down
        stateT: 0,
        walkPhase: this.rng() * 6,
        line: null,
        popupT: 0,
        wasHitBy: null,
      };
      this.placeOnSidewalk(ped);
      this.peds.push(ped);
    }
  }

  // Sidewalk lines run parallel to a road, offset just outside the asphalt.
  placeOnSidewalk(ped) {
    const vertical = this.rng() < 0.5;
    const axis = (vertical ? AXES_X : AXES_Z)[Math.floor(this.rng() * 6)];
    const side = this.rng() < 0.5 ? -1 : 1;
    const along = -205 + this.rng() * 410;
    const off = side * (ROAD_HALF + 1.8);
    ped.x = vertical ? axis + off : along;
    ped.z = vertical ? along : axis + off;
    ped.line = { vertical, axis, side, dir: this.rng() < 0.5 ? 1 : -1 };
    ped.state = 'walk';
    ped.stateT = 0;
  }

  // A fresh pedestrian appears (a driver bailing out of a stolen car).
  spawnAt(scene, x, z) {
    const body = makeHumanoid({ shirt: 0xb5446e, pants: 0x3a4152, skin: 0xd9a066, hair: 0x241a12 });
    scene.add(body.group);
    const popup = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.textures[1], transparent: true }),
    );
    popup.scale.set(2.3, 1.15, 1);
    popup.visible = false;
    scene.add(popup);
    const ped = {
      body, popup, x, z, heading: 0, state: 'flee', stateT: 0,
      walkPhase: 0, line: null, popupT: 1.2, wasHitBy: null,
    };
    this.peds.push(ped);
    return ped;
  }

  // After a scare, resume strolling on whichever sidewalk is closest.
  adoptNearestLine(ped) {
    let bestX = AXES_X[0];
    for (const ax of AXES_X) if (Math.abs(ped.x - ax) < Math.abs(ped.x - bestX)) bestX = ax;
    let bestZ = AXES_Z[0];
    for (const az of AXES_Z) if (Math.abs(ped.z - az) < Math.abs(ped.z - bestZ)) bestZ = az;
    if (Math.abs(ped.x - bestX) < Math.abs(ped.z - bestZ)) {
      ped.line = { vertical: true, axis: bestX, side: ped.x >= bestX ? 1 : -1, dir: this.rng() < 0.5 ? 1 : -1 };
    } else {
      ped.line = { vertical: false, axis: bestZ, side: ped.z >= bestZ ? 1 : -1, dir: this.rng() < 0.5 ? 1 : -1 };
    }
  }

  knockDown(ped, byCar = null) {
    ped.state = 'down';
    ped.stateT = 4.5;
    ped.wasHitBy = byCar;
    ped.popupT = 0;
    ped.popup.visible = false;
  }

  scare(x, z, radius = 20) {
    for (const ped of this.peds) {
      if (ped.state !== 'walk') continue;
      if (Math.hypot(ped.x - x, ped.z - z) < radius) {
        ped.state = 'flee';
        ped.stateT = 2.5 + this.rng() * 1.5;
        ped.popupT = 1.3;
        ped.fleeFrom = { x, z };
      }
    }
  }

  update(dt) {
    const danger = this.game.danger;
    for (const ped of this.peds) {
      ped.stateT -= dt;
      // Fresh danger scares nearby walkers.
      if (ped.state === 'walk' && danger && performance.now() - danger.t < 300) {
        if (Math.hypot(ped.x - danger.x, ped.z - danger.z) < 20) {
          ped.state = 'flee';
          ped.stateT = 2.5 + this.rng() * 1.5;
          ped.popupT = 1.3;
          ped.fleeFrom = { x: danger.x, z: danger.z };
        }
      }
      if (ped.state === 'down') {
        ped.body.setPose(0, false, false, true);
        ped.body.group.position.set(ped.x, 0.25, ped.z);
        ped.body.group.rotation.y = ped.heading;
        if (ped.stateT <= 0) {
          ped.state = 'flee';
          ped.stateT = 2;
          ped.fleeFrom = { x: ped.x + 5, z: ped.z + 5 };
          ped.popupT = 0.9;
        }
        continue;
      }
      let speed = 2.3;
      let tx;
      let tz;
      if (ped.state === 'flee') {
        speed = 6.2;
        const from = ped.fleeFrom || this.game.player.pos;
        const dx = ped.x - from.x;
        const dz = ped.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = ped.x + (dx / d) * 10;
        tz = ped.z + (dz / d) * 10;
        if (ped.stateT <= 0) {
          ped.state = 'walk';
          this.adoptNearestLine(ped);
          continue;
        }
      } else {
        // Stroll the sidewalk line; at a crossing, sometimes turn.
        const line = ped.line;
        const off = line.side * (ROAD_HALF + 1.8);
        if (line.vertical) {
          tx = line.axis + off;
          tz = ped.z + line.dir * 12;
          const cross = AXES_Z.find((az) => Math.abs(ped.z - az) < 2.4);
          if (cross !== undefined && this.rng() < 0.02) {
            ped.line = { vertical: false, axis: cross, side: line.side, dir: this.rng() < 0.5 ? 1 : -1 };
          }
          if (ped.z > 208 || ped.z < -208) line.dir *= -1;
        } else {
          tx = ped.x + line.dir * 12;
          tz = line.axis + off;
          const cross = AXES_X.find((ax) => Math.abs(ped.x - ax) < 2.4);
          if (cross !== undefined && this.rng() < 0.02) {
            ped.line = { vertical: true, axis: cross, side: line.side, dir: this.rng() < 0.5 ? 1 : -1 };
          }
          if (ped.x > 146 || ped.x < -208) line.dir *= -1;
        }
      }
      const want = Math.atan2(tx - ped.x, tz - ped.z);
      ped.heading = lerpAngle(ped.heading, want, Math.min(1, dt * 6));
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      for (const box of colliders) {
        const hit = circleVsBox(ped.x, ped.z, 0.5, box);
        if (hit) {
          ped.x += hit.x * hit.depth;
          ped.z += hit.z * hit.depth;
        }
      }
      ped.x = clamp(ped.x, -214, 200);
      ped.z = clamp(ped.z, -214, 214);
      ped.walkPhase += dt * speed * 1.9;
      ped.body.setPose(ped.walkPhase, true, false, false);
      ped.body.group.position.set(ped.x, 0, ped.z);
      ped.body.group.rotation.y = ped.heading;
      // Scream popup.
      if (ped.popupT > 0) {
        ped.popupT -= dt;
        ped.popup.visible = true;
        ped.popup.position.set(ped.x, 2.45, ped.z);
      } else {
        ped.popup.visible = false;
      }
    }
  }
}
