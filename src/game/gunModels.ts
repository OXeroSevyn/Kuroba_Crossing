/**
 * Micro-voxel firearm models. Every gun model ("variant") is drawn around a shared set of mount
 * points, so any optic / muzzle / underbarrel / magazine / stock / laser fits any gun.
 * Local space: +z = barrel forward, y = up, the grip sits at the origin of the right hand.
 */
import * as THREE from 'three';
import { getVariant } from './armory';
import { getOption } from './customization';
import type { FirearmId, GunBuild, LoadoutConfig } from './types';
import { type SharedVoxelMaterials, VoxelAssembler } from './voxelBuilder';

export interface WeaponRig {
  root: THREE.Group;
  magazine: THREE.Group;
  boltOrPump: THREE.Group;
  muzzleOffsetZ: number;
  /** Barrel height of the muzzle (gun-local, before the 1.12 hand scale). */
  muzzleY: number;
  ejectOffset: THREE.Vector3;
  /** Height of the optic's sight line (gun-local) for scope-camera placement. */
  sightY: number;
}

interface Palette {
  primary: number;
  secondary: number;
  dark: number;
  wood: number;
  woodDark: number;
  lens: number;
  tracer: number;
}

/** Mount points a gun body exposes for its attachments. */
interface GunFrame {
  railY: number;
  railZ: number;
  railLen: number;
  frontSightZ: number;
  tipY: number;
  tipZ: number;
  underY: number;
  underZ: number;
  magY: number;
  magZ: number;
  magW: number;
  magStyle: 'stick' | 'curved' | 'box' | 'shotgun' | 'none';
  stockY: number;
  stockZ: number;
  stockWood: boolean;
  laserY: number;
  laserZ: number;
  eject: THREE.Vector3;
  charm: [number, number, number];
  bolt?: (asm: VoxelAssembler, p: Palette) => void;
  pump?: (asm: VoxelAssembler, p: Palette) => void;
}

const BRASS = 0xd9a844;
const SHELL_RED = 0xc92c24;

// ---------------------------------------------------------------------------
// Gun bodies
// ---------------------------------------------------------------------------
function bodyM4K(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.12, 0.24, 0.08, 0.1, 0.18, p.secondary, 'metal');
  vb.boxBottom(0, -0.19, 0.48, 0.13, 0.18, 0.38, p.primary, 'metal');
  vb.boxBottom(0, -0.34, 0.34, 0.09, 0.18, 0.11, p.dark); // pistol grip
  vb.boxBottom(0, -0.27, 0.42, 0.04, 0.06, 0.1, p.dark); // trigger guard
  vb.boxBottom(0, -0.01, 0.56, 0.08, 0.04, 0.56, p.secondary, 'metal'); // top rail
  for (let r = 0; r < 7; r++) vb.boxBottom(0, 0.03, 0.32 + r * 0.075, 0.085, 0.012, 0.03, p.dark, 'metal');
  vb.boxBottom(0, -0.16, 0.84, 0.14, 0.14, 0.38, p.primary, 'metal'); // handguard
  vb.boxBottom(-0.075, -0.13, 0.84, 0.03, 0.07, 0.32, p.secondary);
  vb.boxBottom(0.075, -0.13, 0.84, 0.03, 0.07, 0.32, p.secondary);
  vb.boxBottom(0, -0.12, 1.12, 0.06, 0.06, 0.24, p.secondary, 'metal'); // barrel
  vb.boxBottom(0.072, -0.12, 0.5, 0.02, 0.05, 0.1, p.dark); // ejection port cover
  return {
    railY: 0.03, railZ: 0.48, railLen: 0.56, frontSightZ: 0.98,
    tipY: -0.11, tipZ: 1.24, underY: -0.16, underZ: 0.86,
    magY: -0.36, magZ: 0.56, magW: 0.08, magStyle: 'stick',
    stockY: -0.18, stockZ: 0.15, stockWood: false,
    laserY: -0.13, laserZ: 0.9,
    eject: new THREE.Vector3(-0.1, -0.06, 0.48), charm: [0.085, -0.12, 0.42],
    bolt: (a, q) => {
      a.boxBottom(-0.07, -0.1, 0.48, 0.04, 0.05, 0.14, BRASS, 'metal');
      a.boxBottom(0, -0.02, 0.31, 0.11, 0.04, 0.06, q.secondary, 'metal');
    },
  };
}

function bodyAK(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.2, 0.5, 0.13, 0.17, 0.44, p.primary, 'metal'); // stamped receiver
  vb.boxBottom(0, -0.03, 0.5, 0.11, 0.05, 0.42, p.secondary, 'metal'); // dust cover
  vb.boxBottom(0, -0.35, 0.34, 0.09, 0.18, 0.1, p.woodDark); // grip
  vb.boxBottom(0, -0.27, 0.43, 0.04, 0.06, 0.1, p.dark);
  vb.boxBottom(0, -0.19, 0.86, 0.15, 0.13, 0.3, p.wood); // wood handguard
  vb.boxBottom(0, -0.06, 0.86, 0.1, 0.07, 0.28, p.woodDark); // upper gas tube cover
  vb.boxBottom(0, -0.03, 1.08, 0.04, 0.04, 0.18, p.secondary, 'metal'); // gas tube
  vb.boxBottom(0, -0.13, 1.16, 0.055, 0.055, 0.34, p.secondary, 'metal'); // barrel
  vb.boxBottom(0, -0.07, 1.22, 0.03, 0.07, 0.03, p.dark, 'metal'); // front sight block
  vb.boxBottom(0.085, -0.15, 0.5, 0.025, 0.02, 0.16, p.secondary, 'metal'); // charging handle side
  vb.boxBottom(0, 0.02, 0.6, 0.08, 0.03, 0.3, p.dark, 'metal'); // side-mount optic rail
  return {
    railY: 0.05, railZ: 0.56, railLen: 0.3, frontSightZ: 1.22,
    tipY: -0.12, tipZ: 1.33, underY: -0.19, underZ: 0.86,
    magY: -0.36, magZ: 0.62, magW: 0.085, magStyle: 'curved',
    stockY: -0.2, stockZ: 0.26, stockWood: true,
    laserY: -0.15, laserZ: 0.88,
    eject: new THREE.Vector3(-0.1, -0.06, 0.5), charm: [0.09, -0.14, 0.4],
    bolt: (a) => a.boxBottom(0.09, -0.15, 0.62, 0.04, 0.04, 0.06, BRASS, 'metal'),
  };
}

