import * as THREE from 'three';
import { DEFAULT_LOADOUT, getOption } from './customization';
import type { EnemyArchetype, GameMode, LoadoutConfig, VehicleKind, WeaponId } from './types';
import {
  createContactShadowMesh,
  type SharedVoxelMaterials,
  VoxelAssembler,
} from './voxelBuilder';

export interface WeaponRig {
  root: THREE.Group;
  magazine: THREE.Group;
  boltOrPump: THREE.Group;
  muzzleOffsetZ: number;
  ejectOffset: THREE.Vector3;
}

export interface HeroRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  weaponRigs: Record<WeaponId, WeaponRig>;
  muzzlePoint: THREE.Object3D;
  ejectPoint: THREE.Object3D;
  muzzleFlash: THREE.Group;
  thrusterFlame: THREE.Mesh;
  contactShadow: THREE.Mesh;
  flashMaterials: THREE.MeshStandardMaterial[];
}

export interface DrivableVehicleRig {
  root: THREE.Group;
  chassis: THREE.Group;
  frontWheelSteerPivots: THREE.Group[];
  wheelSpinMeshes: THREE.Group[];
  driverSeat: THREE.Group;
  nitroFlame: THREE.Group;
  headlightCones: THREE.Group;
  wreckOverlay: THREE.Group;
  exhaustPoint: THREE.Object3D;
  headlightOrigin: THREE.Object3D;
  damageSmokePoint: THREE.Object3D;
}

/**
 * Builds realistic 3D multi-layered star/cross volumetric muzzle flash mesh tinted by tracerFx.
 */
function buildMuzzleFlashMesh(tracerHex = 0xffa838): THREE.Group {
  const group = new THREE.Group();
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flameMat = new THREE.MeshBasicMaterial({
    color: tracerHex,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const outerColor = new THREE.Color(tracerHex).multiplyScalar(0.75);
  const outerMat = new THREE.MeshBasicMaterial({
    color: outerColor,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.42), coreMat);
  core.position.z = 0.22;
  group.add(core);

  const jet = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.68), flameMat);
  jet.position.z = 0.36;
  group.add(jet);

  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.14), flameMat);
  crossH.position.z = 0.12;
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.14), flameMat);
  crossV.position.z = 0.12;
  const diag1 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.12), outerMat);
  diag1.position.z = 0.16;
  diag1.rotation.z = Math.PI * 0.25;
  const diag2 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.12), outerMat);
  diag2.position.z = 0.16;
  diag2.rotation.z = -Math.PI * 0.25;

  group.add(crossH, crossV, diag1, diag2);
  group.visible = false;
  return group;
}

/** Helper to attach modular Optic geometry onto any firearm top rail */
function addModularOptic(
  vb: VoxelAssembler,
  opticId: string,
  lensHex: number,
  railY: number,
  railZ: number,
  steelHex: number,
  darkHex: number,
): void {
  if (opticId === 'eotech_holo') {
    vb.boxBottom(0, railY, railZ, 0.12, 0.12, 0.17, darkHex);
    vb.boxBottom(0, railY + 0.025, railZ, 0.08, 0.065, 0.19, lensHex, 'emissive');
  } else if (opticId === 'red_dot') {
    vb.boxBottom(0, railY, railZ, 0.07, 0.05, 0.11, steelHex, 'metal');
    vb.boxBottom(0, railY + 0.05, railZ, 0.09, 0.09, 0.12, darkHex);
    vb.boxBottom(0, railY + 0.07, railZ, 0.05, 0.05, 0.14, lensHex, 'emissive');
  } else if (opticId === 'acog_4x') {
    vb.boxBottom(0, railY, railZ, 0.08, 0.05, 0.18, steelHex, 'metal');
    vb.boxBottom(0, railY + 0.05, railZ + 0.02, 0.11, 0.11, 0.28, darkHex, 'metal');
    vb.boxBottom(0, railY + 0.16, railZ + 0.04, 0.04, 0.03, 0.14, lensHex, 'emissive');
    vb.boxBottom(0, railY + 0.07, railZ + 0.17, 0.08, 0.08, 0.03, lensHex, 'emissive');
  } else if (opticId === 'thermal_nv') {
    vb.boxBottom(0, railY, railZ + 0.02, 0.15, 0.14, 0.26, darkHex, 'metal');
    vb.boxBottom(0, railY + 0.02, railZ + 0.16, 0.11, 0.1, 0.04, lensHex, 'emissive');
    vb.boxBottom(0.08, railY + 0.04, railZ + 0.02, 0.04, 0.06, 0.12, steelHex, 'metal');
  } else if (opticId === 'long_sniper') {
    vb.boxBottom(0, railY, railZ - 0.1, 0.07, 0.07, 0.05, steelHex, 'metal');
    vb.boxBottom(0, railY, railZ + 0.12, 0.07, 0.07, 0.05, steelHex, 'metal');
    vb.boxBottom(0, railY + 0.06, railZ + 0.02, 0.11, 0.11, 0.44, darkHex, 'metal');
    vb.boxBottom(0, railY + 0.05, railZ + 0.24, 0.14, 0.14, 0.12, steelHex, 'metal');
    vb.boxBottom(0, railY + 0.07, railZ + 0.31, 0.1, 0.1, 0.03, lensHex, 'emissive');
  } else if (opticId === 'iron_ring') {
    vb.boxBottom(0, railY, railZ - 0.1, 0.1, 0.08, 0.05, steelHex, 'metal');
    vb.boxBottom(-0.04, railY + 0.06, railZ - 0.1, 0.025, 0.06, 0.04, steelHex, 'metal');
    vb.boxBottom(0.04, railY + 0.06, railZ - 0.1, 0.025, 0.06, 0.04, steelHex, 'metal');
    vb.boxBottom(0, railY, railZ + 0.28, 0.06, 0.1, 0.04, steelHex, 'metal');
    vb.boxBottom(0, railY + 0.08, railZ + 0.28, 0.03, 0.03, 0.04, lensHex, 'emissive');
  } else if (opticId === 'cyber_rail') {
    vb.boxBottom(0, railY, railZ + 0.04, 0.14, 0.06, 0.32, darkHex, 'metal');
    vb.boxBottom(-0.06, railY + 0.06, railZ + 0.04, 0.03, 0.1, 0.26, steelHex, 'metal');
    vb.boxBottom(0.06, railY + 0.06, railZ + 0.04, 0.03, 0.1, 0.26, steelHex, 'metal');
    vb.boxBottom(0, railY + 0.08, railZ + 0.04, 0.1, 0.08, 0.22, lensHex, 'emissive');
  } else {
    // dual_cant
    vb.boxBottom(0, railY, railZ, 0.11, 0.11, 0.22, darkHex, 'metal');
    vb.boxBottom(0, railY + 0.03, railZ + 0.12, 0.08, 0.07, 0.03, lensHex, 'emissive');
    vb.boxBottom(-0.1, railY + 0.01, railZ + 0.06, 0.07, 0.07, 0.09, steelHex, 'metal');
    vb.boxBottom(-0.1, railY + 0.03, railZ + 0.11, 0.05, 0.05, 0.03, 0xff3b30, 'emissive');
  }
}

/** Helper to attach modular Muzzle device at barrel tip */
function addModularMuzzle(
  vb: VoxelAssembler,
  muzzleId: string,
  tipY: number,
  tipZ: number,
  steelHex: number,
  darkHex: number,
): number {
  if (muzzleId === 'suppressor') {
    vb.boxBottom(0, tipY - 0.02, tipZ + 0.16, 0.11, 0.11, 0.36, darkHex, 'metal');
    vb.boxBottom(0, tipY - 0.01, tipZ + 0.16, 0.12, 0.03, 0.28, steelHex, 'metal');
    return tipZ + 0.36;
  } else if (muzzleId === 'heavy_comp') {
    vb.boxBottom(0, tipY - 0.03, tipZ + 0.08, 0.15, 0.13, 0.2, steelHex, 'metal');
    vb.boxBottom(0, tipY + 0.05, tipZ + 0.08, 0.09, 0.04, 0.14, darkHex);
    return tipZ + 0.2;
  } else if (muzzleId === 'breach_spike') {
    vb.boxBottom(0, tipY - 0.03, tipZ + 0.08, 0.14, 0.14, 0.16, 0x9c2820, 'metal');
    vb.boxBottom(-0.06, tipY + 0.02, tipZ + 0.18, 0.04, 0.04, 0.1, 0xd9dce0, 'metal');
    vb.boxBottom(0.06, tipY + 0.02, tipZ + 0.18, 0.04, 0.04, 0.1, 0xd9dce0, 'metal');
    vb.boxBottom(0, tipY - 0.05, tipZ + 0.18, 0.05, 0.04, 0.1, 0xd9dce0, 'metal');
    return tipZ + 0.24;
  } else if (muzzleId === 'flash_hider') {
    vb.boxBottom(0, tipY - 0.01, tipZ + 0.08, 0.09, 0.09, 0.16, darkHex, 'metal');
    vb.boxBottom(-0.04, tipY, tipZ + 0.15, 0.025, 0.025, 0.1, steelHex, 'metal');
    vb.boxBottom(0.04, tipY, tipZ + 0.15, 0.025, 0.025, 0.1, steelHex, 'metal');
    return tipZ + 0.2;
  } else if (muzzleId === 'twin_cannon') {
    vb.boxBottom(0, tipY - 0.03, tipZ + 0.09, 0.2, 0.12, 0.18, 0xd9a844, 'metal');
    vb.boxBottom(-0.08, tipY - 0.01, tipZ + 0.1, 0.06, 0.08, 0.12, darkHex);
    vb.boxBottom(0.08, tipY - 0.01, tipZ + 0.1, 0.06, 0.08, 0.12, darkHex);
    return tipZ + 0.2;
  } else if (muzzleId === 'cryo_shroud') {
    vb.boxBottom(0, tipY - 0.03, tipZ + 0.12, 0.14, 0.14, 0.28, steelHex, 'metal');
    vb.boxBottom(0, tipY + 0.01, tipZ + 0.12, 0.16, 0.05, 0.22, 0x7cc4ff, 'emissive');
    return tipZ + 0.28;
  } else if (muzzleId === 'long_choke') {
    vb.boxBottom(0, tipY - 0.01, tipZ + 0.12, 0.1, 0.1, 0.28, steelHex, 'metal');
    return tipZ + 0.28;
  }
  // slotted_brake
  vb.boxBottom(0, tipY - 0.02, tipZ + 0.06, 0.1, 0.1, 0.12, darkHex, 'metal');
  return tipZ + 0.14;
}

/** Helper to attach modular Underbarrel attachment */
function addModularUnderbarrel(
  vb: VoxelAssembler,
  underId: string,
  baseY: number,
  baseZ: number,
  steelHex: number,
  darkHex: number,
): void {
  if (underId === 'angled_grip') {
    vb.boxBottom(0, baseY - 0.09, baseZ, 0.08, 0.1, 0.18, darkHex);
  } else if (underId === 'vertical_grip') {
    vb.boxBottom(0, baseY - 0.2, baseZ, 0.075, 0.21, 0.08, darkHex);
  } else if (underId === 'laser_pod') {
    vb.boxBottom(-0.09, baseY + 0.02, baseZ + 0.08, 0.07, 0.07, 0.18, darkHex, 'metal');
    vb.boxBottom(-0.09, baseY + 0.03, baseZ + 0.18, 0.04, 0.04, 0.04, 0xff2f38, 'emissive');
    vb.boxBottom(-0.09, baseY + 0.04, baseZ + 0.42, 0.018, 0.018, 0.44, 0xff2f38, 'emissive');
  } else if (underId === 'grenade_tube') {
    vb.boxBottom(0, baseY - 0.14, baseZ + 0.02, 0.12, 0.13, 0.34, 0x485244, 'metal');
    vb.boxBottom(0, baseY - 0.13, baseZ + 0.2, 0.09, 0.09, 0.06, darkHex, 'metal');
  } else if (underId === 'heavy_bipod') {
    vb.boxBottom(-0.12, baseY - 0.26, baseZ + 0.1, 0.04, 0.26, 0.05, steelHex, 'metal');
    vb.boxBottom(0.12, baseY - 0.26, baseZ + 0.1, 0.04, 0.26, 0.05, steelHex, 'metal');
    vb.boxBottom(0, baseY - 0.05, baseZ + 0.1, 0.22, 0.05, 0.07, darkHex, 'metal');
  } else if (underId === 'floodlight') {
    vb.boxBottom(0, baseY - 0.11, baseZ + 0.08, 0.11, 0.11, 0.22, steelHex, 'metal');
    vb.boxBottom(0, baseY - 0.1, baseZ + 0.2, 0.09, 0.09, 0.04, 0xfff3c4, 'emissive');
  } else if (underId === 'bayonet_blade') {
    vb.boxBottom(0, baseY - 0.08, baseZ + 0.08, 0.06, 0.06, 0.14, darkHex);
    vb.boxBottom(0, baseY - 0.09, baseZ + 0.34, 0.03, 0.08, 0.38, 0xdce4ec, 'metal');
  } else {
    // stubby_grip
    vb.boxBottom(0, baseY - 0.14, baseZ, 0.09, 0.14, 0.1, 0x8f7a5b);
  }
}

