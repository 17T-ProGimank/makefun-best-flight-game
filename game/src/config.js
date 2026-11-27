// NUSA SKY RUN — Island Air Post. Every tuning number, colour and world constant
// in one place. The world is a 4.2 km archipelago: one main island with a runway and
// a town, two bigger islands and a lighthouse islet, all in metres, y up, sea at 0.
// Headings are degrees clockwise from north (-Z); north is -Z, east is +X.

export const WORLD = {
  size: 4200,
  boundRadius: 2400,
  seaLevel: 0,
  seed: 7,
};

export const RUNWAY = {
  // East-west strip on the main island: heading 090/270, threshold at the west end.
  centreX: 0,
  centreZ: 320,
  elevation: 8,
  length: 620,
  width: 42,
  heading: 90,
};

export const TOWN = { centreX: -80, centreZ: -120, radius: 380, flattenTo: 10 };

export const ISLANDS = [
  { x: 0, z: 0, radius: 1150, height: 132, name: 'Nusa Besar' },
  { x: 1560, z: -720, radius: 540, height: 74, name: 'Nusa Timur' },
  { x: 720, z: 1560, radius: 660, height: 88, name: 'Nusa Selatan' },
  { x: -1680, z: 640, radius: 270, height: 38, name: 'Mercusuar Islet' },
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
    id: 'rings',
    name: 'RING RUN',
    tag: '8 rings around the islands — beat the clock',
    timeLimit: 150,
    ringBonusSeconds: 15,
    ringPoints: 1000,
  },
  mail: {
    id: 'mail',
    name: 'MAIL RUN',
    tag: 'Drop the mail at 3 island strips, then land home',
    gatePoints: 1500,
    landingPoints: 2000,
  },
  landing: {
    id: 'landing',
    name: 'LANDING CHALLENGE',
    tag: 'Take off, climb to 800 ft, come back and grease it',
    climbTargetFt: 800,
    landingPoints: 3000,
  },
  free: {
    id: 'free',
    name: 'FREE FLIGHT',
    tag: 'No clock, no score — just fly the islands',
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
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const BEST_KEY = 'nusa-sky-run.best';
