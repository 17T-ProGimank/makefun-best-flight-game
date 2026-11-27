// The archipelago: heightfield terrain with vertex colours, sea, sky, clouds, sun,
// the town, the lighthouse, the runway (with PAPI lights) and the glowing rings.
// One job: build the world the plane flies over. Height is a pure function of x,z
// (see terrainHeight) so the flight model and the renderer always agree.

import * as THREE from 'three';
import { ISLANDS, LIGHTHOUSE, PALETTE, RUNWAY, TOWN, WORLD } from './config.js';
import { clamp, createRandom, fbm, lerp, smoothstep } from './random.js';

const NOISE_SCALE = 0.0016;

/** Ground height in metres at (x, z). Sea floor sits below 0; islands rise above it. */
export function terrainHeight(x, z) {
  let h = -9;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d = Math.sqrt(dx * dx + dz * dz) / island.radius;
    if (d >= 1) continue;
    const fall = smoothstep(1, 0.15, d);
    const ridge = 0.72 + 0.55 * fbm(x * NOISE_SCALE, z * NOISE_SCALE, WORLD.seed);
    h = Math.max(h, -9 + island.height * fall * ridge);
  }
  // Flatten a broad coastal plain around the runway strip and the town apron so
  // the strip sits level and the takeoff/landing corridors are clear of cliffs.
  const rx = Math.abs(x - RUNWAY.centreX) / 1050;
  const rz = Math.abs(z - RUNWAY.centreZ) / 620;
  const runwayMask = smoothstep(1, 0.45, Math.max(rx, rz));
  h = lerp(h, RUNWAY.elevation, runwayMask);
  const tdx = x - TOWN.centreX;
  const tdz = z - TOWN.centreZ;
  const td = Math.sqrt(tdx * tdx + tdz * tdz) / TOWN.radius;
  const townMask = smoothstep(1, 0.3, td) * 0.85;
  h = lerp(h, TOWN.flattenTo, townMask);
  return h;
}

function colourForHeight(h, slope, x, z, random) {
  const c = new THREE.Color();
  if (h < 2.5) c.set(PALETTE.sand);
  else if (h < 55) c.set(PALETTE.grass).lerp(new THREE.Color(PALETTE.grassDry), fbm(x * 0.004, z * 0.004, 5));
  else if (h < 95) c.set(PALETTE.grassDry).lerp(new THREE.Color(PALETTE.rock), (h - 55) / 40);
  else c.set(PALETTE.rock);
  if (slope > 0.55) c.lerp(new THREE.Color(PALETTE.rock), 0.7);
  // Town apron: paved grey-green near the town centre.
  const tdx = x - TOWN.centreX;
  const tdz = z - TOWN.centreZ;
  if (Math.sqrt(tdx * tdx + tdz * tdz) < TOWN.radius * 0.7 && h > 2.5 && h < 20) {
    c.lerp(new THREE.Color(PALETTE.town), 0.45);
  }
  const shade = 0.92 + random() * 0.16;
  c.multiplyScalar(shade);
  return c;
}

function buildTerrainMesh(random) {
  const segments = 170;
  const size = WORLD.size;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const slope = Math.abs(terrainHeight(x + 12, z) - h) / 12 + Math.abs(terrainHeight(x, z + 12) - h) / 12;
    const c = colourForHeight(h, slope, x, z, random);
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildSea() {
  const geo = new THREE.PlaneGeometry(WORLD.size * 2.4, WORLD.size * 2.4);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({
    color: PALETTE.sea,
    transparent: true,
    opacity: 0.88,
    shininess: 120,
    specular: new THREE.Color('#bfe8ff'),
  });
  const sea = new THREE.Mesh(geo, mat);
  sea.position.y = WORLD.seaLevel;
  return sea;
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.55, '#7fb2d9');
  grad.addColorStop(0.78, PALETTE.skyHorizon);
  grad.addColorStop(1, '#f2e3c2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sunSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,246,214,1)');
  grad.addColorStop(0.25, 'rgba(255,224,150,0.85)');
  grad.addColorStop(1, 'rgba(255,224,150,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(260, 260, 1);
  sprite.position.set(-2600, 1500, -3400);
  return sprite;
}

function buildClouds(random) {
  const group = new THREE.Group();
  // Unlit white: clouds read as bright puffs from every side, never grey slabs.
  const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.88 });
  for (let i = 0; i < 42; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(random() * 4);
    for (let p = 0; p < puffs; p += 1) {
      const r = 18 + random() * 30;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      puff.position.set((random() - 0.5) * 90, (random() - 0.5) * 10, (random() - 0.5) * 40);
      puff.scale.y = 0.42;
      cloud.add(puff);
    }
    cloud.position.set(
      (random() - 0.5) * WORLD.size * 1.6,
      260 + random() * 220,
      (random() - 0.5) * WORLD.size * 1.6,
    );
    cloud.userData.drift = 1.5 + random() * 2.5;
    group.add(cloud);
  }
  return group;
}

function buildTown(random) {
  const group = new THREE.Group();
  const wallColours = ['#e8dcc8', '#dfe8ee', '#f0d9b5', '#cfd8dc', '#e6c9c9', '#d7e5c8'];
  const roofMat = new THREE.MeshLambertMaterial({ color: '#8a4a3a' });
  for (let gx = -5; gx <= 5; gx += 1) {
    for (let gz = -4; gz <= 3; gz += 1) {
      if (random() < 0.22) continue;
      const x = TOWN.centreX + gx * 62 + (random() - 0.5) * 18;
      const z = TOWN.centreZ + gz * 62 + (random() - 0.5) * 18;
      // Keep the runway approach clear.
      if (Math.abs(z - RUNWAY.centreZ) < 90) continue;
      const w = 16 + random() * 14;
      const d = 16 + random() * 14;
      const h = 8 + random() * random() * 26;
      const wall = new THREE.MeshLambertMaterial({
        color: wallColours[Math.floor(random() * wallColours.length)],
      });
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
      building.position.set(x, terrainHeight(x, z) + h / 2 - 0.5, z);
      building.castShadow = true;
      group.add(building);
      if (random() < 0.6) {
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 5 + random() * 4, 4), roofMat);
        roof.position.set(x, terrainHeight(x, z) + h + 2.5, z);
        roof.rotation.y = Math.PI / 4;
        group.add(roof);
      }
    }
  }
  return group;
}