/** Helper to attach dangling micro-voxel Weapon Charm on receiver side */
function addModularCharm(vb: VoxelAssembler, charmId: string, cx: number, cy: number, cz: number): void {
  if (charmId === 'none') return;
  // Tiny silver lanyard ring
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

/** Helper to construct modular detachable Magazine geometry */
function buildModularMagazine(
  magId: string,
  baseY: number,
  baseZ: number,
  width: number,
  materials: SharedVoxelMaterials,
): THREE.Group {
  const g = new THREE.Group();
  const asm = new VoxelAssembler();
  if (magId === 'extended_mag') {
    asm.boxBottom(0, baseY - 0.14, baseZ, width, 0.34, 0.14, 0x343a42, 'metal');
    asm.boxBottom(0, baseY - 0.18, baseZ + 0.03, width + 0.01, 0.07, 0.14, 0xd9a844, 'metal');
  } else if (magId === 'fast_dual') {
    asm.boxBottom(-0.045, baseY, baseZ, width * 0.85, 0.22, 0.13, 0x262b32);
    asm.boxBottom(0.045, baseY - 0.03, baseZ, width * 0.85, 0.22, 0.13, 0x343a42);
    asm.boxBottom(0, baseY + 0.06, baseZ, width * 1.9, 0.06, 0.15, 0xd9a844);
  } else if (magId === 'drum_mag') {
    asm.boxBottom(0, baseY + 0.06, baseZ, width, 0.14, 0.13, 0x262b32);
    asm.boxBottom(-0.1, baseY - 0.08, baseZ, 0.15, 0.18, 0.16, 0x353b44, 'metal');
    asm.boxBottom(0.1, baseY - 0.08, baseZ, 0.15, 0.18, 0.16, 0x353b44, 'metal');
  } else if (magId === 'light_skel') {
    asm.boxBottom(0, baseY + 0.02, baseZ, width * 0.9, 0.2, 0.12, 0x737d87, 'metal');
    asm.boxBottom(0, baseY + 0.07, baseZ, width + 0.01, 0.08, 0.06, 0x1b1f24);
  } else if (magId === 'cryo_cell') {
    asm.boxBottom(0, baseY - 0.04, baseZ, width + 0.02, 0.24, 0.15, 0x1e2b38, 'metal');
    asm.boxBottom(0, baseY + 0.01, baseZ, width + 0.035, 0.14, 0.09, 0x45e8ff, 'emissive');
  } else {
    // standard_mag
    asm.boxBottom(0, baseY, baseZ, width, 0.22, 0.13, 0x1c2025);
    asm.boxBottom(0, baseY - 0.08, baseZ + 0.04, width, 0.12, 0.12, 0x353a40);
  }
  g.add(asm.build(materials));
  return g;
}

/**
 * Builds 3 high-detail micro-voxel tactical firearms customized with all 60 Gun Armory options.
 */
function buildDetailedWeapons(
  materials: SharedVoxelMaterials,
  loadout: LoadoutConfig,
): Record<WeaponId, WeaponRig> {
  const skinOpt = getOption('gunSkin', loadout.gunSkin);
  const opticOpt = getOption('optic', loadout.optic);
  const tracerOpt = getOption('tracerFx', loadout.tracerFx);

  const PRIMARY = skinOpt.hex;
  const SECONDARY = skinOpt.secondaryHex ?? 0x3b424c;
  const DARK_POLY = 0x1c2025;
  const WALNUT = loadout.gunSkin === 'gunmetal' ? 0x6b3e22 : PRIMARY;
  const WALNUT_DARK = loadout.gunSkin === 'gunmetal' ? 0x4c2b16 : SECONDARY;
  const SHELL_RED = 0xc92c24;
  const BRASS = 0xd9a844;

  // 1. M4-K TACTICAL CARBINE
  const pulseRoot = new THREE.Group();
  const pulseBody = new VoxelAssembler();
  pulseBody.boxBottom(0, -0.15, 0.06, 0.09, 0.17, 0.24, DARK_POLY);
  pulseBody.boxBottom(0, -0.12, 0.24, 0.08, 0.1, 0.18, SECONDARY, 'metal');
  pulseBody.boxBottom(0, -0.19, 0.48, 0.13, 0.18, 0.38, PRIMARY, 'metal');
  pulseBody.boxBottom(0, -0.34, 0.34, 0.09, 0.18, 0.11, DARK_POLY);
  // Top Picatinny rail + Modular Optic
  pulseBody.boxBottom(0, -0.01, 0.56, 0.08, 0.04, 0.56, SECONDARY, 'metal');
  addModularOptic(pulseBody, loadout.optic, opticOpt.hex, 0.03, 0.48, SECONDARY, DARK_POLY);
  // Handguard + skin accent panels + Modular Underbarrel
  pulseBody.boxBottom(0, -0.16, 0.84, 0.14, 0.14, 0.38, PRIMARY, 'metal');
  pulseBody.boxBottom(-0.075, -0.13, 0.84, 0.03, 0.07, 0.32, SECONDARY);
  pulseBody.boxBottom(0.075, -0.13, 0.84, 0.03, 0.07, 0.32, SECONDARY);
  addModularUnderbarrel(pulseBody, loadout.underbarrel, -0.16, 0.86, SECONDARY, DARK_POLY);
  // Side flashlight pod
  pulseBody.boxBottom(-0.09, -0.14, 0.96, 0.06, 0.06, 0.16, SECONDARY, 'metal');
  pulseBody.boxBottom(-0.09, -0.14, 1.05, 0.05, 0.05, 0.03, 0xfff5d6, 'emissive');
  // Barrel + Modular Muzzle
  pulseBody.boxBottom(0, -0.12, 1.12, 0.06, 0.06, 0.24, SECONDARY, 'metal');
  const pulseMuzzleZ = addModularMuzzle(pulseBody, loadout.muzzle, -0.11, 1.24, SECONDARY, DARK_POLY);
  // Weapon Charm on side of receiver
  addModularCharm(pulseBody, loadout.charm, 0.085, -0.12, 0.42);
  pulseRoot.add(pulseBody.build(materials));

  const pulseMag = buildModularMagazine(loadout.magazine, -0.36, 0.56, 0.08, materials);
  pulseRoot.add(pulseMag);

  const pulseBolt = new THREE.Group();
  const pBoltAsm = new VoxelAssembler();
  pBoltAsm.boxBottom(-0.07, -0.1, 0.48, 0.04, 0.05, 0.14, BRASS, 'metal');
  pBoltAsm.boxBottom(0, -0.02, 0.31, 0.11, 0.04, 0.06, SECONDARY, 'metal');
  pulseBolt.add(pBoltAsm.build(materials));
  pulseRoot.add(pulseBolt);

  // 2. M870 BREACH SHOTGUN
  const scatterRoot = new THREE.Group();
  const scatterBody = new VoxelAssembler();
  scatterBody.boxBottom(0, -0.22, 0.08, 0.11, 0.2, 0.32, WALNUT);
  scatterBody.boxBottom(0, -0.22, -0.09, 0.11, 0.21, 0.05, DARK_POLY);
  scatterBody.boxBottom(0, -0.21, 0.3, 0.1, 0.15, 0.16, WALNUT_DARK);
  scatterBody.boxBottom(0, -0.18, 0.52, 0.16, 0.18, 0.34, PRIMARY, 'metal');
  for (let s = 0; s < 4; s++) {
    scatterBody.boxBottom(0.095, -0.14, 0.4 + s * 0.075, 0.04, 0.09, 0.05, SHELL_RED);
    scatterBody.boxBottom(0.095, -0.17, 0.4 + s * 0.075, 0.04, 0.03, 0.05, BRASS, 'metal');
  }
  addModularOptic(scatterBody, loadout.optic, opticOpt.hex, 0.0, 0.52, SECONDARY, DARK_POLY);
  scatterBody.boxBottom(0, -0.09, 0.98, 0.1, 0.1, 0.64, SECONDARY, 'metal');
  scatterBody.boxBottom(0, -0.04, 0.92, 0.11, 0.04, 0.44, PRIMARY, 'metal');
  scatterBody.boxBottom(0, -0.18, 0.94, 0.09, 0.08, 0.54, DARK_POLY, 'metal');
  addModularUnderbarrel(scatterBody, loadout.underbarrel, -0.18, 1.06, SECONDARY, DARK_POLY);
  scatterBody.boxBottom(0, -0.01, 1.24, 0.04, 0.05, 0.04, tracerOpt.hex, 'emissive');
  const scatterMuzzleZ = addModularMuzzle(scatterBody, loadout.muzzle, -0.08, 1.3, SECONDARY, DARK_POLY);
  addModularCharm(scatterBody, loadout.charm, 0.1, -0.12, 0.38);
  scatterRoot.add(scatterBody.build(materials));

  const scatterMag = new THREE.Group();
  const sMagAsm = new VoxelAssembler();
  sMagAsm.boxBottom(0, -0.25, 0.52, 0.06, 0.08, 0.14, loadout.magazine === 'cryo_cell' ? 0x45e8ff : SHELL_RED);
  scatterMag.add(sMagAsm.build(materials));
  scatterRoot.add(scatterMag);

  const scatterPump = new THREE.Group();
  const sPumpAsm = new VoxelAssembler();
  sPumpAsm.boxBottom(0, -0.21, 0.86, 0.15, 0.13, 0.28, WALNUT);
  for (let r = 0; r < 4; r++) {
    sPumpAsm.boxBottom(0, -0.215, 0.76 + r * 0.065, 0.16, 0.12, 0.025, WALNUT_DARK);
  }
  scatterPump.add(sPumpAsm.build(materials));
  scatterRoot.add(scatterPump);
  scatterRoot.visible = false;

  // 3. K-50 ANTI-MATERIEL PRECISION RIFLE
  const railRoot = new THREE.Group();
  const railBody = new VoxelAssembler();
  railBody.boxBottom(0, -0.22, 0.04, 0.1, 0.22, 0.34, DARK_POLY);
  railBody.boxBottom(0, -0.04, 0.12, 0.11, 0.08, 0.2, SECONDARY);
  railBody.boxBottom(0, -0.19, 0.48, 0.16, 0.2, 0.48, PRIMARY, 'metal');
  railBody.boxBottom(0, -0.35, 0.32, 0.09, 0.18, 0.11, DARK_POLY);
  addModularOptic(railBody, loadout.optic, opticOpt.hex, 0.01, 0.5, SECONDARY, DARK_POLY);
  railBody.boxBottom(0, -0.15, 1.0, 0.12, 0.12, 0.62, SECONDARY, 'metal');
  addModularUnderbarrel(railBody, loadout.underbarrel, -0.16, 1.04, SECONDARY, DARK_POLY);
  railBody.boxBottom(0, -0.12, 1.38, 0.08, 0.08, 0.22, PRIMARY, 'metal');
  railBody.boxBottom(0, -0.11, 1.24, 0.14, 0.04, 0.34, tracerOpt.hex, 'emissive');
  const railMuzzleZ = addModularMuzzle(railBody, loadout.muzzle, -0.12, 1.5, SECONDARY, DARK_POLY);
  addModularCharm(railBody, loadout.charm, 0.1, -0.12, 0.4);
  railRoot.add(railBody.build(materials));

  const railMag = buildModularMagazine(loadout.magazine, -0.37, 0.56, 0.11, materials);
  railRoot.add(railMag);

  const railBolt = new THREE.Group();
  const rBoltAsm = new VoxelAssembler();
  rBoltAsm.boxBottom(-0.1, -0.1, 0.42, 0.1, 0.05, 0.06, 0xcfd6dd, 'metal');
  rBoltAsm.boxBottom(-0.15, -0.13, 0.42, 0.06, 0.06, 0.06, DARK_POLY);
  railBolt.add(rBoltAsm.build(materials));
  railRoot.add(railBolt);
  railRoot.visible = false;

  return {
    pulse: {
      root: pulseRoot,
      magazine: pulseMag,
      boltOrPump: pulseBolt,
      muzzleOffsetZ: pulseMuzzleZ,
      ejectOffset: new THREE.Vector3(-0.1, -0.06, 0.48),
    },
    scatter: {
      root: scatterRoot,
      magazine: scatterMag,
      boltOrPump: scatterPump,
      muzzleOffsetZ: scatterMuzzleZ,
      ejectOffset: new THREE.Vector3(-0.1, -0.08, 0.52),
    },
    rail: {
      root: railRoot,
      magazine: railMag,
      boltOrPump: railBolt,
      muzzleOffsetZ: railMuzzleZ,
      ejectOffset: new THREE.Vector3(-0.12, -0.06, 0.46),
    },
    rpg: {
      root: buildRpgMesh(materials),
      magazine: new THREE.Group(),
      boltOrPump: new THREE.Group(),
      muzzleOffsetZ: 0.95,
      ejectOffset: new THREE.Vector3(0, 0, 0),
    },
    katana: {
      root: buildKatanaMesh(materials),
      magazine: new THREE.Group(),
      boltOrPump: new THREE.Group(),
      muzzleOffsetZ: 0.75,
      ejectOffset: new THREE.Vector3(0, 0, 0),
    },
  };
}

/**
 * Builds the Hero "K-04" Voxel Ranger Bot with all 128 character & firearm customizations.
 */
export function buildHeroRig(
  materials: SharedVoxelMaterials,
  loadout: LoadoutConfig = DEFAULT_LOADOUT,
): HeroRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  const collectFlash = (g: THREE.Group) => {
    g.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = (obj as THREE.Mesh).material;
        if (m instanceof THREE.MeshStandardMaterial && obj.userData.voxelBucket !== 'emissive') {
          flashMaterials.push(m);
        }
      }
    });
  };

  const headOpt = getOption('headgear', loadout.headgear);
  const visorOpt = getOption('visorColor', loadout.visorColor);
  const jacketOpt = getOption('jacketColor', loadout.jacketColor);
  const outfitOpt = getOption('outfitStyle', loadout.outfitStyle);
  const pantsOpt = getOption('pantsStyle', loadout.pantsStyle);
  const packOpt = getOption('backpack', loadout.backpack);
  const glowOpt = getOption('accentGlow', loadout.accentGlow);
  const tracerOpt = getOption('tracerFx', loadout.tracerFx);

  const JACKET = jacketOpt.hex;
  const JACKET_TRIM = jacketOpt.secondaryHex ?? 0xc25b1d;
  const OUTFIT_ACCENT = outfitOpt.hex;
  const PANTS = pantsOpt.hex;
  const BOOT = pantsOpt.secondaryHex ?? 0x1c222e;
  const HELMET = headOpt.hex;
  const HELMET_RIM = 0x4b535c;
  const VISOR_BG = 0x14202b;
  const EYE_GLOW = visorOpt.hex;
  const ACCENT_GLOW = glowOpt.hex;
  const PACK_COLOR = packOpt.hex;

  // Torso + Outfit Style + Back Gear
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.72, 0);
  const torsoAsm = new VoxelAssembler();
  torsoAsm.boxBottom(0, 0, 0, 0.56, 0.52, 0.36, JACKET);
  torsoAsm.boxBottom(0, 0.0, 0, 0.6, 0.12, 0.4, PANTS);
  torsoAsm.boxBottom(0, 0.02, 0.21, 0.16, 0.08, 0.04, 0xf2c641, 'metal');

  // Outfit Rig Variations (8 distinct styles!)
  if (loadout.outfitStyle === 'heavy_exo') {
    torsoAsm.boxBottom(0, 0.08, 0.16, 0.46, 0.36, 0.12, OUTFIT_ACCENT, 'metal');
    torsoAsm.boxBottom(-0.34, 0.34, 0, 0.24, 0.24, 0.42, OUTFIT_ACCENT, 'metal');
    torsoAsm.boxBottom(0.34, 0.34, 0, 0.24, 0.24, 0.42, OUTFIT_ACCENT, 'metal');
    torsoAsm.boxBottom(0, 0.46, 0, 0.68, 0.14, 0.44, JACKET_TRIM, 'metal');
  } else if (loadout.outfitStyle === 'street_bomber') {
    torsoAsm.boxBottom(0, 0.1, 0.18, 0.1, 0.38, 0.05, 0xdce4ec, 'metal');
    torsoAsm.boxBottom(0, 0.48, -0.02, 0.66, 0.16, 0.44, OUTFIT_ACCENT);
    torsoAsm.boxBottom(0, 0.16, 0.19, 0.58, 0.07, 0.04, ACCENT_GLOW, 'emissive');
  } else if (loadout.outfitStyle === 'winter_parka') {
    torsoAsm.boxBottom(0, 0.06, 0.15, 0.44, 0.38, 0.12, OUTFIT_ACCENT);
    torsoAsm.boxBottom(0, 0.48, 0, 0.7, 0.16, 0.48, 0xf2f6fa);
    torsoAsm.boxBottom(0, 0.22, 0.22, 0.4, 0.06, 0.04, JACKET_TRIM);
  } else if (loadout.outfitStyle === 'hazmat_suit') {
    torsoAsm.boxBottom(0, 0.08, 0.17, 0.42, 0.36, 0.1, OUTFIT_ACCENT);
    torsoAsm.boxBottom(-0.12, 0.2, 0.23, 0.12, 0.12, 0.06, 0x262b30, 'metal');
    torsoAsm.boxBottom(0.12, 0.2, 0.23, 0.12, 0.12, 0.06, 0x262b30, 'metal');
    torsoAsm.boxBottom(0, 0.46, 0, 0.64, 0.12, 0.42, 0x262b30);
  } else if (loadout.outfitStyle === 'cyber_shinobi') {
    torsoAsm.boxBottom(0, 0.46, 0.04, 0.66, 0.16, 0.46, 0xb82424);
    torsoAsm.boxBottom(0, 0.12, 0.19, 0.44, 0.08, 0.05, OUTFIT_ACCENT, 'metal');
    torsoAsm.boxBottom(0, 0.28, 0.19, 0.44, 0.08, 0.05, OUTFIT_ACCENT, 'metal');
    torsoAsm.boxBottom(0, 0.2, 0.22, 0.16, 0.16, 0.04, ACCENT_GLOW, 'emissive');
  } else if (loadout.outfitStyle === 'field_medic') {
    torsoAsm.boxBottom(0, 0.08, 0.16, 0.42, 0.36, 0.1, 0xf2eee6);
    torsoAsm.boxBottom(0, 0.2, 0.22, 0.2, 0.07, 0.04, 0xe02c2c, 'emissive');
    torsoAsm.boxBottom(0, 0.14, 0.22, 0.07, 0.2, 0.04, 0xe02c2c, 'emissive');
    torsoAsm.boxBottom(0, 0.48, 0, 0.62, 0.1, 0.4, JACKET_TRIM);
  } else if (loadout.outfitStyle === 'neon_runner') {
    torsoAsm.boxBottom(0, 0.08, 0.16, 0.4, 0.34, 0.09, OUTFIT_ACCENT, 'metal');
    torsoAsm.boxBottom(-0.18, 0.12, 0.21, 0.06, 0.34, 0.04, ACCENT_GLOW, 'emissive');
    torsoAsm.boxBottom(0.18, 0.12, 0.21, 0.06, 0.34, 0.04, ACCENT_GLOW, 'emissive');
    torsoAsm.boxBottom(0, 0.48, 0, 0.64, 0.11, 0.42, ACCENT_GLOW, 'emissive');
  } else {
    // classic_ranger
    torsoAsm.boxBottom(0, 0.08, 0.16, 0.36, 0.32, 0.08, OUTFIT_ACCENT);
    torsoAsm.boxBottom(0, 0.48, 0, 0.62, 0.1, 0.4, JACKET_TRIM);
  }

  // Back Gear Variations (8 distinct backpack models!)
  if (loadout.backpack === 'katana_pack') {
    torsoAsm.boxBottom(0, 0.16, -0.22, 0.34, 0.3, 0.12, 0x22252b, 'metal');
    // Twin vertical/diagonal katana scabbards & glowing hilts rising above shoulders
    torsoAsm.boxBottom(-0.18, 0.02, -0.29, 0.07, 0.96, 0.07, 0x1e2024, 'metal');
    torsoAsm.boxBottom(0.18, 0.02, -0.29, 0.07, 0.96, 0.07, 0x1e2024, 'metal');
    torsoAsm.boxBottom(-0.18, 0.92, -0.29, 0.14, 0.05, 0.1, 0xd9a844, 'metal');
    torsoAsm.boxBottom(0.18, 0.92, -0.29, 0.14, 0.05, 0.1, 0xd9a844, 'metal');
    torsoAsm.boxBottom(-0.18, 0.97, -0.29, 0.06, 0.24, 0.06, ACCENT_GLOW, 'emissive');
    torsoAsm.boxBottom(0.18, 0.97, -0.29, 0.06, 0.24, 0.06, ACCENT_GLOW, 'emissive');
  } else if (loadout.backpack === 'bio_canister') {
    torsoAsm.boxBottom(0, 0.1, -0.25, 0.46, 0.44, 0.2, 0x353d38, 'metal');
    torsoAsm.boxBottom(-0.12, 0.16, -0.34, 0.16, 0.36, 0.16, PACK_COLOR, 'emissive');
    torsoAsm.boxBottom(0.12, 0.16, -0.34, 0.16, 0.36, 0.16, PACK_COLOR, 'emissive');
  } else if (loadout.backpack === 'radio_dish') {
    torsoAsm.boxBottom(0, 0.12, -0.25, 0.44, 0.44, 0.2, PACK_COLOR, 'metal');
    torsoAsm.boxBottom(-0.16, 0.56, -0.28, 0.05, 0.52, 0.05, 0x8e98a4, 'metal');
    torsoAsm.boxBottom(0.14, 0.5, -0.34, 0.26, 0.26, 0.06, 0xdce4ec, 'metal');
    torsoAsm.boxBottom(0.14, 0.6, -0.38, 0.08, 0.08, 0.06, ACCENT_GLOW, 'emissive');
  } else if (loadout.backpack === 'snow_pack') {
    torsoAsm.boxBottom(0, 0.08, -0.27, 0.48, 0.48, 0.26, PACK_COLOR);
    torsoAsm.boxBottom(0, 0.56, -0.27, 0.54, 0.16, 0.18, 0xe8eff5); // rolled snow bedroll
    torsoAsm.boxBottom(0.24, 0.14, -0.36, 0.06, 0.46, 0.06, 0x8d5a34); // ice axe handle
    torsoAsm.boxBottom(0.24, 0.58, -0.36, 0.18, 0.06, 0.06, 0xcfd6dd, 'metal');
  } else if (loadout.backpack === 'ammo_drum') {
    torsoAsm.boxBottom(0, 0.1, -0.28, 0.52, 0.46, 0.26, PACK_COLOR, 'metal');
    torsoAsm.boxBottom(0, 0.24, -0.42, 0.42, 0.14, 0.06, 0xd9a844, 'metal');
    torsoAsm.boxBottom(0, 0.42, -0.28, 0.36, 0.12, 0.18, 0x2b3036, 'metal');
  } else if (loadout.backpack === 'neon_wings') {
    torsoAsm.boxBottom(0, 0.16, -0.24, 0.34, 0.36, 0.14, 0x242a34, 'metal');
    torsoAsm.boxBottom(-0.46, 0.28, -0.32, 0.62, 0.14, 0.08, ACCENT_GLOW, 'emissive');
    torsoAsm.boxBottom(0.46, 0.28, -0.32, 0.62, 0.14, 0.08, ACCENT_GLOW, 'emissive');
    torsoAsm.boxBottom(-0.56, 0.48, -0.34, 0.52, 0.12, 0.08, PACK_COLOR, 'emissive');
    torsoAsm.boxBottom(0.56, 0.48, -0.34, 0.52, 0.12, 0.08, PACK_COLOR, 'emissive');
  } else if (loadout.backpack === 'med_frame') {
    torsoAsm.boxBottom(0, 0.12, -0.26, 0.46, 0.44, 0.2, 0xf2eee6);
    torsoAsm.boxBottom(0, 0.28, -0.37, 0.22, 0.08, 0.04, PACK_COLOR, 'emissive');
    torsoAsm.boxBottom(0, 0.21, -0.37, 0.08, 0.22, 0.04, PACK_COLOR, 'emissive');
  } else {
    // dual_thruster
    torsoAsm.boxBottom(0, 0.12, -0.25, 0.44, 0.42, 0.18, PACK_COLOR, 'metal');
    torsoAsm.boxBottom(-0.13, 0.06, -0.32, 0.14, 0.28, 0.12, 0x2c323a, 'metal');
    torsoAsm.boxBottom(0.13, 0.06, -0.32, 0.14, 0.28, 0.12, 0x2c323a, 'metal');
    torsoAsm.boxBottom(0, 0.32, -0.35, 0.24, 0.1, 0.06, ACCENT_GLOW, 'emissive');
  }

  const torsoMesh = torsoAsm.build(materials, { cloneMaterials: true });
  collectFlash(torsoMesh);
  torsoGroup.add(torsoMesh);

  const flameGeo = new THREE.BoxGeometry(0.32, 0.38, 0.18);
  const flameMat = new THREE.MeshBasicMaterial({
    color: ACCENT_GLOW,
    transparent: true,
    opacity: 0,
  });
  const thrusterFlame = new THREE.Mesh(flameGeo, flameMat);
  thrusterFlame.position.set(0, -0.08, -0.34);
  torsoGroup.add(thrusterFlame);
  bodyPivot.add(torsoGroup);

  // Customized Headgear (8 distinct voxel helmet/hat/mask silhouettes!)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.56, 0);
  const headAsm = new VoxelAssembler();
  // Core head & glowing visor eyes
  headAsm.boxBottom(0, 0, 0, 0.62, 0.5, 0.56, HELMET);
  headAsm.boxBottom(-0.32, 0.14, 0, 0.08, 0.22, 0.22, HELMET_RIM, 'metal');
  headAsm.boxBottom(0.32, 0.14, 0, 0.08, 0.22, 0.22, HELMET_RIM, 'metal');
  headAsm.boxBottom(0, 0.1, 0.26, 0.48, 0.3, 0.08, VISOR_BG, 'metal');
  headAsm.boxBottom(-0.12, 0.2, 0.3, 0.11, 0.12, 0.04, EYE_GLOW, 'emissive');
  headAsm.boxBottom(0.12, 0.2, 0.3, 0.11, 0.12, 0.04, EYE_GLOW, 'emissive');

  if (loadout.headgear === 'ronin_kasa') {
    headAsm.boxBottom(0, 0.46, 0, 1.18, 0.12, 1.18, 0xc99b4f);
    headAsm.boxBottom(0, 0.58, 0, 0.82, 0.12, 0.82, 0xb0823c);
    headAsm.boxBottom(0, 0.7, 0, 0.44, 0.12, 0.44, 0x8f662b);
  } else if (loadout.headgear === 'cyber_kabuto') {
    headAsm.boxBottom(0, 0.46, -0.04, 0.72, 0.14, 0.66, 0x22262e, 'metal');
    headAsm.boxBottom(0, 0.54, 0.26, 0.76, 0.12, 0.08, 0xf2c641, 'metal');
    headAsm.boxBottom(-0.34, 0.62, 0.26, 0.12, 0.24, 0.08, 0xf2c641, 'metal');
    headAsm.boxBottom(0.34, 0.62, 0.26, 0.12, 0.24, 0.08, 0xf2c641, 'metal');
    headAsm.boxBottom(0, 0.04, -0.32, 0.76, 0.36, 0.12, 0x9c2222);
  } else if (loadout.headgear === 'nvg_ops') {
    headAsm.boxBottom(0, 0.46, 0, 0.66, 0.12, 0.62, 0x2c362e);
    headAsm.boxBottom(0, 0.46, 0.32, 0.46, 0.12, 0.16, 0x1e2226, 'metal');
    headAsm.boxBottom(-0.16, 0.48, 0.41, 0.09, 0.09, 0.08, 0x4ef2a1, 'emissive');
    headAsm.boxBottom(-0.05, 0.48, 0.41, 0.09, 0.09, 0.08, 0x4ef2a1, 'emissive');
    headAsm.boxBottom(0.05, 0.48, 0.41, 0.09, 0.09, 0.08, 0x4ef2a1, 'emissive');
    headAsm.boxBottom(0.16, 0.48, 0.41, 0.09, 0.09, 0.08, 0x4ef2a1, 'emissive');
  } else if (loadout.headgear === 'kitsune_mask') {
    headAsm.boxBottom(-0.22, 0.5, 0.04, 0.16, 0.3, 0.16, 0xf5efe6);
    headAsm.boxBottom(0.22, 0.5, 0.04, 0.16, 0.3, 0.16, 0xf5efe6);
    headAsm.boxBottom(-0.22, 0.56, 0.13, 0.08, 0.18, 0.04, 0xd43838);
    headAsm.boxBottom(0.22, 0.56, 0.13, 0.08, 0.18, 0.04, 0xd43838);
    headAsm.boxBottom(0, 0.38, 0.3, 0.26, 0.06, 0.04, 0xd43838);
  } else if (loadout.headgear === 'snow_ushanka') {
    headAsm.boxBottom(0, 0.44, 0, 0.72, 0.24, 0.68, 0x7c553b);
    headAsm.boxBottom(0, 0.44, 0.32, 0.68, 0.2, 0.12, 0xe4e8ee);
    headAsm.boxBottom(-0.37, 0.08, 0.02, 0.12, 0.42, 0.28, 0xe4e8ee);
    headAsm.boxBottom(0.37, 0.08, 0.02, 0.12, 0.42, 0.28, 0xe4e8ee);
  } else if (loadout.headgear === 'hazmat_mask') {
    headAsm.boxBottom(0, 0.48, 0, 0.64, 0.1, 0.6, 0x3b4239);
    headAsm.boxBottom(-0.2, 0.04, 0.34, 0.16, 0.16, 0.16, 0x262b26, 'metal');
    headAsm.boxBottom(0.2, 0.04, 0.34, 0.16, 0.16, 0.16, 0x262b26, 'metal');
    headAsm.boxBottom(0, 0.06, 0.32, 0.22, 0.14, 0.12, 0x4c544b, 'metal');
  } else if (loadout.headgear === 'crowned_visor') {
    headAsm.boxBottom(0, 0.48, 0, 0.66, 0.08, 0.62, 0x202836, 'metal');
    headAsm.boxBottom(0, 0.62, 0, 0.74, 0.07, 0.7, ACCENT_GLOW, 'emissive');
    headAsm.boxBottom(0, 0.7, 0.32, 0.12, 0.16, 0.08, ACCENT_GLOW, 'emissive');
    headAsm.boxBottom(-0.24, 0.7, 0.28, 0.1, 0.12, 0.08, ACCENT_GLOW, 'emissive');
    headAsm.boxBottom(0.24, 0.7, 0.28, 0.1, 0.12, 0.08, ACCENT_GLOW, 'emissive');
  } else {
    // ranger_helm
    headAsm.boxBottom(0, 0.48, 0, 0.52, 0.08, 0.48, 0xf6f2e8);
    headAsm.boxBottom(0.24, 0.5, -0.06, 0.06, 0.22, 0.06, HELMET_RIM, 'metal');
    headAsm.boxBottom(0.24, 0.72, -0.06, 0.1, 0.1, 0.1, ACCENT_GLOW, 'emissive');
  }

  const headMesh = headAsm.build(materials, { cloneMaterials: true });
  collectFlash(headMesh);
  headGroup.add(headMesh);
  torsoGroup.add(headGroup);

  // Articulated Legs
  const buildLeg = (side: -1 | 1) => {
    const g = new THREE.Group();
    g.position.set(side * 0.16, 0.72, 0);
    const asm = new VoxelAssembler();
    asm.boxBottom(0, -0.46, 0, 0.22, 0.46, 0.24, PANTS);
    asm.boxBottom(0, -0.72, 0.04, 0.24, 0.26, 0.32, BOOT);
    const m = asm.build(materials, { cloneMaterials: true });
    collectFlash(m);
    g.add(m);
    return g;
  };
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  bodyPivot.add(leftLeg, rightLeg);

  // Left Support Arm
  const leftArm = new THREE.Group();
  leftArm.position.set(0.38, 0.46, 0);
  const laAsm = new VoxelAssembler();
  laAsm.boxBottom(0, -0.34, 0, 0.18, 0.38, 0.2, JACKET);
  laAsm.boxBottom(0, -0.46, 0, 0.16, 0.14, 0.18, HELMET_RIM, 'metal');
  const laMesh = laAsm.build(materials, { cloneMaterials: true });
  collectFlash(laMesh);
  leftArm.add(laMesh);
  torsoGroup.add(leftArm);

  // Right Weapon Arm
  const rightArm = new THREE.Group();
  rightArm.position.set(-0.46, 0.44, 0.08);
  const raAsm = new VoxelAssembler();
  raAsm.boxBottom(0, -0.14, 0.12, 0.19, 0.21, 0.36, JACKET);
  raAsm.boxBottom(0, -0.14, 0.32, 0.17, 0.17, 0.14, HELMET_RIM, 'metal');
  const raMesh = raAsm.build(materials, { cloneMaterials: true });
  collectFlash(raMesh);
  rightArm.add(raMesh);

  const weaponRigs = buildDetailedWeapons(materials, loadout);
  weaponRigs.pulse.root.scale.setScalar(1.12);
  weaponRigs.scatter.root.scale.setScalar(1.12);
  weaponRigs.rail.root.scale.setScalar(1.12);
  weaponRigs.rpg.root.scale.setScalar(1.12);
  weaponRigs.katana.root.scale.setScalar(1.12);
  rightArm.add(
    weaponRigs.pulse.root,
    weaponRigs.scatter.root,
    weaponRigs.rail.root,
    weaponRigs.rpg.root,
    weaponRigs.katana.root,
  );

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, -0.09, weaponRigs.pulse.muzzleOffsetZ * 1.12);
  rightArm.add(muzzlePoint);

  const ejectPoint = new THREE.Object3D();
  ejectPoint.position.copy(weaponRigs.pulse.ejectOffset);
  rightArm.add(ejectPoint);

  const muzzleFlash = buildMuzzleFlashMesh(tracerOpt.hex);
  muzzlePoint.add(muzzleFlash);

  torsoGroup.add(rightArm);

  const contactShadow = createContactShadowMesh(0.58, materials.contactShadow);
  root.add(contactShadow);

  return {
    root,
    bodyPivot,
    torsoGroup,
    headGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    weaponRigs,
    muzzlePoint,
    ejectPoint,
    muzzleFlash,
    thrusterFlame,
    contactShadow,
    flashMaterials,
  };
}