function bodySMG(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.19, 0.46, 0.12, 0.17, 0.34, p.primary, 'metal');
  vb.boxBottom(0, -0.34, 0.36, 0.085, 0.16, 0.09, p.dark); // grip (mag well in front of it)
  vb.boxBottom(0, -0.02, 0.46, 0.075, 0.035, 0.34, p.secondary, 'metal');
  vb.boxBottom(0, -0.17, 0.7, 0.12, 0.12, 0.16, p.dark); // short handguard
  vb.boxBottom(0, -0.12, 0.82, 0.05, 0.05, 0.12, p.secondary, 'metal'); // stubby barrel
  vb.boxBottom(-0.07, -0.13, 0.46, 0.02, 0.04, 0.1, p.secondary, 'metal');
  return {
    railY: 0.015, railZ: 0.42, railLen: 0.34, frontSightZ: 0.72,
    tipY: -0.11, tipZ: 0.88, underY: -0.17, underZ: 0.7,
    magY: -0.34, magZ: 0.5, magW: 0.07, magStyle: 'stick',
    stockY: -0.17, stockZ: 0.29, stockWood: false,
    laserY: -0.13, laserZ: 0.72,
    eject: new THREE.Vector3(-0.09, -0.06, 0.46), charm: [0.08, -0.12, 0.4],
    bolt: (a, q) => a.boxBottom(0, -0.01, 0.34, 0.09, 0.035, 0.05, q.secondary, 'metal'),
  };
}

function bodyLMG(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.22, 0.5, 0.16, 0.22, 0.5, p.primary, 'metal'); // big receiver
  vb.boxBottom(0, 0.0, 0.48, 0.15, 0.05, 0.34, p.secondary, 'metal'); // feed tray cover
  vb.boxBottom(0, -0.37, 0.34, 0.09, 0.18, 0.1, p.dark);
  vb.boxBottom(0, -0.29, 0.43, 0.04, 0.06, 0.1, p.dark);
  vb.boxBottom(0, -0.17, 0.98, 0.13, 0.13, 0.48, p.dark, 'metal'); // perforated shroud
  for (let h = 0; h < 5; h++) vb.boxBottom(0.068, -0.13, 0.8 + h * 0.08, 0.01, 0.04, 0.04, 0x0f1114);
  vb.boxBottom(0, -0.13, 1.32, 0.065, 0.065, 0.22, p.secondary, 'metal'); // heavy barrel
  vb.boxBottom(0, 0.05, 0.88, 0.04, 0.07, 0.04, p.secondary, 'metal'); // carry handle
  vb.boxBottom(0, 0.12, 0.88, 0.04, 0.03, 0.26, p.secondary, 'metal');
  return {
    railY: 0.05, railZ: 0.4, railLen: 0.3, frontSightZ: 1.3,
    tipY: -0.12, tipZ: 1.43, underY: -0.17, underZ: 1.02,
    magY: -0.4, magZ: 0.62, magW: 0.12, magStyle: 'box',
    stockY: -0.21, stockZ: 0.25, stockWood: false,
    laserY: -0.14, laserZ: 1.0,
    eject: new THREE.Vector3(-0.12, -0.08, 0.52), charm: [0.1, -0.14, 0.42],
    bolt: (a) => {
      for (let b = 0; b < 4; b++) a.boxBottom(-0.1 - b * 0.02, -0.04 - b * 0.05, 0.56, 0.05, 0.04, 0.03, BRASS, 'metal');
    },
  };
}

function bodyM870(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.21, 0.3, 0.1, 0.15, 0.16, p.woodDark);
  vb.boxBottom(0, -0.18, 0.52, 0.16, 0.18, 0.34, p.primary, 'metal');
  for (let s = 0; s < 4; s++) {
    vb.boxBottom(0.095, -0.14, 0.4 + s * 0.075, 0.04, 0.09, 0.05, SHELL_RED);
    vb.boxBottom(0.095, -0.17, 0.4 + s * 0.075, 0.04, 0.03, 0.05, BRASS, 'metal');
  }
  vb.boxBottom(0, -0.09, 0.98, 0.1, 0.1, 0.64, p.secondary, 'metal'); // barrel
  vb.boxBottom(0, -0.04, 0.92, 0.11, 0.04, 0.44, p.primary, 'metal'); // vent rib
  vb.boxBottom(0, -0.18, 0.94, 0.09, 0.08, 0.54, p.dark, 'metal'); // mag tube
  vb.boxBottom(0, -0.01, 1.24, 0.04, 0.05, 0.04, p.tracer, 'emissive'); // bead sight
  return {
    railY: 0.0, railZ: 0.52, railLen: 0.3, frontSightZ: 1.24,
    tipY: -0.08, tipZ: 1.3, underY: -0.18, underZ: 1.06,
    magY: -0.25, magZ: 0.52, magW: 0.06, magStyle: 'shotgun',
    stockY: -0.22, stockZ: 0.22, stockWood: true,
    laserY: -0.08, laserZ: 1.05,
    eject: new THREE.Vector3(-0.1, -0.08, 0.52), charm: [0.1, -0.12, 0.38],
    pump: (a, q) => {
      a.boxBottom(0, -0.21, 0.86, 0.15, 0.13, 0.28, q.wood);
      for (let r = 0; r < 4; r++) a.boxBottom(0, -0.215, 0.76 + r * 0.065, 0.16, 0.12, 0.025, q.woodDark);
    },
  };
}

