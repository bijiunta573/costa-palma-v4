// Costa Palma — turns the layout data into the visible city: textured ground,
// towers with lit windows, palms, lamps, the beach, marina piers and boats.
// Meshes only; every collision question is answered by city-layout.js.

import * as THREE from 'three';
import {
  AXES_X, AXES_Z, ROAD_HALF, SIDEWALK, BEACH_START, BEACH_END, WORLD_Z, PLACES,
} from './config.js';
import { buildings, palms, lampPosts } from './city-layout.js';
import { makeRng } from './util.js';

// Ground plane extent in world units (texture is drawn to match).
const GX0 = -260;
const GX1 = 320;
const GZ0 = -260;
const GZ1 = 260;

// Merge small geometries into one, so a palm crown is a single instanced mesh.
function mergeGeoms(parts) {
  const pos = [];
  const norm = [];
  const uv = [];
  const v = new THREE.Vector3();
  const n = new THREE.Matrix3();
  for (const { geom, matrix } of parts) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const p = g.attributes.position;
    const nr = g.attributes.normal;
    const u = g.attributes.uv;
    n.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nr, i).applyMatrix3(n).normalize();
      norm.push(v.x, v.y, v.z);
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

// --- Ground texture: asphalt, dashes, sidewalks, sand, drawn once ----------

function groundTexture() {
  const W = 2048;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = W;
  const g = cv.getContext('2d');
  const sx = (x) => ((x - GX0) / (GX1 - GX0)) * W;
  const sz = (z) => ((z - GZ0) / (GZ1 - GZ0)) * W;
  const sw = (w) => (w / (GX1 - GX0)) * W;
  const sh = (h) => (h / (GZ1 - GZ0)) * W;

  g.fillStyle = '#7d7268'; // block pavement base
  g.fillRect(0, 0, W, W);
  // Sand east of the last avenue.
  g.fillStyle = '#ecd096';
  g.fillRect(sx(BEACH_START), 0, sw(BEACH_END - BEACH_START + 60), W);
  // Sidewalk aprons along every road, then asphalt on top.
  g.fillStyle = '#a89a86';
  for (const ax of AXES_X) g.fillRect(sx(ax - ROAD_HALF - SIDEWALK), 0, sw((ROAD_HALF + SIDEWALK) * 2), W);
  for (const az of AXES_Z) g.fillRect(0, sz(az - ROAD_HALF - SIDEWALK), sx(BEACH_START + 4), sh((ROAD_HALF + SIDEWALK) * 2));
  g.fillStyle = '#3a383d';
  for (const ax of AXES_X) g.fillRect(sx(ax - ROAD_HALF), 0, sw(ROAD_HALF * 2), W);
  for (const az of AXES_Z) g.fillRect(0, sz(az - ROAD_HALF), sx(BEACH_START + 4), sh(ROAD_HALF * 2));
  // Centre dashes.
  g.fillStyle = '#d9c26a';
  for (const ax of AXES_X) {
    for (let z = GZ0; z < GZ1; z += 12) g.fillRect(sx(ax) - 1, sz(z), 2, sh(6));
  }
  for (const az of AXES_Z) {
    for (let x = GX0; x < BEACH_START; x += 12) g.fillRect(sx(x), sz(az) - 1, sw(6), 2);
  }
  // Marina apron concrete.
  g.fillStyle = '#9b9186';
  g.fillRect(sx(184), sz(52), sw(24), sh(104));
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Building facades --------------------------------------------------------

function facadeTexture(rng, warm) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = warm;
  g.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 12;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = rng() < 0.42;
      g.fillStyle = lit ? '#ffd489' : '#2e3742';
      g.fillRect(8 + i * 20, 10 + j * 20, 12, 13);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, bg, fg) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = fg;
  g.font = 'bold 52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 52);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addSign(scene, text, bg, fg, x, y, z, ry, w = 13) {
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * (96 / 512)), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  scene.add(mesh);
}

// --- The build ----------------------------------------------------------------