export interface EnemyMeshBundle {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLimb: THREE.Group;
  rightLimb: THREE.Group;
  flashMaterials: THREE.MeshStandardMaterial[];
  hpBarBg: THREE.Mesh;
  hpBarFill: THREE.Mesh;
  telegraphRing: THREE.Mesh;
}

/**
 * Builds either 5 distinct Micro-Voxel Mecha OR 5 terrifying Micro-Voxel Zombie archetypes
 * depending on the active GameMode!
 */
export function buildEnemyRig(
  archetype: EnemyArchetype,
  materials: SharedVoxelMaterials,
  mode: GameMode = 'mecha',
): EnemyMeshBundle {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  const collectFlash = (g: THREE.Group) => {
    g.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = (obj as THREE.Mesh).material;
        if (m instanceof THREE.MeshStandardMaterial && obj.userData.voxelBucket !== 'emissive') {
          flashMaterials.push(m);
        }
      }
    });
  };

  const leftLimb = new THREE.Group();
  const rightLimb = new THREE.Group();

  let shadowRadius = 0.6;
  let hpBarY = 1.9;
  let ringRadius = 1.1;
  let ringColor = 0xff4d3b;

  if (mode === 'zombies') {
    const ROT_SKIN = 0x6f8260;
    const PALE_SKIN = 0x879476;
    const DARK_BLOOD = 0x7d1414;
    const FRESH_BLOOD = 0xb81d1d;

    if (archetype === 'rusher') {
      // Infected Sprinter: torn crimson-stained hoodie, feral jaw, outstretched claws
      const bodyAsm = new VoxelAssembler();
      bodyAsm.boxBottom(0, 0.56, 0.04, 0.54, 0.56, 0.34, 0x3b353a); // torn hoodie
      bodyAsm.boxBottom(0.06, 0.68, 0.22, 0.26, 0.24, 0.06, DARK_BLOOD); // bloodstain
      bodyAsm.boxBottom(-0.1, 0.88, 0.21, 0.14, 0.14, 0.06, FRESH_BLOOD);
      // Outstretched clawed arms reaching forward
      bodyAsm.boxBottom(-0.36, 0.86, 0.34, 0.16, 0.16, 0.56, ROT_SKIN);
      bodyAsm.boxBottom(0.36, 0.84, 0.38, 0.16, 0.16, 0.58, ROT_SKIN);
      bodyAsm.boxBottom(-0.36, 0.84, 0.62, 0.15, 0.14, 0.12, FRESH_BLOOD);
      bodyAsm.boxBottom(0.36, 0.82, 0.66, 0.15, 0.14, 0.12, FRESH_BLOOD);
      // Hunched rotten head + glowing feral red eyes + dark jaw
      bodyAsm.boxBottom(0, 1.12, 0.12, 0.44, 0.42, 0.42, ROT_SKIN);
      bodyAsm.boxBottom(0, 1.14, 0.34, 0.24, 0.12, 0.05, 0x260909);
      bodyAsm.boxBottom(-0.1, 1.32, 0.34, 0.09, 0.08, 0.04, 0xff2b2b, 'emissive');
      bodyAsm.boxBottom(0.1, 1.32, 0.34, 0.09, 0.08, 0.04, 0xff2b2b, 'emissive');
      const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
      collectFlash(bodyMesh);
      bodyGroup.add(bodyMesh);

      const legL = new VoxelAssembler().boxBottom(0, -0.56, 0, 0.2, 0.56, 0.22, 0x23252b).build(materials, { cloneMaterials: true });
      const legR = new VoxelAssembler().boxBottom(0, -0.56, 0, 0.2, 0.56, 0.22, 0x23252b).build(materials, { cloneMaterials: true });
      collectFlash(legL);
      collectFlash(legR);
      leftLimb.position.set(-0.15, 0.56, 0);
      rightLimb.position.set(0.15, 0.56, 0);
      leftLimb.add(legL);
      rightLimb.add(legR);
      bodyGroup.add(leftLimb, rightLimb);

      shadowRadius = 0.55;
      hpBarY = 1.95;
      ringRadius = 1.05;
      ringColor = 0xd92626;
    } else if (archetype === 'trooper') {
      // Station Walker: decaying Japanese commuter in torn suit & bloody shirt, outstretched arms
      const bodyAsm = new VoxelAssembler();
      bodyAsm.boxBottom(0, 0.62, 0, 0.58, 0.62, 0.38, 0x2a3545); // tattered navy suit
      bodyAsm.boxBottom(0, 0.72, 0.2, 0.22, 0.42, 0.06, 0xc8c4b8); // dirty shirt
      bodyAsm.boxBottom(0, 0.78, 0.23, 0.08, 0.28, 0.04, 0x8a1f1f); // crooked tie
      bodyAsm.boxBottom(-0.12, 0.68, 0.22, 0.18, 0.18, 0.05, DARK_BLOOD);
      // Shambling outstretched arms
      bodyAsm.boxBottom(-0.38, 0.94, 0.34, 0.17, 0.17, 0.58, 0x2a3545);
      bodyAsm.boxBottom(0.38, 0.9, 0.3, 0.17, 0.17, 0.54, 0x2a3545);
      bodyAsm.boxBottom(-0.38, 0.94, 0.66, 0.15, 0.15, 0.14, PALE_SKIN);
      bodyAsm.boxBottom(0.38, 0.9, 0.6, 0.15, 0.15, 0.14, PALE_SKIN);
      // Rotten commuter head + messy dark hair + sickly pale-amber eyes
      bodyAsm.boxBottom(0, 1.24, 0.04, 0.46, 0.46, 0.44, PALE_SKIN);
      bodyAsm.boxBottom(0, 1.64, 0.02, 0.48, 0.12, 0.46, 0x1d1a18);
      bodyAsm.boxBottom(-0.1, 1.44, 0.27, 0.09, 0.07, 0.04, 0xffe066, 'emissive');
      bodyAsm.boxBottom(0.1, 1.44, 0.27, 0.09, 0.07, 0.04, 0xffe066, 'emissive');
      bodyAsm.boxBottom(0, 1.3, 0.27, 0.22, 0.08, 0.04, DARK_BLOOD);
      const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
      collectFlash(bodyMesh);
      bodyGroup.add(bodyMesh);

      const legL = new VoxelAssembler().boxBottom(0, -0.62, 0, 0.22, 0.62, 0.24, 0x222933).build(materials, { cloneMaterials: true });
      const legR = new VoxelAssembler().boxBottom(0, -0.62, 0, 0.22, 0.62, 0.24, 0x222933).build(materials, { cloneMaterials: true });
      collectFlash(legL);
      collectFlash(legR);
      leftLimb.position.set(-0.17, 0.62, 0);
      rightLimb.position.set(0.17, 0.62, 0);
      leftLimb.add(legL);
      rightLimb.add(legR);
      bodyGroup.add(leftLimb, rightLimb);

      shadowRadius = 0.62;
      hpBarY = 2.1;
      ringRadius = 1.1;
      ringColor = 0xe86b2e;
    } else if (archetype === 'charger') {
      // Hulk Brute: towering mutated railway worker in torn orange hi-vis vest & bloodied arms
      const bodyAsm = new VoxelAssembler();
      bodyAsm.boxBottom(0, 0.78, 0, 1.18, 0.96, 0.78, 0x5c6e4e);
      bodyAsm.boxBottom(0, 0.84, 0.36, 0.92, 0.72, 0.14, 0xd46224); // torn hi-vis vest
      bodyAsm.boxBottom(0, 1.04, 0.44, 0.88, 0.14, 0.06, 0xe8e066); // reflective stripe
      bodyAsm.boxBottom(0.18, 0.86, 0.45, 0.34, 0.32, 0.06, DARK_BLOOD);
      // Massive asymmetrical hulk arms
      bodyAsm.boxBottom(-0.78, 0.92, 0.22, 0.38, 0.86, 0.42, ROT_SKIN);
      bodyAsm.boxBottom(0.78, 0.86, 0.26, 0.42, 0.92, 0.46, ROT_SKIN);
      bodyAsm.boxBottom(0.78, 0.86, 0.48, 0.34, 0.3, 0.12, FRESH_BLOOD);
      // Brutish sunken head + cracked yellow hardhat + blazing red eyes
      bodyAsm.boxBottom(0, 1.72, 0.14, 0.6, 0.52, 0.56, 0x627355);
      bodyAsm.boxBottom(0, 2.16, 0.12, 0.66, 0.18, 0.62, 0xd9a82b); // hardhat
      bodyAsm.boxBottom(-0.14, 1.96, 0.43, 0.12, 0.09, 0.05, 0xff3024, 'emissive');
      bodyAsm.boxBottom(0.14, 1.96, 0.43, 0.12, 0.09, 0.05, 0xff3024, 'emissive');
      const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
      collectFlash(bodyMesh);
      bodyGroup.add(bodyMesh);

      const legL = new VoxelAssembler().boxBottom(0, -0.78, 0, 0.38, 0.78, 0.42, 0x2b2d30).build(materials, { cloneMaterials: true });
      const legR = new VoxelAssembler().boxBottom(0, -0.78, 0, 0.38, 0.78, 0.42, 0x2b2d30).build(materials, { cloneMaterials: true });
      collectFlash(legL);
      collectFlash(legR);
      leftLimb.position.set(-0.34, 0.78, 0);
      rightLimb.position.set(0.34, 0.78, 0);
      leftLimb.add(legL);
      rightLimb.add(legR);
      bodyGroup.add(leftLimb, rightLimb);

      shadowRadius = 0.95;
      hpBarY = 2.68;
      ringRadius = 1.65;
      ringColor = 0xff3b24;
    } else if (archetype === 'drone') {
      // Acid Spitter: toxic glowing lime-green mutant stalker with glowing bile sacs
      const bodyAsm = new VoxelAssembler();
      bodyAsm.boxBottom(0, 0.62, 0, 0.68, 0.66, 0.58, 0x3b5234);
      // Glowing toxic acid sacs along back & belly
      bodyAsm.boxBottom(0, 0.88, -0.28, 0.48, 0.42, 0.24, 0x8cf536, 'emissive');
      bodyAsm.boxBottom(-0.26, 0.72, 0.24, 0.22, 0.22, 0.18, 0x7be02c, 'emissive');
      bodyAsm.boxBottom(0.24, 0.84, 0.24, 0.2, 0.2, 0.16, 0x7be02c, 'emissive');
      // Swollen toxic head & glowing acid maw
      bodyAsm.boxBottom(0, 1.28, 0.1, 0.48, 0.46, 0.46, 0x557348);
      bodyAsm.boxBottom(0, 1.32, 0.34, 0.28, 0.16, 0.06, 0xa8ff42, 'emissive');
      bodyAsm.boxBottom(-0.12, 1.54, 0.33, 0.09, 0.08, 0.05, 0xfff566, 'emissive');
      bodyAsm.boxBottom(0.12, 1.54, 0.33, 0.09, 0.08, 0.05, 0xfff566, 'emissive');
      const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
      collectFlash(bodyMesh);
      bodyGroup.add(bodyMesh);

      const legL = new VoxelAssembler().boxBottom(0, -0.62, 0, 0.22, 0.62, 0.26, 0x2b3626).build(materials, { cloneMaterials: true });
      const legR = new VoxelAssembler().boxBottom(0, -0.62, 0, 0.22, 0.62, 0.26, 0x2b3626).build(materials, { cloneMaterials: true });
      collectFlash(legL);
      collectFlash(legR);
      leftLimb.position.set(-0.22, 0.62, 0);
      rightLimb.position.set(0.22, 0.62, 0);
      leftLimb.add(legL);
      rightLimb.add(legR);
      bodyGroup.add(leftLimb, rightLimb);

      shadowRadius = 0.72;
      hpBarY = 2.15;
      ringRadius = 1.25;
      ringColor = 0x8cf536;
    } else {
      // BOSS: Alpha Nemesis Tyrant (towering bio-horror in tattered black trenchcoat, glowing crimson heart core, bone claws!)
      const bodyAsm = new VoxelAssembler();
      bodyAsm.boxBottom(0, 1.15, 0, 1.62, 1.48, 1.12, 0x1e1d22); // dark leather trenchcoat
      // Exposed glowing crimson mutated heart & ribcage
      bodyAsm.boxBottom(0, 1.52, 0.56, 0.76, 0.68, 0.16, 0x6e1414);
      bodyAsm.boxBottom(0, 1.66, 0.65, 0.42, 0.42, 0.1, 0xff2b38, 'emissive');
      // Huge mutated asymmetric shoulders & clawed bone-blade arms
      bodyAsm.boxBottom(-1.06, 1.38, 0.18, 0.5, 1.16, 0.56, 0x2a2428);
      bodyAsm.boxBottom(1.08, 1.24, 0.26, 0.58, 1.32, 0.62, 0x732121);
      bodyAsm.boxBottom(1.12, 1.12, 0.88, 0.26, 0.26, 0.78, 0xe8dfd0); // giant bone claw!
      bodyAsm.boxBottom(1.12, 1.12, 1.24, 0.28, 0.22, 0.24, FRESH_BLOOD);
      // Stitched tyrant skull head + blazing crimson eyes
      bodyAsm.boxBottom(0, 2.64, 0.12, 0.76, 0.72, 0.72, 0x7a8070);
      bodyAsm.boxBottom(0, 2.72, 0.49, 0.48, 0.22, 0.08, 0x2b0a0a);
      bodyAsm.boxBottom(-0.18, 3.02, 0.49, 0.16, 0.12, 0.06, 0xff2626, 'emissive');
      bodyAsm.boxBottom(0.18, 3.02, 0.49, 0.16, 0.12, 0.06, 0xff2626, 'emissive');
      const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
      collectFlash(bodyMesh);
      bodyGroup.add(bodyMesh);

      const legL = new VoxelAssembler().boxBottom(0, -1.15, 0, 0.5, 1.15, 0.56, 0x1b1a1f).build(materials, { cloneMaterials: true });
      const legR = new VoxelAssembler().boxBottom(0, -1.15, 0, 0.5, 1.15, 0.56, 0x1b1a1f).build(materials, { cloneMaterials: true });
      collectFlash(legL);
      collectFlash(legR);
      leftLimb.position.set(-0.48, 1.15, 0);
      rightLimb.position.set(0.48, 1.15, 0);
      leftLimb.add(legL);
      rightLimb.add(legR);
      bodyGroup.add(leftLimb, rightLimb);

      shadowRadius = 1.48;
      hpBarY = 4.05;
      ringRadius = 2.45;
      ringColor = 0xff2626;
    }
  } else if (archetype === 'rusher') {
    // Kitsune Rusher Mecha
    const bodyAsm = new VoxelAssembler();
    bodyAsm.boxBottom(0, 0.55, 0, 0.58, 0.54, 0.42, 0xd43838);
    bodyAsm.boxBottom(0, 0.65, 0.2, 0.36, 0.28, 0.08, 0xf2ebe0);
    bodyAsm.boxBottom(0, 1.09, 0.06, 0.52, 0.42, 0.48, 0xf5efe6);
    bodyAsm.boxBottom(-0.18, 1.5, 0.04, 0.14, 0.24, 0.14, 0xd43838);
    bodyAsm.boxBottom(0.18, 1.5, 0.04, 0.14, 0.24, 0.14, 0xd43838);
    bodyAsm.boxBottom(0, 1.2, 0.31, 0.38, 0.12, 0.06, 0xff2f45, 'emissive');
    bodyAsm.boxBottom(0, 0.64, -0.34, 0.18, 0.22, 0.34, 0xff6b4a);
    const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
    collectFlash(bodyMesh);
    bodyGroup.add(bodyMesh);

    const legL = new VoxelAssembler().boxBottom(0, -0.55, 0, 0.2, 0.55, 0.24, 0x2a2528).build(materials, { cloneMaterials: true });
    const legR = new VoxelAssembler().boxBottom(0, -0.55, 0, 0.2, 0.55, 0.24, 0x2a2528).build(materials, { cloneMaterials: true });
    collectFlash(legL);
    collectFlash(legR);
    leftLimb.position.set(-0.17, 0.55, 0);
    rightLimb.position.set(0.17, 0.55, 0);
    leftLimb.add(legL);
    rightLimb.add(legR);
    bodyGroup.add(leftLimb, rightLimb);

    shadowRadius = 0.55;
    hpBarY = 2.0;
    ringRadius = 1.05;
    ringColor = 0xff3c4c;
  } else if (archetype === 'trooper') {
    // Tanuki Gunner Mecha
    const bodyAsm = new VoxelAssembler();
    bodyAsm.boxBottom(0, 0.62, 0, 0.66, 0.62, 0.46, 0x526b48);
    bodyAsm.boxBottom(0, 0.68, 0.22, 0.44, 0.34, 0.1, 0xd99b38);
    bodyAsm.boxBottom(0, 1.24, 0, 0.5, 0.36, 0.48, 0x2b3036, 'metal');
    bodyAsm.boxBottom(0, 1.34, 0.25, 0.36, 0.11, 0.06, 0xffb830, 'emissive');
    bodyAsm.boxBottom(0, 1.56, 0, 0.98, 0.12, 0.98, 0xc2984f);
    bodyAsm.boxBottom(0, 1.68, 0, 0.58, 0.12, 0.58, 0xa87e3c);
    bodyAsm.boxBottom(0.42, 0.88, 0.32, 0.18, 0.22, 0.72, 0x333940, 'metal');
    bodyAsm.boxBottom(0.42, 0.92, 0.68, 0.14, 0.12, 0.12, 0xffae34, 'emissive');
    const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
    collectFlash(bodyMesh);
    bodyGroup.add(bodyMesh);

    const legL = new VoxelAssembler().boxBottom(0, -0.62, 0, 0.22, 0.62, 0.26, 0x2d332d).build(materials, { cloneMaterials: true });
    const legR = new VoxelAssembler().boxBottom(0, -0.62, 0, 0.22, 0.62, 0.26, 0x2d332d).build(materials, { cloneMaterials: true });
    collectFlash(legL);
    collectFlash(legR);
    leftLimb.position.set(-0.2, 0.62, 0);
    rightLimb.position.set(0.2, 0.62, 0);
    leftLimb.add(legL);
    rightLimb.add(legR);
    bodyGroup.add(leftLimb, rightLimb);

    shadowRadius = 0.65;
    hpBarY = 2.15;
    ringRadius = 1.1;
    ringColor = 0xffae34;
  } else if (archetype === 'charger') {
    // Oni Charger Mecha
    const bodyAsm = new VoxelAssembler();
    bodyAsm.boxBottom(0, 0.75, 0, 1.18, 0.92, 0.88, 0x2d2b35, 'metal');
    bodyAsm.boxBottom(-0.68, 1.12, 0.08, 0.34, 0.48, 0.68, 0xb83728);
    bodyAsm.boxBottom(0.68, 1.12, 0.08, 0.34, 0.48, 0.68, 0xb83728);
    bodyAsm.boxBottom(0, 1.0, 0.45, 0.48, 0.36, 0.08, 0xff6e24, 'emissive');
    bodyAsm.boxBottom(0, 1.66, 0.14, 0.66, 0.48, 0.56, 0x222029, 'metal');
    bodyAsm.boxBottom(-0.32, 2.02, 0.32, 0.16, 0.36, 0.16, 0xf2c95c, 'metal');
    bodyAsm.boxBottom(0.32, 2.02, 0.32, 0.16, 0.36, 0.16, 0xf2c95c, 'metal');
    bodyAsm.boxBottom(0, 1.82, 0.43, 0.44, 0.12, 0.06, 0xff4c24, 'emissive');
    const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
    collectFlash(bodyMesh);
    bodyGroup.add(bodyMesh);

    const legL = new VoxelAssembler().boxBottom(0, -0.75, 0, 0.36, 0.75, 0.42, 0x222028).build(materials, { cloneMaterials: true });
    const legR = new VoxelAssembler().boxBottom(0, -0.75, 0, 0.36, 0.75, 0.42, 0x222028).build(materials, { cloneMaterials: true });
    collectFlash(legL);
    collectFlash(legR);
    leftLimb.position.set(-0.34, 0.75, 0);
    rightLimb.position.set(0.34, 0.75, 0);
    leftLimb.add(legL);
    rightLimb.add(legR);
    bodyGroup.add(leftLimb, rightLimb);

    shadowRadius = 0.95;
    hpBarY = 2.65;
    ringRadius = 1.6;
    ringColor = 0xff6e24;
  } else if (archetype === 'drone') {
    // Tengu Hover Drone Mecha
    const bodyAsm = new VoxelAssembler();
    bodyAsm.boxBottom(0, 1.65, 0, 0.68, 0.52, 0.68, 0x4b3869, 'metal');
    bodyAsm.boxBottom(0, 1.78, 0.35, 0.4, 0.24, 0.1, 0x1c1528, 'metal');
    bodyAsm.boxBottom(0, 1.84, 0.4, 0.24, 0.12, 0.06, 0xe85cff, 'emissive');
    bodyAsm.boxBottom(0, 1.44, 0, 0.38, 0.22, 0.38, 0x38e8ff, 'emissive');
    const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
    collectFlash(bodyMesh);
    bodyGroup.add(bodyMesh);

    const wingL = new VoxelAssembler()
      .boxBottom(-0.42, 0, 0, 0.76, 0.12, 0.44, 0x7658b8, 'metal')
      .boxBottom(-0.68, 0.1, 0, 0.26, 0.08, 0.26, 0xe85cff, 'emissive')
      .build(materials, { cloneMaterials: true });
    const wingR = new VoxelAssembler()
      .boxBottom(0.42, 0, 0, 0.76, 0.12, 0.44, 0x7658b8, 'metal')
      .boxBottom(0.68, 0.1, 0, 0.26, 0.08, 0.26, 0xe85cff, 'emissive')
      .build(materials, { cloneMaterials: true });
    collectFlash(wingL);
    collectFlash(wingR);
    leftLimb.position.set(-0.34, 1.92, 0);
    rightLimb.position.set(0.34, 1.92, 0);
    leftLimb.add(wingL);
    rightLimb.add(wingR);
    bodyGroup.add(leftLimb, rightLimb);

    shadowRadius = 0.68;
    hpBarY = 2.65;
    ringRadius = 1.15;
    ringColor = 0xe85cff;
  } else {
    // BOSS: Shogun Mk-IV Mecha
    const bodyAsm = new VoxelAssembler();
    bodyAsm.boxBottom(0, 1.15, 0, 1.72, 1.38, 1.24, 0x24262e, 'metal');
    bodyAsm.boxBottom(0, 1.28, 0.56, 1.38, 0.96, 0.2, 0xa82424);
    bodyAsm.boxBottom(0, 1.62, 0.68, 0.64, 0.36, 0.1, 0xffc845, 'emissive');
    bodyAsm.boxBottom(-1.08, 1.62, 0, 0.48, 0.92, 0.98, 0x9c2222);
    bodyAsm.boxBottom(-1.12, 1.82, 0, 0.52, 0.16, 1.02, 0xe8b948, 'metal');
    bodyAsm.boxBottom(1.08, 1.62, 0, 0.48, 0.92, 0.98, 0x9c2222);
    bodyAsm.boxBottom(1.12, 1.82, 0, 0.52, 0.16, 1.02, 0xe8b948, 'metal');
    bodyAsm.boxBottom(-1.1, 2.02, 0.54, 0.32, 0.32, 1.15, 0x353b45, 'metal');
    bodyAsm.boxBottom(1.1, 2.02, 0.54, 0.32, 0.32, 1.15, 0x353b45, 'metal');
    bodyAsm.boxBottom(-1.1, 2.06, 1.12, 0.24, 0.24, 0.1, 0xff5238, 'emissive');
    bodyAsm.boxBottom(1.1, 2.06, 1.12, 0.24, 0.24, 0.1, 0xff5238, 'emissive');
    bodyAsm.boxBottom(0, 2.52, 0.08, 0.88, 0.68, 0.84, 0x20222a, 'metal');
    bodyAsm.boxBottom(0, 2.74, 0.51, 0.58, 0.16, 0.08, 0xff3d3d, 'emissive');
    bodyAsm.boxBottom(0, 3.16, 0.36, 1.48, 0.22, 0.16, 0xf2c641, 'metal');
    bodyAsm.boxBottom(-0.66, 3.32, 0.36, 0.22, 0.36, 0.16, 0xf2c641, 'metal');
    bodyAsm.boxBottom(0.66, 3.32, 0.36, 0.22, 0.36, 0.16, 0xf2c641, 'metal');
    const bodyMesh = bodyAsm.build(materials, { cloneMaterials: true });
    collectFlash(bodyMesh);
    bodyGroup.add(bodyMesh);

    const legL = new VoxelAssembler()
      .boxBottom(0, -1.15, 0, 0.52, 1.15, 0.62, 0x262932, 'metal')
      .boxBottom(0, -0.82, 0.3, 0.44, 0.44, 0.14, 0xa82424)
      .build(materials, { cloneMaterials: true });
    const legR = new VoxelAssembler()
      .boxBottom(0, -1.15, 0, 0.52, 1.15, 0.62, 0x262932, 'metal')
      .boxBottom(0, -0.82, 0.3, 0.44, 0.44, 0.14, 0xa82424)
      .build(materials, { cloneMaterials: true });
    collectFlash(legL);
    collectFlash(legR);
    leftLimb.position.set(-0.5, 1.15, 0);
    rightLimb.position.set(0.5, 1.15, 0);
    leftLimb.add(legL);
    rightLimb.add(legR);
    bodyGroup.add(leftLimb, rightLimb);

    shadowRadius = 1.45;
    hpBarY = 4.1;
    ringRadius = 2.4;
    ringColor = 0xff4433;
  }

  root.add(createContactShadowMesh(shadowRadius, materials.contactShadow));

  const barWidth = archetype === 'shogun' ? 2.1 : 1.05;
  const hpBgGeo = new THREE.PlaneGeometry(barWidth, 0.13);
  const hpBgMat = new THREE.MeshBasicMaterial({
    color: 0x1a1410,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.82,
  });
  const hpBarBg = new THREE.Mesh(hpBgGeo, hpBgMat);
  hpBarBg.position.set(0, hpBarY, 0);
  hpBarBg.visible = false;
  root.add(hpBarBg);

  const hpFillGeo = new THREE.PlaneGeometry(barWidth - 0.06, 0.08);
  const hpFillMat = new THREE.MeshBasicMaterial({
    color: mode === 'zombies' ? 0xd92b2b : archetype === 'shogun' ? 0xff4e3b : 0xff9b38,
    side: THREE.DoubleSide,
  });
  const hpBarFill = new THREE.Mesh(hpFillGeo, hpFillMat);
  hpBarFill.position.set(0, 0, 0.01);
  hpBarBg.add(hpBarFill);

  const ringGeo = new THREE.RingGeometry(ringRadius * 0.72, ringRadius, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: ringColor,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const telegraphRing = new THREE.Mesh(ringGeo, ringMat);
  telegraphRing.position.y = 0.06;
  root.add(telegraphRing);

  return {
    root,
    bodyGroup,
    leftLimb,
    rightLimb,
    flashMaterials,
    hpBarBg,
    hpBarFill,
    telegraphRing,
  };
}