function bodySaiga(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.2, 0.5, 0.14, 0.18, 0.44, p.primary, 'metal');
  vb.boxBottom(0, -0.02, 0.5, 0.12, 0.05, 0.42, p.secondary, 'metal');
  vb.boxBottom(0, -0.36, 0.34, 0.09, 0.18, 0.1, p.dark);
  vb.boxBottom(0, -0.19, 0.88, 0.16, 0.14, 0.32, p.dark); // polymer handguard
  vb.boxBottom(0, -0.11, 1.18, 0.09, 0.09, 0.36, p.secondary, 'metal'); // fat barrel
  vb.boxBottom(0, 0.0, 1.12, 0.03, 0.04, 0.22, p.secondary, 'metal');
  return {
    railY: 0.03, railZ: 0.52, railLen: 0.34, frontSightZ: 1.3,
    tipY: -0.1, tipZ: 1.36, underY: -0.19, underZ: 0.9,
    magY: -0.38, magZ: 0.62, magW: 0.11, magStyle: 'box',
    stockY: -0.2, stockZ: 0.26, stockWood: false,
    laserY: -0.14, laserZ: 0.9,
    eject: new THREE.Vector3(-0.1, -0.06, 0.52), charm: [0.09, -0.14, 0.4],
    bolt: (a) => a.boxBottom(0.09, -0.12, 0.62, 0.04, 0.04, 0.06, SHELL_RED, 'metal'),
  };
}

function bodyCoach(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.2, 0.36, 0.13, 0.17, 0.22, p.primary, 'metal'); // break-action receiver
  vb.boxBottom(0, -0.33, 0.3, 0.09, 0.15, 0.1, p.wood); // wrist
  vb.boxBottom(0, -0.22, 0.72, 0.15, 0.1, 0.36, p.wood); // forend
  vb.boxBottom(-0.045, -0.12, 1.0, 0.075, 0.075, 0.86, p.secondary, 'metal'); // left barrel
  vb.boxBottom(0.045, -0.12, 1.0, 0.075, 0.075, 0.86, p.secondary, 'metal'); // right barrel
  vb.boxBottom(0, -0.05, 1.0, 0.03, 0.02, 0.84, p.primary, 'metal'); // rib
  vb.boxBottom(0, -0.03, 1.4, 0.03, 0.03, 0.03, BRASS, 'emissive');
  vb.boxBottom(-0.045, -0.115, 1.43, 0.035, 0.035, 0.01, 0x050505);
  vb.boxBottom(0.045, -0.115, 1.43, 0.035, 0.035, 0.01, 0x050505);
  return {
    railY: -0.03, railZ: 0.42, railLen: 0.22, frontSightZ: 1.4,
    tipY: -0.1, tipZ: 1.43, underY: -0.22, underZ: 0.8,
    magY: -0.25, magZ: 0.5, magW: 0.06, magStyle: 'none',
    stockY: -0.24, stockZ: 0.25, stockWood: true,
    laserY: -0.14, laserZ: 0.78,
    eject: new THREE.Vector3(-0.06, -0.06, 0.42), charm: [0.09, -0.14, 0.34],
    bolt: (a) => {
      a.boxBottom(-0.045, -0.12, 0.5, 0.06, 0.06, 0.04, SHELL_RED);
      a.boxBottom(0.045, -0.12, 0.5, 0.06, 0.06, 0.04, SHELL_RED);
    },
  };
}

function bodyK50(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.04, 0.12, 0.11, 0.08, 0.2, p.secondary); // cheek
  vb.boxBottom(0, -0.19, 0.48, 0.16, 0.2, 0.48, p.primary, 'metal');
  vb.boxBottom(0, -0.35, 0.32, 0.09, 0.18, 0.11, p.dark);
  vb.boxBottom(0, -0.01, 0.5, 0.09, 0.04, 0.4, p.secondary, 'metal');
  vb.boxBottom(0, -0.15, 1.0, 0.12, 0.12, 0.62, p.secondary, 'metal');
  vb.boxBottom(0, -0.12, 1.38, 0.08, 0.08, 0.22, p.primary, 'metal');
  vb.boxBottom(0, -0.11, 1.24, 0.14, 0.04, 0.34, p.tracer, 'emissive');
  return {
    railY: 0.01, railZ: 0.5, railLen: 0.4, frontSightZ: 1.44,
    tipY: -0.12, tipZ: 1.5, underY: -0.16, underZ: 1.04,
    magY: -0.37, magZ: 0.56, magW: 0.11, magStyle: 'stick',
    stockY: -0.22, stockZ: 0.24, stockWood: false,
    laserY: -0.15, laserZ: 1.02,
    eject: new THREE.Vector3(-0.12, -0.06, 0.46), charm: [0.1, -0.12, 0.4],
    bolt: (a, q) => {
      a.boxBottom(-0.1, -0.1, 0.42, 0.1, 0.05, 0.06, 0xcfd6dd, 'metal');
      a.boxBottom(-0.15, -0.13, 0.42, 0.06, 0.06, 0.06, q.dark);
    },
  };
}

function bodyDMR(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.18, 0.48, 0.13, 0.18, 0.42, p.primary, 'metal');
  vb.boxBottom(0, -0.34, 0.34, 0.09, 0.17, 0.1, p.dark);
  vb.boxBottom(0, -0.01, 0.62, 0.08, 0.04, 0.74, p.secondary, 'metal'); // long top rail
  vb.boxBottom(0, -0.16, 0.98, 0.13, 0.13, 0.52, p.dark, 'metal'); // free-float handguard
  for (let h = 0; h < 4; h++) vb.boxBottom(0.068, -0.12, 0.82 + h * 0.1, 0.01, 0.05, 0.05, p.secondary);
  vb.boxBottom(0, -0.12, 1.36, 0.055, 0.055, 0.3, p.secondary, 'metal');
  return {
    railY: 0.03, railZ: 0.56, railLen: 0.74, frontSightZ: 1.22,
    tipY: -0.11, tipZ: 1.51, underY: -0.16, underZ: 1.0,
    magY: -0.34, magZ: 0.58, magW: 0.09, magStyle: 'stick',
    stockY: -0.2, stockZ: 0.27, stockWood: false,
    laserY: -0.13, laserZ: 1.02,
    eject: new THREE.Vector3(-0.1, -0.06, 0.5), charm: [0.085, -0.12, 0.42],
    bolt: (a) => a.boxBottom(-0.07, -0.09, 0.5, 0.04, 0.05, 0.12, BRASS, 'metal'),
  };
}

