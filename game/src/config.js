// Costa Palma — shared tuning constants: city geometry, prices, pacing.
// Everything else imports from here so the whole city can be re-tuned in one
// place. No logic lives in this file.

// Road grid: vertical avenues run along z at these x positions, horizontal
// streets run along x at these z positions. Blocks sit between neighbours.
export const AXES_X = [-180, -120, -60, 0, 60, 120];
export const AXES_Z = [-180, -120, -60, 0, 60, 120];
export const ROAD_HALF = 8; // half the asphalt width; sidewalks start here
export const SIDEWALK = 3; // pavement ring around each block
export const CITY_MIN = -216;
export const CITY_MAX = 150; // last avenue's east edge; sand starts after
export const BEACH_START = 150;
export const BEACH_END = 204; // waterline
export const WORLD_Z = 216; // ground half-depth, north and south

// Named places the story uses. x east, z south, ground level is y = 0.
export const PLACES = {
  rosaGarage: { x: -189, z: -120, label: "Rosa's Garage" },
  hideout: { x: 120, z: -198, label: 'Harbour Hideout' },
  marinaPickup: { x: 236, z: 110, label: 'Marina Pier 2' },
  marinaStage: { x: 196, z: 110, label: 'Marina' },
  hospital: { x: -189, z: 120, label: 'Costa Palma General' },
  convertiblePark: { x: 56, z: -46, label: 'Sunset Boulevard' },
  escapeDrop: { x: 120, z: 196, label: 'South Promenade' },
};

// Player and economy.
export const START_CASH = 200;
export const WALK_SPEED = 7;
export const SPRINT_SPEED = 11.5;
export const PLAYER_HEALTH = 100;
export const HOSPITAL_FINE_BASE = 50;

// Wanted system: heat 0..500, one star per 100 heat.
export const HEAT_PER_STAR = 100;
export const MAX_STARS = 5;
export const HEAT_DECAY = 15; // per second while nobody sees the player
export const HIDDEN_AFTER = 6; // seconds unseen before heat starts to fall
export const HEAT_EVENTS = {
  stealCar: 60,
  punchPed: 50,
  hitPed: 130,
  gunshot: 40,
  hitCar: 25,
  hitBuilding: 10,
};

// Mission rewards in dollars, by mission index.
export const MISSION_PAY = [300, 500, 800];

// Camera.
export const CAM_DIST_FOOT = 7.5;
export const CAM_DIST_CAR = 11;
export const CAM_HEIGHT = 2.6;
