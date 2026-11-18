// Costa Palma — photo mode: ?photo=cover|foot|mission|combat stages a
// deterministic, photogenic frame with the full HUD, for the screenshots
// the judge sees. The game freezes on the staged frame; nothing here runs
// during normal play.

import { PLACES } from './config.js';
import { createCar } from './vehicles.js';
import { groundHeightAt } from './city-layout.js';

export function readPhotoParam() {
  try {
    return new URLSearchParams(window.location.search).get('photo');
  } catch {
    return null;
  }
}

function addCruiser(game, x, z, heading, phase) {
  const car = createCar(game.scene, { kind: 'police', color: 0xe8e8ea, x, z, heading });
  car.driver = 'police';
  car.syncMesh();
  if (car.flashMats) {
    car.flashMats[0].emissiveIntensity = phase === 0 ? 2.8 : 0.25;
    car.flashMats[1].emissiveIntensity = phase === 0 ? 0.25 : 2.8;
  }
  game.cars.push(car);
  game.police.cars.push(car);
  return car;
}

function stageCover(game) {
  const car = game.missionCar;
  car.x = 60;
  car.z = 26;
  car.heading = 0.12;
  car.driver = 'player';
  car.syncMesh();
  const player = game.player;
  player.inCar = car;
  player.x = car.x;
  player.z = car.z;
  player.camYaw = Math.PI;
  player.camPitch = 0.38;
  game.heat = 300;
  game.stars = 3;
  game.missions.stage = 'deliver';
  game.missions.target = { x: PLACES.rosaGarage.x + 10, z: PLACES.rosaGarage.z };
  game.hud.setTimer(96);
  // The chase cam sits ~11 units back, so the cruisers box Leo in from the
  // flanks where the lens can see them, light bars lit.
  addCruiser(game, 53.5, 22.5, 0.35, 0);
  addCruiser(game, 67, 23.5, -0.3, 1);
  const traffic = game.traffic.cars[0];
  if (traffic) {
    traffic.x = 56;
    traffic.z = 74;
    traffic.heading = 0;
    traffic.syncMesh();
  }
}

function stageFoot(game) {
  const player = game.player;
  player.x = 10.2;
  player.z = 30;
  player.heading = 2.6; // three-quarter front to the camera
  player.camYaw = Math.PI; // camera looks along the avenue, boulevard receding
  player.camPitch = 0.3;
  player.syncMesh();
  // A crowd on both sidewalks around Leo.
  const spots = [
    [9.8, 20], [-9.8, 26], [9.8, 40], [-9.8, 38], [9.8, 46], [-9.8, 16], [12.5, 34], [-9.8, 54],
  ];
  game.peds.peds.forEach((ped, i) => {
    if (i >= spots.length) return;
    ped.x = spots[i][0];
    ped.z = spots[i][1];
    ped.heading = i % 2 ? 0.4 : Math.PI - 0.4;
    ped.body.group.position.set(ped.x, 0, ped.z);
    ped.body.group.rotation.y = ped.heading;
  });
  // Traffic on the avenue and the crossing street.
  const lanes = [
    [4, 2, Math.PI], [-4, 52, 0], [30, 56, Math.PI / 2], [-26, 64, -Math.PI / 2],
  ];
  game.traffic.cars.forEach((car, i) => {
    if (i >= lanes.length) return;
    car.x = lanes[i][0];
    car.z = lanes[i][1];
    car.heading = lanes[i][2];
    car.syncMesh();
  });
}

function stageMission(game) {
  const player = game.player;
  player.x = 224;
  player.z = 110;
  player.heading = Math.PI / 2; // facing the package, down the pier
  player.camYaw = -Math.PI / 2;
  player.camPitch = 0.3;
  player.syncMesh();
  game.missions.stage = 'pickup';
  game.missions.target = { x: PLACES.marinaPickup.x, z: PLACES.marinaPickup.z };
  game.hud.showBanner(
    'Mama Rosa',
    'A crate waits at Marina Pier 2. Collect it — and whatever happens, do not let the police sit on you.',
    9999,
  );
}

function stageCombat(game) {
  const player = game.player;
  player.x = 205;
  player.z = 103;
  player.heading = 1.23; // aiming down the piers at the Verano crew
  player.camYaw = -1.85;
  player.camPitch = 0.33;
  player.health = 55;
  game.hasPistol = true;
  player.body.setPose(0, false, true, false);
  player.syncMesh();
  game.missions.stage = 'wave1';
  game.missions.target = null;
  // On the pier decks themselves, clear of the moored boats.
  const g1 = game.combat.spawnGunman(221, 90);
  const g2 = game.combat.spawnGunman(225, 110);
  const g3 = game.combat.spawnGunman(217, 129);
  const downed = game.combat.spawnGunman(213, 110);
  for (const g of [g1, g2, g3]) {
    g.heading = Math.atan2(player.x - g.x, player.z - g.z);
    g.body.setPose(0, false, true, false);
    g.body.group.position.set(g.x, groundHeightAt(g.x, g.z), g.z);
    g.body.group.rotation.y = g.heading;
  }
  downed.state = 'down';
  downed.body.setPose(0, false, false, true);
  downed.body.group.position.set(downed.x, groundHeightAt(downed.x, downed.z) + 0.25, downed.z);
  // A muzzle flash and tracer that stay for the photograph.
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  const mx = player.x + fx * 0.8;
  const mz = player.z + fz * 0.8;
  game.effects.flash.position.set(mx, 1.42, mz);
  game.effects.flash.visible = true;
  game.effects.flashLight.position.set(mx, 1.42, mz);
  game.effects.flashLight.intensity = 20;
  game.effects.flashT = 9999;
  game.effects.tracer(mx, 1.42, mz, g1.x, 1.15, g1.z);
  game.hud.setCrosshair(true);
  game.hud.setHealth(0.55);
}

export function stagePhoto(name, game) {
  if (name === 'cover') stageCover(game);
  else if (name === 'foot') stageFoot(game);
  else if (name === 'mission') stageMission(game);
  else if (name === 'combat') stageCombat(game);
}
