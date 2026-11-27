// NUSA SKY RUN — the bush plane: primitives-built, nose facing +Z,
// rotation order YXZ applied by the caller. Plus strobe, water tank
// and the water-drop particle effect for FIRE ATTACK.

import * as THREE from 'three';
import { PALETTE } from './config.js';

export function buildPlane() {
  const group = new THREE.Group();

  const teal = new THREE.MeshLambertMaterial({ color: PALETTE.planeTeal });
  const white = new THREE.MeshLambertMaterial({ color: PALETTE.planeWhite });
  const orange = new THREE.MeshLambertMaterial({ color: PALETTE.planeOrange });
  const dark = new THREE.MeshLambertMaterial({ color: '#1c2733' });
  const glass = new THREE.MeshPhongMaterial({
    color: '#20303e',
    shininess: 120,
    specular: '#bfe8ff',
  });
  const metal = new THREE.MeshLambertMaterial({ color: '#8b939c' });

  // Fuselage: tapered cylinder along Z, nose toward +Z.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.72, 7.4, 14), teal);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0, -0.6);
  fuselage.castShadow = true;
  group.add(fuselage);

  // Orange nose cone.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.7, 14), orange);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, 3.85);
  nose.castShadow = true;
  group.add(nose);

  // Tail cone tapering back.
  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.16, 2.6, 12), teal);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.set(0, 0.1, -5.5);
  tailCone.castShadow = true;
  group.add(tailCone);

  // Canopy: dark-glass half-sphere on top of the fuselage.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.72, 1.7);
  canopy.position.set(0, 0.55, 0.9);
  group.add(canopy);

  // Main wing: wide white slab with orange tips, slight dihedral via tilt.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 1.9), white);
  wing.position.set(0, 0.28, 0.4);
  wing.castShadow = true;
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 1.9), orange);
    tip.position.set(side * 5.35, 0.28, 0.4);
    tip.castShadow = true;
    group.add(tip);
    // Wing strut down to the fuselage belly.
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 8), metal);
    strut.position.set(side * 2.6, -0.55, 0.4);
    strut.rotation.z = side * 0.5;
    group.add(strut);
  }

  // Tailplane + orange fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.1), white);
  tailplane.position.set(0, 0.25, -6.4);
  tailplane.castShadow = true;
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.9, 1.5), orange);
  fin.position.set(0, 1.05, -6.4);
  fin.castShadow = true;
  group.add(fin);

  // Propeller group at the nose (z ≈ 5.15).
  const propeller = new THREE.Group();
  propeller.position.set(0, 0, 5.15);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 12), orange);
  spinner.rotation.x = Math.PI / 2;
  propeller.add(spinner);
  const bladeMat = new THREE.MeshLambertMaterial({ color: '#22262b' });
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.4, 0.1), bladeMat);
    blade.rotation.z = a;
    blade.position.z = -0.15;
    propeller.add(blade);
  }
  // Translucent prop disc.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 32),
    new THREE.MeshBasicMaterial({
      color: '#cfd8de',
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  disc.position.z = -0.2;
  propeller.add(disc);
  group.add(propeller);

  // Fixed gear: two mains + tail wheel.
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#14181c' });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 8), metal);
    leg.position.set(side * 0.95, -1.35, 0.9);
    leg.rotation.z = side * 0.35;
    group.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.2, -2.0, 0.9);
    wheel.castShadow = true;
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), wheelMat);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.85, -6.2);
  group.add(tailWheel);

  // Nav lights: red left (port), green right (starboard), white strobe at tail.
  const navL = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#ff2d2d' }),
  );
  navL.position.set(-5.7, 0.28, 0.4);
  group.add(navL);
  const navR = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#2dff5a' }),
  );
  navR.position.set(5.7, 0.28, 0.4);
  group.add(navR);
  const strobeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), strobeMat);
  strobe.position.set(0, 0.35, -6.9);
  strobe.userData.material = strobeMat;
  group.add(strobe);

  // Belly water tank (FIRE ATTACK): small translucent tank under the fuselage.
  const tankMat = new THREE.MeshPhongMaterial({
    color: '#2f9fd8',
    transparent: true,
    opacity: 0.75,
    shininess: 60,
  });
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.6, 6, 12), tankMat);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, -1.05, -0.4);
  tank.castShadow = true;
  tank.userData.material = tankMat;
  group.add(tank);

  return { group, propeller, strobe, tank };
}

export function updateStrobe(strobe, elapsed) {
  // Bright flash for the first 0.08 s of each second, dim otherwise.
  const phase = elapsed % 1;
  const mat = strobe.userData.material || strobe.material;
  if (phase < 0.08) {
    mat.color.set('#ffffff');
    strobe.scale.setScalar(1.8);
  } else {
    mat.color.set('#5a6068');
    strobe.scale.setScalar(1);
  }
}

export function setTankLevel(tank, level01) {
  const level = Math.max(0, Math.min(1, level01));
  const mat = tank.userData.material || tank.material;
  // Full = bright water blue, empty = dark grey.
  const full = new THREE.Color('#2f9fd8');
  const empty = new THREE.Color('#3a4046');
  mat.color.copy(empty).lerp(full, level);
  mat.opacity = 0.25 + 0.5 * level;
  tank.visible = true;
}

export function createDropEffect(scene) {
  const COUNT = 40;
  const pool = [];
  const geo = new THREE.SphereGeometry(0.55, 6, 5);
  const mat = new THREE.MeshBasicMaterial({
    color: '#9fd8ff',
    transparent: true,
    opacity: 0.85,
  });
  for (let i = 0; i < COUNT; i++) {
    const drop = new THREE.Mesh(geo, mat.clone());
    drop.visible = false;
    scene.add(drop);
    pool.push({ mesh: drop, vx: 0, vy: 0, vz: 0, life: 0 });
  }
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  return {
    drop(x, y, z) {
      for (const p of pool) {
        p.mesh.position.set(x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 1.5, z + (rnd() - 0.5) * 3);
        p.vx = (rnd() - 0.5) * 4;
        p.vy = -6 - rnd() * 8;
        p.vz = (rnd() - 0.5) * 4;
        p.life = 1.2;
        p.mesh.visible = true;
        p.mesh.material.opacity = 0.85;
        p.mesh.scale.setScalar(0.7 + rnd() * 0.7);
      }
    },
    update(dt) {
      for (const p of pool) {
        if (!p.mesh.visible) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
          continue;
        }
        p.vy -= 22 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.material.opacity = 0.85 * (p.life / 1.2);
      }
    },
  };
}
