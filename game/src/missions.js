// Costa Palma — Mama Rosa's three jobs, as a stage machine. Each stage has
// an objective line and (usually) a world target the beacon and minimap
// point at. The game object supplies the verbs: banners, cash, heat, cars.

import { PLACES, MISSION_PAY } from './config.js';

const ROSA = 'Mama Rosa';

export class Missions {
  constructor(game) {
    this.game = game;
    this.missionIndex = 0; // 0,1,2 = the three jobs; 3 = story complete
    this.stage = 'steal';
    this.target = null; // {x, z} the beacon points at, or null
    this.timer = null; // seconds left on timed stages, or null
    this.started = false;
  }

  // Begin (or restart) the story at a given mission, e.g. from a save.
  reset(missionIndex) {
    this.missionIndex = missionIndex;
    this.started = true;
    this.timer = null;
    this.game.combat.clearGunmen();
    this.game.removeEscapeCar();
    if (missionIndex >= 3) {
      this.stage = 'free';
      this.target = null;
      return;
    }
    if (missionIndex === 0) this.beginSteal(false);
    else if (missionIndex === 1) this.beginM2(false);
    else this.beginM3(false);
  }

  objectiveText() {
    const s = this.stage;
    if (s === 'steal') return 'Steal the marked convertible on Sunset Boulevard';
    if (s === 'deliver') return "Deliver the convertible to Rosa's Garage";
    if (s === 'toGarage') return "Meet Mama Rosa at her garage";
    if (s === 'pickup') return 'Pick up the package at Marina Pier 2';
    if (s === 'escape') return 'Lose the police!';
    if (s === 'hideout') return 'Reach the Harbour Hideout';
    if (s === 'toMarina') return 'Meet the crew at the Marina';
    if (s === 'wave1' || s === 'wave2') return 'Harbor Heat: clear the marina';
    if (s === 'escapeCar') return 'Take the marked escape car';
    if (s === 'drop') return 'Reach the South Promenade';
    return 'Free roam — Costa Palma is yours';
  }

  banner(speaker, text, seconds = 5) {
    this.game.hud.showBanner(speaker, text, seconds);
  }

  // --- Mission 1: First Wheels ---------------------------------------------
  beginSteal(announce = true) {
    this.stage = 'steal';
    this.timer = null;
    this.game.hud.setTimer(null);
    this.game.resetMissionCar();
    this.target = { x: this.game.missionCar.x, z: this.game.missionCar.z };
    if (announce) {
      this.banner(ROSA, 'Leo! A collector left a convertible on Sunset Boulevard. Bring it to my garage — and try not to scratch it.', 7);
    }
  }

  beginDeliver() {
    this.stage = 'deliver';
    this.timer = 150;
    this.target = { x: PLACES.rosaGarage.x + 10, z: PLACES.rosaGarage.z };
    this.banner(ROSA, "That's the one! My garage, west side — the clock is running, wheelman.", 6);
  }

  finishM1() {
    this.missionIndex = 1;
    this.game.addCash(MISSION_PAY[0]);
    this.game.hasPistol = true;
    this.game.sfx.jingle();
    this.game.sfx.cash();
    this.banner(ROSA, 'Clean work. Take this pistol — the next job bites back. Come see me at the garage.', 7);
    this.game.persist();
    this.beginM2(false);
  }

  // --- Mission 2: Hot Package ------------------------------------------------
  beginM2(announce = true) {
    this.stage = 'toGarage';
    this.timer = null;
    this.target = { x: PLACES.rosaGarage.x + 10, z: PLACES.rosaGarage.z };
    if (announce) this.banner(ROSA, 'Back already? Good. I have a package with your name on it.', 5);
  }

  beginPickup() {
    this.stage = 'pickup';
    this.target = { x: PLACES.marinaPickup.x, z: PLACES.marinaPickup.z };
    this.banner(ROSA, 'A crate waits at Marina Pier 2. Collect it — and whatever happens, do not let the police sit on you.', 7);
  }

  beginEscape() {
    this.stage = 'escape';
    this.target = null;
    this.game.setHeat(300); // the pickup was watched: three stars, now
    this.banner(ROSA, 'They were waiting! Lose them, Leo — break their sight and stay hidden!', 6);
  }

  beginHideout() {
    this.stage = 'hideout';
    this.target = { x: PLACES.hideout.x, z: PLACES.hideout.z };
    this.banner(ROSA, 'Good, the trail is cold. The Harbour Hideout, north edge — lie low there.', 6);
  }

