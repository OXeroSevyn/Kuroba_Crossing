import * as THREE from 'three';
import { DEFAULT_GUN_BUILDS } from './armory';
import { DEFAULT_LOADOUT, getOption } from './customization';
import { buildFirearm, buildKatanaRig, type WeaponRig } from './gunModels';
import { buildOperatorParts } from './heroModel';
import type { EnemyArchetype, GameMode, GunBuilds, LoadoutConfig, VehicleKind, WeaponId } from './types';
import {
  createContactShadowMesh,
  type SharedVoxelMaterials,
  VoxelAssembler,
} from './voxelBuilder';

export type { WeaponRig } from './gunModels';

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
  /** Skin-coloured lids over the eyes, shown briefly to blink. */
  eyelids: THREE.Group;
  /** Eye height in head space (scope camera anchor). */
  eyeY: number;
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

/**
 * Builds the player operator: a detailed micro-voxel human (see heroModel.ts) holding every
 * firearm built from its per-gun build (see gunModels.ts / armory.ts).
 */
export function buildHeroRig(
  materials: SharedVoxelMaterials,
  loadout: LoadoutConfig = DEFAULT_LOADOUT,
  builds: GunBuilds = DEFAULT_GUN_BUILDS,
): HeroRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  const collectFlash = (g: THREE.Object3D) => {
    g.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = (obj as THREE.Mesh).material;
        if (m instanceof THREE.MeshStandardMaterial && obj.userData.voxelBucket !== 'emissive') {
          flashMaterials.push(m);
        }
      }
    });
  };

  const parts = buildOperatorParts(materials, loadout);
  const glow = getOption('accentGlow', loadout.accentGlow).hex;
  const tracer = getOption('tracerFx', loadout.tracerFx).hex;

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.72, 0);
  torsoGroup.add(parts.torsoMesh);
  collectFlash(parts.torsoMesh);

  const thrusterFlame = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.38, 0.18),
    new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0 }),
  );
  thrusterFlame.position.set(0, 0.0, parts.thrusterZ);
  torsoGroup.add(thrusterFlame);
  bodyPivot.add(torsoGroup);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, parts.headY, 0);
  headGroup.add(parts.headGroupContent);
  collectFlash(parts.headGroupContent);
  torsoGroup.add(headGroup);

  const leftLeg = parts.buildLeg(-1);
  const rightLeg = parts.buildLeg(1);
  collectFlash(leftLeg);
  collectFlash(rightLeg);
  bodyPivot.add(leftLeg, rightLeg);

  const leftArm = new THREE.Group();
  leftArm.position.copy(parts.leftShoulder);
  leftArm.add(parts.leftArmMesh);
  collectFlash(parts.leftArmMesh);
  torsoGroup.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.copy(parts.rightShoulder);
  rightArm.add(parts.rightArmMesh);
  collectFlash(parts.rightArmMesh);

  const weaponRigs: Record<WeaponId, WeaponRig> = {
    pulse: buildFirearm('pulse', builds.pulse, loadout, materials),
    scatter: buildFirearm('scatter', builds.scatter, loadout, materials),
    rail: buildFirearm('rail', builds.rail, loadout, materials),
    rpg: buildFirearm('rpg', builds.rpg, loadout, materials),
    katana: buildKatanaRig(materials),
  };
  for (const id of Object.keys(weaponRigs) as WeaponId[]) {
    const w = weaponRigs[id];
    w.root.scale.setScalar(1.12);
    w.root.visible = id === 'pulse';
    rightArm.add(w.root);
  }

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, weaponRigs.pulse.muzzleY * 1.12, weaponRigs.pulse.muzzleOffsetZ * 1.12);
  rightArm.add(muzzlePoint);

  const ejectPoint = new THREE.Object3D();
  ejectPoint.position.copy(weaponRigs.pulse.ejectOffset);
  rightArm.add(ejectPoint);

  const muzzleFlash = buildMuzzleFlashMesh(tracer);
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
    eyelids: parts.eyelids,
    eyeY: parts.eyeY,
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
  } else if (kind === 'bike') {
    // Type-01 Neo Cyberbike (futuristic agile sports street bike)
    const FRAME = 0x181a20;
    const FAIRING = 0x06b6d4; // Cyan aerodynamic fairing panels
    const ACCENT = 0xf97316; // Orange speed accent graphics
    const NEON = 0x22d3ee; // Glowing instrumentation and rim ring
    // Front fairing cowl and windscreen
    vb.boxBottom(0, 0.42, 0.35, 0.42, 0.54, 0.95, FAIRING);
    vb.boxBottom(0, 0.88, 0.48, 0.36, 0.32, 0.48, GLASS, 'metal');
    // Dual aggressive LED projector headlights
    vb.boxBottom(-0.14, 0.62, 0.86, 0.12, 0.12, 0.06, HEADLIGHT, 'emissive');
    vb.boxBottom(0.14, 0.62, 0.86, 0.12, 0.12, 0.06, HEADLIGHT, 'emissive');
    // Digital cockpit telemetry screen
    vb.boxBottom(0, 0.94, 0.44, 0.22, 0.12, 0.04, NEON, 'emissive');
    // Clip-on racing handlebars & bar-end mirrors
    vb.boxBottom(-0.32, 0.82, 0.42, 0.28, 0.06, 0.06, 0x111317, 'metal');
    vb.boxBottom(0.32, 0.82, 0.42, 0.28, 0.06, 0.06, 0x111317, 'metal');
    // Main trellis engine frame & battery block
    vb.boxBottom(0, 0.26, -0.1, 0.38, 0.52, 0.92, FRAME, 'metal');
    vb.boxBottom(0, 0.32, -0.1, 0.42, 0.12, 0.82, ACCENT);
    // Ergonomic racing saddle
    vb.boxBottom(0, 0.66, -0.32, 0.34, 0.12, 0.55, 0x0f1115);
    // Aerodynamic tail cowl & razor taillight
    vb.boxBottom(0, 0.64, -0.85, 0.36, 0.28, 0.58, FAIRING);
    vb.boxBottom(0, 0.72, -1.15, 0.28, 0.08, 0.04, TAILLIGHT, 'emissive');
    // Upswept carbon exhaust canister
    vb.boxBottom(0.24, 0.44, -0.88, 0.14, 0.14, 0.72, 0x27272a, 'metal');
    vb.boxBottom(0.24, 0.44, -1.25, 0.12, 0.12, 0.04, 0x38bdf8, 'emissive');
    // Front suspension inverted telescopic fork
    vb.boxBottom(-0.16, 0.24, 0.88, 0.08, 0.54, 0.08, 0xd4d4d8, 'metal');
    vb.boxBottom(0.16, 0.24, 0.88, 0.08, 0.54, 0.08, 0xd4d4d8, 'metal');
    // Rear aluminum swingarm
    vb.boxBottom(-0.16, 0.22, -0.72, 0.07, 0.16, 0.68, 0x52525b, 'metal');
    vb.boxBottom(0.16, 0.22, -0.72, 0.07, 0.16, 0.68, 0x52525b, 'metal');

    wheelZFront = 1.05;
    wheelZRear = -1.05;
    wheelX = 0;
    wheelSize = 0.68;
    driverY = 0.56;
    driverZ = -0.22;
    exhaustZ = -1.25;
    headlightZ = 0.95;
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
  const isBike = kind === 'bike';
  const frontWheelSteerPivots: THREE.Group[] = [];
  const wheelSpinMeshes: THREE.Group[] = [];
  const wheelSpecs: Array<{ x: number; z: number; isFront: boolean; isDummy?: boolean }> = isBike
    ? [
        { x: 0, z: wheelZFront, isFront: true },
        { x: 0, z: wheelZFront, isFront: true, isDummy: true },
        { x: 0, z: wheelZRear, isFront: false },
        { x: 0, z: wheelZRear, isFront: false, isDummy: true },
      ]
    : [
        { x: -wheelX, z: wheelZFront, isFront: true },
        { x: wheelX, z: wheelZFront, isFront: true },
        { x: -wheelX, z: wheelZRear, isFront: false },
        { x: wheelX, z: wheelZRear, isFront: false },
      ];

  for (const w of wheelSpecs) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(w.x, wheelSize * 0.5, w.z);
    const spinGroup = new THREE.Group();
    if (!w.isDummy) {
      const wAsm = new VoxelAssembler();
      const tireWidth = isBike ? 0.22 : 0.34;
      wAsm.boxBottom(0, -wheelSize * 0.5, 0, tireWidth, wheelSize, wheelSize, TIRE);
      wAsm.boxBottom(
        w.x > 0 ? 0.14 : isBike ? 0 : -0.14,
        -wheelSize * 0.22,
        0,
        0.1,
        wheelSize * 0.44,
        wheelSize * 0.44,
        HUB,
        'metal',
      );
      if (isBike) {
        // Glowing cyan neon rim stripe on cyberbike
        wAsm.boxBottom(0, -wheelSize * 0.32, 0, 0.23, wheelSize * 0.64, wheelSize * 0.64, 0x06b6d4, 'emissive');
      }
      // Tread bar detail so wheel spinning is unmistakably visible
      wAsm.boxBottom(0, -wheelSize * 0.52, 0, tireWidth + 0.02, 0.1, 0.14, 0x353a42);
      wAsm.boxBottom(0, wheelSize * 0.42, 0, tireWidth + 0.02, 0.1, 0.14, 0x353a42);
      spinGroup.add(wAsm.build(materials));
    }
    steerPivot.add(spinGroup);
    root.add(steerPivot);

    if (w.isFront) {
      frontWheelSteerPivots.push(steerPivot);
    }
    wheelSpinMeshes.push(spinGroup);
  }

  // Visible seated K-04 driver inside the cab or on bike saddle (toggled visible when player enters car/bike!)
  const driverSeat = new THREE.Group();
  driverSeat.position.set(isBike ? 0 : -0.26, driverY, driverZ);
  if (isBike) {
    driverSeat.rotation.x = 0.35; // Aerodynamic forward racing lean over motorcycle tank
  }
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
  const exhaustXs = isBike ? [0.24] : [-0.42, 0.42];
  for (const ex of exhaustXs) {
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

export interface BirdRig {
  root: THREE.Group;
  leftWing: THREE.Group;
  rightWing: THREE.Group;
  kind: 'pigeon' | 'crow';
}

export function buildBirdRig(materials: SharedVoxelMaterials, kind: 'pigeon' | 'crow'): BirdRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const vb = new VoxelAssembler();
  const isPigeon = kind === 'pigeon';
  const BODY = isPigeon ? 0x64748b : 0x18181b;
  const NECK = isPigeon ? 0x10b981 : 0x0f172a;
  const BEAK = isPigeon ? 0xf59e0b : 0x3f3f46;
  const EYE = 0xffffff;

  // Streamlined voxel bird torso
  vb.boxBottom(0, 0, -0.05, 0.16, 0.16, 0.28, BODY);
  vb.boxBottom(0, 0.08, 0.08, 0.14, 0.14, 0.16, NECK);
  // Head & beak
  vb.boxBottom(0, 0.18, 0.14, 0.12, 0.12, 0.14, BODY);
  vb.boxBottom(0, 0.2, 0.22, 0.04, 0.04, 0.08, BEAK);
  vb.boxBottom(-0.065, 0.23, 0.15, 0.02, 0.03, 0.03, EYE);
  vb.boxBottom(0.065, 0.23, 0.15, 0.02, 0.03, 0.03, EYE);
  // Tail feathers
  vb.boxBottom(0, 0.06, -0.22, 0.12, 0.04, 0.18, BODY);
  bodyGroup.add(vb.build(materials));

  // Articulated wings pivoted at body sides
  const leftWing = new THREE.Group();
  leftWing.position.set(-0.08, 0.1, 0.02);
  const lwAsm = new VoxelAssembler();
  lwAsm.boxBottom(-0.16, -0.02, -0.02, 0.32, 0.03, 0.2, BODY);
  lwAsm.boxBottom(-0.36, -0.01, -0.01, 0.16, 0.02, 0.16, isPigeon ? 0x94a3b8 : 0x27272a);
  leftWing.add(lwAsm.build(materials));
  root.add(leftWing);

  const rightWing = new THREE.Group();
  rightWing.position.set(0.08, 0.1, 0.02);
  const rwAsm = new VoxelAssembler();
  rwAsm.boxBottom(0.16, -0.02, -0.02, 0.32, 0.03, 0.2, BODY);
  rwAsm.boxBottom(0.36, -0.01, -0.01, 0.16, 0.02, 0.16, isPigeon ? 0x94a3b8 : 0x27272a);
  rightWing.add(rwAsm.build(materials));
  root.add(rightWing);

  return { root, leftWing, rightWing, kind };
}