export function buildCity(scene) {
  const rng = makeRng(777);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GX1 - GX0, GZ1 - GZ0),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((GX0 + GX1) / 2, 0, (GZ0 + GZ1) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // Water: a separate sheet east of the waterline, gently scrolling.
  const waterCv = document.createElement('canvas');
  waterCv.width = waterCv.height = 128;
  const wg = waterCv.getContext('2d');
  wg.fillStyle = '#2b7a99';
  wg.fillRect(0, 0, 128, 128);
  wg.strokeStyle = 'rgba(255,255,255,0.16)';
  for (let i = 0; i < 9; i++) {
    wg.beginPath();
    wg.moveTo(0, i * 16 + 4);
    wg.bezierCurveTo(40, i * 16, 90, i * 16 + 8, 128, i * 16 + 3);
    wg.stroke();
  }
  const waterTex = new THREE.CanvasTexture(waterCv);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(6, 24);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(150, GZ1 - GZ0),
    new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.35, metalness: 0.15 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(BEACH_END + 73, 0.12, 0); // above the sea floor, below the pier decks
  scene.add(water);

  // Towers: a handful of shared facades, tinted per building.
  const facadeBase = ['#b09a80', '#9c8b78', '#c2ab90', '#8f8272', '#b5a08a', '#a3947f'];
  const facades = facadeBase.map((c) => facadeTexture(rng, c));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4c463f, roughness: 1 });
  for (const b of buildings) {
    const mat = new THREE.MeshStandardMaterial({
      map: facades[Math.floor(b.hue * facades.length) % facades.length],
      roughness: 0.92,
    });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    tower.position.set(b.x, b.h / 2, b.z);
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene.add(tower);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.5, 0.5, b.d + 0.5), roofMat);
    roof.position.set(b.x, b.h + 0.25, b.z);
    scene.add(roof);
  }

  // Palms: instanced trunks and crowns.
  const trunkGeom = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  trunkGeom.translate(0, 3.2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, palms.length);
  const frondParts = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Matrix4()
      .makeRotationY((i / 7) * Math.PI * 2)
      .multiply(new THREE.Matrix4().makeTranslation(0, 6.5, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(0.85))
      .multiply(new THREE.Matrix4().makeTranslation(1.7, 0, 0));
    const plane = new THREE.PlaneGeometry(3.6, 0.85);
    frondParts.push({ geom: plane, matrix: m });
  }
  const crownGeom = mergeGeoms(frondParts);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x3f7d33, roughness: 1, side: THREE.DoubleSide });
  const crowns = new THREE.InstancedMesh(crownGeom, crownMat, palms.length);
  const dummy = new THREE.Object3D();
  palms.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.scale.setScalar(p.s);
    dummy.rotation.y = p.x * 1.7 + p.z;
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = true;
  scene.add(trunks, crowns);

  // Lamp posts: instanced poles with warm heads (they glow at golden hour).
  const poleGeom = new THREE.CylinderGeometry(0.09, 0.09, 5.4, 5);
  poleGeom.translate(0, 2.7, 0);
  const poles = new THREE.InstancedMesh(
    poleGeom,
    new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.7 }),
    lampPosts.length,
  );
  const headGeom = new THREE.SphereGeometry(0.32, 8, 6);
  headGeom.translate(0, 5.5, 0);
  const heads = new THREE.InstancedMesh(
    headGeom,
    new THREE.MeshStandardMaterial({ color: 0xffca7a, emissive: 0xff9d3c, emissiveIntensity: 0.9 }),
    lampPosts.length,
  );
  lampPosts.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles, heads);

  // Marina piers: three wooden fingers over the water, with moored boats.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
  for (const pz of [90, 110, 130]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(48, 0.5, 6), woodMat);
    pier.position.set(224, 0.25, pz);
    pier.receiveShadow = true;
    scene.add(pier);
  }
  const hullCols = [0xd8d3c8, 0x3f6d8e, 0xb8452f, 0x386150, 0xd8d3c8];
  for (let i = 0; i < 5; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1.4, 2.6),
      new THREE.MeshStandardMaterial({ color: hullCols[i], roughness: 0.6 }),
    );
    hull.position.y = 0.5;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.1, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.6 }),
    );
    cabin.position.set(-0.4, 1.6, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.5, 5), woodMat);
    mast.position.set(1.2, 3.4, 0);
    boat.add(hull, cabin, mast);
    boat.position.set(216 + (i % 2) * 16, 0, 96 + i * 9);
    boat.rotation.y = (i % 2 ? -1 : 1) * 0.06;
    scene.add(boat);
  }

  // Landmark dressing: signs and Rosa's roller door.
  addSign(scene, "ROSA'S GARAGE", '#263238', '#ffb74d', PLACES.rosaGarage.x + 8.6, 6.4, PLACES.rosaGarage.z - 10, Math.PI / 2);
  addSign(scene, 'HOSPITAL +', '#e8e4da', '#c62828', PLACES.hospital.x + 9.6, 9.5, PLACES.hospital.z + 10, Math.PI / 2);
  addSign(scene, 'MARINA', '#1d4e5e', '#ffe082', 190, 4.6, 66, Math.PI / 2, 9);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 4.4, 9),
    new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.55, metalness: 0.5 }),
  );
  door.position.set(PLACES.rosaGarage.x + 8.2, 2.2, PLACES.rosaGarage.z - 10);
  scene.add(door);

  return {
    // Scroll the water texture a touch each frame; cheap and lively.
    tick(dt) {
      waterTex.offset.x += dt * 0.008;
      waterTex.offset.y += dt * 0.003;
    },
  };
}