  finishM2() {
    this.missionIndex = 2;
    this.game.addCash(MISSION_PAY[1]);
    this.game.sfx.jingle();
    this.game.sfx.cash();
    this.banner(ROSA, 'The package is safe and so are you. One last job, at the marina. Bring the pistol.', 7);
    this.game.persist();
    this.beginM3(false);
  }

  // --- Mission 3: Harbor Heat --------------------------------------------------
  beginM3(announce = true) {
    this.stage = 'toMarina';
    this.timer = null;
    this.target = { x: PLACES.marinaStage.x, z: PLACES.marinaStage.z };
    if (announce) this.banner(ROSA, 'The Verano crew thinks the marina is theirs. Prove them wrong.', 5);
  }

  beginWave(n) {
    this.stage = n === 1 ? 'wave1' : 'wave2';
    this.target = null;
    const spots = n === 1
      ? [[214, 96], [220, 122], [206, 128], [232, 104]]
      : [[216, 94], [226, 108], [208, 118], [238, 124], [200, 100]];
    for (const [x, z] of spots) this.game.combat.spawnGunman(x, z);
    this.banner('Verano Crew', n === 1 ? 'This pier is ours, wheelman!' : 'More of them — hold the marina!', 4);
  }

  beginEscapeCar() {
    this.stage = 'escapeCar';
    const car = this.game.spawnEscapeCar();
    this.target = { x: car.x, z: car.z };
    this.banner(ROSA, 'The pier is yours! Wheels are waiting on the apron — get to the South Promenade.', 6);
  }

  beginDrop() {
    this.stage = 'drop';
    this.target = { x: PLACES.escapeDrop.x, z: PLACES.escapeDrop.z };
  }

  finishM3() {
    this.missionIndex = 3;
    this.stage = 'free';
    this.target = null;
    this.game.addCash(MISSION_PAY[2]);
    this.game.sfx.jingle();
    this.game.sfx.cash();
    this.banner(ROSA, 'It is done — the marina flies our colours. Costa Palma is yours now, Leo.', 8);
    this.game.persist();
  }

  // Busted or wasted: the current job starts over, the story does not.
  onFail() {
    this.timer = null;
    this.game.combat.clearGunmen();
    this.game.removeEscapeCar();
    if (this.missionIndex === 0) this.beginSteal(false);
    else if (this.missionIndex === 1) this.beginM2(false);
    else if (this.missionIndex === 2) this.beginM3(false);
  }

  update(dt) {
    if (!this.started || this.stage === 'free') return;
    const game = this.game;
    const player = game.player;
    const p = player.pos;
    const near = (t, r) => t && Math.hypot(p.x - t.x, p.z - t.z) < r;

    if (this.stage === 'steal') {
      this.target = { x: game.missionCar.x, z: game.missionCar.z };
      if (player.inCar === game.missionCar) this.beginDeliver();
    } else if (this.stage === 'deliver') {
      this.timer -= dt;
      game.hud.setTimer(this.timer);
      if (this.timer <= 0) {
        game.sfx.fail();
        this.banner(ROSA, 'Too slow — the buyer walked. Get back in the convertible and try again.', 5);
        this.beginSteal(false);
        if (player.inCar === game.missionCar) this.beginDeliver();
      } else if (player.inCar === game.missionCar && near(this.target, 10)) {
        game.hud.setTimer(null);
        player.inCar = null;
        game.missionCar.driver = null;
        this.finishM1();
      }
    } else if (this.stage === 'toGarage') {
      if (!player.inCar && near(this.target, 6)) this.beginPickup();
    } else if (this.stage === 'pickup') {
      if (!player.inCar && near(this.target, 4.5)) {
        game.sfx.pop();
        this.beginEscape();
      }
    } else if (this.stage === 'escape') {
      if (game.stars === 0) this.beginHideout();
    } else if (this.stage === 'hideout') {
      if (near(this.target, 9)) this.finishM2();
    } else if (this.stage === 'toMarina') {
      if (near(this.target, 11)) this.beginWave(1);
    } else if (this.stage === 'wave1') {
      if (game.combat.aliveGunmen() === 0) this.beginWave(2);
    } else if (this.stage === 'wave2') {
      if (game.combat.aliveGunmen() === 0) this.beginEscapeCar();
    } else if (this.stage === 'escapeCar') {
      const car = game.escapeCar;
      if (car) {
        this.target = { x: car.x, z: car.z };
        if (player.inCar === car) this.beginDrop();
      }
    } else if (this.stage === 'drop') {
      if (player.inCar === game.escapeCar && near(this.target, 10)) {
        player.inCar = null;
        game.escapeCar.driver = null;
        this.finishM3();
      }
    }
  }
}
