/**
 * Detailed micro-voxel human operator: face (eyes with iris/pupil/catch-light, lids, brows, nose,
 * lips, ears), hairstyles, facial hair, scars/marks, open-face headgear, body builds, outfits and
 * back gear. Keeps the original rig pivots (torso at hip height 0.72, head on top of the torso,
 * arms on the shoulders) so every existing animation keeps working.
 */
import * as THREE from 'three';
import { getOption } from './customization';
import type { LoadoutConfig } from './types';
import { type SharedVoxelMaterials, VoxelAssembler } from './voxelBuilder';

export interface OperatorParts {
  torsoMesh: THREE.Group;
  headGroupContent: THREE.Group;
  eyelids: THREE.Group;
  leftArmMesh: THREE.Group;
  rightArmMesh: THREE.Group;
  buildLeg: (side: -1 | 1) => THREE.Group;
  /** Torso top (head pivot) height in torso space. */
  headY: number;
  /** Shoulder pivots in torso space. */
  leftShoulder: THREE.Vector3;
  rightShoulder: THREE.Vector3;
  /** Eye height in head space (used for the scope camera). */
  eyeY: number;
  thrusterZ: number;
}

interface BodyDims {
  torsoW: number;
  shoulderW: number;
  depth: number;
  torsoH: number;
  armT: number;
  legT: number;
  legGap: number;
  neck: number;
}

const BODY: Record<string, BodyDims> = {
  athletic: { torsoW: 0.48, shoulderW: 0.58, depth: 0.3, torsoH: 0.42, armT: 0.16, legT: 0.2, legGap: 0.14, neck: 0.09 },
  slim: { torsoW: 0.42, shoulderW: 0.5, depth: 0.27, torsoH: 0.43, armT: 0.14, legT: 0.18, legGap: 0.125, neck: 0.1 },
  heavy: { torsoW: 0.58, shoulderW: 0.7, depth: 0.36, torsoH: 0.42, armT: 0.19, legT: 0.23, legGap: 0.16, neck: 0.08 },
  tall: { torsoW: 0.47, shoulderW: 0.56, depth: 0.3, torsoH: 0.48, armT: 0.16, legT: 0.2, legGap: 0.14, neck: 0.11 },
  compact: { torsoW: 0.5, shoulderW: 0.58, depth: 0.31, torsoH: 0.36, armT: 0.17, legT: 0.21, legGap: 0.145, neck: 0.07 },
};

function mix(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a);
  ca.lerp(new THREE.Color(b), t);
  return ca.getHex();
}

const CYBER_EYES = new Set(['cyan_pulse', 'emerald_bio', 'crimson_hunt', 'solar_gold', 'ultraviolet', 'sakura_pink']);
/** Headgear that hides the top of the hair. */
const COVERS_TOP = new Set(['tactical_cap', 'beanie', 'ranger_helm', 'snow_ushanka', 'nvg_ops', 'cyber_kabuto', 'ronin_kasa']);