let _cachedHeadlightBeamTex: THREE.CanvasTexture | null = null;
function getSoftHeadlightBeamTexture(): THREE.CanvasTexture {
  if (_cachedHeadlightBeamTex) return _cachedHeadlightBeamTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Smooth quadratic longitudinal falloff along the beam (Y: 0 at bulb apex to 256 at far end)
  // Three.js ConeGeometry UV: apex is uv.y = 1 (top of canvas y = 0), base is uv.y = 0 (bottom y = 256)
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.75)');
  grad.addColorStop(0.08, 'rgba(255, 255, 255, 0.58)');
  grad.addColorStop(0.22, 'rgba(255, 255, 255, 0.32)');
  grad.addColorStop(0.48, 'rgba(255, 255, 255, 0.12)');
  grad.addColorStop(0.78, 'rgba(255, 255, 255, 0.03)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  _cachedHeadlightBeamTex = new THREE.CanvasTexture(canvas);
  return _cachedHeadlightBeamTex;
}

let _cachedHeadlightRoadTex: THREE.CanvasTexture | null = null;
function getSoftHeadlightRoadTexture(): THREE.CanvasTexture {
  if (_cachedHeadlightRoadTex) return _cachedHeadlightRoadTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Soft forward-projected elliptical beam on road asphalt
  const grad = ctx.createRadialGradient(64, 70, 8, 64, 115, 95);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.65)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.35)');
  grad.addColorStop(0.62, 'rgba(255, 255, 255, 0.09)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  _cachedHeadlightRoadTex = new THREE.CanvasTexture(canvas);
  return _cachedHeadlightRoadTex;
}

