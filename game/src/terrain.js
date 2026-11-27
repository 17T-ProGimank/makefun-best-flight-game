// NUSA SKY RUN — terrain, sky, sea, town, lighthouse, runway, strips, fire.
// All world geometry is built fresh here from config + seeded noise.

import * as THREE from 'three';
import {
  ISLANDS,
  LIGHTHOUSE,
  PALETTE,
  RUNWAY,
  TOWN,
  WORLD,
  STRIPS,
  FIRE_ZONE,
} from './config.js';
import { createRandom, fbm, clamp, lerp, smoothstep } from './random.js';

const SEED = WORLD.seed;

function islandHeight(x, z, isl) {
  const dx = x - isl.x;
  const dz = z - isl.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= isl.radius) return -9;
  const fall = 1 - d / isl.radius;
  const cone = isl.height * Math.pow(fall, 1.5);
  const ridge = (fbm(x * 0.008 + 31, z * 0.008 + 17, SEED) - 0.5) * isl.height * 0.45 * fall;
  return Math.max(-9, cone + ridge);
}

export function terrainHeight(x, z) {
  // Sea floor, then the tallest island cone at this point.
  let h = -9;
  for (const isl of ISLANDS) {
    const ih = islandHeight(x, z, isl);
    if (ih > h) h = ih;
  }

  // Town apron: flatten the town bowl to TOWN.flattenTo.
  const tdx = x - TOWN.centreX;
  const tdz = z - TOWN.centreZ;
  const td = Math.sqrt(tdx * tdx + tdz * tdz);
  const townMask = 1 - smoothstep(TOWN.radius * 0.75, TOWN.radius * 1.1, td);
  if (townMask > 0) h = lerp(h, TOWN.flattenTo, townMask);

  // Runway coastal plain: flatten a broad apron around the runway.
  const rdx = x - RUNWAY.centreX;
  const rdz = z - RUNWAY.centreZ;
  const rd = Math.sqrt(rdx * rdx + rdz * rdz);
  const runwayMask = 1 - smoothstep(300, 520, rd);
  if (runwayMask > 0) h = lerp(h, RUNWAY.elevation, runwayMask);

  // Island strip aprons: level ground around each dirt strip.
  for (const strip of STRIPS) {
    const sdx = Math.abs(x - strip.x);
    const sdz = Math.abs(z - strip.z);
    const u = Math.max(sdx / (strip.length * 0.9), sdz / (strip.width * 3));
    const mask = 1 - smoothstep(0.55, 1.0, u);
    if (mask > 0) h = lerp(h, strip.elevation, mask);
  }

  return h;
}

function makeCanvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture(top, horizon) {
  return makeCanvasTexture(16, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(0.62, horizon);
    g.addColorStop(1, horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function runwayTexture() {
  return makeCanvasTexture(1024, 96, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.runway;
    ctx.fillRect(0, 0, w, h);
    // Edge lines.
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 3, w, 3);
    ctx.fillRect(0, h - 6, w, 3);
    // Centreline dashes.
    for (let x = 60; x < w - 60; x += 64) {
      ctx.fillRect(x, h / 2 - 3, 34, 6);
    }
    // Threshold bars at both ends.
    for (const bx of [18, 34, 50, 66]) {
      ctx.fillRect(bx, 14, 10, h - 28);
      ctx.fillRect(w - bx - 10, 14, 10, h - 28);
    }
    // Runway numbers, reading from each approach end.
    ctx.fillStyle = '#f2f5f7';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(120, h / 2);
    ctx.fillText('09', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(w - 120, h / 2);
    ctx.rotate(Math.PI);
    ctx.fillText('27', 0, 0);
    ctx.restore();
  });
}

function stripTexture() {
  return makeCanvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#8a6b46';
    ctx.fillRect(0, 0, w, h);
    // Dirt variation streaks.
    const rnd = createRandom(SEED + 55);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,240,200,0.08)';
      ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 14, 1 + rnd() * 3);
    }
    // Centreline dashes.
    ctx.fillStyle = '#f0e6c8';
    for (let x = 30; x < w - 30; x += 44) {
      ctx.fillRect(x, h / 2 - 2, 22, 4);
    }
    // Threshold bars.
    for (const bx of [10, 22]) {
      ctx.fillRect(bx, 10, 7, h - 20);
      ctx.fillRect(w - bx - 7, 10, 7, h - 20);
    }
  });
}

