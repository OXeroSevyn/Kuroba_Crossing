/**
 * Armory: gun models ("variants") per firearm slot, per-gun attachments with real stat effects,
 * optics with magnification & reticles (scope view), unlock requirements and saved builds.
 *
 * Stats are resolved into concrete WeaponSpec overrides (see rules.applyWeaponOverrides) so the
 * combat code keeps reading WEAPONS[...] as before.
 */
import type {
  AttachmentSlot,
  FirearmId,
  GunBuild,
  GunBuilds,
  ReticleKind,
  WeaponId,
  WeaponSpec,
} from './types';

export const FIREARMS: FirearmId[] = ['pulse', 'scatter', 'rail', 'rpg'];
export const ATTACHMENT_SLOTS: AttachmentSlot[] = ['optic', 'muzzle', 'underbarrel', 'magazine', 'stock', 'laser'];

export const SLOT_LABELS: Record<AttachmentSlot, string> = {
  optic: 'Optic',
  muzzle: 'Muzzle',
  underbarrel: 'Underbarrel',
  magazine: 'Magazine',
  stock: 'Stock',
  laser: 'Laser',
};

/** Multiplicative stat effects (1 = unchanged). */
export interface StatMods {
  damage?: number;
  fireRate?: number; // >1 = faster
  mag?: number;
  reload?: number; // <1 = faster
  hipSpread?: number;
  adsSpread?: number;
  recoil?: number;
  velocity?: number;
  adsSpeed?: number; // >1 = faster aim-in
}

export interface OpticInfo {
  zoom: number;
  /** Variable-power scopes: scroll while scoped to zoom between `zoom` and `maxZoom`. */
  maxZoom?: number;
  reticle: ReticleKind;
  color: string;
}

export interface AttachmentDef {
  id: string;
  slot: AttachmentSlot;
  label: string;
  note: string;
  hex: number;
  /** Weapon level (of the gun it is mounted on) needed to unlock. */
  weaponLevel: number;
  /** Per-gun unlock level overrides (e.g. the sniper starts with its 8x scope). */
  weaponLevelBy?: Partial<Record<FirearmId, number>>;
  /** Guns that can mount it (default: pulse, scatter, rail). */
  allowed?: FirearmId[];
  mods: StatMods;
  optic?: OpticInfo;
}

const GUNS: FirearmId[] = ['pulse', 'scatter', 'rail'];
const ALL: FirearmId[] = ['pulse', 'scatter', 'rail', 'rpg'];