export interface SmallAnimalRig {
  root: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  legs: THREE.Group[];
  kind: 'cat' | 'fox';
}

export function buildSmallAnimalRig(materials: SharedVoxelMaterials, kind: 'cat' | 'fox'): SmallAnimalRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const vb = new VoxelAssembler();
  const isFox = kind === 'fox';
  const FUR = isFox ? 0xd97706 : 0xf8fafc;
  const FUR_ALT = isFox ? 0xffedd5 : 0xea580c;
  const DARK = isFox ? 0x18181b : 0x27272a;

  // Voxel torso
  vb.boxBottom(0, 0.14, 0, 0.24, 0.22, 0.44, FUR);
  vb.boxBottom(0, 0.14, 0.02, 0.22, 0.18, 0.28, FUR_ALT);
  if (!isFox) {
    // Calico markings
    vb.boxBottom(-0.06, 0.26, -0.08, 0.12, 0.11, 0.14, DARK);
    vb.boxBottom(0.07, 0.25, 0.08, 0.11, 0.11, 0.14, FUR_ALT);
  }
  bodyGroup.add(vb.build(materials));

  // Articulated Head with ears
  const head = new THREE.Group();
  head.position.set(0, 0.26, 0.24);
  const hAsm = new VoxelAssembler();
  hAsm.boxBottom(0, 0, 0, 0.22, 0.2, 0.22, FUR);
  // Snout
  hAsm.boxBottom(0, 0.02, 0.12, 0.12, 0.1, 0.12, isFox ? 0xffedd5 : 0xf1f5f9);
  hAsm.boxBottom(0, 0.09, 0.18, 0.04, 0.04, 0.02, 0x18181b); // Nose
  // Pointed ears
  hAsm.boxBottom(-0.08, 0.2, -0.02, 0.07, 0.1, 0.06, isFox ? 0x18181b : FUR);
  hAsm.boxBottom(0.08, 0.2, -0.02, 0.07, 0.1, 0.06, isFox ? 0x18181b : FUR_ALT);
  // Eyes
  hAsm.boxBottom(-0.08, 0.1, 0.1, 0.03, 0.04, 0.03, isFox ? 0x18181b : 0x10b981, 'emissive');
  hAsm.boxBottom(0.08, 0.1, 0.1, 0.03, 0.04, 0.03, isFox ? 0x18181b : 0x10b981, 'emissive');
  head.add(hAsm.build(materials));
  root.add(head);

  // Articulated Tail
  const tail = new THREE.Group();
  tail.position.set(0, 0.28, -0.22);
  const tAsm = new VoxelAssembler();
  if (isFox) {
    // Big fluffy bushy fox tail with white tip
    tAsm.boxBottom(0, -0.06, -0.2, 0.15, 0.15, 0.36, 0xd97706);
    tAsm.boxBottom(0, -0.04, -0.38, 0.13, 0.13, 0.16, 0xffffff);
  } else {
    // Sleek cat tail
    tAsm.boxBottom(0, 0.04, -0.16, 0.06, 0.06, 0.32, DARK);
  }
  tail.add(tAsm.build(materials));
  root.add(tail);

  // 4 Articulated legs for walking
  const legs: THREE.Group[] = [];
  const legOffsets = [
    { x: -0.09, z: 0.15 },
    { x: 0.09, z: 0.15 },
    { x: -0.09, z: -0.15 },
    { x: 0.09, z: -0.15 },
  ];
  for (const pos of legOffsets) {
    const leg = new THREE.Group();
    leg.position.set(pos.x, 0.14, pos.z);
    const lAsm = new VoxelAssembler();
    lAsm.boxBottom(0, -0.14, 0, 0.07, 0.14, 0.07, isFox ? DARK : FUR);
    leg.add(lAsm.build(materials));
    root.add(leg);
    legs.push(leg);
  }

  return { root, head, tail, legs, kind };
}

