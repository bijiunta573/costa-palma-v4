// Costa Palma — the humanoid factory (player, pedestrians, gunmen all share
// it) and Leo himself: on-foot movement, the orbit camera, walk animation.

import * as THREE from 'three';
import { WALK_SPEED, SPRINT_SPEED, CAM_DIST_FOOT, CAM_DIST_CAR } from './config.js';
import { colliders, insideBuilding, groundHeightAt } from './city-layout.js';
import { circleVsBox, clamp, lerpAngle } from './util.js';
import { input, down } from './input.js';

// A low-poly person, ~1.8 units tall, facing +z. Limbs pivot at the
// shoulder/hip so setPose can swing them for a walk cycle or an aim.
export function makeHumanoid({ shirt = 0x1f8a8c, pants = 0x2c3242, skin = 0xd9a066, hair = 0x2a1c10 } = {}) {
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const add = (geo, material, x, y, z, parent = group) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const limb = (w, len, material, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), material);
    m.position.y = -len / 2;
    m.castShadow = true;
    pivot.add(m);
    group.add(pivot);
    return pivot;
  };
  const legL = limb(0.17, 0.82, mat(pants), -0.13, 0.84, 0);
  const legR = limb(0.17, 0.82, mat(pants), 0.13, 0.84, 0);
  add(new THREE.BoxGeometry(0.54, 0.66, 0.27), mat(shirt), 0, 1.16, 0); // torso
  const armL = limb(0.13, 0.68, mat(shirt), -0.35, 1.44, 0);
  const armR = limb(0.13, 0.68, mat(shirt), 0.35, 1.44, 0);
  add(new THREE.BoxGeometry(0.3, 0.32, 0.3), mat(skin), 0, 1.66, 0); // head
  add(new THREE.BoxGeometry(0.32, 0.1, 0.32), mat(hair), 0, 1.84, 0); // hair
  const gun = add(new THREE.BoxGeometry(0.07, 0.12, 0.42), mat(0x14151a), 0, -0.66, 0.14, armR);
  gun.visible = false;
  return {
    group, legL, legR, armL, armR, gun,
    // phase: walk cycle radians; aim: pistol raised; downed: lying flat.
    setPose(phase, moving, aim, downed) {
      if (downed) {
        group.rotation.x = -Math.PI / 2;
        group.position.y = 0.25;
        return;
      }
      group.rotation.x = 0;
      const swing = moving ? Math.sin(phase) * 0.62 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = aim ? -0.25 : -swing * 0.8;
      armR.rotation.x = aim ? -1.45 : swing * 0.8;
      gun.visible = aim;
    },
  };
}

export class Player {
  constructor(scene, x, z) {
    this.body = makeHumanoid({ shirt: 0x14b8a6, pants: 0x27324a, skin: 0xd9a066, hair: 0x1d130a });
    this.x = x;
    this.z = z;
    this.heading = Math.PI; // facing the boulevard (toward -z is π with our forward)
    this.health = 100;
    this.inCar = null;
    this.walkPhase = 0;
    this.speedMag = 0;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.punchCooldown = 0;
    scene.add(this.body.group);
    this.syncMesh();
  }

  get pos() {
    return this.inCar ? { x: this.inCar.x, z: this.inCar.z } : { x: this.x, z: this.z };
  }

  // On-foot movement from input, relative to the camera. Returns true if moved.
  update(dt) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.inCar) {
      this.speedMag = Math.abs(this.inCar.speed);
      this.body.group.visible = false;
      return false;
    }
    this.body.group.visible = true;
    // Camera looks along -(sin yaw, cos yaw); W walks that way.
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = -fz;
    const rz = fx;
    let mx = 0;
    let mz = 0;
    if (down('KeyW')) { mx += fx; mz += fz; }
    if (down('KeyS')) { mx -= fx; mz -= fz; }
    if (down('KeyD')) { mx += rx; mz += rz; }
    if (down('KeyA')) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    const sprint = down('ShiftLeft') || down('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      this.x += mx * speed * dt;
      this.z += mz * speed * dt;
      this.heading = lerpAngle(this.heading, Math.atan2(mx, mz), Math.min(1, dt * 14));
      this.walkPhase += dt * speed * 1.55;
      this.speedMag = speed;
    } else {
      this.speedMag = 0;
    }
    // Buildings and the sea wall.
    for (const box of colliders) {
      const hit = circleVsBox(this.x, this.z, 0.7, box);
      if (hit) {
        this.x += hit.x * hit.depth;
        this.z += hit.z * hit.depth;
      }
    }
    // The piers are the only footing past the waterline.
    const onPier = [90, 110, 130].some((pz) => Math.abs(this.z - pz) <= 3.2);
    this.x = clamp(this.x, -222, onPier ? 246 : 202);
    this.z = clamp(this.z, -222, 222);
    this.body.setPose(this.walkPhase, len > 0.01, input.aiming, false);
    this.syncMesh();
    return len > 0.01;
  }

  syncMesh() {
    this.body.group.position.set(this.x, groundHeightAt(this.x, this.z), this.z);
    this.body.group.rotation.y = this.heading;
  }

  // Orbit camera: mouse turns it, it trails the player or their car, and it
  // climbs over rooftops rather than clipping through towers.
  updateCamera(camera, dt) {
    this.camYaw -= input.mouseDX * 0.0031;
    this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0026, 0.04, 1.15);
    const focus = this.inCar ? this.inCar : this;
    const dist = this.inCar ? CAM_DIST_CAR : CAM_DIST_FOOT;
    const cx = focus.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = focus.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    let cy = 1.6 + Math.sin(this.camPitch) * dist;
    const under = insideBuilding(cx, cz, 0);
    if (under) cy = Math.max(cy, under.h + 1.6);
    const k = Math.min(1, dt * 9);
    camera.position.x += (cx - camera.position.x) * k;
    camera.position.y += (cy - camera.position.y) * k;
    camera.position.z += (cz - camera.position.z) * k;
    camera.lookAt(focus.x, 1.7, focus.z);
    void dt;
  }

  // Where the camera is looking, as a ground-plane direction (for shooting).
  viewDirection() {
    return { x: -Math.sin(this.camYaw), z: -Math.cos(this.camYaw) };
  }
}