export const ATTACHMENTS: AttachmentDef[] = [
  // ---------------- OPTICS (every firearm has at least iron sights + one scope) ----------------
  { id: 'iron', slot: 'optic', label: 'Iron Sights', note: 'No zoom, fastest aim', hex: 0xa8b0b8, weaponLevel: 1, allowed: ALL, mods: { adsSpeed: 1.12 }, optic: { zoom: 1.0, reticle: 'iron', color: '#f8fafc' } },
  { id: 'red_dot', slot: 'optic', label: 'Micro Red Dot', note: '1.25x · crisp dot', hex: 0xff3b30, weaponLevel: 1, allowed: ALL, mods: { adsSpread: 0.9 }, optic: { zoom: 1.25, reticle: 'dot', color: '#ff3b30' } },
  { id: 'eotech_holo', slot: 'optic', label: 'EOTech Holo', note: '1.35x · ring reticle', hex: 0x3bf58a, weaponLevel: 1, allowed: ALL, mods: { adsSpread: 0.88 }, optic: { zoom: 1.35, reticle: 'holo', color: '#3bf58a' } },
  { id: 'dual_cant', slot: 'optic', label: 'Hybrid Canted', note: '1.6x · ring + dot', hex: 0xffd447, weaponLevel: 2, allowed: GUNS, mods: { adsSpread: 0.85 }, optic: { zoom: 1.6, reticle: 'holo', color: '#ffd447' } },
  { id: 'acog_4x', slot: 'optic', label: 'ACOG 4x', note: '4x scope · chevron', hex: 0xffae34, weaponLevel: 3, allowed: ALL, mods: { adsSpread: 0.7, adsSpeed: 0.9 }, optic: { zoom: 4, reticle: 'chevron', color: '#ffae34' } },
  { id: 'pgo7', slot: 'optic', label: 'PGO-7 Launcher Scope', note: '2.7x · range ladder', hex: 0xf59e0b, weaponLevel: 2, allowed: ['rpg'], mods: { adsSpread: 0.6 }, optic: { zoom: 2.7, reticle: 'pgo', color: '#f59e0b' } },
  { id: 'cyber_rail', slot: 'optic', label: 'Aurora Smart-Sight', note: '2.5x · target lock', hex: 0xff4fd8, weaponLevel: 6, allowed: GUNS, mods: { adsSpread: 0.72 }, optic: { zoom: 2.5, reticle: 'smart', color: '#ff4fd8' } },
  { id: 'thermal_nv', slot: 'optic', label: 'Thermal 3x', note: '3x · white-hot thermal', hex: 0x45f2ff, weaponLevel: 7, weaponLevelBy: { rpg: 4 }, allowed: ALL, mods: { adsSpread: 0.78 }, optic: { zoom: 3, reticle: 'thermal', color: '#45f2ff' } },
  { id: 'long_sniper', slot: 'optic', label: 'Sniper 8x', note: '8x · mil-dot', hex: 0x4ef2a1, weaponLevel: 5, weaponLevelBy: { rail: 1 }, allowed: GUNS, mods: { adsSpread: 0.5, adsSpeed: 0.82 }, optic: { zoom: 8, reticle: 'mildot', color: '#111827' } },
  { id: 'variable_scope', slot: 'optic', label: 'Variable 3-12x', note: 'Scroll to zoom 3-12x', hex: 0x22c55e, weaponLevel: 9, weaponLevelBy: { rail: 6 }, allowed: ['pulse', 'rail'], mods: { adsSpread: 0.45, adsSpeed: 0.78 }, optic: { zoom: 3, maxZoom: 12, reticle: 'mildot', color: '#ef4444' } },

  // ---------------- MUZZLE ----------------
  { id: 'slotted_brake', slot: 'muzzle', label: 'Slotted Brake', note: 'Standard', hex: 0x48505a, weaponLevel: 1, mods: {} },
  { id: 'flash_hider', slot: 'muzzle', label: 'Prong Flash Hider', note: '-5% recoil', hex: 0x3c424a, weaponLevel: 2, mods: { recoil: 0.95 } },
  { id: 'heavy_comp', slot: 'muzzle', label: 'Heavy Compensator', note: '-25% recoil, slower aim', hex: 0x68727d, weaponLevel: 3, mods: { recoil: 0.75, adsSpeed: 0.92 } },
  { id: 'suppressor', slot: 'muzzle', label: 'Spec Suppressor', note: '-15% recoil, -5% damage', hex: 0x262b32, weaponLevel: 4, mods: { recoil: 0.85, damage: 0.95, velocity: 0.95 } },
  { id: 'long_choke', slot: 'muzzle', label: 'Extended Choke', note: '-18% spread', hex: 0x525b66, weaponLevel: 5, mods: { hipSpread: 0.82, adsSpread: 0.85 } },
  { id: 'breach_spike', slot: 'muzzle', label: 'Breacher Teeth', note: '+8% damage', hex: 0xa8342a, weaponLevel: 6, mods: { damage: 1.08 } },
  { id: 'cryo_shroud', slot: 'muzzle', label: 'Cryo Barrel Shroud', note: '+15% velocity', hex: 0x7cc4ff, weaponLevel: 7, mods: { velocity: 1.15 } },
  { id: 'twin_cannon', slot: 'muzzle', label: 'Twin-Port Brake', note: '+10% damage, +10% recoil', hex: 0xd9a844, weaponLevel: 8, mods: { damage: 1.1, recoil: 1.1 } },

  // ---------------- UNDERBARREL ----------------
  { id: 'angled_grip', slot: 'underbarrel', label: 'Angled Foregrip', note: '+8% aim speed', hex: 0x2a3038, weaponLevel: 1, mods: { adsSpeed: 1.08 } },
  { id: 'vertical_grip', slot: 'underbarrel', label: 'Vertical Tac-Grip', note: '-12% recoil', hex: 0x3c434d, weaponLevel: 2, mods: { recoil: 0.88 } },
  { id: 'stubby_grip', slot: 'underbarrel', label: 'Stubby Polymer', note: '-8% recoil & hip spread', hex: 0x8f7a5b, weaponLevel: 3, mods: { recoil: 0.92, hipSpread: 0.92 } },
  { id: 'floodlight', slot: 'underbarrel', label: 'High-Beam Torch', note: '-4% hip spread', hex: 0xfff3c4, weaponLevel: 4, mods: { hipSpread: 0.96 } },
  { id: 'heavy_bipod', slot: 'underbarrel', label: 'Deployed Bipod', note: '-25% recoil, slow aim', hex: 0x5e6670, weaponLevel: 5, mods: { recoil: 0.75, adsSpread: 0.85, adsSpeed: 0.85 } },
  { id: 'bayonet_blade', slot: 'underbarrel', label: 'Tactical Bayonet', note: '+4% damage', hex: 0xcfd6dd, weaponLevel: 6, mods: { damage: 1.04 } },
  { id: 'grenade_tube', slot: 'underbarrel', label: 'M203 Launcher', note: 'Heavy: -10% recoil', hex: 0x485244, weaponLevel: 8, mods: { recoil: 0.9, adsSpeed: 0.9 } },

  // ---------------- MAGAZINE ----------------
  { id: 'standard_mag', slot: 'magazine', label: 'Standard Mag', note: 'Standard', hex: 0x2d3238, weaponLevel: 1, mods: {} },
  { id: 'light_skel', slot: 'magazine', label: 'Skeletal Light', note: '-12% reload time', hex: 0x737d87, weaponLevel: 2, mods: { reload: 0.88 } },
  { id: 'extended_mag', slot: 'magazine', label: 'Extended Mag', note: '+25% capacity', hex: 0x4c545e, weaponLevel: 3, mods: { mag: 1.25, reload: 1.06 } },
  { id: 'fast_dual', slot: 'magazine', label: 'Taped Fast-Mag', note: '-22% reload time', hex: 0xb89448, weaponLevel: 4, mods: { reload: 0.78 } },
  { id: 'drum_mag', slot: 'magazine', label: 'Twin Drum Mag', note: '+60% capacity, slow reload', hex: 0x383e47, weaponLevel: 7, mods: { mag: 1.6, reload: 1.25, adsSpeed: 0.9 } },
  { id: 'cryo_cell', slot: 'magazine', label: 'Aurora Cell-Mag', note: '+15% cap, -10% reload', hex: 0x45e8ff, weaponLevel: 9, mods: { mag: 1.15, reload: 0.9 } },

  // ---------------- STOCK ----------------
  { id: 'standard_stock', slot: 'stock', label: 'Standard Stock', note: 'Standard', hex: 0x2a2f36, weaponLevel: 1, mods: {} },
  { id: 'skeleton_stock', slot: 'stock', label: 'Skeleton Stock', note: '+12% aim speed, +6% recoil', hex: 0x6b7480, weaponLevel: 2, mods: { adsSpeed: 1.12, recoil: 1.06 } },
  { id: 'folding_stock', slot: 'stock', label: 'Folding Stock', note: '-10% hip spread', hex: 0x3b424c, weaponLevel: 3, mods: { hipSpread: 0.9, adsSpread: 1.05 } },
  { id: 'heavy_stock', slot: 'stock', label: 'Padded Heavy Stock', note: '-15% recoil, slower aim', hex: 0x4a3a2c, weaponLevel: 4, mods: { recoil: 0.85, adsSpeed: 0.9 } },
  { id: 'cheek_rest', slot: 'stock', label: 'Marksman Cheek Rest', note: '-15% aimed spread', hex: 0x5c4630, weaponLevel: 6, mods: { adsSpread: 0.85 } },

  // ---------------- LASER ----------------
  { id: 'no_laser', slot: 'laser', label: 'No Laser', note: 'Clean rail', hex: 0x2e2a28, weaponLevel: 1, mods: {} },
  { id: 'red_laser', slot: 'laser', label: 'Red Laser', note: '-15% hip spread', hex: 0xff2f38, weaponLevel: 2, mods: { hipSpread: 0.85 } },
  { id: 'green_laser', slot: 'laser', label: 'Green Laser', note: '-20% hip spread, +5% aim', hex: 0x3bff6a, weaponLevel: 5, mods: { hipSpread: 0.8, adsSpeed: 1.05 } },
  { id: 'ir_laser', slot: 'laser', label: 'IR Laser', note: 'Invisible beam, -15% spread', hex: 0x7c3aed, weaponLevel: 8, mods: { hipSpread: 0.85, adsSpread: 0.92 } },
];