export function buildOperatorParts(materials: SharedVoxelMaterials, loadout: LoadoutConfig): OperatorParts {
  const b = BODY[loadout.bodyType] ?? BODY.athletic;
  const skinOpt = getOption('skinTone', loadout.skinTone);
  const SKIN = skinOpt.hex;
  const SKIN_SHADE = skinOpt.secondaryHex ?? mix(SKIN, 0x000000, 0.14);
  const SKIN_DEEP = mix(SKIN, 0x3a1c12, 0.3);
  const LIP = mix(SKIN, 0x9a3b34, 0.42);
  const HAIR = getOption('hairColor', loadout.hairColor).hex;
  const HAIR_SHADE = mix(HAIR, 0x000000, 0.22);
  const BROW = loadout.hairStyle === 'bald' ? mix(HAIR, SKIN_DEEP, 0.3) : mix(HAIR, 0x000000, 0.12);
  const IRIS = getOption('visorColor', loadout.visorColor).hex;
  const cyberEyes = CYBER_EYES.has(loadout.visorColor);
  const JACKET = getOption('jacketColor', loadout.jacketColor).hex;
  const JACKET_TRIM = getOption('jacketColor', loadout.jacketColor).secondaryHex ?? 0xc25b1d;
  const OUTFIT = getOption('outfitStyle', loadout.outfitStyle).hex;
  const PANTS = getOption('pantsStyle', loadout.pantsStyle).hex;
  const BOOT = getOption('pantsStyle', loadout.pantsStyle).secondaryHex ?? 0x1c222e;
  const GLOW = getOption('accentGlow', loadout.accentGlow).hex;
  const PACK = getOption('backpack', loadout.backpack).hex;
  const HEADGEAR_HEX = getOption('headgear', loadout.headgear).hex;
  const GLOVE = 0x23262b;
  const STRAP = 0x2a2420;

  // =====================================================================
  // TORSO (jacket, chest rig, belt) in torso space: y = 0 at the hips
  // =====================================================================
  const t = new VoxelAssembler();
  const fz = b.depth / 2;
  const top = 0.1 + b.torsoH;
  t.boxBottom(0, 0, 0, b.torsoW + 0.04, 0.13, b.depth + 0.03, PANTS); // pelvis
  t.boxBottom(0, 0.1, 0, b.torsoW + 0.05, 0.05, b.depth + 0.05, STRAP); // belt
  t.boxBottom(0, 0.105, fz + 0.03, 0.09, 0.045, 0.02, 0xd9a844, 'metal'); // buckle
  t.boxBottom(0, 0.14, 0, b.torsoW, b.torsoH - 0.1, b.depth, JACKET); // abdomen
  t.boxBottom(0, top - 0.16, 0, b.shoulderW - 0.08, 0.16, b.depth + 0.02, JACKET); // chest / shoulders
  t.boxBottom(0, top - 0.06, 0, b.shoulderW, 0.06, b.depth - 0.02, JACKET_TRIM); // shoulder line
  t.boxBottom(0, top - 0.01, 0.0, 0.24, 0.05, 0.2, JACKET_TRIM); // collar
  t.boxBottom(0, 0.16, fz + 0.005, 0.02, b.torsoH - 0.12, 0.01, mix(JACKET, 0x000000, 0.35)); // zipper seam
  // Shoulder straps of the chest rig
  t.boxBottom(-b.torsoW * 0.28, 0.2, fz + 0.01, 0.05, b.torsoH - 0.12, 0.02, STRAP);
  t.boxBottom(b.torsoW * 0.28, 0.2, fz + 0.01, 0.05, b.torsoH - 0.12, 0.02, STRAP);

  // Outfit rig (chest plate / jacket style)
  const o = loadout.outfitStyle;
  if (o === 'heavy_exo') {
    t.boxBottom(0, 0.18, fz + 0.04, b.torsoW - 0.06, b.torsoH - 0.12, 0.08, OUTFIT, 'metal');
    t.boxBottom(-(b.shoulderW / 2 + 0.02), top - 0.2, 0, 0.16, 0.18, b.depth + 0.06, OUTFIT, 'metal');
    t.boxBottom(b.shoulderW / 2 + 0.02, top - 0.2, 0, 0.16, 0.18, b.depth + 0.06, OUTFIT, 'metal');
    t.boxBottom(0, 0.3, fz + 0.085, 0.12, 0.08, 0.02, GLOW, 'emissive');
  } else if (o === 'street_bomber') {
    t.boxBottom(0, top - 0.04, -0.02, b.shoulderW + 0.04, 0.08, b.depth + 0.06, OUTFIT); // fur-lined collar roll
    t.boxBottom(0, 0.2, fz + 0.015, b.torsoW - 0.04, 0.05, 0.02, GLOW, 'emissive');
    t.boxBottom(-0.12, 0.22, fz + 0.012, 0.1, 0.08, 0.02, mix(JACKET, 0xffffff, 0.15)); // patch
  } else if (o === 'winter_parka') {
    t.boxBottom(0, 0.14, fz + 0.03, b.torsoW - 0.04, b.torsoH - 0.06, 0.05, OUTFIT);
    t.boxBottom(0, top - 0.06, -0.01, b.shoulderW + 0.06, 0.12, b.depth + 0.08, 0xf2f6fa); // fur hood rim
    for (let q = 0; q < 3; q++) t.boxBottom(0, 0.2 + q * 0.1, fz + 0.06, b.torsoW - 0.02, 0.015, 0.01, JACKET_TRIM);
  } else if (o === 'hazmat_suit') {
    t.boxBottom(0, 0.14, fz + 0.025, b.torsoW - 0.06, b.torsoH - 0.08, 0.04, OUTFIT);
    t.boxBottom(-0.11, 0.28, fz + 0.05, 0.1, 0.1, 0.04, 0x262b30, 'metal');
    t.boxBottom(0.11, 0.28, fz + 0.05, 0.1, 0.1, 0.04, 0x262b30, 'metal');
    t.boxBottom(0, 0.2, fz + 0.05, 0.14, 0.03, 0.02, 0x111111);
  } else if (o === 'cyber_shinobi') {
    t.boxBottom(0, top - 0.06, 0.02, b.shoulderW + 0.04, 0.08, b.depth + 0.04, 0xb82424); // scarf
    t.boxBottom(0.12, top - 0.3, -fz - 0.02, 0.08, 0.3, 0.02, 0xb82424); // scarf tail
    t.boxBottom(0, 0.2, fz + 0.02, b.torsoW - 0.08, 0.06, 0.04, OUTFIT, 'metal');
    t.boxBottom(0, 0.32, fz + 0.02, b.torsoW - 0.08, 0.06, 0.04, OUTFIT, 'metal');
    t.boxBottom(0, 0.26, fz + 0.045, 0.1, 0.1, 0.02, GLOW, 'emissive');
  } else if (o === 'field_medic') {
    t.boxBottom(0, 0.16, fz + 0.02, b.torsoW - 0.08, b.torsoH - 0.12, 0.03, 0xf2eee6);
    t.boxBottom(0, 0.3, fz + 0.04, 0.16, 0.05, 0.02, 0xe02c2c, 'emissive');
    t.boxBottom(0, 0.255, fz + 0.04, 0.05, 0.14, 0.02, 0xe02c2c, 'emissive');
    t.boxBottom(-b.torsoW / 2 - 0.005, top - 0.2, 0, 0.02, 0.08, 0.1, 0xe02c2c); // armband
  } else if (o === 'neon_runner') {
    t.boxBottom(0, 0.16, fz + 0.02, b.torsoW - 0.1, b.torsoH - 0.12, 0.03, OUTFIT, 'metal');
    t.boxBottom(-0.14, 0.16, fz + 0.04, 0.03, b.torsoH - 0.14, 0.02, GLOW, 'emissive');
    t.boxBottom(0.14, 0.16, fz + 0.04, 0.03, b.torsoH - 0.14, 0.02, GLOW, 'emissive');
    t.boxBottom(0, top - 0.06, 0, b.shoulderW, 0.04, b.depth, GLOW, 'emissive');
  } else {
    // classic_ranger: tactical plate carrier with mag pouches & radio
    t.boxBottom(0, 0.16, fz + 0.03, b.torsoW - 0.08, b.torsoH - 0.14, 0.05, OUTFIT);
    for (const px of [-0.12, 0, 0.12]) {
      t.boxBottom(px, 0.17, fz + 0.065, 0.09, 0.11, 0.04, mix(OUTFIT, 0x000000, 0.2));
      t.boxBottom(px, 0.27, fz + 0.065, 0.09, 0.02, 0.045, mix(OUTFIT, 0x000000, 0.35));
    }
    t.boxBottom(b.torsoW * 0.28, top - 0.18, fz + 0.06, 0.06, 0.1, 0.05, 0x2b3036, 'metal'); // radio
    t.boxBottom(b.torsoW * 0.28 + 0.02, top - 0.08, fz + 0.06, 0.012, 0.08, 0.012, 0x111111); // antenna
    t.boxBottom(-b.torsoW * 0.28, top - 0.14, fz + 0.06, 0.07, 0.04, 0.02, GLOW, 'emissive'); // IFF strobe
  }
  // Holster on the right hip
  t.boxBottom(-b.torsoW / 2 - 0.03, 0.0, 0.02, 0.06, 0.14, 0.12, STRAP);

  // Back gear (rear face at -fz)
  const bz = -fz;
  const pk = loadout.backpack;
  if (pk === 'katana_pack') {
    t.boxBottom(0, 0.22, bz - 0.05, 0.32, 0.28, 0.1, 0x22252b, 'metal');
    t.boxBottom(-0.16, 0.06, bz - 0.12, 0.06, 0.92, 0.06, 0x1e2024, 'metal');
    t.boxBottom(0.16, 0.06, bz - 0.12, 0.06, 0.92, 0.06, 0x1e2024, 'metal');
    t.boxBottom(-0.16, 0.92, bz - 0.12, 0.13, 0.04, 0.09, 0xd9a844, 'metal');
    t.boxBottom(0.16, 0.92, bz - 0.12, 0.13, 0.04, 0.09, 0xd9a844, 'metal');
    t.boxBottom(-0.16, 0.96, bz - 0.12, 0.05, 0.22, 0.05, GLOW, 'emissive');
    t.boxBottom(0.16, 0.96, bz - 0.12, 0.05, 0.22, 0.05, GLOW, 'emissive');
  } else if (pk === 'bio_canister') {
    t.boxBottom(0, 0.16, bz - 0.08, 0.44, 0.42, 0.18, 0x353d38, 'metal');
    t.boxBottom(-0.11, 0.2, bz - 0.17, 0.14, 0.34, 0.14, PACK, 'emissive');
    t.boxBottom(0.11, 0.2, bz - 0.17, 0.14, 0.34, 0.14, PACK, 'emissive');
  } else if (pk === 'radio_dish') {
    t.boxBottom(0, 0.18, bz - 0.08, 0.42, 0.42, 0.18, PACK, 'metal');
    t.boxBottom(-0.15, 0.6, bz - 0.1, 0.04, 0.5, 0.04, 0x8e98a4, 'metal');
    t.boxBottom(0.13, 0.54, bz - 0.17, 0.24, 0.24, 0.05, 0xdce4ec, 'metal');
    t.boxBottom(0.13, 0.64, bz - 0.2, 0.07, 0.07, 0.05, GLOW, 'emissive');
  } else if (pk === 'snow_pack') {
    t.boxBottom(0, 0.14, bz - 0.11, 0.46, 0.46, 0.24, PACK);
    t.boxBottom(0, 0.6, bz - 0.11, 0.52, 0.14, 0.16, 0xe8eff5);
    t.boxBottom(0.23, 0.18, bz - 0.2, 0.05, 0.44, 0.05, 0x8d5a34);
    t.boxBottom(0.23, 0.6, bz - 0.2, 0.17, 0.05, 0.05, 0xcfd6dd, 'metal');
  } else if (pk === 'ammo_drum') {
    t.boxBottom(0, 0.16, bz - 0.11, 0.5, 0.44, 0.24, PACK, 'metal');
    t.boxBottom(0, 0.28, bz - 0.25, 0.4, 0.13, 0.05, 0xd9a844, 'metal');
    t.boxBottom(0, 0.46, bz - 0.11, 0.34, 0.11, 0.17, 0x2b3036, 'metal');
  } else if (pk === 'neon_wings') {
    t.boxBottom(0, 0.2, bz - 0.06, 0.32, 0.34, 0.12, 0x242a34, 'metal');
    t.boxBottom(-0.44, 0.32, bz - 0.14, 0.6, 0.12, 0.07, GLOW, 'emissive');
    t.boxBottom(0.44, 0.32, bz - 0.14, 0.6, 0.12, 0.07, GLOW, 'emissive');
    t.boxBottom(-0.54, 0.5, bz - 0.16, 0.5, 0.1, 0.07, PACK, 'emissive');
    t.boxBottom(0.54, 0.5, bz - 0.16, 0.5, 0.1, 0.07, PACK, 'emissive');
  } else if (pk === 'med_frame') {
    t.boxBottom(0, 0.18, bz - 0.09, 0.44, 0.42, 0.18, 0xf2eee6);
    t.boxBottom(0, 0.33, bz - 0.19, 0.2, 0.07, 0.03, PACK, 'emissive');
    t.boxBottom(0, 0.265, bz - 0.19, 0.07, 0.2, 0.03, PACK, 'emissive');
  } else {
    // dual_thruster
    t.boxBottom(0, 0.18, bz - 0.08, 0.42, 0.4, 0.16, PACK, 'metal');
    t.boxBottom(-0.13, 0.12, bz - 0.15, 0.13, 0.26, 0.11, 0x2c323a, 'metal');
    t.boxBottom(0.13, 0.12, bz - 0.15, 0.13, 0.26, 0.11, 0x2c323a, 'metal');
    t.boxBottom(0, 0.38, bz - 0.18, 0.22, 0.09, 0.05, GLOW, 'emissive');
  }
  const torsoMesh = t.build(materials, { cloneMaterials: true });

  // =====================================================================
  // HEAD & FACE in head space: y = 0 at the top of the torso
  // =====================================================================
  const h = new VoxelAssembler();
  const lids = new VoxelAssembler();
  const shape = loadout.faceShape;
  const HW = shape === 'round' ? 0.41 : shape === 'angular' ? 0.38 : 0.39;
  const HH = shape === 'long' ? 0.47 : shape === 'round' ? 0.42 : 0.44;
  const HD = 0.39;
  const yb = b.neck; // chin height
  const yt = yb + HH; // crown
  const zc = 0.015; // head centre z (slightly forward of the neck)
  const zf = zc + HD / 2; // face plane
  const ey = yb + HH * 0.56; // eye line
  const my = yb + HH * 0.2; // mouth line
  const coversTop = COVERS_TOP.has(loadout.headgear);
  const maskLowerFace = loadout.headgear === 'hazmat_mask';

  // Neck (with trapezius shading) & head volumes per face shape
  h.boxBottom(0, -0.03, 0, 0.15, b.neck + 0.05, 0.15, SKIN_SHADE);
  const jawH = 0.11;
  if (shape === 'square') {
    h.boxBottom(0, yb, zc, HW, HH, HD, SKIN);
  } else if (shape === 'round') {
    h.boxBottom(0, yb + jawH, zc, HW, HH - jawH, HD, SKIN);
    h.boxBottom(0, yb, zc, HW - 0.05, jawH, HD - 0.03, SKIN);
    h.boxBottom(-(HW / 2 - 0.035), yb + 0.06, zc + 0.04, 0.05, 0.08, HD - 0.12, SKIN); // full cheeks
    h.boxBottom(HW / 2 - 0.035, yb + 0.06, zc + 0.04, 0.05, 0.08, HD - 0.12, SKIN);
  } else if (shape === 'angular') {
    h.boxBottom(0, yb + jawH, zc, HW, HH - jawH, HD, SKIN);
    h.boxBottom(0, yb + 0.04, zc, HW - 0.1, jawH - 0.04, HD - 0.04, SKIN);
    h.boxBottom(0, yb, zc + 0.02, HW - 0.2, 0.05, HD - 0.1, SKIN);
    h.boxBottom(-(HW / 2 - 0.02), ey - 0.07, zf - 0.03, 0.05, 0.04, 0.07, SKIN_SHADE); // cheekbones
    h.boxBottom(HW / 2 - 0.02, ey - 0.07, zf - 0.03, 0.05, 0.04, 0.07, SKIN_SHADE);
  } else if (shape === 'long') {
    h.boxBottom(0, yb + jawH, zc, HW, HH - jawH, HD, SKIN);
    h.boxBottom(0, yb, zc, HW - 0.08, jawH, HD - 0.04, SKIN);
  } else {
    // oval
    h.boxBottom(0, yb + jawH, zc, HW, HH - jawH, HD, SKIN);
    h.boxBottom(0, yb, zc, HW - 0.06, jawH, HD - 0.03, SKIN);
    h.boxBottom(0, yt - 0.02, zc, HW - 0.04, 0.02, HD - 0.04, SKIN); // rounded crown
  }
  // Brow ridge & jaw shadow for depth
  h.boxBottom(0, ey + 0.045, zf - 0.002, HW - 0.1, 0.03, 0.012, SKIN);
  h.boxBottom(0, yb + 0.005, zf - 0.03, 0.12, 0.02, 0.03, SKIN_SHADE);

  // Ears
  for (const s of [-1, 1]) {
    h.boxBottom(s * (HW / 2 + 0.014), ey - 0.09, zc - 0.02, 0.03, 0.1, 0.08, SKIN);
    h.boxBottom(s * (HW / 2 + 0.03), ey - 0.07, zc - 0.015, 0.008, 0.06, 0.04, SKIN_DEEP);
  }

  // Eyes: sclera, iris, pupil, catch-light, lash line, lid shape
  const eyeStyle = loadout.eyeStyle;
  const sclH = eyeStyle === 'wide' ? 0.058 : eyeStyle === 'narrow' ? 0.03 : eyeStyle === 'gentle' ? 0.05 : 0.044;
  const sclW = 0.078;
  for (const s of [-1, 1]) {
    const ex = s * 0.085;
    const eyeHidden = loadout.faceDetail === 'eye_patch' && s === 1;
    if (!eyeHidden) {
      h.box(ex, ey, zf + 0.004, sclW, sclH, 0.008, 0xf4f1ea);
      const irisH = Math.min(0.044, sclH);
      h.box(ex - s * 0.004, ey - 0.002, zf + 0.009, 0.04, irisH, 0.006, IRIS, cyberEyes ? 'emissive' : 'matte');
      h.box(ex - s * 0.004, ey - 0.002, zf + 0.013, 0.018, Math.min(0.02, irisH), 0.004, cyberEyes ? mix(IRIS, 0xffffff, 0.5) : 0x0b0b0d, cyberEyes ? 'emissive' : 'matte');
      h.box(ex - s * 0.004 - 0.009, ey + Math.min(0.012, irisH * 0.3), zf + 0.016, 0.009, 0.009, 0.003, 0xffffff, 'emissive');
    }
    // lash line
    h.box(ex, ey + sclH / 2 + 0.004, zf + 0.007, sclW + 0.012, 0.011, 0.01, 0x1a1412);
    if (eyeStyle === 'sleepy') {
      h.box(ex, ey + sclH * 0.2, zf + 0.012, sclW + 0.012, sclH * 0.55, 0.008, SKIN_SHADE);
    } else if (eyeStyle === 'fierce') {
      h.box(ex - s * 0.026, ey + sclH / 2 - 0.008, zf + 0.013, 0.028, 0.02, 0.008, SKIN_SHADE); // inner corner hooded
    } else if (eyeStyle === 'gentle') {
      h.box(ex, ey - sclH / 2 - 0.006, zf + 0.006, sclW, 0.008, 0.008, SKIN_SHADE);
    }
    // under-eye shading
    h.box(ex, ey - sclH / 2 - 0.016, zf + 0.002, sclW - 0.01, 0.01, 0.006, mix(SKIN, SKIN_SHADE, 0.6));
    // blink lids (shown briefly by the engine)
    if (!eyeHidden) lids.box(ex, ey, zf + 0.018, sclW + 0.012, sclH + 0.012, 0.01, SKIN_SHADE);
  }

  // Brows
  const browY = ey + sclH / 2 + 0.032;
  const browStyle = loadout.browStyle;
  for (const s of [-1, 1]) {
    const bx = s * 0.087;
    const th = browStyle === 'thick' ? 0.03 : browStyle === 'thin' ? 0.012 : 0.02;
    if (browStyle === 'arched') {
      h.box(bx - s * 0.03, browY - 0.004, zf + 0.012, 0.035, th, 0.014, BROW);
      h.box(bx + s * 0.005, browY + 0.006, zf + 0.012, 0.035, th, 0.014, BROW);
      h.box(bx + s * 0.035, browY - 0.006, zf + 0.012, 0.025, th, 0.014, BROW);
    } else if (browStyle === 'angry') {
      h.box(bx - s * 0.028, browY - 0.012, zf + 0.012, 0.04, th + 0.004, 0.014, BROW);
      h.box(bx + s * 0.02, browY + 0.004, zf + 0.012, 0.05, th, 0.014, BROW);
    } else if (browStyle === 'split' && s === 1) {
      h.box(bx - s * 0.03, browY, zf + 0.012, 0.03, th, 0.014, BROW);
      h.box(bx + s * 0.03, browY, zf + 0.012, 0.03, th, 0.014, BROW);
    } else {
      h.box(bx, browY, zf + 0.012, 0.09, th, 0.014, BROW);
    }
  }

  // Nose
  if (!maskLowerFace) {
    const ns = loadout.noseStyle;
    if (ns === 'button') {
      h.boxBottom(0, ey - 0.1, zf, 0.05, 0.05, 0.035, SKIN);
    } else if (ns === 'broad') {
      h.boxBottom(0, ey - 0.1, zf, 0.075, 0.07, 0.04, SKIN);
      h.boxBottom(0, ey - 0.03, zf, 0.04, 0.05, 0.02, SKIN);
    } else if (ns === 'hooked') {
      h.boxBottom(0, ey - 0.05, zf, 0.04, 0.07, 0.05, SKIN);
      h.boxBottom(0, ey - 0.1, zf, 0.05, 0.05, 0.035, SKIN);
    } else if (ns === 'small') {
      h.boxBottom(0, ey - 0.085, zf, 0.035, 0.05, 0.028, SKIN);
    } else {
      h.boxBottom(0, ey - 0.1, zf, 0.048, 0.1, 0.04, SKIN);
    }
    h.box(-0.016, ey - 0.098, zf + 0.025, 0.012, 0.008, 0.012, SKIN_DEEP); // nostrils
    h.box(0.016, ey - 0.098, zf + 0.025, 0.012, 0.008, 0.012, SKIN_DEEP);
    h.box(0, ey - 0.1, zf + 0.018, 0.05, 0.006, 0.02, SKIN_SHADE); // nose shadow
  }

  // Mouth / expression
  if (!maskLowerFace) {
    const m = loadout.mouthStyle;
    const mz = zf + 0.006;
    if (m === 'grin' || m === 'determined') {
      h.box(0, my, mz, 0.11, m === 'grin' ? 0.03 : 0.022, 0.01, 0xf2ece4);
      h.box(0, my + (m === 'grin' ? 0.019 : 0.015), mz + 0.002, 0.12, 0.01, 0.01, LIP);
      h.box(0, my - (m === 'grin' ? 0.019 : 0.015), mz + 0.002, 0.1, 0.01, 0.01, LIP);
      if (m === 'grin') {
        h.box(-0.062, my + 0.012, mz + 0.002, 0.016, 0.012, 0.01, LIP);
        h.box(0.062, my + 0.012, mz + 0.002, 0.016, 0.012, 0.01, LIP);
      }
      for (const tx of [-0.03, 0, 0.03]) h.box(tx, my, mz + 0.004, 0.003, 0.02, 0.006, 0xc9c2b8);
    } else {
      h.box(0, my, mz, 0.1, 0.016, 0.01, mix(LIP, 0x000000, 0.45));
      h.box(0, my - 0.017, mz - 0.002, 0.08, 0.016, 0.008, LIP);
      if (m === 'smirk') h.box(-0.055, my + 0.008, mz, 0.03, 0.012, 0.01, mix(LIP, 0x000000, 0.25));
      if (m === 'calm') {
        h.box(-0.055, my + 0.008, mz, 0.022, 0.012, 0.01, mix(LIP, 0x000000, 0.25));
        h.box(0.055, my + 0.008, mz, 0.022, 0.012, 0.01, mix(LIP, 0x000000, 0.25));
      }
      if (m === 'frown') {
        h.box(-0.055, my - 0.01, mz, 0.02, 0.012, 0.01, mix(LIP, 0x000000, 0.25));
        h.box(0.055, my - 0.01, mz, 0.02, 0.012, 0.01, mix(LIP, 0x000000, 0.25));
      }
    }
    // philtrum & chin dimple
    h.box(0, my + 0.04, zf + 0.002, 0.018, 0.03, 0.006, SKIN_SHADE);
    // subtle cheek warmth
    h.box(-0.12, ey - 0.07, zf + 0.002, 0.05, 0.03, 0.004, mix(SKIN, 0xe07a6a, 0.22));
    h.box(0.12, ey - 0.07, zf + 0.002, 0.05, 0.03, 0.004, mix(SKIN, 0xe07a6a, 0.22));
  }

  // Facial hair
  const fh = loadout.facialHair;
  if (!maskLowerFace && fh !== 'none') {
    const beardC = mix(HAIR, 0x000000, 0.1);
    const jawW = shape === 'square' ? HW : HW - 0.06;
    if (fh === 'stubble') {
      const sc = mix(SKIN, HAIR, 0.32);
      h.box(0, yb + 0.05, zf - 0.006, jawW - 0.02, 0.1, 0.012, sc);
      h.box(0, my + 0.03, zf + 0.004, 0.11, 0.02, 0.006, sc);
      for (const s of [-1, 1]) h.box(s * (jawW / 2), yb + 0.08, zc + 0.05, 0.012, 0.12, 0.18, sc);
    } else {
      if (fh === 'mustache' || fh === 'goatee' || fh === 'full_beard') {
        h.box(0, my + 0.028, zf + 0.012, 0.13, 0.026, 0.018, beardC);
        h.box(-0.068, my + 0.012, zf + 0.012, 0.02, 0.03, 0.016, beardC);
        h.box(0.068, my + 0.012, zf + 0.012, 0.02, 0.03, 0.016, beardC);
      }
      if (fh === 'goatee') {
        h.box(0, yb + 0.03, zf + 0.008, 0.08, 0.07, 0.02, beardC);
      }
      if (fh === 'chin_strap') {
        h.box(0, yb + 0.012, zf - 0.004, jawW - 0.02, 0.024, 0.022, beardC);
        for (const s of [-1, 1]) h.box(s * (jawW / 2), yb + 0.08, zc + 0.04, 0.016, 0.14, 0.03, beardC);
      }
      if (fh === 'full_beard') {
        h.boxBottom(0, yb - 0.05, zf - 0.07, jawW + 0.02, my - yb + 0.04, 0.1, beardC);
        for (const s of [-1, 1]) h.boxBottom(s * (jawW / 2 + 0.005), yb, zc + 0.02, 0.025, ey - yb - 0.06, HD - 0.12, beardC);
        h.box(0, my - 0.005, zf + 0.034, 0.08, 0.018, 0.01, mix(LIP, 0x000000, 0.3)); // mouth gap
      }
    }
  }

  // Scars & marks
  const fd = loadout.faceDetail;
  const scar = mix(SKIN, 0xc06a60, 0.55);
  if (fd === 'scar_eye') {
    h.box(-0.085 + 0.01, ey, zf + 0.02, 0.012, 0.13, 0.006, scar);
  } else if (fd === 'scar_cheek') {
    for (let k = 0; k < 4; k++) h.box(0.1 + k * 0.016, ey - 0.06 - k * 0.018, zf + 0.004, 0.02, 0.014, 0.006, scar);
  } else if (fd === 'freckles') {
    const dots: Array<[number, number]> = [[-0.12, -0.05], [-0.1, -0.075], [-0.14, -0.08], [-0.03, -0.06], [0.03, -0.06], [0.12, -0.05], [0.1, -0.075], [0.14, -0.08], [-0.07, -0.09], [0.07, -0.09]];
    for (const [dx, dy] of dots) h.box(dx, ey + dy, zf + 0.004, 0.01, 0.01, 0.004, SKIN_DEEP);
  } else if (fd === 'war_paint') {
    for (const s of [-1, 1]) {
      h.box(s * 0.09, ey - 0.05, zf + 0.004, 0.1, 0.016, 0.005, 0xd43838);
      h.box(s * 0.1, ey - 0.075, zf + 0.004, 0.07, 0.014, 0.005, 0xd43838);
    }
  } else if (fd === 'kanji_tattoo') {
    const ink = 0x1f2937;
    h.box(0.14, ey - 0.05, zf + 0.003, 0.05, 0.008, 0.005, ink);
    h.box(0.14, ey - 0.08, zf + 0.003, 0.008, 0.06, 0.005, ink);
    h.box(0.13, ey - 0.1, zf + 0.003, 0.03, 0.008, 0.005, ink);
    h.box(-0.07, 0.02, 0.08, 0.008, 0.06, 0.005, ink); // neck stroke
  } else if (fd === 'eye_patch') {
    h.box(0.085, ey, zf + 0.018, 0.1, 0.08, 0.016, 0x151515);
    h.box(0.02, ey + 0.05, zf + 0.012, 0.16, 0.012, 0.01, 0x151515);
    h.box(-0.11, ey + 0.075, zf - 0.02, 0.16, 0.012, 0.06, 0x151515);
  } else if (fd === 'glasses') {
    const frame = 0x111827;
    for (const s of [-1, 1]) {
      h.box(s * 0.085, ey, zf + 0.03, 0.1, 0.012, 0.01, frame);
      h.box(s * 0.085, ey - 0.03, zf + 0.03, 0.1, 0.01, 0.01, frame);
      h.box(s * 0.135, ey - 0.014, zf + 0.03, 0.01, 0.04, 0.01, frame);
      h.box(s * 0.085, ey - 0.014, zf + 0.026, 0.09, 0.028, 0.004, 0x7dd3fc, 'emissive');
      h.box(s * (HW / 2 + 0.005), ey + 0.004, zc + 0.06, 0.008, 0.01, HD * 0.55, frame); // temple arms
    }
    h.box(0, ey + 0.004, zf + 0.03, 0.05, 0.01, 0.01, frame);
  } else if (fd === 'bandage') {
    h.box(0, ey - 0.04, zf + 0.045, 0.1, 0.025, 0.006, 0xf2ece0);
  }

  // Hair
  const hs = loadout.hairStyle;
  const fringeY = ey + 0.085;
  const sideHair = (fromY: number, thick = 0.02, back = true) => {
    for (const s of [-1, 1]) h.boxBottom(s * (HW / 2 + thick / 2 - 0.002), fromY, zc - 0.03, thick, yt - fromY, HD - 0.1, HAIR_SHADE);
    if (back) h.boxBottom(0, fromY, zc - HD / 2 - thick / 2 + 0.002, HW + 0.01, yt - fromY, thick, HAIR_SHADE);
  };
  if (hs !== 'bald') {
    if (hs === 'buzz') {
      sideHair(ey + 0.01, 0.012);
      if (!coversTop) h.boxBottom(0, yt - 0.01, zc - 0.005, HW + 0.012, 0.025, HD + 0.006, HAIR);
    } else if (hs === 'undercut') {
      sideHair(ey + 0.02, 0.01);
      if (!coversTop) {
        h.boxBottom(0, yt - 0.04, zc - 0.01, HW - 0.04, 0.12, HD - 0.04, HAIR);
        h.boxBottom(-0.04, yt - 0.03, zf - 0.04, HW * 0.62, 0.07, 0.1, HAIR); // swept fringe
        h.boxBottom(-0.1, yt - 0.01, zf - 0.02, 0.12, 0.06, 0.05, mix(HAIR, 0xffffff, 0.08));
      }
    } else if (hs === 'side_part') {
      sideHair(ey - 0.01, 0.025);
      if (!coversTop) {
        h.boxBottom(0, yt - 0.02, zc, HW + 0.03, 0.07, HD + 0.03, HAIR);
        h.boxBottom(-0.08, yt + 0.045, zc, 0.012, 0.01, HD, HAIR_SHADE); // part line
        h.boxBottom(0.05, fringeY + 0.02, zf - 0.01, HW * 0.62, 0.07, 0.04, HAIR); // swept bangs
      }
    } else if (hs === 'spiky') {
      sideHair(ey + 0.01, 0.02);
      if (!coversTop) {
        h.boxBottom(0, yt - 0.02, zc, HW + 0.02, 0.06, HD + 0.02, HAIR);
        const spikes: Array<[number, number, number]> = [[-0.13, 0.12, 0.08], [-0.04, 0.16, 0.1], [0.06, 0.14, 0.06], [0.14, 0.1, 0.02], [-0.1, 0.12, -0.08], [0.02, 0.15, -0.06], [0.12, 0.1, -0.1], [-0.02, 0.1, 0.16]];
        for (const [sx, sh, sz] of spikes) h.boxBottom(sx, yt + 0.02, zc + sz, 0.07, sh, 0.07, HAIR);
      }
    } else if (hs === 'ponytail') {
      sideHair(ey, 0.02);
      if (!coversTop) h.boxBottom(0, yt - 0.015, zc - 0.005, HW + 0.02, 0.04, HD + 0.02, HAIR);
      h.boxBottom(0, yt - 0.12, zc - HD / 2 - 0.04, 0.07, 0.06, 0.06, 0xd43b2c); // tie
      h.boxBottom(0, yt - 0.42, zc - HD / 2 - 0.06, 0.08, 0.32, 0.08, HAIR);
      h.boxBottom(0, yt - 0.5, zc - HD / 2 - 0.05, 0.05, 0.1, 0.06, HAIR_SHADE);
    } else if (hs === 'bob') {
      for (const s of [-1, 1]) h.boxBottom(s * (HW / 2 + 0.02), yb + 0.08, zc - 0.01, 0.04, yt - yb - 0.08, HD - 0.04, HAIR);
      h.boxBottom(0, yb + 0.08, zc - HD / 2 - 0.02, HW + 0.08, yt - yb - 0.08, 0.04, HAIR);
      if (!coversTop) h.boxBottom(0, yt - 0.02, zc, HW + 0.06, 0.06, HD + 0.06, HAIR);
      h.boxBottom(0, fringeY + 0.005, zf - 0.005, HW + 0.02, yt - fringeY, 0.04, HAIR); // straight bangs
    } else if (hs === 'long') {
      for (const s of [-1, 1]) h.boxBottom(s * (HW / 2 + 0.02), yb - 0.14, zc - 0.03, 0.04, yt - yb + 0.12, HD - 0.06, HAIR);
      h.boxBottom(0, yb - 0.2, zc - HD / 2 - 0.025, HW + 0.08, yt - yb + 0.18, 0.05, HAIR);
      if (!coversTop) h.boxBottom(0, yt - 0.02, zc, HW + 0.06, 0.06, HD + 0.06, HAIR);
      for (const s of [-1, 1]) h.boxBottom(s * 0.12, fringeY - 0.02, zf - 0.005, 0.12, yt - fringeY + 0.02, 0.04, HAIR);
    } else if (hs === 'topknot') {
      sideHair(ey + 0.03, 0.012);
      if (!coversTop) {
        h.boxBottom(0, yt - 0.01, zc - 0.01, HW + 0.012, 0.03, HD + 0.008, HAIR);
        h.boxBottom(0, yt + 0.02, zc - 0.06, 0.13, 0.1, 0.13, HAIR);
        h.boxBottom(0, yt + 0.04, zc - 0.06, 0.14, 0.025, 0.14, 0xd9a844, 'metal');
        h.boxBottom(0, yt + 0.12, zc - 0.07, 0.07, 0.04, 0.1, HAIR_SHADE);
      }
    } else if (hs === 'afro') {
      if (coversTop) {
        for (const s of [-1, 1]) h.boxBottom(s * (HW / 2 + 0.05), ey - 0.04, zc - 0.03, 0.1, 0.16, HD - 0.04, HAIR);
      } else {
        h.boxBottom(0, ey + 0.07, zc - 0.03, HW + 0.18, yt - ey + 0.1, HD + 0.16, HAIR);
        h.boxBottom(0, yt + 0.12, zc - 0.03, HW + 0.08, 0.06, HD + 0.08, HAIR_SHADE);
      }
    } else if (hs === 'braids') {
      sideHair(ey + 0.01, 0.02);
      if (!coversTop) h.boxBottom(0, yt - 0.015, zc, HW + 0.02, 0.04, HD + 0.02, HAIR);
      for (const s of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          h.boxBottom(s * 0.12, yt - 0.18 - k * 0.07, zc - HD / 2 - 0.035, 0.06, 0.065, 0.06, k % 2 ? HAIR_SHADE : HAIR);
        }
        h.boxBottom(s * 0.12, yt - 0.56, zc - HD / 2 - 0.035, 0.04, 0.04, 0.04, 0xd43b2c);
      }
    } else if (hs === 'mohawk') {
      for (const s of [-1, 1]) h.boxBottom(s * (HW / 2 + 0.004), ey + 0.01, zc - 0.03, 0.01, yt - ey - 0.01, HD - 0.1, mix(SKIN, HAIR, 0.25));
      if (!coversTop) h.boxBottom(0, yt - 0.02, zc - 0.01, 0.08, 0.16, HD + 0.04, HAIR);
    }
  }

  // Headgear (open-face)
  const hg = loadout.headgear;
  if (hg === 'tactical_cap') {
    h.boxBottom(0, yt - 0.06, zc, HW + 0.035, 0.11, HD + 0.035, HEADGEAR_HEX);
    h.boxBottom(0, yt + 0.05, zc, HW - 0.04, 0.025, HD - 0.04, HEADGEAR_HEX);
    h.boxBottom(0, yt - 0.06, zf + 0.07, HW * 0.82, 0.025, 0.15, mix(HEADGEAR_HEX, 0x000000, 0.2)); // brim
    h.boxBottom(0, yt - 0.02, zf + 0.018, 0.08, 0.05, 0.01, 0xd9a844); // patch
    h.boxBottom(0, yt - 0.05, zc - HD / 2 - 0.02, 0.1, 0.03, 0.02, 0x1b1f24); // strap
  } else if (hg === 'headband') {
    h.boxBottom(0, ey + 0.065, zc, HW + 0.026, 0.055, HD + 0.026, 0xf2efe8);
    h.box(0, ey + 0.093, zf + 0.016, 0.05, 0.04, 0.006, 0xd43b2c);
    h.boxBottom(-0.03, ey + 0.0, zc - HD / 2 - 0.03, 0.04, 0.1, 0.02, 0xf2efe8);
    h.boxBottom(0.03, ey - 0.03, zc - HD / 2 - 0.035, 0.04, 0.12, 0.02, 0xf2efe8);
  } else if (hg === 'beanie') {
    h.boxBottom(0, yt - 0.11, zc - 0.01, HW + 0.045, 0.17, HD + 0.045, HEADGEAR_HEX);
    h.boxBottom(0, yt - 0.12, zc - 0.01, HW + 0.06, 0.06, HD + 0.06, mix(HEADGEAR_HEX, 0xffffff, 0.12));
    h.boxBottom(0, yt + 0.06, zc - 0.01, 0.08, 0.06, 0.08, 0xe8e2d4); // pompom
  } else if (hg === 'ranger_helm' || hg === 'nvg_ops') {
    const shell = hg === 'nvg_ops' ? 0x354238 : HEADGEAR_HEX;
    h.boxBottom(0, yt - 0.08, zc - 0.01, HW + 0.07, 0.15, HD + 0.07, shell);
    h.boxBottom(0, yt + 0.07, zc - 0.01, HW - 0.02, 0.035, HD - 0.02, shell);
    for (const s of [-1, 1]) h.boxBottom(s * (HW / 2 + 0.035), ey - 0.01, zc - 0.03, 0.03, yt - ey - 0.06, HD - 0.04, shell);
    h.boxBottom(0, yt - 0.09, zf + 0.04, HW + 0.04, 0.03, 0.04, mix(shell, 0x000000, 0.25)); // brow rim
    for (const s of [-1, 1]) h.boxBottom(s * (HW / 2 + 0.02), yb + 0.03, zc + 0.04, 0.014, ey - yb - 0.03, 0.02, 0x1b1f24); // chin straps
    h.box(0, yb + 0.02, zc + 0.12, HW - 0.12, 0.014, 0.02, 0x1b1f24);
    if (hg === 'nvg_ops') {
      h.boxBottom(0, yt - 0.02, zf + 0.06, 0.12, 0.06, 0.06, 0x1e2226, 'metal'); // mount
      h.boxBottom(0, yt + 0.03, zf + 0.09, 0.26, 0.1, 0.08, 0x1e2226, 'metal'); // flipped-up quad tubes
      for (const nx of [-0.09, -0.03, 0.03, 0.09]) h.box(nx, yt + 0.13, zf + 0.09, 0.045, 0.012, 0.045, 0x4ef2a1, 'emissive');
    } else {
      h.boxBottom(HW / 2 + 0.06, yt - 0.04, zc + 0.04, 0.05, 0.06, 0.1, 0x4b535c, 'metal'); // helmet lamp
      h.box(HW / 2 + 0.06, yt - 0.01, zc + 0.095, 0.04, 0.04, 0.01, GLOW, 'emissive');
    }
  } else if (hg === 'ronin_kasa') {
    h.boxBottom(0, yt - 0.02, zc, 1.0, 0.05, 1.0, 0xc99b4f);
    h.boxBottom(0, yt + 0.03, zc, 0.78, 0.06, 0.78, 0xb88a42);
    h.boxBottom(0, yt + 0.09, zc, 0.54, 0.06, 0.54, 0xa8793a);
    h.boxBottom(0, yt + 0.15, zc, 0.3, 0.05, 0.3, 0x8f662b);
    h.boxBottom(0, yt + 0.2, zc, 0.1, 0.04, 0.1, 0x6e4c1f);
    for (const s of [-1, 1]) h.boxBottom(s * (HW / 2 - 0.01), yb + 0.02, zf - 0.04, 0.01, yt - yb - 0.02, 0.01, 0x7f1d1d); // chin cords
  } else if (hg === 'snow_ushanka') {
    h.boxBottom(0, yt - 0.07, zc - 0.01, HW + 0.08, 0.16, HD + 0.08, HEADGEAR_HEX);
    h.boxBottom(0, yt - 0.08, zf + 0.03, HW + 0.06, 0.11, 0.05, 0xe4e8ee);
    for (const s of [-1, 1]) h.boxBottom(s * (HW / 2 + 0.045), yb + 0.02, zc - 0.01, 0.06, yt - yb - 0.08, HD - 0.08, 0xe4e8ee);
  } else if (hg === 'hazmat_mask') {
    const mz = zf + 0.03;
    h.boxBottom(0, my - 0.07, mz, 0.26, ey - my - 0.0, 0.1, 0x3b4239);
    h.boxBottom(0, my - 0.05, mz + 0.07, 0.12, 0.09, 0.06, 0x4c544b, 'metal');
    for (const s of [-1, 1]) {
      h.boxBottom(s * 0.15, my - 0.06, mz + 0.03, 0.1, 0.1, 0.1, 0x262b26, 'metal');
      h.box(s * 0.15, my - 0.01, mz + 0.085, 0.07, 0.07, 0.01, 0x1a1d1a);
      h.boxBottom(s * (HW / 2 + 0.01), ey - 0.06, zc - 0.02, 0.014, 0.04, HD - 0.02, 0x1b1f24); // head straps
    }
  } else if (hg === 'kitsune_mask') {
    // Festival fox mask worn on the side of the head
    const kx = HW / 2 + 0.035;
    h.boxBottom(kx, ey - 0.02, zc + 0.02, 0.04, 0.2, 0.18, 0xf5efe6);
    h.boxBottom(kx + 0.02, ey + 0.17, zc - 0.04, 0.03, 0.07, 0.04, 0xf5efe6);
    h.boxBottom(kx + 0.02, ey + 0.17, zc + 0.08, 0.03, 0.07, 0.04, 0xf5efe6);
    h.box(kx + 0.025, ey + 0.08, zc + 0.02, 0.01, 0.02, 0.1, 0xd43838);
    h.box(kx + 0.025, ey + 0.02, zc + 0.02, 0.01, 0.015, 0.06, 0xd43838);
    h.box(kx + 0.025, ey + 0.04, zc + 0.1, 0.012, 0.03, 0.03, 0x111111);
    h.boxBottom(0, ey + 0.11, zc, HW + 0.02, 0.014, HD + 0.02, 0xd43838); // cord
  } else if (hg === 'cyber_kabuto') {
    h.boxBottom(0, yt - 0.07, zc - 0.01, HW + 0.08, 0.15, HD + 0.08, 0x22262e, 'metal');
    h.boxBottom(0, yt + 0.08, zc - 0.01, HW - 0.04, 0.04, HD - 0.04, 0x22262e, 'metal');
    h.boxBottom(0, yt - 0.08, zf + 0.05, HW + 0.06, 0.04, 0.05, 0xf2c641, 'metal');
    h.boxBottom(-0.16, yt - 0.04, zf + 0.06, 0.06, 0.24, 0.04, 0xf2c641, 'metal'); // kuwagata horns
    h.boxBottom(0.16, yt - 0.04, zf + 0.06, 0.06, 0.24, 0.04, 0xf2c641, 'metal');
    h.boxBottom(0, yt - 0.04, zf + 0.07, 0.07, 0.07, 0.03, GLOW, 'emissive');
    for (let k = 0; k < 3; k++) {
      h.boxBottom(0, yt - 0.14 - k * 0.07, zc - 0.05 - k * 0.02, HW + 0.12 + k * 0.06, 0.06, HD - 0.04 + k * 0.03, k % 2 ? 0x7f1d1d : 0x9c2222);
    }
  } else if (hg === 'crowned_visor') {
    h.boxBottom(0, yt - 0.06, zc, HW + 0.04, 0.05, HD + 0.04, 0x202836, 'metal');
    h.boxBottom(0, yt - 0.01, zc, HW + 0.05, 0.025, HD + 0.05, GLOW, 'emissive');
    for (const cx of [-0.14, 0, 0.14]) h.boxBottom(cx, yt + 0.01, zf + 0.0, 0.05, cx === 0 ? 0.1 : 0.07, 0.03, GLOW, 'emissive');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      h.box(Math.cos(a) * 0.2, yt + 0.16, zc + Math.sin(a) * 0.2, 0.08, 0.015, 0.08, GLOW, 'emissive'); // halo
    }
  }

  const headMesh = h.build(materials, { cloneMaterials: true });
  const headGroupContent = new THREE.Group();
  headGroupContent.add(headMesh);
  const eyelids = new THREE.Group();
  eyelids.add(lids.build(materials, { cloneMaterials: true }));
  eyelids.visible = false;
  headGroupContent.add(eyelids);

  // =====================================================================
  // ARMS (sleeve, elbow pad, forearm, tactical glove with skin knuckles)
  // =====================================================================
  const armT = b.armT;
  const la = new VoxelAssembler();
  la.boxBottom(0, -0.24, 0, armT + 0.01, 0.3, armT + 0.03, JACKET); // upper sleeve
  la.boxBottom(0, -0.06, 0, armT + 0.03, 0.08, armT + 0.05, JACKET_TRIM); // shoulder seam
  la.boxBottom(0, -0.3, 0.01, armT + 0.02, 0.07, armT + 0.05, 0x2b3036, 'metal'); // elbow pad
  la.boxBottom(0, -0.44, 0, armT - 0.01, 0.16, armT, JACKET); // forearm
  la.boxBottom(0, -0.52, 0.0, armT - 0.01, 0.09, armT + 0.01, GLOVE); // glove
  la.boxBottom(0, -0.55, 0.03, armT - 0.03, 0.04, armT - 0.04, SKIN); // fingertips
  const leftArmMesh = la.build(materials, { cloneMaterials: true });

  const ra = new VoxelAssembler();
  ra.boxBottom(0, -0.14, 0.08, armT + 0.02, 0.2, 0.3, JACKET); // upper arm reaching forward
  ra.boxBottom(0, -0.12, -0.02, armT + 0.04, 0.17, 0.1, JACKET_TRIM);
  ra.boxBottom(0, -0.14, 0.26, armT, 0.18, 0.14, JACKET); // forearm
  ra.boxBottom(0, -0.15, 0.36, armT - 0.01, 0.16, 0.1, GLOVE); // gloved hand on grip
  ra.boxBottom(0.0, -0.16, 0.41, armT - 0.04, 0.05, 0.03, SKIN); // knuckles
  const rightArmMesh = ra.build(materials, { cloneMaterials: true });

  // =====================================================================
  // LEGS (cargo pants, knee pads, laced boots)
  // =====================================================================
  const buildLeg = (side: -1 | 1) => {
    const g = new THREE.Group();
    g.position.set(side * b.legGap, 0.72, 0);
    const a = new VoxelAssembler();
    const lt = b.legT;
    a.boxBottom(0, -0.44, 0, lt, 0.44, lt + 0.02, PANTS);
    a.boxBottom(side * (lt / 2 + 0.01), -0.26, 0.0, 0.03, 0.1, 0.1, mix(PANTS, 0x000000, 0.2)); // cargo pocket
    a.boxBottom(0, -0.37, lt / 2 + 0.01, lt - 0.02, 0.09, 0.04, 0x2b3036, 'metal'); // knee pad
    a.boxBottom(0, -0.7, 0.03, lt + 0.02, 0.26, lt + 0.08, BOOT);
    a.boxBottom(0, -0.72, 0.04, lt + 0.04, 0.04, lt + 0.12, 0x111214); // sole
    a.boxBottom(0, -0.62, lt / 2 + 0.07, 0.04, 0.12, 0.01, mix(BOOT, 0xffffff, 0.25)); // laces
    const m = a.build(materials, { cloneMaterials: true });
    g.add(m);
    return g;
  };

  return {
    torsoMesh,
    headGroupContent,
    eyelids,
    leftArmMesh,
    rightArmMesh,
    buildLeg,
    headY: top,
    leftShoulder: new THREE.Vector3(b.shoulderW / 2 + armT / 2 - 0.02, top - 0.04, 0),
    rightShoulder: new THREE.Vector3(-(b.shoulderW / 2 + armT / 2 + 0.02), top - 0.06, 0.08),
    eyeY: ey,
    thrusterZ: -fz - 0.2,
  };
}