/**
 * Builds 5 distinct drivable micro-voxel vehicles with articulated steering front wheels,
 * spinning rear/front tires, visible seated K-04 driver inside the cab, and nitro exhaust flames!
 */
export function buildDrivableVehicleRig(
  kind: VehicleKind,
  materials: SharedVoxelMaterials,
): DrivableVehicleRig {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);

  const vb = new VoxelAssembler();
  const TIRE = 0x1b1e22;
  const HUB = 0xb8c0c8;
  const GLASS = 0x26384a;
  const HEADLIGHT = 0xfff3c4;
  const TAILLIGHT = 0xf03830;

  let wheelZFront = 1.1;
  let wheelZRear = -1.1;
  let wheelX = 0.84;
  let wheelSize = 0.66;
  let driverY = 0.96;
  let driverZ = 0.72;
  let exhaustZ = -1.92;
  let headlightZ = 1.95;

  if (kind === 'kei_truck') {
    const BODY = 0xf2f0ea;
    const TRIM = 0x3b4856;
    vb.boxBottom(0, 0.3, 0, 1.7, 0.26, 3.7, TRIM, 'metal');
    vb.boxBottom(0, 0.56, 1.04, 1.72, 0.72, 1.56, BODY);
    vb.boxBottom(0, 1.28, 0.86, 1.58, 0.74, 1.2, BODY);
    vb.boxBottom(0, 2.02, 0.86, 1.46, 0.1, 1.08, 0xe2dfd7);
    vb.boxBottom(0, 1.34, 1.47, 1.36, 0.52, 0.08, GLASS, 'metal');
    vb.boxBottom(-0.8, 1.36, 0.9, 0.08, 0.46, 0.74, GLASS, 'metal');
    vb.boxBottom(0.8, 1.36, 0.9, 0.08, 0.46, 0.74, GLASS, 'metal');
    vb.boxBottom(0, 0.54, 1.86, 1.76, 0.24, 0.14, TRIM, 'metal');
    vb.boxBottom(0, 0.8, 1.84, 0.78, 0.24, 0.08, 0x33383e, 'metal');
    vb.boxBottom(-0.58, 0.84, 1.85, 0.32, 0.22, 0.08, HEADLIGHT, 'emissive');
    vb.boxBottom(0.58, 0.84, 1.85, 0.32, 0.22, 0.08, HEADLIGHT, 'emissive');
    vb.boxBottom(0, 0.56, 1.94, 0.42, 0.18, 0.04, 0xf2c641);
    // Flatbed + stacked wooden crates
    vb.boxBottom(0, 0.56, -0.82, 1.72, 0.2, 1.98, BODY);
    vb.boxBottom(-0.8, 0.76, -0.82, 0.12, 0.44, 1.98, BODY);
    vb.boxBottom(0.8, 0.76, -0.82, 0.12, 0.44, 1.98, BODY);
    vb.boxBottom(0, 0.76, -1.78, 1.72, 0.44, 0.12, BODY);
    vb.boxBottom(-0.62, 0.58, -1.86, 0.26, 0.18, 0.06, TAILLIGHT, 'emissive');
    vb.boxBottom(0.62, 0.58, -1.86, 0.26, 0.18, 0.06, TAILLIGHT, 'emissive');
    vb.boxBottom(-0.24, 0.76, -0.45, 0.85, 0.72, 0.85, 0x8e5c34);
    vb.boxBottom(0.28, 0.76, -1.25, 0.72, 0.58, 0.72, 0xa26c3e);
    driverY = 1.02;
    driverZ = 0.86;
  } else if (kind === 'olive_jeep') {
    const OLIVE = 0x455a3e;
    const DARK = 0x2e3d2b;
    vb.boxBottom(0, 0.38, 0, 1.78, 0.72, 3.45, OLIVE);
    vb.boxBottom(0, 1.1, -0.22, 1.62, 0.72, 1.72, DARK);
    vb.boxBottom(0, 1.14, 0.65, 1.4, 0.52, 0.1, GLASS, 'metal');
    vb.boxBottom(0, 0.54, 1.74, 1.82, 0.24, 0.16, 0x25282c, 'metal');
    vb.boxBottom(-0.58, 0.78, 1.74, 0.28, 0.24, 0.08, HEADLIGHT, 'emissive');
    vb.boxBottom(0.58, 0.78, 1.74, 0.28, 0.24, 0.08, HEADLIGHT, 'emissive');
    vb.boxBottom(-0.6, 0.68, -1.74, 0.24, 0.18, 0.08, TAILLIGHT, 'emissive');
    vb.boxBottom(0.6, 0.68, -1.74, 0.24, 0.18, 0.08, TAILLIGHT, 'emissive');
    // Rear spare tire
    vb.boxBottom(0, 0.66, -1.84, 0.68, 0.68, 0.26, TIRE);
    wheelX = 0.92;
    wheelSize = 0.76;
    driverY = 0.98;
    driverZ = 0.1;
    exhaustZ = -1.82;
    headlightZ = 1.82;
  } else if (kind === 'aurora_coupe') {
    const BODY = 0x1e2c44;
    const NEON = 0x38e8ff;
    const PINK = 0xff4fd8;
    vb.boxBottom(0, 0.26, 0, 1.86, 0.52, 4.15, BODY, 'metal');
    vb.boxBottom(0, 0.78, -0.12, 1.56, 0.56, 1.9, 0x162033, 'metal');
    vb.boxBottom(0, 0.82, 0.84, 1.4, 0.42, 0.12, GLASS, 'metal');
    // Neon side skirt & underglow strips
    vb.boxBottom(-0.95, 0.3, 0, 0.06, 0.1, 3.2, NEON, 'emissive');
    vb.boxBottom(0.95, 0.3, 0, 0.06, 0.1, 3.2, NEON, 'emissive');
    // Rear racing wing spoiler
    vb.boxBottom(-0.72, 0.78, -1.82, 0.12, 0.44, 0.16, 0x141820, 'metal');
    vb.boxBottom(0.72, 0.78, -1.82, 0.12, 0.44, 0.16, 0x141820, 'metal');
    vb.boxBottom(0, 1.18, -1.86, 1.92, 0.1, 0.38, BODY, 'metal');
    vb.boxBottom(0, 1.24, -2.02, 1.86, 0.05, 0.05, PINK, 'emissive');
    // Sleek cyber LED lightbars
    vb.boxBottom(0, 0.56, 2.09, 1.66, 0.12, 0.08, NEON, 'emissive');
    vb.boxBottom(0, 0.58, -2.09, 1.66, 0.14, 0.08, PINK, 'emissive');
    wheelZFront = 1.28;
    wheelZRear = -1.28;
    wheelX = 0.92;
    wheelSize = 0.62;
    driverY = 0.76;
    driverZ = 0.0;
    exhaustZ = -2.14;
    headlightZ = 2.15;
  } else if (kind === 'fungi_buggy') {
    const BODY = 0x5c3688;
    const LIME = 0x9eff3b;
    const CAGE = 0x262a30;
    vb.boxBottom(0, 0.44, 0, 1.72, 0.48, 3.4, BODY);
    vb.boxBottom(0, 0.92, 0.96, 1.48, 0.24, 0.85, 0x452669);
    // Open off-road rollcage bars
    vb.boxBottom(-0.74, 0.92, 0.5, 0.12, 0.88, 0.12, CAGE, 'metal');
    vb.boxBottom(0.74, 0.92, 0.5, 0.12, 0.88, 0.12, CAGE, 'metal');
    vb.boxBottom(-0.74, 0.92, -0.9, 0.12, 0.88, 0.12, CAGE, 'metal');
    vb.boxBottom(0.74, 0.92, -0.9, 0.12, 0.88, 0.12, CAGE, 'metal');
    vb.boxBottom(0, 1.74, -0.2, 1.6, 0.1, 1.54, CAGE, 'metal');
    // Glowing spore-lime roof lightbar & headlights
    vb.boxBottom(0, 1.84, 0.52, 1.12, 0.16, 0.14, LIME, 'emissive');
    vb.boxBottom(-0.56, 0.78, 1.72, 0.28, 0.2, 0.08, LIME, 'emissive');
    vb.boxBottom(0.56, 0.78, 1.72, 0.28, 0.2, 0.08, LIME, 'emissive');
    vb.boxBottom(-0.56, 0.74, -1.72, 0.28, 0.18, 0.08, TAILLIGHT, 'emissive');
    vb.boxBottom(0.56, 0.74, -1.72, 0.28, 0.18, 0.08, TAILLIGHT, 'emissive');
    wheelX = 0.96;
    wheelSize = 0.84;
    driverY = 0.92;
    driverZ = -0.05;
    exhaustZ = -1.78;
    headlightZ = 1.8;
  } else {
    // snow_patrol (Kopenhime Alpine Rescue Truck)
    const SNOW = 0xe8eff5;
    const RED = 0xd43228;
    const DARK = 0x2b3440;
    vb.boxBottom(0, 0.42, 0, 1.84, 0.72, 3.85, SNOW);
    vb.boxBottom(0, 0.72, 0, 1.88, 0.16, 3.7, RED);
    vb.boxBottom(0, 1.14, 0.24, 1.66, 0.74, 1.86, SNOW);
    vb.boxBottom(0, 1.2, 1.18, 1.44, 0.52, 0.1, GLASS, 'metal');
    // Roof rescue lightbar (red + cyan)
    vb.boxBottom(-0.34, 1.88, 0.42, 0.52, 0.16, 0.2, 0xff3b30, 'emissive');
    vb.boxBottom(0.34, 1.88, 0.42, 0.52, 0.16, 0.2, 0x45f2ff, 'emissive');
    // Heavy front alpine snow bumper
    vb.boxBottom(0, 0.34, 2.02, 2.02, 0.42, 0.28, DARK, 'metal');
    vb.boxBottom(-0.62, 0.88, 1.94, 0.34, 0.22, 0.08, HEADLIGHT, 'emissive');
    vb.boxBottom(0.62, 0.88, 1.94, 0.34, 0.22, 0.08, HEADLIGHT, 'emissive');
    vb.boxBottom(-0.62, 0.72, -1.94, 0.28, 0.2, 0.08, TAILLIGHT, 'emissive');
    vb.boxBottom(0.62, 0.72, -1.94, 0.28, 0.2, 0.08, TAILLIGHT, 'emissive');
    wheelX = 0.96;
    wheelSize = 0.82;
    driverY = 1.06;
    driverZ = 0.35;
    exhaustZ = -1.98;
    headlightZ = 2.05;
  }

  chassis.add(vb.build(materials));

  // Build 4 articulated wheels (front 2 steer + spin, rear 2 spin)
  const frontWheelSteerPivots: THREE.Group[] = [];
  const wheelSpinMeshes: THREE.Group[] = [];
  const wheelSpecs: Array<{ x: number; z: number; isFront: boolean }> = [
    { x: -wheelX, z: wheelZFront, isFront: true },
    { x: wheelX, z: wheelZFront, isFront: true },
    { x: -wheelX, z: wheelZRear, isFront: false },
    { x: wheelX, z: wheelZRear, isFront: false },
  ];

  for (const w of wheelSpecs) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(w.x, wheelSize * 0.5, w.z);
    const spinGroup = new THREE.Group();
    const wAsm = new VoxelAssembler();
    wAsm.boxBottom(0, -wheelSize * 0.5, 0, 0.34, wheelSize, wheelSize, TIRE);
    wAsm.boxBottom(
      w.x > 0 ? 0.14 : -0.14,
      -wheelSize * 0.22,
      0,
      0.1,
      wheelSize * 0.44,
      wheelSize * 0.44,
      HUB,
      'metal',
    );
    // Tread bar detail so wheel spinning is unmistakably visible
    wAsm.boxBottom(0, -wheelSize * 0.52, 0, 0.36, 0.1, 0.14, 0x353a42);
    wAsm.boxBottom(0, wheelSize * 0.42, 0, 0.36, 0.1, 0.14, 0x353a42);
    spinGroup.add(wAsm.build(materials));
    steerPivot.add(spinGroup);
    root.add(steerPivot);

    if (w.isFront) {
      frontWheelSteerPivots.push(steerPivot);
    }
    wheelSpinMeshes.push(spinGroup);
  }

  // Visible seated K-04 driver inside the cab (toggled visible when player enters car!)
  const driverSeat = new THREE.Group();
  driverSeat.position.set(-0.26, driverY, driverZ);
  const dAsm = new VoxelAssembler();
  dAsm.boxBottom(0, 0, 0, 0.42, 0.36, 0.3, 0xe87a2e);
  dAsm.boxBottom(0, 0.36, 0, 0.46, 0.38, 0.42, 0xede8dc);
  dAsm.boxBottom(0, 0.46, 0.2, 0.34, 0.18, 0.06, 0x45f2ff, 'emissive');
  driverSeat.add(dAsm.build(materials));
  driverSeat.visible = false;
  chassis.add(driverSeat);

  // Twin Nitro Exhaust Flames (shown when pressing Shift boost!)
  const nitroFlame = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x45f2ff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flameCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const jetGeo = new THREE.BoxGeometry(0.18, 0.18, 0.95);
  const coreGeo = new THREE.BoxGeometry(0.1, 0.1, 0.55);
  for (const ex of [-0.42, 0.42]) {
    const jet = new THREE.Mesh(jetGeo, flameMat);
    jet.position.set(ex, 0.38, exhaustZ - 0.45);
    const core = new THREE.Mesh(coreGeo, flameCoreMat);
    core.position.set(ex, 0.38, exhaustZ - 0.28);
    nitroFlame.add(jet, core);
  }
  nitroFlame.visible = false;
  chassis.add(nitroFlame);

  const exhaustPoint = new THREE.Object3D();
  exhaustPoint.position.set(0, 0.36, exhaustZ);
  chassis.add(exhaustPoint);

  const headlightOrigin = new THREE.Object3D();
  headlightOrigin.position.set(0, 0.9, headlightZ);
  chassis.add(headlightOrigin);

  const damageSmokePoint = new THREE.Object3D();
  damageSmokePoint.position.set(0, 1.05, headlightZ * 0.55);
  chassis.add(damageSmokePoint);

  // Twin Volumetric Headlight Light Cones + Soft Road Light Projection (realistic soft atmospheric blends)
  const headlightCones = new THREE.Group();
  const beamTex = getSoftHeadlightBeamTexture();
  const coneGeo = new THREE.ConeGeometry(1.45, 11.0, 24, 2, true);
  coneGeo.translate(0, -5.5, 0);
  coneGeo.rotateX(-Math.PI * 0.5);
  const coneColor = kind === 'aurora_coupe' ? 0x62f4ff : kind === 'fungi_buggy' ? 0xb8ff66 : 0xfff0c2;
  const coneMat = new THREE.MeshBasicMaterial({
    color: coneColor,
    map: beamTex,
    transparent: true,
    opacity: 0.10,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const hx of [-0.58, 0.58]) {
    const beam = new THREE.Mesh(coneGeo, coneMat);
    beam.position.set(hx, 0.84, headlightZ);
    beam.rotation.x = 0.05;
    headlightCones.add(beam);
  }

  // Soft projected ground light pool on the road ahead of the car
  const roadTex = getSoftHeadlightRoadTexture();
  const roadMat = new THREE.MeshBasicMaterial({
    color: coneColor,
    map: roadTex,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const roadGeo = new THREE.PlaneGeometry(3.4, 9.2);
  roadGeo.rotateX(-Math.PI * 0.5);
  const roadBeam = new THREE.Mesh(roadGeo, roadMat);
  roadBeam.position.set(0, 0.04, headlightZ + 4.6);
  headlightCones.add(roadBeam);

  headlightCones.visible = true;
  chassis.add(headlightCones);

  // Charred Wreck Overlay (shown after vehicle explodes while awaiting respawn!)
  const wreckOverlay = new THREE.Group();
  const wreckAsm = new VoxelAssembler();
  wreckAsm.boxBottom(0, 0.25, 0, 1.92, 0.95, 3.65, 0x1a1718);
  wreckAsm.boxBottom(0, 0.95, 0.1, 1.55, 0.52, 1.85, 0x262022);
  wreckAsm.boxBottom(0, 0.82, 0.95, 0.72, 0.35, 0.72, 0xff5a24, 'emissive');
  wreckOverlay.add(wreckAsm.build(materials));
  wreckOverlay.visible = false;
  root.add(wreckOverlay);

  root.add(createContactShadowMesh(2.25, materials.contactShadow));

  return {
    root,
    chassis,
    frontWheelSteerPivots,
    wheelSpinMeshes,
    driverSeat,
    nitroFlame,
    headlightCones,
    wreckOverlay,
    exhaustPoint,
    headlightOrigin,
    damageSmokePoint,
  };
}

export interface DrivableHelicopterRig {
  root: THREE.Group;
  body: THREE.Group;
  fuselageGroup: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
  chinMinigun: THREE.Group;
  chinTurret: THREE.Group;
  muzzlePointLeft: THREE.Object3D;
  muzzlePointRight: THREE.Object3D;
  bombDropPoint: THREE.Object3D;
  driverSeat: THREE.Group;
  headlightCones: THREE.Group;
  searchlightCone: THREE.Group;
  wreckOverlay: THREE.Group;
  damageSmokePoint: THREE.Object3D;
}

/**
 * Builds the high-detail AH-80 Voxel Attack Gunship rig.
 * Complete with aerodynamic fuselage, animated 4-blade main rotor, tail anti-torque rotor,
 * chin rotary cannon, dual bomb pods, landing skids, cockpit pilot seat, and searchlight.
 */
export function buildDrivableHelicopterRig(materials: SharedVoxelMaterials): DrivableHelicopterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const vb = new VoxelAssembler();
  const SLATE = 0x22272e;
  const OLIVE = 0x364634;
  const DARK = 0x181c22;
  const GLASS = 0x243b53;
  const HUD_GLOW = 0x39ff72;
  const ROTOR_TIP = 0xf23d3d;
  const STEEL = 0x8a99ad;

  // 1. MAIN FUSELAGE & COCKPIT CHASSIS
  // Lower keel
  vb.boxBottom(0, 0.32, 0.2, 1.34, 0.48, 3.4, SLATE, 'metal');
  // Forward cockpit slope
  vb.boxBottom(0, 0.8, 0.75, 1.28, 0.62, 2.2, OLIVE);
  vb.boxBottom(0, 1.42, 0.55, 1.16, 0.54, 1.5, SLATE);
  // Aerodynamic nose cone
  vb.boxBottom(0, 0.65, 1.95, 0.88, 0.46, 0.72, DARK, 'metal');
  vb.boxBottom(0, 0.52, 2.32, 0.56, 0.32, 0.38, 0x111317, 'metal');

  // Cockpit Tinted Canopy Windows
  vb.boxBottom(0, 1.05, 1.28, 1.05, 0.48, 0.82, GLASS, 'metal');
  vb.boxBottom(0, 1.44, 0.95, 0.98, 0.38, 0.72, GLASS, 'metal');
  vb.boxBottom(-0.55, 1.02, 0.85, 0.08, 0.42, 1.1, GLASS, 'metal');
  vb.boxBottom(0.55, 1.02, 0.85, 0.08, 0.42, 1.1, GLASS, 'metal');
  // Glowing green cockpit avionics HUD
  vb.boxBottom(0, 0.92, 1.42, 0.36, 0.18, 0.06, HUD_GLOW, 'emissive');

  // Engine Turbines & Transmission Doghouse
  vb.boxBottom(0, 1.84, -0.05, 1.02, 0.38, 1.85, DARK, 'metal');
  vb.boxBottom(-0.52, 1.55, -0.1, 0.42, 0.36, 1.45, 0x2e3842, 'metal');
  vb.boxBottom(0.52, 1.55, -0.1, 0.42, 0.36, 1.45, 0x2e3842, 'metal');

  // 2. TAIL BOOM & EMPENNAGE
  vb.boxBottom(0, 0.96, -1.85, 0.54, 0.46, 2.2, SLATE, 'metal');
  vb.boxBottom(0, 1.12, -2.85, 0.38, 0.38, 1.6, OLIVE);
  // Vertical tail fin
  vb.boxBottom(0, 1.4, -3.55, 0.14, 1.15, 0.68, DARK, 'metal');
  vb.boxBottom(0, 2.45, -3.7, 0.16, 0.22, 0.42, ROTOR_TIP);
  // Horizontal tail stabilizer
  vb.boxBottom(0, 1.55, -3.35, 1.6, 0.1, 0.42, SLATE, 'metal');

  // 3. WUB-WING PYLONS (WEAPON HARDPOINTS)
  vb.boxBottom(-1.15, 0.92, 0.25, 0.98, 0.14, 0.52, DARK, 'metal');
  vb.boxBottom(1.15, 0.92, 0.25, 0.98, 0.14, 0.52, DARK, 'metal');
  // Aerial Bomb Cluster Racks underneath winglets
  vb.boxBottom(-1.25, 0.62, 0.25, 0.32, 0.28, 0.85, 0x2a3828, 'metal');
  vb.boxBottom(1.25, 0.62, 0.25, 0.32, 0.28, 0.85, 0x2a3828, 'metal');
  // Rocket Pod launch tubes
  vb.boxBottom(-1.48, 0.76, 0.25, 0.28, 0.28, 0.88, 0x1f2328, 'metal');
  vb.boxBottom(1.48, 0.76, 0.25, 0.28, 0.28, 0.88, 0x1f2328, 'metal');
  vb.boxBottom(-1.48, 0.82, 0.7, 0.22, 0.22, 0.04, 0xffaa24, 'emissive');
  vb.boxBottom(1.48, 0.82, 0.7, 0.22, 0.22, 0.04, 0xffaa24, 'emissive');

  // 4. TUBULAR LANDING SKIDS
  // Left skid
  vb.boxBottom(-0.76, 0.04, 0.2, 0.14, 0.12, 3.2, STEEL, 'metal');
  vb.boxBottom(-0.76, 0.12, 1.25, 0.12, 0.36, 0.14, STEEL, 'metal');
  vb.boxBottom(-0.76, 0.12, -0.65, 0.12, 0.36, 0.14, STEEL, 'metal');
  // Right skid
  vb.boxBottom(0.76, 0.04, 0.2, 0.14, 0.12, 3.2, STEEL, 'metal');
  vb.boxBottom(0.76, 0.12, 1.25, 0.12, 0.36, 0.14, STEEL, 'metal');
  vb.boxBottom(0.76, 0.12, -0.65, 0.12, 0.36, 0.14, STEEL, 'metal');

  body.add(vb.build(materials));

  // 5. ANIMATED 4-BLADE MAIN ROTOR
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.32, 0.05);
  const mrAsm = new VoxelAssembler();
  // Central rotor mast hub
  mrAsm.boxBottom(0, 0, 0, 0.44, 0.22, 0.44, 0x181c22, 'metal');
  // 4 aerodynamic blades with high-vis red tips
  mrAsm.boxBottom(0, 0.08, 1.45, 0.22, 0.05, 2.65, 0x111418, 'metal');
  mrAsm.boxBottom(0, 0.08, 2.7, 0.24, 0.06, 0.22, ROTOR_TIP, 'emissive');
  mrAsm.boxBottom(0, 0.08, -1.45, 0.22, 0.05, 2.65, 0x111418, 'metal');
  mrAsm.boxBottom(0, 0.08, -2.7, 0.24, 0.06, 0.22, ROTOR_TIP, 'emissive');
  mrAsm.boxBottom(1.45, 0.08, 0, 2.65, 0.05, 0.22, 0x111418, 'metal');
  mrAsm.boxBottom(2.7, 0.08, 0, 0.22, 0.06, 0.24, ROTOR_TIP, 'emissive');
  mrAsm.boxBottom(-1.45, 0.08, 0, 2.65, 0.05, 0.22, 0x111418, 'metal');
  mrAsm.boxBottom(-2.7, 0.08, 0, 0.22, 0.06, 0.24, ROTOR_TIP, 'emissive');
  mainRotor.add(mrAsm.build(materials));
  body.add(mainRotor);

  // 6. ANIMATED 2-BLADE TAIL ROTOR
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.12, 2.32, -3.7);
  const trAsm = new VoxelAssembler();
  trAsm.boxBottom(0, 0, 0, 0.16, 0.16, 0.16, 0x181c22, 'metal');
  trAsm.boxBottom(0.04, 0, 0.52, 0.05, 0.12, 0.95, 0x111418, 'metal');
  trAsm.boxBottom(0.04, 0, 0.96, 0.06, 0.14, 0.14, ROTOR_TIP);
  trAsm.boxBottom(0.04, 0, -0.52, 0.05, 0.12, 0.95, 0x111418, 'metal');
  trAsm.boxBottom(0.04, 0, -0.96, 0.06, 0.14, 0.14, ROTOR_TIP);
  tailRotor.add(trAsm.build(materials));
  body.add(tailRotor);

  // 7. CHIN ROTARY MINIGUN CANNON
  const chinMinigun = new THREE.Group();
  chinMinigun.position.set(0, 0.35, 1.95);
  const mgAsm = new VoxelAssembler();
  mgAsm.boxBottom(0, 0, 0, 0.28, 0.24, 0.36, 0x16181d, 'metal');
  mgAsm.boxBottom(-0.06, 0.06, 0.42, 0.06, 0.06, 0.58, 0x22262c, 'metal');
  mgAsm.boxBottom(0.06, 0.06, 0.42, 0.06, 0.06, 0.58, 0x22262c, 'metal');
  mgAsm.boxBottom(0, 0.14, 0.42, 0.06, 0.06, 0.58, 0x22262c, 'metal');
  chinMinigun.add(mgAsm.build(materials));
  body.add(chinMinigun);

  const muzzlePointLeft = new THREE.Object3D();
  muzzlePointLeft.position.set(-0.06, 0.09, 0.76);
  chinMinigun.add(muzzlePointLeft);

  const muzzlePointRight = new THREE.Object3D();
  muzzlePointRight.position.set(0.06, 0.09, 0.76);
  chinMinigun.add(muzzlePointRight);

  const bombDropPoint = new THREE.Object3D();
  bombDropPoint.position.set(0, 0.32, 0.2);
  body.add(bombDropPoint);

  const damageSmokePoint = new THREE.Object3D();
  damageSmokePoint.position.set(0, 1.9, -0.4);
  body.add(damageSmokePoint);

  // 8. PILOT IN COCKPIT SEAT
  const driverSeat = new THREE.Group();
  driverSeat.position.set(0, 0.88, 0.82);
  const pilotAsm = new VoxelAssembler();
  pilotAsm.boxBottom(0, 0, 0, 0.44, 0.38, 0.32, 0x223226); // Flight suit
  pilotAsm.boxBottom(0, 0.38, 0, 0.42, 0.38, 0.4, 0x1f2620); // Flight helmet
  pilotAsm.boxBottom(0, 0.46, 0.21, 0.34, 0.16, 0.06, 0x45f2ff, 'emissive'); // Visor
  driverSeat.add(pilotAsm.build(materials));
  driverSeat.visible = false;
  body.add(driverSeat);

  // 9. HIGH-INTENSITY DOWNWARD SEARCHLIGHT CONES
  const headlightCones = new THREE.Group();
  const searchlight = new THREE.SpotLight(0xfff5d0, 14, 45, Math.PI * 0.28, 0.65, 1.2);
  searchlight.position.set(0, 0.35, 1.2);
  searchlight.target.position.set(0, -18, 6);
  body.add(searchlight);
  body.add(searchlight.target);

  const coneGeo = new THREE.ConeGeometry(3.5, 14, 16, 1, true);
  coneGeo.translate(0, -7, 0);
  coneGeo.rotateX(-0.25);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xffefb8,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const visualCone = new THREE.Mesh(coneGeo, coneMat);
  visualCone.position.set(0, 0.35, 1.2);
  headlightCones.add(visualCone);
  headlightCones.visible = true;
  body.add(headlightCones);

  // 10. CHARRED WRECK OVERLAY
  const wreckOverlay = new THREE.Group();
  const wreckAsm = new VoxelAssembler();
  wreckAsm.boxBottom(0, 0.25, 0, 1.6, 0.95, 3.8, 0x161314);
  wreckAsm.boxBottom(0, 0.85, 0.2, 1.2, 0.55, 1.9, 0x231d20);
  wreckAsm.boxBottom(0, 0.75, 0.8, 0.8, 0.4, 0.8, 0xff551c, 'emissive');
  wreckOverlay.add(wreckAsm.build(materials));
  wreckOverlay.visible = false;
  root.add(wreckOverlay);

  root.add(createContactShadowMesh(2.8, materials.contactShadow));

  return {
    root,
    body,
    fuselageGroup: body,
    mainRotor,
    tailRotor,
    chinMinigun,
    chinTurret: chinMinigun,
    muzzlePointLeft,
    muzzlePointRight,
    bombDropPoint,
    driverSeat,
    headlightCones,
    searchlightCone: headlightCones,
    wreckOverlay,
    damageSmokePoint,
  };
}