const ATTACHMENT_BY_ID = new Map(ATTACHMENTS.map((a) => [a.id, a]));

export function getAttachment(id: string): AttachmentDef | undefined {
  return ATTACHMENT_BY_ID.get(id);
}

/** Gun models selectable for each firearm slot. */
export interface GunVariantDef {
  id: string;
  firearm: FirearmId;
  name: string;
  role: string;
  description: string;
  /** Operator level needed to equip. */
  playerLevel: number;
  /** Stat baseline for this model (replaces the slot's base spec fields). */
  spec: Partial<Pick<WeaponSpec, 'damage' | 'fireInterval' | 'magSize' | 'reloadDuration' | 'pellets' | 'spreadRad' | 'projectileSpeed' | 'piercing' | 'recoilKick' | 'hitstopSec'>>;
  /** Attachment slots this model cannot use. */
  blockedSlots?: AttachmentSlot[];
}

export const GUN_VARIANTS: GunVariantDef[] = [
  // Slot 1 — rifles / SMG / LMG
  { id: 'm4k', firearm: 'pulse', name: 'M4-K Tactical Carbine', role: 'Full-Auto Rifle', description: 'Reliable all-rounder with a smooth recoil curve.', playerLevel: 1, spec: {} },
  { id: 'ak74', firearm: 'pulse', name: 'AK-74 "Ronin"', role: 'Heavy Assault Rifle', description: 'Hard-hitting rounds, wilder kick.', playerLevel: 2, spec: { damage: 27, fireInterval: 0.15, magSize: 30, reloadDuration: 1.5, spreadRad: 0.013, recoilKick: 0.27, projectileSpeed: 60 } },
  { id: 'smg', firearm: 'pulse', name: 'Hornet MP-9', role: 'Rapid-Fire SMG', description: 'Shreds up close, falls off at range.', playerLevel: 3, spec: { damage: 15, fireInterval: 0.072, magSize: 32, reloadDuration: 1.15, spreadRad: 0.02, recoilKick: 0.12, projectileSpeed: 50 } },
  { id: 'lmg', firearm: 'pulse', name: 'Oni-60 LMG', role: 'Suppressive LMG', description: 'Massive box mag for holding the crossing.', playerLevel: 6, spec: { damage: 23, fireInterval: 0.105, magSize: 75, reloadDuration: 3.2, spreadRad: 0.017, recoilKick: 0.23, projectileSpeed: 60 } },
  // Slot 2 — shotguns
  { id: 'm870', firearm: 'scatter', name: 'M870 Breach Shotgun', role: 'Pump-Action Shotgun', description: 'Six-pellet buckshot with a satisfying pump.', playerLevel: 1, spec: {} },
  { id: 'saiga', firearm: 'scatter', name: 'Typhoon Auto-12', role: 'Semi-Auto Shotgun', description: 'Box-fed and fast, lighter pellets.', playerLevel: 4, spec: { damage: 11, fireInterval: 0.26, magSize: 10, reloadDuration: 1.9, pellets: 6, spreadRad: 0.092, recoilKick: 0.42 } },
  { id: 'coach', firearm: 'scatter', name: 'Kuroba Coach Gun', role: 'Double-Barrel', description: 'Two devastating barrels. Reload often.', playerLevel: 5, spec: { damage: 19, fireInterval: 0.24, magSize: 2, reloadDuration: 1.6, pellets: 8, spreadRad: 0.11, recoilKick: 0.8, hitstopSec: 0.06 }, blockedSlots: ['magazine'] },
  // Slot 3 — marksman
  { id: 'k50', firearm: 'rail', name: 'K-50 Precision Rifle', role: 'Bolt-Action Sniper', description: 'Piercing heavy rounds through whole hordes.', playerLevel: 1, spec: {} },
  { id: 'dmr', firearm: 'rail', name: 'Yumi-14 DMR', role: 'Marksman Rifle', description: 'Semi-auto precision for follow-up shots.', playerLevel: 2, spec: { damage: 42, fireInterval: 0.3, magSize: 12, reloadDuration: 1.6, spreadRad: 0.004, recoilKick: 0.42, projectileSpeed: 80, piercing: false } },
  { id: 'raijin', firearm: 'rail', name: 'Raijin .50 Anti-Materiel', role: 'Anti-Materiel Rifle', description: 'Splits shoguns and tanks alike.', playerLevel: 8, spec: { damage: 150, fireInterval: 1.35, magSize: 4, reloadDuration: 2.4, spreadRad: 0.0015, recoilKick: 1.0, projectileSpeed: 110, piercing: true, hitstopSec: 0.09 } },
  // Slot 4 — launcher
  { id: 'rpg7', firearm: 'rpg', name: 'RPG-7 Rocket Launcher', role: 'Anti-Armor Rocket', description: 'One rocket, one very bad day.', playerLevel: 1, spec: {}, blockedSlots: ['muzzle', 'underbarrel', 'magazine', 'stock', 'laser'] },
];

