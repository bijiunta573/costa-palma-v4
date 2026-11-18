// Costa Palma — car meshes and the car entity every driver system shares.
// A car is a plain object: position/heading/speed for the physics in
// vehicle-physics.js, a THREE group for the eye, and flags for who drives it.

import * as THREE from 'three';

export const CAR_PAINTS = [
  0xc23b2e, 0x2e5fc2, 0xe0a51f, 0x3f9e57, 0xd8d5cc, 0x30343c, 0x7a3f8c, 0x1f8a8c, 0xd96c2c,
];

const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.15, metalness: 0.6 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.95 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.6 });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Build the visible car. The model faces +z; heading 0 drives toward +z.
function buildCarMesh(kind, color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  group.add(box(1.9, 0.55, 4.3, paint, 0, 0.58, 0)); // body
  group.add(box(1.94, 0.22, 1.1, paint, 0, 0.42, 1.85)); // nose
  if (kind === 'convertible') {
    group.add(box(1.7, 0.3, 2.1, trimMat, 0, 0.92, -0.25)); // open tub
    group.add(box(0.62, 0.5, 0.5, new THREE.MeshStandardMaterial({ color: 0x8c2f26 }), -0.42, 0.95, -0.7));
    group.add(box(0.62, 0.5, 0.5, new THREE.MeshStandardMaterial({ color: 0x8c2f26 }), 0.42, 0.95, -0.7));
    group.add(box(1.66, 0.42, 0.08, glassMat, 0, 1.12, 0.86)); // windshield
  } else {
    group.add(box(1.68, 0.52, 2.0, glassMat, 0, 1.08, -0.2)); // glasshouse
    group.add(box(1.74, 0.1, 2.06, paint, 0, 1.36, -0.2)); // roof skin
  }
  if (kind === 'police') {
    group.add(box(1.92, 0.3, 4.32, trimMat, 0, 0.5, 0)); // black band
    const barMatR = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2222, emissiveIntensity: 0.4 });
    const barMatB = new THREE.MeshStandardMaterial({ color: 0x111188, emissive: 0x2244ff, emissiveIntensity: 0.4 });
    const barR = box(0.55, 0.16, 0.5, barMatR, -0.3, 1.5, -0.2);
    const barB = box(0.55, 0.16, 0.5, barMatB, 0.3, 1.5, -0.2);
    group.add(barR, barB);
    group.userData.flashMats = [barMatR, barMatB];
  }
  // Headlights and tail lights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.7 });
  group.add(box(0.34, 0.14, 0.06, headMat, -0.6, 0.62, 2.16));
  group.add(box(0.34, 0.14, 0.06, headMat, 0.6, 0.62, 2.16));
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.5 });
  group.add(box(0.34, 0.12, 0.06, tailMat, -0.6, 0.66, -2.16));
  group.add(box(0.34, 0.12, 0.06, tailMat, 0.6, 0.66, -2.16));
  // Wheels.
  const wheelGeom = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10);
  wheelGeom.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.38], [0.88, 1.38], [-0.88, -1.38], [0.88, -1.38]]) {
    const w = new THREE.Mesh(wheelGeom, tyreMat);
    w.position.set(wx, 0.37, wz);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }
  return { group, wheels };
}

// Create a car entity and add it to the scene.
export function createCar(scene, { kind = 'sedan', color = 0xc23b2e, x = 0, z = 0, heading = 0 } = {}) {
  const { group, wheels } = buildCarMesh(kind, color);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  const car = {
    kind,
    color,
    group,
    wheels,
    flashMats: group.userData.flashMats || null,
    x, z, heading,
    speed: 0,
    steerVis: 0,
    radius: 2.25,
    maxSpeed: kind === 'police' ? 37 : kind === 'convertible' ? 33 : 29,
    accel: kind === 'police' ? 15 : 12.5,
    damage: 0, // 0..100; smoke past 55, crawling past 85
    driver: null, // null = parked; otherwise 'traffic' | 'police' | 'player'
    honkAt: 0,
    syncMesh() {
      group.position.set(this.x, 0, this.z);
      group.rotation.y = this.heading;
      // Spin is applied by stepCar; here only the front wheels' steer angle.
      for (let i = 0; i < 2; i++) this.wheels[i].rotation.y = this.steerVis;
    },
  };
  return car;
}

// Forward vector for a heading (cars face +z at heading 0).
export function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}
