// NUSA SKY RUN — Island Air Post (round 2)
// World / plane / mission configuration. All distances in metres, y up,
// sea level 0, north = -Z, headings in degrees clockwise from north.

export const WORLD = {
  size: 4200,
  boundRadius: 2400,
  seaLevel: 0,
  seed: 7,
};

export const RUNWAY = {
  centreX: 0,
  centreZ: 320,
  elevation: 8,
  length: 620,
  width: 42,
  heading: 90,
};

export const TOWN = {
  centreX: -80,
  centreZ: -120,
  radius: 380,
  flattenTo: 10,
};

export const ISLANDS = [
  { name: 'Nusa Besar', x: 0, z: 0, radius: 1150, height: 132 },
  { name: 'Nusa Timur', x: 1560, z: -720, radius: 540, height: 74 },
  { name: 'Nusa Selatan', x: 720, z: 1560, radius: 660, height: 88 },
  { name: 'Mercusuar Islet', x: -1680, z: 640, radius: 270, height: 38 },
];

export const LIGHTHOUSE = { x: -640, z: -520 };

export const PLANE = {
  cruiseSpeed: 62,
  maxSpeed: 96,
  stallSpeed: 27,
  maxBankDeg: 62,
  maxPitchDeg: 34,
  climbRate: 9,
  thrust: 26,
  drag: 0.0032,
  fuelCapacity: 100,
  burnPerSecond: 0.12,
  burnPerThrottle: 0.35,
  gearHeight: 2.2,
};

export const RINGS = [
  { x: 420, y: 120, z: 320, radius: 26 },
  { x: 900, y: 150, z: -260, radius: 26 },
  { x: 1150, y: 180, z: -900, radius: 26 },
  { x: 1560, y: 110, z: -720, radius: 26 },
  { x: 900, y: 140, z: -1250, radius: 26 },
  { x: -200, y: 170, z: -950, radius: 26 },
  { x: -900, y: 120, z: -350, radius: 26 },
  { x: -420, y: 100, z: 320, radius: 26 },
];

export const MAIL_GATES = [
  { x: 1560, y: 70, z: -720, radius: 24, name: 'Nusa Timur strip' },
  { x: 720, y: 80, z: 1560, radius: 24, name: 'Nusa Selatan strip' },
  { x: -1680, y: 60, z: 640, radius: 24, name: 'Mercusuar Islet strip' },
];

export const MISSIONS = {
  rings: {
    name: 'RING RUN',
    tag: 'Thread all 8 rings against the clock',
    timeLimit: 150,
    ringBonusSeconds: 15,
    ringPoints: 1000,
  },
  mail: {
    name: 'MAIL RUN',
    tag: 'Deliver the mail to all three island strips, then land home',
    gatePoints: 1500,
    landingPoints: 2000,
  },
  landing: {
    name: 'LANDING CHALLENGE',
    tag: 'Climb to 800 ft and grease a landing on runway 09',
    climbTargetFt: 800,
    landingPoints: 3000,
  },
  free: {
    name: 'FREE FLIGHT',
    tag: 'The archipelago is yours — fly where you like',
  },
  fire: {
    name: 'FIRE ATTACK',
    tag: 'Scoop the sea, drop on the ridge fire — 3 drops to kill it',
    dropsNeeded: 3,
    dropPoints: 1200,
    scoopPoints: 150,
  },
  medevac: {
    name: 'MEDEVAC',
    tag: 'Land on Mercusuar Islet, lift the patient home — fly gentle',
    landingPoints: 2000,
    pickupPoints: 800,
  },
  nightmail: {
    name: 'NIGHT MAIL',
    tag: 'The mail run at dusk — follow the flare lights home',
    gatePoints: 1500,
    landingPoints: 2000,
    timeLimit: 240,
  },
  hopper: {
    name: 'ISLAND HOPPER',
    tag: 'Land Timur, Selatan, Mercusuar in order, then home',
    stopPoints: 1200,
    landingPoints: 2000,
  },
};

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyHorizon: '#cfe6f2',
  sea: '#1b6f9e',
  seaDeep: '#0f4d73',
  sand: '#e3cf9a',
  grass: '#5d9b4a',
  grassDry: '#8aa85a',
  rock: '#7a7568',
  town: '#9aa0a8',
  runway: '#33373d',
  planeTeal: '#0f8a8a',
  planeWhite: '#f2f5f7',
  planeOrange: '#ff7a1a',
  ringNext: '#ffc21a',
  ringDone: '#37d67a',
  ringIdle: '#2fb3e6',
  hudCyan: '#7fe7ff',
  hudAmber: '#ffc21a',
  hudGreen: '#37d67a',
  hudRed: '#ff4d4d',
  panelDark: '#10161c',
  duskSkyTop: '#1c2f55',
  duskSkyHorizon: '#e8905a',
  fireOrange: '#ff6a1a',
  fireGlow: '#ffb347',
  smokeGrey: '#5a5a5a',
};

export const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const BEST_KEY = 'nusa-sky-run.best';
export const LOGBOOK_KEY = 'nusa-sky-run.logbook';

export const FIRE_ZONE = {
  x: 720,
  z: 1560,
  radius: 180,
  name: 'Nusa Selatan ridge fire',
  dropsNeeded: 3,
};

export const STRIPS = [
  {
    id: 'timur',
    name: 'Nusa Timur strip',
    x: 1560,
    z: -720,
    heading: 90,
    length: 300,
    width: 26,
    elevation: 12,
  },
  {
    id: 'selatan',
    name: 'Nusa Selatan strip',
    x: 720,
    z: 1560,
    heading: 90,
    length: 300,
    width: 26,
    elevation: 14,
  },
  {
    id: 'mercusuar',
    name: 'Mercusuar Islet strip',
    x: -1680,
    z: 640,
    heading: 90,
    length: 260,
    width: 24,
    elevation: 10,
  },
];