function buildLighthouse() {
  const group = new THREE.Group();
  const x = LIGHTHOUSE.x;
  const z = LIGHTHOUSE.z;
  const base = terrainHeight(x, z);
  const towerMat = new THREE.MeshLambertMaterial({ color: '#f5f2ea' });
  const bandMat = new THREE.MeshLambertMaterial({ color: '#c23b2e' });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 34, 12), towerMat);
  tower.position.set(x, base + 17, z);
  tower.castShadow = true;
  group.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.2, 6, 12), bandMat);
  band.position.set(x, base + 24, z);
  group.add(band);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff6c8' });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 8), lampMat);
  lamp.position.set(x, base + 36, z);
  group.add(lamp);
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#fff2a0', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
  });
  const beamPivot = new THREE.Group();
  beamPivot.position.set(x, base + 36, z);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(16, 260, 12, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(130, 0, 0);
  beamPivot.add(beam);
  beamPivot.name = 'lighthouseBeam';
  group.add(beamPivot);
  group.userData.lamp = lamp;
  group.userData.beam = beamPivot;
  group.userData.baseY = base + 36;
  return group;
}

function runwayTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PALETTE.runway;
  ctx.fillRect(0, 0, 1024, 96);
  ctx.fillStyle = '#e8e8e8';
  for (let x = 70; x < 1024; x += 90) ctx.fillRect(x, 44, 48, 8);
  // Threshold bars at both ends.
  for (const end of [8, 1000]) {
    for (let i = 0; i < 4; i += 1) ctx.fillRect(end, 12 + i * 20, 14, 10);
  }
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('09', 60, 66);
  ctx.save();
  ctx.translate(964, 48);
  ctx.rotate(Math.PI);
  ctx.fillText('27', 0, 16);
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildRunway() {
  const group = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.length, RUNWAY.width),
    new THREE.MeshLambertMaterial({ map: runwayTexture() }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = 0;
  strip.position.set(RUNWAY.centreX, RUNWAY.elevation + 0.25, RUNWAY.centreZ);
  strip.receiveShadow = true;
  group.add(strip);
  // PAPI lights beside the west threshold: four lamps, red/white by glideslope.
  const papi = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2, 3),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    );
    lamp.position.set(RUNWAY.centreX - RUNWAY.length / 2 + 40, RUNWAY.elevation + 1.2, RUNWAY.centreZ + 34 + i * 7);
    papi.add(lamp);
  }
  papi.name = 'papi';
  group.add(papi);
  group.userData.papi = papi;
  return group;
}

/** A glowing torus ring with a faint light column so the pilot can find it. */
export function buildRing(def, index) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: PALETTE.ringIdle, transparent: true, opacity: 0.85 });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(def.radius, 1.8, 12, 48), mat);
  group.add(torus);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(def.radius, 0.5, 8, 48),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }),
  );
  group.add(inner);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 320, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: PALETTE.ringIdle, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  column.position.y = 160;
  group.add(column);
  group.position.set(def.x, def.y, def.z);
  group.userData.material = mat;
  group.userData.columnMaterial = column.material;
  group.userData.index = index;
  return group;
}

/** Build the whole static world. Returns { scene, clouds, lighthouse, runway, rings, update }. */
export function buildWorld(rings, gates) {
  const random = createRandom(WORLD.seed);
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xcfe5ef, 900, 5200);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(-1800, 1400, -900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -700;
  sun.shadow.camera.right = 700;
  sun.shadow.camera.top = 700;
  sun.shadow.camera.bottom = -700;
  sun.shadow.camera.far = 6000;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x4a6b3a, 1.1));
  scene.add(sunSprite());

  scene.add(buildTerrainMesh(random));
  scene.add(buildSea());
  const clouds = buildClouds(random);
  scene.add(clouds);
  scene.add(buildTown(random));
  const lighthouse = buildLighthouse();
  scene.add(lighthouse);
  const runway = buildRunway();
  scene.add(runway);

  const ringMeshes = rings.map((def, i) => {
    const mesh = buildRing(def, i);
    scene.add(mesh);
    return mesh;
  });
  const gateMeshes = gates.map((def, i) => {
    const mesh = buildRing(def, 100 + i);
    mesh.scale.setScalar(0.92);
    scene.add(mesh);
    return mesh;
  });

  function update(dt, elapsed, planePos) {
    for (const cloud of clouds.children) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > WORLD.size) cloud.position.x = -WORLD.size;
    }
    const beam = lighthouse.userData.beam;
    beam.rotation.y = elapsed * 0.5;
    lighthouse.userData.lamp.material.color.setHSL(0.13, 0.9, 0.6 + 0.25 * Math.sin(elapsed * 2.4));
    // Shadow camera follows the plane so shadows stay crisp where the pilot looks.
    sun.position.set(planePos.x - 1800, 1400, planePos.z - 900);
    sun.target.position.copy(planePos);
    sun.target.updateMatrixWorld();
  }

  return { scene, clouds, lighthouse, runway, ringMeshes, gateMeshes, update };
}