const VARIANT_BY_ID = new Map(GUN_VARIANTS.map((v) => [v.id, v]));

export function getVariant(firearm: FirearmId, id: string): GunVariantDef {
  const v = VARIANT_BY_ID.get(id);
  if (v && v.firearm === firearm) return v;
  return GUN_VARIANTS.find((g) => g.firearm === firearm)!;
}

export function variantsFor(firearm: FirearmId): GunVariantDef[] {
  return GUN_VARIANTS.filter((v) => v.firearm === firearm);
}

export const DEFAULT_GUN_BUILDS: GunBuilds = {
  pulse: { variant: 'm4k', optic: 'eotech_holo', muzzle: 'slotted_brake', underbarrel: 'angled_grip', magazine: 'standard_mag', stock: 'standard_stock', laser: 'no_laser' },
  scatter: { variant: 'm870', optic: 'red_dot', muzzle: 'slotted_brake', underbarrel: 'angled_grip', magazine: 'standard_mag', stock: 'standard_stock', laser: 'no_laser' },
  rail: { variant: 'k50', optic: 'long_sniper', muzzle: 'slotted_brake', underbarrel: 'angled_grip', magazine: 'standard_mag', stock: 'standard_stock', laser: 'no_laser' },
  rpg: { variant: 'rpg7', optic: 'iron', muzzle: 'slotted_brake', underbarrel: 'angled_grip', magazine: 'standard_mag', stock: 'standard_stock', laser: 'no_laser' },
};