function bodyRaijin(vb: VoxelAssembler, p: Palette): GunFrame {
  vb.boxBottom(0, -0.24, 0.5, 0.18, 0.24, 0.56, p.primary, 'metal'); // massive receiver
  vb.boxBottom(0, -0.0, 0.5, 0.12, 0.04, 0.5, p.secondary, 'metal');
  vb.boxBottom(0, -0.4, 0.32, 0.1, 0.18, 0.11, p.dark);
  vb.boxBottom(0, -0.18, 1.06, 0.15, 0.15, 0.6, p.dark, 'metal');
  vb.boxBottom(0, -0.14, 1.6, 0.085, 0.085, 0.5, p.secondary, 'metal'); // long fluted barrel
  vb.boxBottom(0, -0.1, 1.6, 0.05, 0.015, 0.46, p.primary, 'metal');
  vb.boxBottom(0.1, -0.14, 0.62, 0.03, 0.06, 0.12, p.tracer, 'emissive');
  return {
    railY: 0.04, railZ: 0.5, railLen: 0.5, frontSightZ: 1.8,
    tipY: -0.13, tipZ: 1.85, underY: -0.18, underZ: 1.12,
    magY: -0.42, magZ: 0.62, magW: 0.13, magStyle: 'box',
    stockY: -0.24, stockZ: 0.22, stockWood: false,
    laserY: -0.16, laserZ: 1.1,
    eject: new THREE.Vector3(-0.14, -0.06, 0.5), charm: [0.11, -0.14, 0.4],
    bolt: (a) => {
      a.boxBottom(-0.12, -0.08, 0.44, 0.12, 0.06, 0.07, 0xcfd6dd, 'metal');
      a.boxBottom(-0.19, -0.11, 0.44, 0.07, 0.07, 0.07, 0x1b1f24);
    },
  };
}

function bodyRPG(vb: VoxelAssembler): GunFrame {
  vb.boxBottom(0, 0, -0.4, 0.14, 0.14, 0.95, 0x3b4436, 'metal');
  vb.boxBottom(0, -0.01, -0.15, 0.17, 0.17, 0.42, 0x6e3d22); // wood heat shield
  vb.boxBottom(0, -0.16, 0.18, 0.08, 0.22, 0.1, 0x1e241c); // grip
  vb.boxBottom(0, -0.04, 0.58, 0.28, 0.28, 0.34, 0x2e3b2b); // warhead
  vb.boxBottom(0, 0, 0.9, 0.14, 0.14, 0.22, 0x1e241c, 'metal');
  vb.boxBottom(0, 0.14, 0.42, 0.02, 0.05, 0.02, 0x1e241c, 'metal'); // front iron
  return {
    railY: 0.14, railZ: 0.05, railLen: 0.2, frontSightZ: 0.42,
    tipY: 0.07, tipZ: 0.95, underY: -0.05, underZ: 0.2,
    magY: 0, magZ: 0, magW: 0, magStyle: 'none',
    stockY: 0, stockZ: -0.4, stockWood: false,
    laserY: 0.05, laserZ: 0.3,
    eject: new THREE.Vector3(0, 0, 0), charm: [0.09, 0.02, -0.1],
  };
}

