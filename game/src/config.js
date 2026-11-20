// Solmar Bay — all tuning numbers, palettes, mission definitions and districts.
// One place for every magic number so the rest of the game reads like a spec.
export const GAME_NAME = 'SOLMAR BAY';
export const GAME_TAGLINE = 'Rico Vale is back — and the city owes him.';
export const HERO_NAME = 'Rico Vale';
export const FIXER_NAME = 'Mara';
export const GANG_NAME = 'the Vipers';
export const POLICE_NAME = 'Solmar Bay PD';
export const SAVE_KEY = 'solmar-bay-save-v1';

export const WORLD = {
  half: 210,
  roadHalf: 7,
  block: 60,
  roads: [-150, -90, -30, 30, 90, 150],
  beachZ: 178,
  seaZ: 205,
};

export const PALETTE = {
  grass: 0x8a7d55,
  sand: 0xd9c08a,
  sea: 0x2e7f9e,
  road: 0x3b3b42,
  sidewalk: 0x9b9b90,
  sky: 0xffb36b,
  sun: 0xffe0a8,
  taxiYellow: 0xffc21c,
  policeWhite: 0xf2f2f2,
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 11,
  jumpSpeed: 8.5,
  gravity: 24,
  radius: 0.7,
  height: 1.8,
  maxHealth: 100,
  punchDamage: 12,
  punchRange: 2.4,
  regenPerSec: 2,
};

export const DRIVING = {
  accel: 26,
  brake: 42,
  reverseAccel: 14,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 1.9,
  grip: 6.5,
  drag: 0.55,
  enterRadius: 3.4,
  exitOffset: 2.4,
};

export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 26;
export const MAX_POLICE = 5;
export const SHOT_TRAFFIC_BOOST = 10;
export const SHOT_PED_BOOST = 14;

// Wanted: how many stars each crime adds, and how the heat cools off.
export const WANTED = {
  stealCar: 1,
  hitPed: 1,
  hitPolice: 2,
  shoot: 1,
  kill: 2,
  max: 5,
  decayDelay: 14,
  decayRate: 0.12,
  policeSpeedByLevel: [0, 22, 25, 28, 31, 34],
  spawnDelayByLevel: [0, 9, 7, 5, 4, 3],
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 60,
  pistolFireRate: 0.22,
  enemyHealth: 100,
  enemyDamage: 7,
  enemyRange: 34,
  enemyFireRate: 1.4,
  enemySpeed: 4.2,
  killXp: 25,
};

export const MISSIONS = [
  {
    id: 'package-run',
    name: 'PACKAGE RUN',
    story: 'Mara needs a package moved from the Marina to Downtown. No questions, no stops.',
    reward: 400,
    xp: 100,
    steps: [
      { type: 'goto', label: 'Pick up the package at the Marina', x: 150, z: 150, radius: 7 },
      { type: 'goto', label: 'Deliver the package in Downtown', x: -30, z: -90, radius: 7 },
    ],
  },
  {
    id: 'heat-escape',
    name: 'HEAT ESCAPE',
    story: 'The drop was watched. The whole Solmar Bay PD is on you — lose them, then vanish.',
    reward: 600,
    xp: 150,
    steps: [
      { type: 'escape', label: 'Lose the cops — get your wanted level to zero' },
      { type: 'goto', label: 'Reach the hideout under Coral Bridge', x: -150, z: 150, radius: 8 },
    ],
  },
  {
    id: 'harbor-showdown',
    name: 'HARBOR SHOWDOWN',
    story: 'The Vipers took the harbour cut. Take it back — all three of them.',
    reward: 1000,
    xp: 250,
    steps: [
      { type: 'goto', label: 'Reach the harbour crates', x: 150, z: -150, radius: 9 },
      { type: 'fight', label: 'Clear the harbour — defeat all 3 Vipers' },
      { type: 'goto', label: 'Grab the harbour cut', x: 150, z: -150, radius: 6 },
    ],
  },
];

export const DISTRICTS = [
  { name: 'MARINA', x0: 60, x1: 210, z0: 60, z1: 210, tint: 0x9fd4e8, minH: 10, maxH: 22 },
  { name: 'DOWNTOWN', x0: -90, x1: 90, z0: -150, z1: 30, tint: 0xf2e3c2, minH: 26, maxH: 62 },
  { name: 'HARBOR', x0: 60, x1: 210, z0: -210, z1: -60, tint: 0xa8b4c4, minH: 10, maxH: 20 },
  { name: 'CORAL HILLS', x0: -210, x1: -60, z0: 60, z1: 210, tint: 0xf2c9a0, minH: 10, maxH: 30 },
];

export const CONTROLS = [
  'WASD move · Shift run · Space jump',
  'E enter / exit car · F shoot · V punch',
  'Mouse look · P pause · R restart mission · M mute',
];

export function createDefaultSave() {
  return { money: 0, xp: 0, missionsDone: 0, bestMoney: 0, playTime: 0 };
}