export function cloneBuilds(b: GunBuilds): GunBuilds {
  return {
    pulse: { ...b.pulse },
    scatter: { ...b.scatter },
    rail: { ...b.rail },
    rpg: { ...b.rpg },
  };
}

/** Whether `slot` exists on this gun model at all. */
export function slotAvailable(firearm: FirearmId, variantId: string, slot: AttachmentSlot): boolean {
  const v = getVariant(firearm, variantId);
  return !(v.blockedSlots ?? []).includes(slot);
}

export function attachmentFits(att: AttachmentDef, firearm: FirearmId): boolean {
  return (att.allowed ?? GUNS).includes(firearm);
}

export function attachmentsFor(firearm: FirearmId, slot: AttachmentSlot): AttachmentDef[] {
  return ATTACHMENTS.filter((a) => a.slot === slot && attachmentFits(a, firearm));
}

export function attachmentUnlockLevel(att: AttachmentDef, firearm: FirearmId): number {
  return att.weaponLevelBy?.[firearm] ?? att.weaponLevel;
}

/** Levels the build is checked against (attachments: weapon level; models: operator level). */
export interface UnlockLevels {
  playerLevel: number;
  weaponLevels: Record<WeaponId, number>;
}

/** Replaces anything locked, unknown or incompatible with that slot's default. */
export function sanitizeBuild(firearm: FirearmId, build: Partial<GunBuild>, levels: UnlockLevels): GunBuild {
  const def = DEFAULT_GUN_BUILDS[firearm];
  const out: GunBuild = { ...def, ...build } as GunBuild;
  const variant = VARIANT_BY_ID.get(out.variant);
  if (!variant || variant.firearm !== firearm || variant.playerLevel > levels.playerLevel) out.variant = def.variant;
  const wl = levels.weaponLevels[firearm] ?? 1;
  for (const slot of ATTACHMENT_SLOTS) {
    const att = ATTACHMENT_BY_ID.get(out[slot]);
    if (!att || att.slot !== slot || !attachmentFits(att, firearm) || attachmentUnlockLevel(att, firearm) > wl) {
      out[slot] = def[slot];
    }
  }
  return out;
}

export interface ResolvedGun {
  /** Concrete stat overrides for WEAPONS[firearm]. */
  spec: Pick<WeaponSpec, 'name' | 'role' | 'damage' | 'fireInterval' | 'magSize' | 'reloadDuration' | 'pellets' | 'spreadRad' | 'projectileSpeed' | 'piercing' | 'recoilKick' | 'hitstopSec'>;
  adsSpreadMult: number;
  adsSpeedMult: number;
  optic: OpticInfo & { id: string; name: string };
  laser: string;
}

/**
 * Resolves a build into final stats. `base` is the slot's original spec (rules.BASE_WEAPONS).
 */