const BODIES: Record<string, (vb: VoxelAssembler, p: Palette) => GunFrame> = {
  m4k: bodyM4K,
  ak74: bodyAK,
  smg: bodySMG,
  lmg: bodyLMG,
  m870: bodyM870,
  saiga: bodySaiga,
  coach: bodyCoach,
  k50: bodyK50,
  dmr: bodyDMR,
  raijin: bodyRaijin,
  rpg7: (vb) => bodyRPG(vb),
};

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------
/** Draws the optic; returns the height of its sight line. */
function addOptic(vb: VoxelAssembler, id: string, f: GunFrame, p: Palette): number {
  const y = f.railY;
  const z = f.railZ;
  const lens = p.lens;
  switch (id) {
    case 'iron':
      vb.boxBottom(0, y, z - 0.06, 0.1, 0.07, 0.05, p.secondary, 'metal');
      vb.boxBottom(-0.035, y + 0.06, z - 0.06, 0.025, 0.05, 0.04, p.secondary, 'metal');
      vb.boxBottom(0.035, y + 0.06, z - 0.06, 0.025, 0.05, 0.04, p.secondary, 'metal');
      vb.boxBottom(0, y - 0.02, f.frontSightZ, 0.05, 0.11, 0.04, p.secondary, 'metal');
      vb.boxBottom(0, y + 0.08, f.frontSightZ, 0.018, 0.03, 0.03, 0xfacc15, 'emissive');
      return y + 0.09;
    case 'red_dot':
      vb.boxBottom(0, y, z, 0.07, 0.05, 0.11, p.secondary, 'metal');
      vb.boxBottom(0, y + 0.05, z, 0.09, 0.09, 0.12, p.dark);
      vb.boxBottom(0, y + 0.07, z, 0.05, 0.05, 0.14, lens, 'emissive');
      return y + 0.095;
    case 'eotech_holo':
      vb.boxBottom(0, y, z, 0.12, 0.05, 0.2, p.dark);
      vb.boxBottom(-0.055, y + 0.05, z + 0.02, 0.02, 0.1, 0.16, p.dark);
      vb.boxBottom(0.055, y + 0.05, z + 0.02, 0.02, 0.1, 0.16, p.dark);
      vb.boxBottom(0, y + 0.14, z + 0.02, 0.13, 0.02, 0.16, p.dark);
      vb.boxBottom(0, y + 0.06, z + 0.07, 0.08, 0.07, 0.02, lens, 'emissive');
      return y + 0.095;
    case 'dual_cant':
      vb.boxBottom(0, y, z, 0.11, 0.11, 0.22, p.dark, 'metal');
      vb.boxBottom(0, y + 0.03, z + 0.12, 0.08, 0.07, 0.03, lens, 'emissive');
      vb.boxBottom(-0.1, y + 0.01, z + 0.06, 0.07, 0.07, 0.09, p.secondary, 'metal');
      vb.boxBottom(-0.1, y + 0.03, z + 0.11, 0.05, 0.05, 0.03, 0xff3b30, 'emissive');
      return y + 0.07;
    case 'acog_4x':
      vb.boxBottom(0, y, z, 0.08, 0.05, 0.18, p.secondary, 'metal');
      vb.boxBottom(0, y + 0.05, z + 0.02, 0.11, 0.11, 0.28, p.dark, 'metal');
      vb.boxBottom(0, y + 0.16, z + 0.04, 0.04, 0.03, 0.14, lens, 'emissive');
      vb.boxBottom(0, y + 0.07, z + 0.17, 0.08, 0.08, 0.03, lens, 'emissive');
      return y + 0.105;
    case 'thermal_nv':
      vb.boxBottom(0, y, z + 0.02, 0.15, 0.14, 0.26, p.dark, 'metal');
      vb.boxBottom(0, y + 0.02, z + 0.16, 0.11, 0.1, 0.04, lens, 'emissive');
      vb.boxBottom(0.08, y + 0.04, z + 0.02, 0.04, 0.06, 0.12, p.secondary, 'metal');
      vb.boxBottom(0, y + 0.03, z - 0.13, 0.08, 0.08, 0.04, 0x111827, 'metal');
      return y + 0.07;
    case 'cyber_rail':
      vb.boxBottom(0, y, z + 0.04, 0.14, 0.06, 0.32, p.dark, 'metal');
      vb.boxBottom(-0.06, y + 0.06, z + 0.04, 0.03, 0.1, 0.26, p.secondary, 'metal');
      vb.boxBottom(0.06, y + 0.06, z + 0.04, 0.03, 0.1, 0.26, p.secondary, 'metal');
      vb.boxBottom(0, y + 0.08, z + 0.04, 0.1, 0.08, 0.22, lens, 'emissive');
      return y + 0.12;
    case 'long_sniper':
      vb.boxBottom(0, y, z - 0.1, 0.07, 0.07, 0.05, p.secondary, 'metal');
      vb.boxBottom(0, y, z + 0.12, 0.07, 0.07, 0.05, p.secondary, 'metal');
      vb.boxBottom(0, y + 0.06, z + 0.02, 0.11, 0.11, 0.44, p.dark, 'metal');
      vb.boxBottom(0, y + 0.05, z + 0.24, 0.14, 0.14, 0.12, p.secondary, 'metal');
      vb.boxBottom(0, y + 0.07, z + 0.31, 0.1, 0.1, 0.03, lens, 'emissive');
      vb.boxBottom(0, y + 0.17, z + 0.02, 0.04, 0.04, 0.05, p.secondary, 'metal'); // elevation turret
      return y + 0.115;
    case 'variable_scope':
      vb.boxBottom(0, y, z - 0.12, 0.07, 0.08, 0.05, p.secondary, 'metal');
      vb.boxBottom(0, y, z + 0.16, 0.07, 0.08, 0.05, p.secondary, 'metal');
      vb.boxBottom(0, y + 0.07, z + 0.02, 0.1, 0.1, 0.5, p.dark, 'metal');
      vb.boxBottom(0, y + 0.05, z - 0.25, 0.13, 0.13, 0.1, p.dark, 'metal'); // eyepiece
      vb.boxBottom(0, y + 0.04, z + 0.33, 0.16, 0.16, 0.16, p.secondary, 'metal'); // objective bell
      vb.boxBottom(0, y + 0.07, z + 0.42, 0.11, 0.11, 0.02, lens, 'emissive');
      vb.boxBottom(0, y + 0.17, z + 0.02, 0.045, 0.06, 0.05, p.secondary, 'metal');
      vb.boxBottom(0.075, y + 0.1, z + 0.02, 0.05, 0.045, 0.05, p.secondary, 'metal');
      vb.boxBottom(0, y + 0.07, z - 0.13, 0.12, 0.04, 0.03, 0x22c55e, 'emissive'); // zoom ring
      return y + 0.12;
    case 'pgo7':
      // Side-mounted launcher scope on the left of the tube
      vb.boxBottom(-0.12, y - 0.06, z - 0.02, 0.05, 0.08, 0.14, 0x1e241c, 'metal');
      vb.boxBottom(-0.16, y - 0.02, z, 0.08, 0.09, 0.26, 0x222622, 'metal');
      vb.boxBottom(-0.16, y, z + 0.14, 0.06, 0.06, 0.02, lens, 'emissive');
      vb.boxBottom(-0.16, y - 0.01, z - 0.14, 0.09, 0.09, 0.04, 0x111111, 'metal'); // rubber eyecup
      return y + 0.03;
    default:
      return y + 0.08;
  }
}

