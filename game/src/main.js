// Costa Palma — entry point and game orchestration: builds the world,
// owns the shared state (cash, heat, cars, danger), runs the loop, and
// wires every system together. The systems themselves live in their own
// files; this one is the conductor, not an instrument.

import * as THREE from 'three';
import {
  PLACES, START_CASH, HEAT_PER_STAR, MAX_STARS, HEAT_EVENTS, HEAT_DECAY, HIDDEN_AFTER,
} from './config.js';
import { clamp } from './util.js';
import { initInput, input, down, wasPressed, endFrameInput, requestLock } from './input.js';
import { parkedSpots } from './city-layout.js';
import { buildCity } from './buildings.js';
import { createCar, CAR_PAINTS } from './vehicles.js';
import { stepCar } from './vehicle-physics.js';
import { Player } from './player-controller.js';
import { TrafficSystem } from './traffic-ai.js';
import { PedestrianSystem } from './pedestrian-ai.js';
import { PoliceSystem } from './police-ai.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { Sfx } from './audio-synth.js';
import { Missions } from './missions.js';
import { HUD } from './hud-minimap.js';
import { loadSave, storeSave, clearSave } from './save-game.js';
import { readPhotoParam, stagePhoto } from './photo-mode.js';

function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 512;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#6f9fd0');
  grad.addColorStop(0.45, '#d9a06a');
  grad.addColorStop(0.72, '#f7b267');
  grad.addColorStop(1, '#e2703a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xefa25e, 130, 470);
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(51, 4, -18);

    const hemi = new THREE.HemisphereLight(0xffd9a0, 0x54503f, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
    sun.position.set(-170, 120, -70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -280;
    sun.shadow.camera.right = 280;
    sun.shadow.camera.top = 280;
    sun.shadow.camera.bottom = -280;
    sun.shadow.camera.far = 620;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffe0b3, 0.25));

    this.city = buildCity(this.scene);
    this.hud = new HUD();
    this.sfx = new Sfx();
    this.effects = new Effects(this.scene);

    // Shared state.
    this.cars = [];
    this.cash = START_CASH;
    this.hasPistol = false;
    this.heat = 0;
    this.stars = 0;
    this.danger = null; // {x, z, t} latest public disturbance
    this.state = 'menu'; // menu | playing | paused | down
    this.downT = 0;
    this.fireT = 0;
    this.lastSeenAt = 0;
    this.bustMeter = 0;
    this.photoFrozen = false;
    this.missionCar = null;
    this.escapeCar = null;
    this.crashEvents = { onCrash: (car, impact, what, other) => this.onCrash(car, impact, what, other) };

    this.player = new Player(this.scene, 51, -32);
    this.traffic = new TrafficSystem(this.scene, this);
    for (const spot of parkedSpots) {
      const car = createCar(this.scene, {
        kind: Math.random() < 0.14 ? 'convertible' : 'sedan',
        color: CAR_PAINTS[Math.floor(Math.random() * CAR_PAINTS.length)],
        x: spot.x, z: spot.z, heading: spot.heading,
      });
      this.cars.push(car);
    }
    this.peds = new PedestrianSystem(this.scene, this);
    this.police = new PoliceSystem(this.scene, this);
    this.combat = new Combat(this.scene, this);
    this.missions = new Missions(this);
    this.resetMissionCar();

    // Objective beacon: a shaft of gold light plus a bobbing diamond.
    this.beacon = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 36, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd740, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    shaft.position.y = 18;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.15),
      new THREE.MeshBasicMaterial({ color: 0xffe082 }),
    );
    gem.position.y = 4;
    this.beacon.add(shaft, gem);
    this.beaconGem = gem;
    this.scene.add(this.beacon);

    // The package crate, visible while the marina pickup is live.
    this.crate = new THREE.Group();
    const crateBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x6b7040, roughness: 0.8 }),
    );
    crateBox.position.y = 0.5;
    const crateGlow = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.16, 1.06),
      new THREE.MeshBasicMaterial({ color: 0xffd740 }),
    );
    crateGlow.position.y = 0.82;
    this.crate.add(crateBox, crateGlow);
    this.crate.position.set(PLACES.marinaPickup.x, 0.5, PLACES.marinaPickup.z);
    this.scene.add(this.crate);

    this.clock = new THREE.Clock();
    this.wireUi();
    initInput(this.renderer.domElement, () => this.sfx.init());
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'Escape') {
        if (this.state === 'playing') this.setPaused(true);
        else if (this.state === 'paused') this.setPaused(false);
      }
    });
    // Browsers reserve Esc to break pointer lock and swallow the keydown;
    // losing the lock mid-game is the pause signal instead.
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.renderer.domElement) {
        this.lockWasActive = true;
      } else if (this.lockWasActive && this.state === 'playing' && !this.photoFrozen) {
        this.lockWasActive = false;
        this.setPaused(true);
      }
    });

    const photo = readPhotoParam();
    if (photo) {
      this.state = 'playing';
      this.missions.reset(0);
      stagePhoto(photo, this);
      this.photoFrozen = true;
      this.hud.hideMenu();
      this.refreshHud();
    } else {
      this.hud.showMenu(!!loadSave());
    }
    this.renderer.setAnimationLoop(() => this.frame());
  }

  wireUi() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').addEventListener('click', () => this.startGame(false));
    $('btn-continue').addEventListener('click', () => this.startGame(true));
    $('btn-resume').addEventListener('click', () => this.setPaused(false));
    $('btn-restart').addEventListener('click', () => {
      this.setPaused(false);
      this.state = 'menu';
      this.hud.showMenu(!!loadSave());
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing') {
        this.sfx.init();
        requestLock(this.renderer.domElement);
      }
    });
  }

  startGame(fromSave) {
    this.sfx.init();
    const save = fromSave ? loadSave() : null;
    if (save) {
      this.cash = save.cash;
      this.hasPistol = save.hasPistol;
    } else {
      clearSave();
      this.cash = START_CASH;
      this.hasPistol = false;
    }
    this.player.x = 51;
    this.player.z = -32;
    this.player.health = 100;
    this.player.inCar = null;
    this.heat = 0;
    this.stars = 0;
    this.state = 'playing';
    this.hud.hideMenu();
    this.missions.reset(save ? save.missionIndex : 0);
    if (!save) {
      this.hud.showBanner('Mama Rosa', 'Leo! A collector left a convertible on Sunset Boulevard. Bring it to my garage — and try not to scratch it.', 7);
    }
    this.persist();
    this.refreshHud();
  }

  setPaused(on) {
    if (on && this.state === 'playing') {
      this.state = 'paused';
      this.hud.setPause(true);
      this.sfx.engine(0, false);
      this.sfx.siren(999);
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      this.hud.setPause(false);
    }
  }

  persist() {
    storeSave({ cash: this.cash, missionIndex: this.missions.missionIndex, hasPistol: this.hasPistol });
  }

  addCash(n) {
    this.cash += n;
    this.hud.setCash(this.cash);
  }

  setHeat(n) {
    this.heat = n;
  }

  resetMissionCar() {
    if (this.missionCar) {
      this.scene.remove(this.missionCar.group);
      this.cars = this.cars.filter((c) => c !== this.missionCar);
    }
    this.missionCar = createCar(this.scene, {
      kind: 'convertible', color: 0xe0a51f,
      x: PLACES.convertiblePark.x, z: PLACES.convertiblePark.z, heading: 0,
    });
    this.cars.push(this.missionCar);
  }

  spawnEscapeCar() {
    this.removeEscapeCar();
    this.escapeCar = createCar(this.scene, {
      kind: 'sedan', color: 0x2e5fc2, x: 198, z: 122, heading: -Math.PI / 2,
    });
    this.cars.push(this.escapeCar);
    return this.escapeCar;
  }

  removeEscapeCar() {
    if (!this.escapeCar) return;
    if (this.player.inCar === this.escapeCar) this.player.inCar = null;
    this.scene.remove(this.escapeCar.group);
    this.cars = this.cars.filter((c) => c !== this.escapeCar);
    this.escapeCar = null;
  }

  onGunmanDown() {
    this.sfx.pop();
  }

  // A crime only raises heat when someone sees it: a pedestrian within earshot
  // or a cruiser in sight. Either way it becomes the city's latest disturbance.
  commitCrime(type, x, z) {
    this.danger = { x, z, t: performance.now() };
    const witnessed =
      this.peds.peds.some((p) => p.state !== 'down' && Math.hypot(p.x - x, p.z - z) < 30) ||
      this.police.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 48);
    if (witnessed) {
      this.heat = Math.min(HEAT_PER_STAR * MAX_STARS, this.heat + (HEAT_EVENTS[type] || 0));
    }
  }

  onCrash(car, impact, what, other) {
    if (impact > 7) this.effects.sparks(car.x, 0.8, car.z);
    if (car.driver === 'player') {
      this.effects.shake(clamp(impact / 42, 0.08, 0.55));
      this.sfx.crash(clamp(impact / 30, 0.1, 1));
      if (impact > 9) this.commitCrime(what === 'car' ? 'hitCar' : 'hitBuilding', car.x, car.z);
      void other;
    } else if (impact > 11) {
      const p = this.player.pos;
      if (Math.hypot(car.x - p.x, car.z - p.z) < 42) this.sfx.crash(0.3);
    }
  }

  damagePlayer(n) {
    if (this.state !== 'playing' || this.photoFrozen) return;
    this.player.health -= n;
    this.hud.flashDamage();
    this.effects.shake(0.22);
    this.refreshHud();
    if (this.player.health <= 0) this.goDown(false);
  }

  goDown(busted) {
    this.state = 'down';
    this.downT = 2.8;
    const fine = Math.min(this.cash, 50 + Math.floor(this.cash * 0.1));
    this.pendingFine = fine;
    this.hud.showToast(
      busted ? 'BUSTED' : 'WASTED',
      busted ? `The C.P.P.D. bill you $${fine} for the trouble` : `Costa Palma General patches you up — $${fine}`,
      2.7,
    );
    this.sfx.fail();
    this.sfx.engine(0, false);
    this.sfx.siren(999);
  }

  respawn() {
    const player = this.player;
    if (player.inCar) {
      player.inCar.driver = null;
      player.inCar = null;
    }
    player.x = PLACES.hospital.x + 13;
    player.z = PLACES.hospital.z;
    player.health = 100;
    this.cash = Math.max(0, this.cash - (this.pendingFine || 0));
    this.heat = 0;
    this.stars = 0;
    this.bustMeter = 0;
    this.missions.onFail();
    this.state = 'playing';
    this.persist();
    this.refreshHud();
  }

  refreshHud() {
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health / 100);
    this.hud.setStars(this.stars);
    this.hud.setObjective(this.missions.objectiveText());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();
    if (this.state === 'playing' && !this.photoFrozen) this.update(dt, now);
    else if (this.state === 'down') {
      this.downT -= dt;
      this.effects.tick(dt);
      this.hud.tick(dt);
      if (this.downT <= 0) this.respawn();
    } else if (this.state === 'paused') {
      this.hud.tick(dt);
    }
    if (this.state === 'playing' || this.state === 'down') {
      // Beacon and crate dressing, plus the camera, stay live in every state.
      const t = now * 0.001;
      if (this.missions.target && this.state === 'playing') {
        this.beacon.visible = true;
        this.beacon.position.set(this.missions.target.x, 0, this.missions.target.z);
        this.beaconGem.position.y = 4 + Math.sin(t * 2.2) * 0.45;
        this.beaconGem.rotation.y = t * 1.4;
      } else {
        this.beacon.visible = false;
      }
      this.crate.visible = this.missions.stage === 'pickup';
      this.crate.rotation.y = t * 0.8;
      if (!this.photoFrozen) {
        this.player.updateCamera(this.camera, dt);
        const off = this.effects.shakeOffset();
        this.camera.position.x += off.x;
        this.camera.position.y += off.y;
      } else {
        // Staged frame: settle the camera exactly where photo-mode put Leo.
        this.player.updateCamera(this.camera, 0.5);
      }
      this.hud.drawMinimap(this);
    }
    this.renderer.render(this.scene, this.camera);
    endFrameInput();
  }

  update(dt, now) {
    const player = this.player;
    this.fireT = Math.max(0, this.fireT - dt);

    if (wasPressed('KeyM')) {
      const muted = this.sfx.toggleMute();
      this.hud.showBanner('Sound', muted ? 'Muted.' : 'Sound on.', 1.2);
    }

    player.update(dt);

    // Enter / exit cars.
    if (wasPressed('KeyE')) {
      if (player.inCar) {
        const car = player.inCar;
        if (Math.abs(car.speed) < 2.5) {
          player.inCar = null;
          car.driver = null;
          const fx = Math.sin(car.heading);
          const fz = Math.cos(car.heading);
          player.x = car.x + fz * 2.7;
          player.z = car.z - fx * 2.7;
          player.heading = car.heading;
          player.syncMesh();
        }
      } else {
        let best = null;
        let bestD = 3.6;
        for (const car of this.cars) {
          const d = Math.hypot(car.x - player.x, car.z - player.z);
          if (d < bestD && Math.abs(car.speed) < 3) {
            best = car;
            bestD = d;
          }
        }
        if (best) this.enterCar(best);
      }
    }

    // Driving.
    if (player.inCar) {
      const car = player.inCar;
      player.x = car.x;
      player.z = car.z;
      const ctl = {
        throttle: (down('KeyW') ? 1 : 0) + (down('KeyS') ? -1 : 0),
        steer: (down('KeyA') ? 1 : 0) + (down('KeyD') ? -1 : 0),
        handbrake: down('Space'),
      };
      const drifting = stepCar(car, ctl, dt, this.crashEvents, this.cars);
      if (drifting || (Math.abs(car.speed) > 17 && Math.abs(ctl.steer) > 0.7)) {
        this.skidT = (this.skidT || 0) - dt;
        if (this.skidT <= 0) {
          this.skidT = 0.04;
          const fx = Math.sin(car.heading);
          const fz = Math.cos(car.heading);
          this.effects.smoke(car.x - fx * 1.7, 0.25, car.z - fz * 1.7);
        }
      }
      this.sfx.engine(Math.abs(car.speed) / car.maxSpeed, true);
      this.hud.setSpeed(Math.abs(car.speed) * 3.6);
      this.hud.setPrompt(Math.abs(car.speed) < 2.5 ? '<b>E</b> — exit car' : null);
    } else {
      this.sfx.engine(0, false);
      this.hud.setSpeed(null);
      // Context prompt: a car in reach.
      let nearCar = false;
      for (const car of this.cars) {
        if (Math.hypot(car.x - player.x, car.z - player.z) < 3.6 && Math.abs(car.speed) < 3) {
          nearCar = true;
          break;
        }
      }
      this.hud.setPrompt(nearCar ? '<b>E</b> — steal car' : null);
      // Fists and pistol.
      this.hud.setCrosshair(this.hasPistol && input.aiming);
      if (input.firing && this.fireT <= 0) {
        if (this.hasPistol && input.aiming) {
          this.combat.playerShoot(this.camera);
          this.fireT = 0.17;
        } else if (!input.aiming) {
          this.combat.playerPunch();
          this.fireT = 0.22;
        }
      }
    }

    // Car vs pedestrian, and traffic vs Leo.
    for (const car of this.cars) {
      const speed = Math.abs(car.speed);
      if (speed < 3.5) continue;
      for (const ped of this.peds.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(car.x - ped.x, car.z - ped.z) < 1.8) {
          this.peds.knockDown(ped, car);
          this.effects.dust(ped.x, 0.5, ped.z);
          if (car.driver === 'player') {
            this.commitCrime('hitPed', ped.x, ped.z);
            this.effects.shake(0.2);
            this.sfx.crash(0.35);
          }
          car.speed *= 0.55;
        }
      }
      if (!player.inCar && car.driver !== 'player' && Math.hypot(car.x - player.x, car.z - player.z) < 1.9) {
        this.damagePlayer(11);
        player.x += (player.x - car.x) * 0.9;
        player.z += (player.z - car.z) * 0.9;
      }
    }

    // Damage smoke from wrecked cars.
    for (const car of this.cars) {
      if (car.damage > 55) {
        car.smokeT = (car.smokeT || 0) - dt;
        if (car.smokeT <= 0) {
          car.smokeT = 0.13;
          const fx = Math.sin(car.heading);
          const fz = Math.cos(car.heading);
          this.effects.smoke(car.x + fx * 1.6, 1.05, car.z + fz * 1.6, car.damage > 82);
        }
      }
    }

    this.traffic.update(dt);
    this.peds.update(dt);
    this.police.update(dt);
    this.combat.update(dt);
    this.missions.update(dt);

    // Wanted: who can see Leo right now?
    const p = player.pos;
    const seen =
      this.police.cars.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 52) ||
      this.peds.peds.some((ped) => ped.state !== 'down' && Math.hypot(ped.x - p.x, ped.z - p.z) < 27);
    if (seen) this.lastSeenAt = now;
    if (now - this.lastSeenAt > HIDDEN_AFTER * 1000) {
      this.heat = Math.max(0, this.heat - HEAT_DECAY * dt);
    }
    this.stars = this.heat <= 0 ? 0 : Math.min(MAX_STARS, Math.ceil(this.heat / HEAT_PER_STAR));

    // Busted: pinned by cruisers while slow or on foot.
    if (this.stars > 0 && this.state === 'playing') {
      const closeCruisers = this.police.cars.filter((c) => Math.hypot(c.x - p.x, c.z - p.z) < 9).length;
      const pinned = player.inCar
        ? Math.abs(player.inCar.speed) < 1.6 && closeCruisers >= 2
        : closeCruisers >= 1 && player.speedMag < 2;
      if (pinned) this.bustMeter += dt;
      else this.bustMeter = Math.max(0, this.bustMeter - dt * 2.2);
      if (this.bustMeter > 0.5) this.hud.setPrompt('⚠ The police are pinning you — MOVE!');
      if (this.bustMeter >= 2.3) this.goDown(true);
    } else {
      this.bustMeter = 0;
    }

    this.sfx.siren(this.stars > 0 ? this.police.nearest : 999);
    this.city.tick(dt);
    this.effects.tick(dt);
    this.hud.tick(dt);
    this.refreshHud();
  }

  enterCar(car) {
    const player = this.player;
    if (car.driver === 'traffic') {
      this.traffic.release(car);
      this.peds.spawnAt(this.scene, car.x + 2, car.z + 1); // the owner bails, screaming
    }
    if (!car.everStolen) {
      car.everStolen = true;
      this.commitCrime('stealCar', car.x, car.z);
    }
    if (car.driver === 'police') this.heat = Math.min(500, this.heat + 40);
    car.driver = 'player';
    player.inCar = car;
  }
}

new Game();