export function resolveGun(firearm: FirearmId, build: GunBuild, base: WeaponSpec): ResolvedGun {
  const variant = getVariant(firearm, build.variant);
  const merged = { ...base, ...variant.spec };
  let damage = 1;
  let fireRate = 1;
  let mag = 1;
  let reload = 1;
  let hip = 1;
  let ads = 1;
  let recoil = 1;
  let velocity = 1;
  let adsSpeed = 1;
  for (const slot of ATTACHMENT_SLOTS) {
    if (!slotAvailable(firearm, build.variant, slot) && slot !== 'optic') continue;
    const att = ATTACHMENT_BY_ID.get(build[slot]);
    if (!att) continue;
    const m = att.mods;
    damage *= m.damage ?? 1;
    fireRate *= m.fireRate ?? 1;
    mag *= m.mag ?? 1;
    reload *= m.reload ?? 1;
    hip *= m.hipSpread ?? 1;
    ads *= m.adsSpread ?? 1;
    recoil *= m.recoil ?? 1;
    velocity *= m.velocity ?? 1;
    adsSpeed *= m.adsSpeed ?? 1;
  }
  const opticDef = ATTACHMENT_BY_ID.get(build.optic) ?? ATTACHMENT_BY_ID.get('iron')!;
  const fixedMag = !slotAvailable(firearm, build.variant, 'magazine');
  return {
    spec: {
      name: variant.name,
      role: variant.role,
      damage: Math.max(1, Math.round(merged.damage * damage)),
      fireInterval: merged.fireInterval / fireRate,
      magSize: merged.magSize >= 999 || fixedMag ? merged.magSize : Math.max(1, Math.round(merged.magSize * mag)),
      reloadDuration: Math.max(0.45, merged.reloadDuration * reload),
      pellets: merged.pellets,
      spreadRad: merged.spreadRad * hip,
      projectileSpeed: merged.projectileSpeed * velocity,
      piercing: merged.piercing,
      recoilKick: merged.recoilKick * recoil,
      hitstopSec: merged.hitstopSec,
    },
    adsSpreadMult: ads,
    adsSpeedMult: adsSpeed,
    optic: { ...(opticDef.optic ?? { zoom: 1, reticle: 'iron', color: '#ffffff' }), id: opticDef.id, name: opticDef.label },
    laser: slotAvailable(firearm, build.variant, 'laser') ? build.laser : 'no_laser',
  };
}

/** Normalised 0..1 stat bars for the armory UI. */
export interface GunStatBars {
  damage: number;
  fireRate: number;
  range: number;
  accuracy: number;
  control: number;
  handling: number;
  capacity: number;
  reload: number;
}

export function gunStatBars(r: ResolvedGun): GunStatBars {
  const s = r.spec;
  const c = (v: number) => Math.max(0.04, Math.min(1, v));
  return {
    damage: c((s.damage * s.pellets) / 160),
    fireRate: c(1 / s.fireInterval / 14),
    range: c((s.projectileSpeed / 115) * (1 - Math.min(0.6, s.spreadRad * 4))),
    accuracy: c(1 - (s.spreadRad * r.adsSpreadMult) / 0.06),
    control: c(1.05 - s.recoilKick),
    handling: c(0.5 * r.adsSpeedMult + 0.1),
    capacity: c(s.magSize >= 999 ? 1 : s.magSize / 75),
    reload: c(0.8 / s.reloadDuration),
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
const BUILDS_KEY = 'kuroba_gun_builds_v1';
const LEGACY_LOADOUT_KEY = 'kuroba_crossing_loadout_v2';

export function loadGunBuilds(): GunBuilds {
  const out = cloneBuilds(DEFAULT_GUN_BUILDS);
  try {
    const raw = window.localStorage.getItem(BUILDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<FirearmId, Partial<GunBuild>>>;
      for (const f of FIREARMS) {
        if (parsed[f]) out[f] = { ...out[f], ...parsed[f] } as GunBuild;
      }
      return out;
    }
    // One-time migration: the old global attachments become the rifle's build
    const legacy = window.localStorage.getItem(LEGACY_LOADOUT_KEY);
    if (legacy) {
      const l = JSON.parse(legacy) as Record<string, string>;
      for (const slot of ['optic', 'muzzle', 'underbarrel', 'magazine'] as const) {
        if (typeof l[slot] === 'string' && l[slot] !== 'laser_pod') out.pulse[slot] = l[slot];
      }
    }
  } catch {
    // ignore storage errors
  }
  return out;
}

export function saveGunBuilds(builds: GunBuilds): void {
  try {
    window.localStorage.setItem(BUILDS_KEY, JSON.stringify(builds));
  } catch {
    // ignore storage errors
  }
}