/** Draws the muzzle device; returns the new tip z. */
function addMuzzle(vb: VoxelAssembler, id: string, tipY: number, tipZ: number, p: Palette): number {
  const steel = p.secondary;
  const dark = p.dark;
  switch (id) {
    case 'suppressor':
      vb.boxBottom(0, tipY - 0.02, tipZ + 0.16, 0.11, 0.11, 0.36, dark, 'metal');
      vb.boxBottom(0, tipY - 0.01, tipZ + 0.16, 0.12, 0.03, 0.28, steel, 'metal');
      return tipZ + 0.36;
    case 'heavy_comp':
      vb.boxBottom(0, tipY - 0.03, tipZ + 0.08, 0.15, 0.13, 0.2, steel, 'metal');
      vb.boxBottom(0, tipY + 0.05, tipZ + 0.08, 0.09, 0.04, 0.14, dark);
      return tipZ + 0.2;
    case 'breach_spike':
      vb.boxBottom(0, tipY - 0.03, tipZ + 0.08, 0.14, 0.14, 0.16, 0x9c2820, 'metal');
      vb.boxBottom(-0.06, tipY + 0.02, tipZ + 0.18, 0.04, 0.04, 0.1, 0xd9dce0, 'metal');
      vb.boxBottom(0.06, tipY + 0.02, tipZ + 0.18, 0.04, 0.04, 0.1, 0xd9dce0, 'metal');
      vb.boxBottom(0, tipY - 0.05, tipZ + 0.18, 0.05, 0.04, 0.1, 0xd9dce0, 'metal');
      return tipZ + 0.24;
    case 'flash_hider':
      vb.boxBottom(0, tipY - 0.01, tipZ + 0.08, 0.09, 0.09, 0.16, dark, 'metal');
      vb.boxBottom(-0.04, tipY, tipZ + 0.15, 0.025, 0.025, 0.1, steel, 'metal');
      vb.boxBottom(0.04, tipY, tipZ + 0.15, 0.025, 0.025, 0.1, steel, 'metal');
      return tipZ + 0.2;
    case 'twin_cannon':
      vb.boxBottom(0, tipY - 0.03, tipZ + 0.09, 0.2, 0.12, 0.18, 0xd9a844, 'metal');
      vb.boxBottom(-0.08, tipY - 0.01, tipZ + 0.1, 0.06, 0.08, 0.12, dark);
      vb.boxBottom(0.08, tipY - 0.01, tipZ + 0.1, 0.06, 0.08, 0.12, dark);
      return tipZ + 0.2;
    case 'cryo_shroud':
      vb.boxBottom(0, tipY - 0.03, tipZ + 0.12, 0.14, 0.14, 0.28, steel, 'metal');
      vb.boxBottom(0, tipY + 0.01, tipZ + 0.12, 0.16, 0.05, 0.22, 0x7cc4ff, 'emissive');
      return tipZ + 0.28;
    case 'long_choke':
      vb.boxBottom(0, tipY - 0.01, tipZ + 0.12, 0.1, 0.1, 0.28, steel, 'metal');
      return tipZ + 0.28;
    default:
      vb.boxBottom(0, tipY - 0.02, tipZ + 0.06, 0.1, 0.1, 0.12, dark, 'metal');
      return tipZ + 0.14;
  }
}

function addUnderbarrel(vb: VoxelAssembler, id: string, y: number, z: number, p: Palette): void {
  const steel = p.secondary;
  const dark = p.dark;
  switch (id) {
    case 'vertical_grip':
      vb.boxBottom(0, y - 0.2, z, 0.075, 0.21, 0.08, dark);
      break;
    case 'grenade_tube':
      vb.boxBottom(0, y - 0.14, z + 0.02, 0.12, 0.13, 0.34, 0x485244, 'metal');
      vb.boxBottom(0, y - 0.13, z + 0.2, 0.09, 0.09, 0.06, dark, 'metal');
      vb.boxBottom(0, y - 0.24, z - 0.1, 0.06, 0.1, 0.06, dark);
      break;
    case 'heavy_bipod':
      vb.boxBottom(-0.12, y - 0.26, z + 0.1, 0.04, 0.26, 0.05, steel, 'metal');
      vb.boxBottom(0.12, y - 0.26, z + 0.1, 0.04, 0.26, 0.05, steel, 'metal');
      vb.boxBottom(0, y - 0.05, z + 0.1, 0.22, 0.05, 0.07, dark, 'metal');
      break;
    case 'floodlight':
      vb.boxBottom(0, y - 0.11, z + 0.08, 0.11, 0.11, 0.22, steel, 'metal');
      vb.boxBottom(0, y - 0.1, z + 0.2, 0.09, 0.09, 0.04, 0xfff3c4, 'emissive');
      break;
    case 'bayonet_blade':
      vb.boxBottom(0, y - 0.08, z + 0.08, 0.06, 0.06, 0.14, dark);
      vb.boxBottom(0, y - 0.09, z + 0.34, 0.03, 0.08, 0.38, 0xdce4ec, 'metal');
      break;
    case 'stubby_grip':
      vb.boxBottom(0, y - 0.14, z, 0.09, 0.14, 0.1, 0x8f7a5b);
      break;
    default: // angled_grip
      vb.boxBottom(0, y - 0.09, z, 0.08, 0.1, 0.18, dark);
      vb.boxBottom(0, y - 0.12, z + 0.06, 0.07, 0.04, 0.08, dark);
  }
}

function addStock(vb: VoxelAssembler, id: string, f: GunFrame, p: Palette): void {
  const y = f.stockY;
  const z = f.stockZ;
  const body = f.stockWood ? p.wood : p.dark;
  const trim = f.stockWood ? p.woodDark : p.secondary;
  switch (id) {
    case 'skeleton_stock':
      vb.boxBottom(0, y + 0.08, z - 0.2, 0.04, 0.04, 0.4, p.secondary, 'metal');
      vb.boxBottom(0, y - 0.04, z - 0.2, 0.04, 0.04, 0.4, p.secondary, 'metal');
      vb.boxBottom(0, y - 0.06, z - 0.42, 0.08, 0.2, 0.05, 0x1b1f24);
      break;
    case 'folding_stock':
      vb.boxBottom(0.08, y + 0.02, z - 0.02, 0.03, 0.06, 0.36, p.secondary, 'metal'); // folded along side
      vb.boxBottom(0.09, y - 0.02, z + 0.32, 0.04, 0.12, 0.04, 0x1b1f24);
      vb.boxBottom(0, y + 0.0, z - 0.04, 0.06, 0.08, 0.08, p.secondary, 'metal'); // hinge
      break;
    case 'heavy_stock':
      vb.boxBottom(0, y - 0.04, z - 0.2, 0.11, 0.2, 0.42, body);
      vb.boxBottom(0, y - 0.06, z - 0.44, 0.12, 0.24, 0.06, 0x1b1f24); // rubber pad
      vb.boxBottom(0, y + 0.16, z - 0.18, 0.08, 0.04, 0.24, trim);
      break;
    case 'cheek_rest':
      vb.boxBottom(0, y - 0.02, z - 0.2, 0.09, 0.16, 0.4, body);
      vb.boxBottom(0, y + 0.14, z - 0.2, 0.1, 0.06, 0.26, 0x5c4630); // leather riser
      vb.boxBottom(0, y - 0.03, z - 0.42, 0.1, 0.18, 0.04, 0x1b1f24);
      break;
    default: // standard_stock
      vb.boxBottom(0, y - 0.02, z - 0.18, 0.09, 0.16, 0.36, body);
      vb.boxBottom(0, y + 0.1, z - 0.14, 0.08, 0.04, 0.22, trim);
      vb.boxBottom(0, y - 0.03, z - 0.38, 0.1, 0.18, 0.04, 0x1b1f24);
  }
}