function buildTerrainMesh() {
  const SEG = 170;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSand = new THREE.Color(PALETTE.sand);
  const cGrass = new THREE.Color(PALETTE.grass);
  const cDry = new THREE.Color(PALETTE.grassDry);
  const cRock = new THREE.Color(PALETTE.rock);
  const cTown = new THREE.Color(PALETTE.town);
  const tmp = new THREE.Color();
  const half = WORLD.size / 2;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);

    // Slope from finite differences.
    const sx = terrainHeight(x + 6, z) - terrainHeight(x - 6, z);
    const sz = terrainHeight(x, z + 6) - terrainHeight(x, z - 6);
    const slope = Math.sqrt(sx * sx + sz * sz) / 12;

    if (h < 2.5) {
      tmp.copy(cSand);
    } else if (h < 55) {
      tmp.copy(cGrass).lerp(cDry, clamp((h - 18) / 45, 0, 1) * 0.7);
      const n = fbm(x * 0.02, z * 0.02, SEED + 3);
      tmp.offsetHSL(0, 0, (n - 0.5) * 0.06);
    } else {
      tmp.copy(cDry).lerp(cRock, clamp((h - 55) / 50, 0, 1));
    }
    if (slope > 0.55) tmp.lerp(cRock, clamp((slope - 0.55) / 0.5, 0, 0.85));
    // Town ground: grey-ish where the town sits.
    const tdx = x - TOWN.centreX;
    const tdz = z - TOWN.centreZ;
    if (tdx * tdx + tdz * tdz < TOWN.radius * TOWN.radius && h < 16) {
      tmp.lerp(cTown, 0.45);
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.position.set(0, 0, 0);
  return mesh;
}

export function buildRing(def, index) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: PALETTE.ringIdle,
    transparent: true,
    opacity: 0.95,
  });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(def.radius, 1.6, 12, 48), material);
  group.add(torus);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(def.radius * 0.55, 0.7, 8, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.ringIdle, transparent: true, opacity: 0.5 }),
  );
  group.add(inner);
  // Faint light column down to the sea / ground.
  const columnMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.ringIdle,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const columnHeight = Math.max(def.y, 10);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(def.radius * 0.9, def.radius * 0.9, columnHeight, 24, 1, true),
    columnMaterial,
  );
  column.position.y = -columnHeight / 2;
  group.add(column);
  group.position.set(def.x, def.y, def.z);
  group.userData = { material, columnMaterial, index };
  return group;
}

function buildGateMesh(def, index) {
  // Mail gates reuse the ring shape with a distinct amber hoop.
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: PALETTE.ringNext,
    transparent: true,
    opacity: 0.95,
  });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(def.radius, 1.4, 12, 48), material);
  group.add(torus);
  const columnMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.ringNext,
    transparent: true,
    opacity: 0.06,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const columnHeight = Math.max(def.y, 10);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(def.radius * 0.9, def.radius * 0.9, columnHeight, 24, 1, true),
    columnMaterial,
  );
  column.position.y = -columnHeight / 2;
  group.add(column);
  group.position.set(def.x, def.y, def.z);
  group.userData = { material, columnMaterial, index, name: def.name };
  return group;
}

function buildTown() {
  const group = new THREE.Group();
  const rnd = createRandom(SEED + 11);
  const wallMat = new THREE.MeshLambertMaterial({ color: '#e8ddc4' });
  const wallMat2 = new THREE.MeshLambertMaterial({ color: '#d8c8a8' });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#b4552d' });
  const roofMat2 = new THREE.MeshLambertMaterial({ color: '#7a6a55' });
  const step = 46;
  for (let gx = -8; gx <= 8; gx++) {
    for (let gz = -8; gz <= 8; gz++) {
      const x = TOWN.centreX + gx * step + (rnd() - 0.5) * 22;
      const z = TOWN.centreZ + gz * step + (rnd() - 0.5) * 22;
      const dx = x - TOWN.centreX;
      const dz = z - TOWN.centreZ;
      if (dx * dx + dz * dz > TOWN.radius * TOWN.radius) continue;
      // Skip the runway approach corridor.
      if (Math.abs(z - RUNWAY.centreZ) < 90) continue;
      if (rnd() < 0.28) continue;
      const w = 12 + rnd() * 14;
      const d = 10 + rnd() * 12;
      const hgt = 6 + rnd() * 9;
      const gy = terrainHeight(x, z);
      const house = new THREE.Group();
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(w, hgt, d),
        rnd() > 0.5 ? wallMat : wallMat2,
      );
      walls.position.y = hgt / 2;
      walls.castShadow = true;
      house.add(walls);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.72, 4 + rnd() * 3, 4),
        rnd() > 0.5 ? roofMat : roofMat2,
      );
      roof.rotation.y = Math.PI / 4;
      roof.position.y = hgt + 2.5;
      roof.castShadow = true;
      house.add(roof);
      house.position.set(x, gy - 0.5, z);
      house.rotation.y = (rnd() - 0.5) * 0.6;
      group.add(house);
    }
  }
  return group;
}