/**
 * Builds a high-detail 3D Voxel Frag Grenade.
 */
export function buildFragGrenadeMesh(materials: SharedVoxelMaterials): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  // Ribbed explosive body (olive drab)
  vb.boxBottom(0, 0, 0, 0.22, 0.32, 0.22, 0x485838);
  // Collar & fuse assembly
  vb.boxBottom(0, 0.32, 0, 0.14, 0.1, 0.14, 0x88949e, 'metal');
  vb.boxBottom(0.04, 0.36, -0.06, 0.05, 0.14, 0.08, 0xd0d8e2, 'metal'); // Safety lever
  vb.boxBottom(-0.06, 0.38, 0, 0.04, 0.08, 0.08, 0xff7b24, 'emissive'); // Orange detonator cap
  group.add(vb.build(materials));
  return group;
}

/**
 * Builds a high-detail 3D Voxel Smoke Grenade.
 */
export function buildSmokeGrenadeMesh(materials: SharedVoxelMaterials): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  // Cylindrical canister body
  vb.boxBottom(0, 0, 0, 0.2, 0.38, 0.2, 0xd8dde4);
  vb.boxBottom(0, 0.24, 0, 0.22, 0.08, 0.22, 0x8b5cf6, 'emissive'); // Purple smoke indicator band
  vb.boxBottom(0, 0.38, 0, 0.12, 0.08, 0.12, 0x4b5563, 'metal');
  vb.boxBottom(0.04, 0.4, -0.05, 0.04, 0.12, 0.06, 0xb0b8c4, 'metal');
  group.add(vb.build(materials));
  return group;
}