/** Side-rail laser module; returns the beam mesh (or null for IR / none). */
function addLaser(vb: VoxelAssembler, id: string, f: GunFrame, p: Palette): THREE.Mesh | null {
  if (id === 'no_laser') return null;
  const color = id === 'green_laser' ? 0x3bff6a : id === 'ir_laser' ? 0x7c3aed : 0xff2f38;
  vb.boxBottom(-0.09, f.laserY, f.laserZ, 0.06, 0.06, 0.16, p.dark, 'metal');
  vb.boxBottom(-0.09, f.laserY + 0.015, f.laserZ + 0.085, 0.03, 0.03, 0.02, color, 'emissive');
  vb.boxBottom(-0.09, f.laserY + 0.06, f.laserZ - 0.02, 0.03, 0.02, 0.05, 0xd9a844, 'metal'); // switch
  if (id === 'ir_laser') return null;
  const geo = new THREE.BoxGeometry(0.012, 0.012, 7.5);
  geo.translate(0, 0, 3.75);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(geo, mat);
  beam.position.set(-0.09, f.laserY + 0.03, f.laserZ + 0.09);
  beam.userData.isLaserBeam = true;
  return beam;
}

function addCharm(vb: VoxelAssembler, charmId: string, cx: number, cy: number, cz: number): void {
  if (charmId === 'none') return;
  vb.boxBottom(cx, cy, cz, 0.025, 0.05, 0.025, 0xcfd6dd, 'metal');
  if (charmId === 'mini_torii') {
    vb.boxBottom(cx, cy - 0.12, cz - 0.03, 0.025, 0.11, 0.025, 0xd43b2c);
    vb.boxBottom(cx, cy - 0.12, cz + 0.03, 0.025, 0.11, 0.025, 0xd43b2c);
    vb.boxBottom(cx, cy - 0.04, cz, 0.035, 0.03, 0.11, 0xd43b2c);
  } else if (charmId === 'voxel_skull') {
    vb.boxBottom(cx, cy - 0.11, cz, 0.07, 0.09, 0.08, 0xe8e2d5);
    vb.boxBottom(cx + 0.035, cy - 0.08, cz - 0.015, 0.02, 0.025, 0.025, 0x1a1414);
    vb.boxBottom(cx + 0.035, cy - 0.08, cz + 0.015, 0.02, 0.025, 0.025, 0x1a1414);
  } else if (charmId === 'red_postbox') {
    vb.boxBottom(cx, cy - 0.12, cz, 0.06, 0.1, 0.06, 0xe03c28);
    vb.boxBottom(cx, cy - 0.03, cz, 0.07, 0.02, 0.07, 0xbf2c20);
  } else if (charmId === 'snow_crystal') {
    vb.boxBottom(cx, cy - 0.12, cz, 0.03, 0.11, 0.03, 0x8ce0ff, 'emissive');
    vb.boxBottom(cx, cy - 0.08, cz, 0.03, 0.03, 0.11, 0x8ce0ff, 'emissive');
  } else if (charmId === 'neon_shroom') {
    vb.boxBottom(cx, cy - 0.12, cz, 0.04, 0.06, 0.04, 0xe8e0d0);
    vb.boxBottom(cx, cy - 0.07, cz, 0.09, 0.05, 0.09, 0xa84cff, 'emissive');
  } else if (charmId === 'golden_star') {
    vb.boxBottom(cx, cy - 0.11, cz, 0.04, 0.09, 0.09, 0xffd447, 'emissive');
  } else if (charmId === 'mini_kei') {
    vb.boxBottom(cx, cy - 0.11, cz, 0.06, 0.07, 0.12, 0xf2f0ea);
    vb.boxBottom(cx, cy - 0.07, cz + 0.03, 0.055, 0.04, 0.05, 0x3b4856);
  }
}