function buildLighthouse() {
  const baseY = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
  const group = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: '#f4f2ec' });
  const red = new THREE.MeshLambertMaterial({ color: '#c0392b' });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.6, 26, 16), white);
  tower.position.y = 13;
  tower.castShadow = true;
  group.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.9, 4, 16), red);
  band.position.y = 17;
  group.add(band);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 1, 16), red);
  gallery.position.y = 26.5;
  group.add(gallery);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff3b0' });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), lampMat);
  lamp.position.y = 29;
  group.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 2.6, 12), red);
  cap.position.y = 32;
  group.add(cap);

  // Rotating beam: cone pivoting around the lamp, pointing sideways.
  const beamPivot = new THREE.Group();
  beamPivot.name = 'lighthouseBeam';
  beamPivot.position.y = 29;
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#fff8c8',
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(7, 90, 16, 1, true), beamMat);
  beam.rotation.z = -Math.PI / 2;
  beam.position.x = 45;
  beamPivot.add(beam);
  const beam2 = beam.clone();
  beam2.rotation.z = Math.PI / 2;
  beam2.position.x = -45;
  beamPivot.add(beam2);
  group.add(beamPivot);

  group.position.set(LIGHTHOUSE.x, baseY, LIGHTHOUSE.z);
  group.userData = { lamp, beam: beamPivot, baseY, lampMat, beamMat };
  return group;
}

function buildRunway() {
  const group = new THREE.Group();
  const tex = runwayTexture();
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.length, RUNWAY.width),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.15;
  strip.receiveShadow = true;
  group.add(strip);

  // PAPI: 4 lamps beside the west (09) threshold.
  const papi = new THREE.Group();
  const papiLamps = [];
  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.2, 1.6),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    );
    lamp.position.set(-RUNWAY.length / 2 + 34, 0.8, -RUNWAY.width / 2 - 8 - i * 3.4);
    papi.add(lamp);
    papiLamps.push(lamp);
  }
  group.add(papi);

  // Edge lights: rows of small emissive lamps along both long edges.
  const edgeGroup = new THREE.Group();
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#3a3f45' });
  const edgeGeo = new THREE.SphereGeometry(0.7, 8, 6);
  for (let x = -RUNWAY.length / 2 + 10; x <= RUNWAY.length / 2 - 10; x += 34) {
    for (const z of [-RUNWAY.width / 2 - 2.5, RUNWAY.width / 2 + 2.5]) {
      const lamp = new THREE.Mesh(edgeGeo, edgeMat);
      lamp.position.set(x, 0.9, z);
      edgeGroup.add(lamp);
    }
  }
  group.add(edgeGroup);
  const edgeLights = {
    group: edgeGroup,
    setLit(on) {
      edgeMat.color.set(on ? '#ffd27a' : '#3a3f45');
    },
  };

  group.position.set(RUNWAY.centreX, RUNWAY.elevation, RUNWAY.centreZ);
  group.userData = { papi, papiLamps, edgeLights };
  return group;
}

function buildStrips() {
  const out = [];
  for (const def of STRIPS) {
    const group = new THREE.Group();
    const tex = stripTexture();
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(def.length, def.width),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.25;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Flare lights along both edges.
    const flareMat = new THREE.MeshBasicMaterial({ color: '#4a4038' });
    const flareGeo = new THREE.SphereGeometry(0.8, 8, 6);
    for (let x = -def.length / 2 + 8; x <= def.length / 2 - 8; x += 26) {
      for (const z of [-def.width / 2 - 2, def.width / 2 + 2]) {
        const flare = new THREE.Mesh(flareGeo, flareMat);
        flare.position.set(x, 1.0, z);
        group.add(flare);
      }
    }
    const setFlare = (on) => {
      flareMat.color.set(on ? '#ffb347' : '#4a4038');
    };
    group.position.set(def.x, def.elevation, def.z);
    group.userData = { def };
    out.push({ def, group, setFlare });
  }
  return out;
}