/**
 * Builds a 3D Voxel 250lb Aerial Bomb dropped from the attack helicopter.
 */
export function buildAeroBombMesh(materials: SharedVoxelMaterials): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  // Heavy cast-steel casing (olive green with yellow HE band)
  vb.boxBottom(0, 0.1, 0, 0.38, 0.38, 1.25, 0x364834, 'metal');
  vb.boxBottom(0, 0.15, 0.35, 0.42, 0.42, 0.14, 0xfacc15, 'emissive'); // Yellow hazard blast ring
  vb.boxBottom(0, 0.16, 0.65, 0.26, 0.26, 0.24, 0x222c20, 'metal'); // Nose cone
  vb.boxBottom(0, 0.2, 0.78, 0.12, 0.12, 0.08, 0xffffff, 'metal'); // Contact detonator pin
  // 4 Stabilizing Tail Fins
  vb.boxBottom(0, 0.22, -0.65, 0.06, 0.45, 0.38, 0x202920, 'metal');
  vb.boxBottom(0, 0.22, -0.65, 0.45, 0.06, 0.38, 0x202920, 'metal');
  group.add(vb.build(materials));
  return group;
}

/**
 * Builds an expanding ground-level volumetric shockwave blast ring mesh.
 */
export function buildShockwaveRingMesh(): THREE.Mesh {
  const ringGeo = new THREE.RingGeometry(0.3, 0.95, 32);
  ringGeo.rotateX(-Math.PI * 0.5);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffaa33,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(ringGeo, ringMat);
}

export interface DrivableTankRig {
  root: THREE.Group;
  hull: THREE.Group;
  turret: THREE.Group;
  cannonBarrel: THREE.Group;
  cannonMuzzle: THREE.Object3D;
  coaxialMuzzle: THREE.Object3D;
  driverSeat: THREE.Group;
  leftTreads: THREE.Mesh[];
  rightTreads: THREE.Mesh[];
  headlightCones: THREE.Group;
  wreckOverlay: THREE.Group;
  damageSmokePoint: THREE.Object3D;
}