function buildMagazine(magId: string, f: GunFrame, materials: SharedVoxelMaterials, p: Palette): THREE.Group {
  const g = new THREE.Group();
  if (f.magStyle === 'none') return g;
  const a = new VoxelAssembler();
  const { magY: y, magZ: z, magW: w } = f;
  if (f.magStyle === 'shotgun') {
    a.boxBottom(0, y, z, w, 0.08, 0.14, magId === 'cryo_cell' ? 0x45e8ff : SHELL_RED);
  } else if (magId === 'drum_mag') {
    a.boxBottom(0, y + 0.06, z, w, 0.14, 0.13, 0x262b32);
    a.boxBottom(-0.1, y - 0.1, z, 0.15, 0.2, 0.18, 0x353b44, 'metal');
    a.boxBottom(0.1, y - 0.1, z, 0.15, 0.2, 0.18, 0x353b44, 'metal');
  } else if (f.magStyle === 'box') {
    const ext = magId === 'extended_mag' ? 0.1 : 0;
    a.boxBottom(0, y - ext, z, w + 0.04, 0.2 + ext, 0.2, 0x2b3036, 'metal');
    a.boxBottom(0, y + 0.04 - ext, z, w + 0.05, 0.05, 0.21, magId === 'cryo_cell' ? 0x45e8ff : 0x434a52, magId === 'cryo_cell' ? 'emissive' : 'metal');
  } else if (f.magStyle === 'curved') {
    const c = magId === 'cryo_cell' ? 0x1e2b38 : 0x5a3a24;
    a.boxBottom(0, y + 0.06, z, w, 0.14, 0.13, c);
    a.boxBottom(0, y - 0.06, z + 0.05, w, 0.13, 0.13, c);
    a.boxBottom(0, y - 0.16, z + 0.11, w, 0.11, 0.13, c);
    if (magId === 'extended_mag') a.boxBottom(0, y - 0.26, z + 0.17, w, 0.11, 0.13, c);
    if (magId === 'cryo_cell') a.boxBottom(0, y - 0.04, z + 0.05, w + 0.015, 0.1, 0.08, 0x45e8ff, 'emissive');
  } else if (magId === 'extended_mag') {
    a.boxBottom(0, y - 0.14, z, w, 0.34, 0.14, 0x343a42, 'metal');
    a.boxBottom(0, y - 0.18, z + 0.03, w + 0.01, 0.07, 0.14, 0xd9a844, 'metal');
  } else if (magId === 'fast_dual') {
    a.boxBottom(-0.045, y, z, w * 0.85, 0.22, 0.13, 0x262b32);
    a.boxBottom(0.045, y - 0.03, z, w * 0.85, 0.22, 0.13, 0x343a42);
    a.boxBottom(0, y + 0.06, z, w * 1.9, 0.06, 0.15, 0xd9a844);
  } else if (magId === 'light_skel') {
    a.boxBottom(0, y + 0.02, z, w * 0.9, 0.2, 0.12, 0x737d87, 'metal');
    a.boxBottom(0, y + 0.07, z, w + 0.01, 0.08, 0.06, 0x1b1f24);
  } else if (magId === 'cryo_cell') {
    a.boxBottom(0, y - 0.04, z, w + 0.02, 0.24, 0.15, 0x1e2b38, 'metal');
    a.boxBottom(0, y + 0.01, z, w + 0.035, 0.14, 0.09, 0x45e8ff, 'emissive');
  } else {
    a.boxBottom(0, y, z, w, 0.22, 0.13, 0x1c2025);
    a.boxBottom(0, y - 0.08, z + 0.04, w, 0.12, 0.12, 0x353a40);
  }
  g.add(a.build(materials));
  void p;
  return g;
}

/**
 * Builds one firearm for the given build & finish.
 */
export function buildFirearm(
  firearm: FirearmId,
  build: GunBuild,
  loadout: LoadoutConfig,
  materials: SharedVoxelMaterials,
): WeaponRig {
  const skin = getOption('gunSkin', loadout.gunSkin);
  const variant = getVariant(firearm, build.variant);
  const p: Palette = {
    primary: skin.hex,
    secondary: skin.secondaryHex ?? 0x3b424c,
    dark: 0x1c2025,
    wood: loadout.gunSkin === 'gunmetal' ? 0x6b3e22 : skin.hex,
    woodDark: loadout.gunSkin === 'gunmetal' ? 0x4c2b16 : skin.secondaryHex ?? 0x3b424c,
    lens: 0x3bf58a,
    tracer: getOption('tracerFx', loadout.tracerFx).hex,
  };
  const blocked = new Set(variant.blockedSlots ?? []);

  const root = new THREE.Group();
  const vb = new VoxelAssembler();
  const frame = BODIES[variant.id](vb, p);

  // Optic lens tint follows the optic's own colour
  const opticTint: Record<string, number> = {
    red_dot: 0xff3b30, eotech_holo: 0x3bf58a, dual_cant: 0xffd447, acog_4x: 0xffae34, thermal_nv: 0x45f2ff,
    cyber_rail: 0xff4fd8, long_sniper: 0x4ef2a1, variable_scope: 0x22c55e, pgo7: 0xf59e0b,
  };
  p.lens = opticTint[build.optic] ?? 0x3bf58a;
  const sightY = addOptic(vb, build.optic, frame, p);

  let tipZ = frame.tipZ;
  if (!blocked.has('muzzle')) tipZ = addMuzzle(vb, build.muzzle, frame.tipY, frame.tipZ, p);
  if (!blocked.has('underbarrel')) addUnderbarrel(vb, build.underbarrel, frame.underY, frame.underZ, p);
  if (!blocked.has('stock')) addStock(vb, build.stock, frame, p);
  const beam = blocked.has('laser') ? null : addLaser(vb, build.laser, frame, p);
  addCharm(vb, loadout.charm, ...frame.charm);
  root.add(vb.build(materials));
  if (beam) root.add(beam);

  const magazine = blocked.has('magazine') && frame.magStyle !== 'shotgun' ? new THREE.Group() : buildMagazine(build.magazine, frame, materials, p);
  root.add(magazine);

  const boltOrPump = new THREE.Group();
  if (frame.bolt || frame.pump) {
    const a = new VoxelAssembler();
    frame.bolt?.(a, p);
    frame.pump?.(a, p);
    boltOrPump.add(a.build(materials));
  }
  root.add(boltOrPump);

  return {
    root,
    magazine,
    boltOrPump,
    muzzleOffsetZ: tipZ,
    muzzleY: frame.tipY + 0.02,
    ejectOffset: frame.eject.clone(),
    sightY,
  };
}

export function buildKatanaRig(materials: SharedVoxelMaterials): WeaponRig {
  const root = new THREE.Group();
  const vb = new VoxelAssembler();
  vb.boxBottom(0, -0.02, -0.32, 0.08, 0.08, 0.32, 0x171717);
  for (let w = 0; w < 4; w++) vb.boxBottom(0, -0.025, -0.3 + w * 0.08, 0.09, 0.09, 0.03, 0xe5e7eb); // ito wrap diamonds
  vb.boxBottom(0, -0.03, 0.01, 0.24, 0.24, 0.04, 0xf59e0b, 'emissive');
  vb.boxBottom(0, 0, 0.06, 0.05, 0.12, 0.85, 0xd4d4d8, 'metal');
  vb.boxBottom(0, 0.08, 0.06, 0.02, 0.05, 0.86, 0xec4899, 'emissive');
  root.add(vb.build(materials));
  return {
    root,
    magazine: new THREE.Group(),
    boltOrPump: new THREE.Group(),
    muzzleOffsetZ: 0.75,
    muzzleY: -0.07,
    ejectOffset: new THREE.Vector3(0, 0, 0),
    sightY: 0,
  };
}