function buildFire() {
  const baseY = terrainHeight(FIRE_ZONE.x, FIRE_ZONE.z);
  const group = new THREE.Group();
  group.position.set(FIRE_ZONE.x, baseY, FIRE_ZONE.z);

  // Orange ground glow disc.
  const glowMat = new THREE.MeshBasicMaterial({
    color: PALETTE.fireGlow,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(FIRE_ZONE.radius * 0.55, 32), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 1.2;
  group.add(glow);

  // Point light, flickering in update().
  const light = new THREE.PointLight(PALETTE.fireOrange, 1.4, 500, 0);
  light.position.y = 26;
  group.add(light);

  // 3 smoke columns, each 5-7 stacked translucent spheres that rise and loop.
  const columns = [];
  const rnd = createRandom(SEED + 77);
  const smokeMat = new THREE.MeshBasicMaterial({
    color: PALETTE.smokeGrey,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  for (let c = 0; c < 3; c++) {
    const col = new THREE.Group();
    const offX = (rnd() - 0.5) * FIRE_ZONE.radius * 0.9;
    const offZ = (rnd() - 0.5) * FIRE_ZONE.radius * 0.9;
    col.position.set(offX, 0, offZ);
    const puffs = [];
    const count = 5 + Math.floor(rnd() * 3);
    for (let p = 0; p < count; p++) {
      const r = 7 + rnd() * 9;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), smokeMat.clone());
      const phase = p / count;
      puff.position.set((rnd() - 0.5) * 6, 6 + phase * 95, (rnd() - 0.5) * 6);
      puff.userData = { phase, speed: 0.05 + rnd() * 0.03, baseR: r };
      col.add(puff);
      puffs.push(puff);
    }
    group.add(col);
    columns.push({ group: col, puffs });
  }

  let remaining = 3;
  const setRemaining = (n) => {
    remaining = clamp(Math.round(n), 0, 3);
    columns.forEach((col, i) => {
      col.group.visible = i < remaining;
    });
    const k = remaining / 3;
    glowMat.opacity = 0.5 * k;
    glow.visible = remaining > 0;
    light.visible = remaining > 0;
    light.intensity = 1.4 * k;
    group.visible = remaining > 0;
  };

  const fire = {
    group,
    setRemaining,
    userData: { zone: FIRE_ZONE, columns, glow, glowMat, light },
  };
  group.userData = fire.userData;
  return fire;
}

function buildClouds(scene) {
  const rnd = createRandom(SEED + 23);
  const mat = new THREE.MeshLambertMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.88,
  });
  const clouds = [];
  for (let i = 0; i < 42; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rnd() * 4);
    for (let p = 0; p < puffs; p++) {
      const r = 14 + rnd() * 22;
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
      s.position.set((rnd() - 0.5) * 55, (rnd() - 0.5) * 8, (rnd() - 0.5) * 30);
      s.scale.y = 0.42;
      cloud.add(s);
    }
    cloud.position.set(
      (rnd() - 0.5) * WORLD.size * 1.9,
      250 + rnd() * 170,
      (rnd() - 0.5) * WORLD.size * 1.9,
    );
    cloud.userData.drift = 2.5 + rnd() * 4;
    scene.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

export function buildWorld(rings, gates, options = {}) {
  const { dusk = false } = options;
  const scene = new THREE.Scene();

  const daySky = skyTexture(PALETTE.skyTop, PALETTE.skyHorizon);
  const duskSky = skyTexture(PALETTE.duskSkyTop, PALETTE.duskSkyHorizon);
  scene.background = daySky;
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.skyHorizon), 900, 5200);

  // Low warm sun with shadows.
  const sun = new THREE.DirectionalLight('#ffe0b3', 2.4);
  sun.position.set(-1800, 1400, -900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -700;
  sun.shadow.camera.right = 700;
  sun.shadow.camera.top = 700;
  sun.shadow.camera.bottom = -700;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 6000;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight('#bcd8ea', '#3d5a3a', 0.75);
  scene.add(hemi);

  // Sun sprite: soft glowing disc low on the horizon.
  const sunSpriteTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,240,200,1)');
    g.addColorStop(0.35, 'rgba(255,210,140,0.75)');
    g.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const sunSpriteMat = new THREE.SpriteMaterial({
    map: sunSpriteTex,
    transparent: true,
    depthWrite: false,
  });
  const sunSprite = new THREE.Sprite(sunSpriteMat);
  sunSprite.scale.set(700, 700, 1);
  sunSprite.position.set(-2600, 420, -1400);
  scene.add(sunSprite);

  // Terrain, sea, town, lighthouse, runway, strips, fire.
  scene.add(buildTerrainMesh());

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size * 1.6, WORLD.size * 1.6),
    new THREE.MeshPhongMaterial({
      color: PALETTE.sea,
      transparent: true,
      opacity: 0.88,
      shininess: 90,
      specular: '#9fd4e8',
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  sea.receiveShadow = true;
  scene.add(sea);

  scene.add(buildTown());
  const lighthouse = buildLighthouse();
  scene.add(lighthouse);
  const runway = buildRunway();
  scene.add(runway);
  const strips = buildStrips();
  for (const s of strips) scene.add(s.group);
  const fire = buildFire();
  scene.add(fire.group);

  const clouds = buildClouds(scene);

  const ringMeshes = (rings || []).map((def, i) => {
    const m = buildRing(def, i);
    scene.add(m);
    return m;
  });
  const gateMeshes = (gates || []).map((def, i) => {
    const m = buildGateMesh(def, i);
    scene.add(m);
    return m;
  });

  let duskOn = false;

  function setDusk(on) {
    if (on === duskOn) return;
    duskOn = on;
    if (on) {
      scene.background = duskSky;
      scene.fog.color.set(PALETTE.duskSkyHorizon);
      sun.color.set('#ffb070');
      sun.intensity = 1.2;
      sun.position.set(-2200, 500, -1100);
      sunSprite.position.set(-2600, 180, -1400);
      sunSpriteMat.opacity = 0.9;
      hemi.intensity = 0.35;
      runway.userData.edgeLights.setLit(true);
      for (const s of strips) s.setFlare(true);
      lighthouse.userData.lampMat.color.set('#fff6c0');
      lighthouse.userData.beamMat.opacity = 0.45;
    } else {
      scene.background = daySky;
      scene.fog.color.set(PALETTE.skyHorizon);
      sun.color.set('#ffe0b3');
      sun.intensity = 2.4;
      sun.position.set(-1800, 1400, -900);
      sunSprite.position.set(-2600, 420, -1400);
      sunSpriteMat.opacity = 1;
      hemi.intensity = 0.75;
      runway.userData.edgeLights.setLit(false);
      for (const s of strips) s.setFlare(false);
      lighthouse.userData.lampMat.color.set('#fff3b0');
      lighthouse.userData.beamMat.opacity = 0.28;
    }
  }

  function update(dt, elapsed, planePos) {
    const half = WORLD.size;
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > half) cloud.position.x = -half;
    }
    // Lighthouse beam sweeps; lamp pulses gently.
    lighthouse.userData.beam.rotation.y = elapsed * 0.5;
    const pulse = 0.85 + 0.15 * Math.sin(elapsed * 2.2);
    lighthouse.userData.lamp.scale.setScalar(pulse);
    // Smoke puffs rise and loop back to the base of their column.
    for (const col of fire.userData.columns) {
      if (!col.group.visible) continue;
      for (const puff of col.puffs) {
        const u = puff.userData;
        let y = puff.position.y + u.speed * 60 * dt;
        if (y > 105) y = 5;
        puff.position.y = y;
        const k = clamp(y / 105, 0, 1);
        puff.scale.setScalar(1 + k * 0.9);
        puff.material.opacity = 0.34 * (1 - k * 0.75);
      }
    }
    // Fire light flickers.
    const fl = fire.userData.light;
    if (fl.visible) {
      const k = fire.userData.columns.filter((c) => c.group.visible).length / 3;
      fl.intensity = 1.4 * k * (0.85 + 0.15 * Math.sin(elapsed * 9.3) * Math.sin(elapsed * 5.1));
    }
    // Sun shadow camera follows the plane.
    if (planePos) {
      const px = planePos.x ?? 0;
      const py = planePos.y ?? 0;
      const pz = planePos.z ?? 0;
      const sunH = duskOn ? 500 : 1400;
      const sunX = duskOn ? -2200 : -1800;
      sun.position.set(px + sunX, py + sunH, pz - 900);
      sun.target.position.set(px, py, pz);
      sun.target.updateMatrixWorld();
      if (!duskOn) {
        sunSprite.position.set(px - 2600, 420, pz - 1400);
      } else {
        sunSprite.position.set(px - 2600, 180, pz - 1400);
      }
    }
  }

  if (dusk) setDusk(true);

  return {
    scene,
    clouds,
    lighthouse,
    runway,
    ringMeshes,
    gateMeshes,
    strips,
    fire,
    update,
    setDusk,
  };
}
