// The aircraft: a bush plane built from primitives — fuselage, canopy, wings with
// dihedral, tail, spinning propeller, fixed gear and blinking nav lights. The mesh
// faces +Z (nose at +Z); the flight model yaws/pitches/rolls the group with
// rotation order YXZ. buildPlane returns { group, propeller, strobe, setBank }.

import * as THREE from 'three';
import { PALETTE } from './config.js';

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function metal(color) {
  return new THREE.MeshPhongMaterial({ color, shininess: 60, specular: new THREE.Color('#8899aa') });
}

export function buildPlane() {
  const group = new THREE.Group();
  const teal = lambert(PALETTE.planeTeal);
  const white = lambert(PALETTE.planeWhite);
  const orange = lambert(PALETTE.planeOrange);
  const dark = lambert('#22282e');
  const glass = new THREE.MeshPhongMaterial({
    color: '#1c3a4d', shininess: 140, specular: new THREE.Color('#cfe8ff'),
  });

  // Fuselage: a tapered cylinder along Z, nose at +Z.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 6.4, 12), teal);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.2;
  fuselage.castShadow = true;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.6, 12), orange);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 4.2;
  nose.castShadow = true;
  group.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.2, 12), teal);
  tailCone.rotation.x = -Math.PI / 2;
  tailCone.position.z = -4.1;
  group.add(tailCone);

  // Canopy: a flattened half-sphere of dark glass over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), glass);
  canopy.scale.set(0.9, 0.72, 1.7);
  canopy.position.set(0, 0.85, 1.1);
  group.add(canopy);

  // Main wing: one wide thin box, slight dihedral, white with orange tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 1.9), white);
  wing.position.set(0, 0.1, 0.6);
  wing.rotation.z = 0;
  wing.castShadow = true;
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 1.9), orange);
    tip.position.set(side * 5.55, 0.1 + 0.18, 0.6);
    group.add(tip);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), dark);
    strut.position.set(side * 2.6, -0.75, 0.6);
    strut.rotation.z = side * 0.5;
    group.add(strut);
  }

  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 1.2), white);
  tailplane.position.set(0, 0.25, -4.6);
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 1.6), orange);
  fin.position.set(0, 1.0, -4.7);
  group.add(fin);

  // Propeller: spinner + two blades, spins around Z at the nose.
  const propeller = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 10), white);
  spinner.rotation.x = Math.PI / 2;
  spinner.position.z = 0.2;
  propeller.add(spinner);
  const bladeMat = new THREE.MeshLambertMaterial({ color: '#1a1d20' });
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.08), bladeMat);
    blade.rotation.z = angle;
    propeller.add(blade);
  }
  // Translucent prop disc: reads as a spinning blur from any distance.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.85, 24),
    new THREE.MeshBasicMaterial({ color: '#cccccc', transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  );
  propeller.add(disc);
  propeller.position.z = 5.15;
  group.add(propeller);

  // Fixed landing gear: two mains + a tail wheel.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 6), dark);
    leg.position.set(side * 0.95, -1.35, 1.2);
    leg.rotation.z = side * 0.28;
    group.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.15, -2.05, 1.2);
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -1.15, -4.4);
  group.add(tailWheel);

  // Nav lights: red left, green right, white strobe on the tail.
  const navLeft = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#ff2d2d' }),
  );
  navLeft.position.set(-5.7, 0.15, 0.6);
  group.add(navLeft);
  const navRight = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#2dff5e' }),
  );
  navRight.position.set(5.7, 0.15, 0.6);
  group.add(navRight);
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  );
  strobe.position.set(0, 0.4, -5.3);
  group.add(strobe);

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  return { group, propeller, strobe };
}

/** Point the strobe: on for a short blink once a second. */
export function updateStrobe(strobe, elapsed) {
  const phase = elapsed % 1;
  strobe.material.color.set(phase < 0.08 ? '#ffffff' : '#555555');
}