export function buildVoxelPickupMesh(kind: 'heal' | 'overdrive', materials: SharedVoxelMaterials): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  if (kind === 'heal') {
    // Voxel First-Aid Nanite Medkit
    vb.boxBottom(0, -0.2, 0, 0.44, 0.4, 0.24, 0xf1f5f9);
    vb.boxBottom(0, 0.2, 0, 0.2, 0.08, 0.06, 0x334155, 'metal'); // Handle
    // Green luminous cross on front and back
    vb.boxBottom(0, -0.16, 0.125, 0.12, 0.32, 0.02, 0x22c55e, 'emissive');
    vb.boxBottom(0, -0.06, 0.125, 0.32, 0.12, 0.02, 0x22c55e, 'emissive');
    vb.boxBottom(0, -0.16, -0.125, 0.12, 0.32, 0.02, 0x22c55e, 'emissive');
    vb.boxBottom(0, -0.06, -0.125, 0.32, 0.12, 0.02, 0x22c55e, 'emissive');
  } else {
    // Voxel Plasma Overdrive Core
    vb.boxBottom(0, -0.22, 0, 0.34, 0.44, 0.34, 0x1e293b, 'metal');
    // Glowing amber energizer bands
    vb.boxBottom(0, -0.15, 0, 0.38, 0.12, 0.38, 0xf59e0b, 'emissive');
    vb.boxBottom(0, 0.04, 0, 0.38, 0.12, 0.38, 0xf59e0b, 'emissive');
    vb.boxBottom(0, 0.22, 0, 0.16, 0.06, 0.16, 0x38bdf8, 'emissive');
  }
  group.add(vb.build(materials));
  return group;
}
