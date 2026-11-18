// Costa Palma — juice: particle puffs (smoke, sparks, dust), muzzle flashes,
// bullet tracers and screen shake. One pooled particle system keeps it cheap.

import * as THREE from 'three';

const MAX_PARTICLES = 700;

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.4, 'rgba(255,180,80,0.75)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // Particle pool.
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.grav = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX_PARTICLES; i++) this.pos[i * 3 + 1] = -50;
    // Muzzle flash: a glow sprite plus a real light, both short-lived.
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
    this.flash.scale.set(1.6, 1.6, 1);
    this.flash.visible = false;
    scene.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffb45e, 0, 16);
    scene.add(this.flashLight);
    this.flashT = 0;
    // Tracers: a small pool of lines.
    this.tracers = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, t: 0 });
    }
    this.trauma = 0; // screen shake energy, decays in tick
  }

  spawn(x, y, z, { count = 8, color = [0.6, 0.6, 0.6], speed = 2.4, up = 1.6, life = 0.8, gravity = -0.4, spread = 1 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = (Math.random() - 0.5) * speed * spread;
      this.vel[i * 3 + 1] = Math.random() * up;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed * spread;
      this.col[i * 3] = color[0];
      this.col[i * 3 + 1] = color[1];
      this.col[i * 3 + 2] = color[2];
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
      this.grav[i] = gravity;
    }
  }

  smoke(x, y, z, dark = false) {
    const c = dark ? [0.16, 0.16, 0.17] : [0.62, 0.6, 0.58];
    this.spawn(x, y, z, { count: 2, color: c, speed: 0.7, up: 1.9, life: 1.15, gravity: 0.5 });
  }

  sparks(x, y, z) {
    this.spawn(x, y, z, { count: 10, color: [1, 0.72, 0.25], speed: 4.6, up: 2.6, life: 0.4, gravity: -6 });
  }

  dust(x, y, z) {
    this.spawn(x, y, z, { count: 6, color: [0.85, 0.76, 0.6], speed: 1.6, up: 0.8, life: 0.6, gravity: -0.2 });
  }

  muzzle(x, y, z) {
    this.flash.position.set(x, y, z);
    this.flash.visible = true;
    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = 26;
    this.flashT = 0.055;
    this.spawn(x, y, z, { count: 3, color: [1, 0.8, 0.4], speed: 1.2, up: 0.4, life: 0.16, gravity: 0 });
  }

  tracer(x0, y0, z0, x1, y1, z1) {
    const slot = this.tracers.find((t) => t.t <= 0) || this.tracers[0];
    const p = slot.line.geometry.attributes.position;
    p.setXYZ(0, x0, y0, z0);
    p.setXYZ(1, x1, y1, z1);
    p.needsUpdate = true;
    slot.line.material.opacity = 0.9;
    slot.t = 0.07;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  // Camera offset for this frame; call once per frame from the camera code.
  shakeOffset() {
    const t = this.trauma;
    this.trauma = Math.max(0, this.trauma - 0.028);
    if (t <= 0) return { x: 0, y: 0 };
    const s = t * t * 0.5;
    return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
  }

  tick(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -50;
        continue;
      }
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) this.pos[i * 3 + 1] = 0.05;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
      }
    }
    for (const t of this.tracers) {
      if (t.t > 0) {
        t.t -= dt;
        t.line.material.opacity = Math.max(0, t.t / 0.07) * 0.9;
      }
    }
  }
}