/**
 * Builds the heavy Type-90 Voxel Main Battle Tank rig.
 * Features heavy composite armor hull, track skirts, 360° rotating turret,
 * recoil-absorbing 120mm smoothbore cannon, and coaxial machine gun.
 */
export function buildDrivableTankRig(materials: SharedVoxelMaterials): DrivableTankRig {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);

  const TANK_GREEN = 0x3d4838;
  const TANK_DARK = 0x242e20;
  const TREAD_COLOR = 0x181a1c;
  const METAL_GRAY = 0x64707a;

  const hullAsm = new VoxelAssembler();
  // Lower hull & chassis floor
  hullAsm.boxBottom(0, 0.25, 0, 2.3, 0.45, 4.4, TANK_DARK, 'metal');
  // Upper sloped glacis plate
  hullAsm.boxBottom(0, 0.65, 0.35, 2.4, 0.45, 3.2, TANK_GREEN);
  // Engine deck & exhaust louvers
  hullAsm.boxBottom(0, 0.72, -1.35, 2.2, 0.35, 1.8, TANK_DARK, 'metal');
  // Front sloped armor wedge
  hullAsm.boxBottom(0, 0.45, 1.95, 2.2, 0.42, 0.8, TANK_GREEN);
  // Heavy side armor skirts protecting treads
  hullAsm.boxBottom(-1.22, 0.28, 0, 0.16, 0.62, 4.5, TANK_DARK);
  hullAsm.boxBottom(1.22, 0.28, 0, 0.16, 0.62, 4.5, TANK_DARK);
  // Headlight housings
  hullAsm.boxBottom(-0.95, 0.85, 2.1, 0.24, 0.2, 0.16, 0xfff3c4, 'emissive');
  hullAsm.boxBottom(0.95, 0.85, 2.1, 0.24, 0.2, 0.16, 0xfff3c4, 'emissive');
  hull.add(hullAsm.build(materials));

  // Caterpillar road wheels
  const leftTreads: THREE.Mesh[] = [];
  const rightTreads: THREE.Mesh[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.24, 12);
  wheelGeo.rotateZ(Math.PI * 0.5);
  const wheelMat = new THREE.MeshLambertMaterial({ color: TREAD_COLOR });

  for (let z = -1.8; z <= 1.8; z += 0.72) {
    const lw = new THREE.Mesh(wheelGeo, wheelMat);
    lw.position.set(-1.18, 0.28, z);
    hull.add(lw);
    leftTreads.push(lw);

    const rw = new THREE.Mesh(wheelGeo, wheelMat);
    rw.position.set(1.18, 0.28, z);
    hull.add(rw);
    rightTreads.push(rw);
  }

  // Turret Assembly (Rotates 360° independently)
  const turret = new THREE.Group();
  turret.position.set(0, 1.05, 0.15);
  root.add(turret);

  const turretAsm = new VoxelAssembler();
  // Main angular turret bustle
  turretAsm.boxBottom(0, 0, -0.15, 1.85, 0.58, 2.4, TANK_GREEN);
  // Front wedge mantlet
  turretAsm.boxBottom(0, 0.08, 0.95, 1.35, 0.48, 0.85, TANK_DARK, 'metal');
  // Commander cupola & optic sight
  turretAsm.boxBottom(-0.48, 0.58, -0.25, 0.52, 0.25, 0.52, TANK_DARK);
  turretAsm.boxBottom(-0.48, 0.68, 0.02, 0.35, 0.12, 0.12, 0x38bdf8, 'emissive');
  // Smoke grenade dischargers on turret flanks
  turretAsm.boxBottom(-0.95, 0.35, 0.45, 0.18, 0.25, 0.32, METAL_GRAY, 'metal');
  turretAsm.boxBottom(0.95, 0.35, 0.45, 0.18, 0.25, 0.32, METAL_GRAY, 'metal');
  turret.add(turretAsm.build(materials));

  // 120mm Cannon Barrel Group
  const cannonBarrel = new THREE.Group();
  cannonBarrel.position.set(0, 0.28, 1.35);
  turret.add(cannonBarrel);

  const barrelAsm = new VoxelAssembler();
  // Main cannon tube (3.2m long)
  barrelAsm.boxBottom(0, -0.14, 0, 0.24, 0.24, 3.2, METAL_GRAY, 'metal');
  // Thermal sleeve bore evacuator
  barrelAsm.boxBottom(0, -0.18, 1.45, 0.34, 0.34, 0.72, TANK_DARK, 'metal');
  // Muzzle brake
  barrelAsm.boxBottom(0, -0.16, 3.15, 0.32, 0.28, 0.32, 0x222428, 'metal');
  cannonBarrel.add(barrelAsm.build(materials));

  const cannonMuzzle = new THREE.Object3D();
  cannonMuzzle.position.set(0, 0, 3.4);
  cannonBarrel.add(cannonMuzzle);

  const coaxialMuzzle = new THREE.Object3D();
  coaxialMuzzle.position.set(0.32, 0.28, 1.35);
  turret.add(coaxialMuzzle);

  // Driver Seat inside tank
  const driverSeat = new THREE.Group();
  driverSeat.position.set(0, 0.85, 0.95);
  const pilotAsm = new VoxelAssembler();
  pilotAsm.boxBottom(0, 0, 0, 0.42, 0.35, 0.32, 0x2d3b2c);
  pilotAsm.boxBottom(0, 0.35, 0, 0.38, 0.35, 0.36, 0x1a2418);
  driverSeat.add(pilotAsm.build(materials));
  driverSeat.visible = false;
  hull.add(driverSeat);

  // Headlight Cones
  const headlightCones = new THREE.Group();
  const coneGeo = new THREE.ConeGeometry(2.8, 18, 16, 1, true);
  coneGeo.translate(0, -9, 0);
  coneGeo.rotateX(-Math.PI * 0.5 + 0.08);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xffefb8,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const leftCone = new THREE.Mesh(coneGeo, coneMat);
  leftCone.position.set(-0.95, 0.95, 2.15);
  headlightCones.add(leftCone);
  const rightCone = new THREE.Mesh(coneGeo, coneMat);
  rightCone.position.set(0.95, 0.95, 2.15);
  headlightCones.add(rightCone);
  hull.add(headlightCones);

  // Charred Wreck Overlay
  const wreckOverlay = new THREE.Group();
  const wreckAsm = new VoxelAssembler();
  wreckAsm.boxBottom(0, 0.25, 0, 2.4, 0.9, 4.4, 0x141212);
  wreckAsm.boxBottom(0, 1.05, 0.15, 1.9, 0.6, 2.4, 0x1f191b);
  wreckAsm.boxBottom(0, 1.25, 1.2, 0.3, 0.3, 1.8, 0x100e10);
  wreckOverlay.add(wreckAsm.build(materials));
  wreckOverlay.visible = false;
  root.add(wreckOverlay);

  const damageSmokePoint = new THREE.Object3D();
  damageSmokePoint.position.set(0, 1.45, -0.6);
  root.add(damageSmokePoint);

  root.add(createContactShadowMesh(3.2, materials.contactShadow));

  return {
    root,
    hull,
    turret,
    cannonBarrel,
    cannonMuzzle,
    coaxialMuzzle,
    driverSeat,
    leftTreads,
    rightTreads,
    headlightCones,
    wreckOverlay,
    damageSmokePoint,
  };
}

/**
 * Builds the RPG-7 Anti-Armor Rocket Launcher model for player weapon rig.
 */
export function buildRpgMesh(materials: SharedVoxelMaterials): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  // Steel launch tube (olive drab & wood heat shield)
  vb.boxBottom(0, 0, -0.4, 0.14, 0.14, 0.95, 0x3b4436, 'metal');
  vb.boxBottom(0, -0.01, -0.15, 0.17, 0.17, 0.42, 0x6e3d22); // Wood grip sleeve
  vb.boxBottom(0, 0.12, 0.05, 0.08, 0.18, 0.16, 0x222622, 'metal'); // PGO-7 Optical Scope
  vb.boxBottom(0, -0.16, 0.18, 0.08, 0.22, 0.1, 0x1e241c); // Pistol grip & trigger
  // Conical rocket warhead loaded in the muzzle
  vb.boxBottom(0, -0.04, 0.58, 0.28, 0.28, 0.34, 0x2e3b2b);
  vb.boxBottom(0, 0, 0.9, 0.14, 0.14, 0.22, 0x1e241c, 'metal'); // Fuse tip
  group.add(vb.build(materials));
  return group;
}

/**
 * Builds the in-flight RPG Rocket projectile with stabilizing fins.
 */
export function buildRpgRocketMesh(materials: SharedVoxelMaterials): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  vb.boxBottom(0, 0, 0, 0.12, 0.12, 0.65, 0x485842, 'metal');
  vb.boxBottom(0, -0.06, 0.45, 0.26, 0.26, 0.32, 0x364834);
  vb.boxBottom(0, 0, 0.75, 0.1, 0.1, 0.18, 0x1c2218, 'metal');
  // 4 Stabilizing folding fins
  vb.boxBottom(0, 0.05, -0.28, 0.04, 0.35, 0.18, 0x242d22, 'metal');
  vb.boxBottom(0, 0.05, -0.28, 0.35, 0.04, 0.18, 0x242d22, 'metal');
  group.add(vb.build(materials));
  return group;
}

/**
 * Builds the Cyber Katana with glowing neon blade edge.
 */
export function buildKatanaMesh(materials: SharedVoxelMaterials): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  // Tsuka handle with black ito wrap
  vb.boxBottom(0, -0.02, -0.32, 0.08, 0.08, 0.32, 0x171717);
  // Golden tsuba guard
  vb.boxBottom(0, -0.03, 0.01, 0.24, 0.24, 0.04, 0xf59e0b, 'emissive');
  // High-frequency carbon-steel katana blade with neon pink edge
  vb.boxBottom(0, 0, 0.06, 0.05, 0.12, 0.85, 0xd4d4d8, 'metal');
  vb.boxBottom(0, 0.08, 0.06, 0.02, 0.05, 0.86, 0xec4899, 'emissive');
  group.add(vb.build(materials));
  return group;
}

/**
 * Builds the C4 Remote Explosive Block with blinking detonator LED.
 */
export function buildC4Mesh(materials: SharedVoxelMaterials): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  // Plastic explosive clay block
  vb.boxBottom(0, 0, 0, 0.26, 0.14, 0.38, 0x9ca3af);
  // Green circuit board
  vb.boxBottom(0, 0.14, 0.02, 0.18, 0.04, 0.22, 0x15803d);
  // Blinking red status LED
  vb.boxBottom(0.05, 0.18, 0.08, 0.05, 0.05, 0.05, 0xef4444, 'emissive');
  group.add(vb.build(materials));
  return group;
}

/**
 * Builds the Automated Deployable Sentry Turret rig.
 */
export interface SentryRig {
  root: THREE.Group;
  turretHead: THREE.Group;
  muzzleLeft: THREE.Object3D;
  muzzleRight: THREE.Object3D;
  scanLight: THREE.PointLight;
}

export function buildSentryRig(materials: SharedVoxelMaterials): SentryRig {
  const root = new THREE.Group();
  const baseAsm = new VoxelAssembler();
  // Tripod legs & central base mount
  baseAsm.boxBottom(0, 0, 0, 0.45, 0.35, 0.45, 0x27272a, 'metal');
  baseAsm.boxBottom(-0.35, 0, -0.35, 0.15, 0.25, 0.15, 0x3f3f46, 'metal');
  baseAsm.boxBottom(0.35, 0, -0.35, 0.15, 0.25, 0.15, 0x3f3f46, 'metal');
  baseAsm.boxBottom(0, 0, 0.45, 0.15, 0.25, 0.15, 0x3f3f46, 'metal');
  root.add(baseAsm.build(materials));

  const turretHead = new THREE.Group();
  turretHead.position.set(0, 0.42, 0);
  root.add(turretHead);

  const headAsm = new VoxelAssembler();
  // Armored servo head housing
  headAsm.boxBottom(0, 0, 0, 0.38, 0.32, 0.48, 0x3b82f6);
  // Twin 7.62mm vulcan barrels
  headAsm.boxBottom(-0.12, 0.08, 0.24, 0.08, 0.08, 0.55, 0x18181b, 'metal');
  headAsm.boxBottom(0.12, 0.08, 0.24, 0.08, 0.08, 0.55, 0x18181b, 'metal');
  // Red targeting sensor visor
  headAsm.boxBottom(0, 0.22, 0.18, 0.24, 0.08, 0.06, 0xef4444, 'emissive');
  turretHead.add(headAsm.build(materials));

  const muzzleLeft = new THREE.Object3D();
  muzzleLeft.position.set(-0.12, 0.12, 0.78);
  turretHead.add(muzzleLeft);

  const muzzleRight = new THREE.Object3D();
  muzzleRight.position.set(0.12, 0.12, 0.78);
  turretHead.add(muzzleRight);

  const scanLight = new THREE.PointLight(0xef4444, 2.5, 8);
  scanLight.position.set(0, 0.24, 0.35);
  turretHead.add(scanLight);

  return { root, turretHead, muzzleLeft, muzzleRight, scanLight };
}

/**
 * Builds destructible props (wooden fences, crates, market canopies, lantern posts).
 */
export function buildDestructiblePropMesh(
  kind: 'fence' | 'crate' | 'lantern' | 'canopy',
  materials: SharedVoxelMaterials,
): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();

  if (kind === 'fence') {
    // Japanese wooden post-and-beam fence section
    vb.boxBottom(-0.95, 0, 0, 0.16, 1.15, 0.16, 0x5a3d28);
    vb.boxBottom(0.95, 0, 0, 0.16, 1.15, 0.16, 0x5a3d28);
    vb.boxBottom(0, 0.35, 0, 1.95, 0.14, 0.08, 0x785338);
    vb.boxBottom(0, 0.82, 0, 1.95, 0.14, 0.08, 0x785338);
  } else if (kind === 'crate') {
    // Stackable wooden cargo crate
    vb.boxBottom(0, 0, 0, 1.1, 1.1, 1.1, 0x85542f);
    vb.boxBottom(0, 0.05, 0, 1.14, 0.14, 1.14, 0x3d2716);
    vb.boxBottom(0, 0.95, 0, 1.14, 0.14, 1.14, 0x3d2716);
  } else if (kind === 'lantern') {
    // Traditional stone toro lantern
    vb.boxBottom(0, 0, 0, 0.55, 0.24, 0.55, 0x6b7280);
    vb.boxBottom(0, 0.24, 0, 0.28, 1.1, 0.28, 0x9ca3af);
    vb.boxBottom(0, 1.34, 0, 0.48, 0.42, 0.48, 0xffe488, 'emissive');
    vb.boxBottom(0, 1.76, 0, 0.65, 0.18, 0.65, 0x4b5563);
  } else {
    // Market stall canopy cloth & frame
    vb.boxBottom(-0.9, 0, -0.6, 0.12, 2.1, 0.12, 0x785338);
    vb.boxBottom(0.9, 0, -0.6, 0.12, 2.1, 0.12, 0x785338);
    vb.boxBottom(-0.9, 0, 0.6, 0.12, 2.1, 0.12, 0x785338);
    vb.boxBottom(0.9, 0, 0.6, 0.12, 2.1, 0.12, 0x785338);
    vb.boxBottom(0, 2.1, 0, 2.1, 0.12, 1.4, 0xef4444); // Red canopy
    vb.boxBottom(0, 2.05, 0, 2.15, 0.08, 1.45, 0xffffff); // White fringe
  }

  group.add(vb.build(materials));
  return group;
}
