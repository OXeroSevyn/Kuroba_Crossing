/**
 * Operator generator: rolls a complete, coherent character (face, hair, body, outfit, gear, name)
 * from an archetype and a seed. Same seed + archetype + locks = same operator, so players can
 * share seeds. Locked trait groups are kept from the current character.
 */
import { CUSTOMIZATION_CATEGORIES, type CustomGroup, DEFAULT_LOADOUT } from './customization';
import type { LoadoutConfig } from './types';

export type ArchetypeId = 'any' | 'ronin' | 'ranger' | 'medic' | 'ghost' | 'scout' | 'runner' | 'biohazard';

export interface ArchetypeDef {
  id: ArchetypeId;
  label: string;
  tagline: string;
  accent: string;
  /** Weighted preferences per trait. Unlisted traits are rolled uniformly from unlocked options. */
  prefs: Partial<Record<keyof LoadoutConfig, string[]>>;
  callsigns: string[];
}

export const ARCHETYPES: ArchetypeDef[] = [
  { id: 'any', label: 'Wildcard', tagline: 'Anything goes', accent: '#e5e7eb', prefs: {}, callsigns: [] },
  {
    id: 'ronin',
    label: 'Ronin',
    tagline: 'Blade-first wanderer',
    accent: '#ef4444',
    prefs: {
      hairStyle: ['topknot', 'long', 'ponytail', 'topknot'],
      facialHair: ['stubble', 'goatee', 'full_beard', 'none'],
      headgear: ['headband', 'ronin_kasa', 'none'],
      jacketColor: ['crimson_guard', 'midnight_ops', 'slate_steel'],
      outfitStyle: ['cyber_shinobi', 'classic_ranger'],
      pantsStyle: ['charcoal_ops', 'crimson_leg'],
      backpack: ['katana_pack'],
      accentGlow: ['crimson_alert', 'sunset_gold'],
      browStyle: ['angry', 'thick', 'split'],
      mouthStyle: ['frown', 'neutral', 'determined'],
      faceDetail: ['scar_eye', 'scar_cheek', 'none', 'war_paint'],
      eyeStyle: ['fierce', 'narrow'],
    },
    callsigns: ['Kaze', 'Oni', 'Shiro', 'Tsurugi', 'Kage', 'Raiden'],
  },
  {
    id: 'ranger',
    label: 'Ranger',
    tagline: 'Crossing guard veteran',
    accent: '#f59e0b',
    prefs: {
      hairStyle: ['buzz', 'undercut', 'side_part'],
      facialHair: ['stubble', 'none', 'chin_strap'],
      headgear: ['ranger_helm', 'tactical_cap'],
      jacketColor: ['kuroba_orange', 'olive_drab', 'forest_ranger', 'desert_sand'],
      outfitStyle: ['classic_ranger', 'heavy_exo'],
      pantsStyle: ['navy_tac', 'khaki_cargo', 'moss_trail'],
      backpack: ['dual_thruster', 'ammo_drum'],
      mouthStyle: ['neutral', 'smirk', 'calm'],
      eyeStyle: ['focused', 'narrow'],
    },
    callsigns: ['Signal', 'Crossing', 'Brakeman', 'Junction', 'Lantern', 'Switch'],
  },
  {
    id: 'medic',
    label: 'Field Medic',
    tagline: 'Keeps the squad breathing',
    accent: '#f43f5e',
    prefs: {
      hairStyle: ['bob', 'ponytail', 'side_part', 'braids'],
      facialHair: ['none', 'none', 'stubble'],
      headgear: ['none', 'tactical_cap', 'headband'],
      jacketColor: ['snowpeak_white', 'crimson_guard', 'slate_steel'],
      outfitStyle: ['field_medic'],
      backpack: ['med_frame'],
      accentGlow: ['crimson_alert', 'silver_chrome'],
      mouthStyle: ['calm', 'neutral', 'smirk'],
      eyeStyle: ['gentle', 'focused', 'wide'],
      faceDetail: ['none', 'glasses', 'freckles'],
    },
    callsigns: ['Patch', 'Halo', 'Suture', 'Mercy', 'Pulse', 'Saint'],
  },
  {
    id: 'ghost',
    label: 'Ghost',
    tagline: 'Silent night operator',
    accent: '#94a3b8',
    prefs: {
      hairStyle: ['buzz', 'bald', 'undercut'],
      facialHair: ['stubble', 'full_beard', 'none'],
      headgear: ['nvg_ops', 'beanie', 'hazmat_mask'],
      jacketColor: ['midnight_ops', 'slate_steel', 'olive_drab'],
      outfitStyle: ['heavy_exo', 'neon_runner', 'classic_ranger'],
      pantsStyle: ['charcoal_ops', 'steel_greaves'],
      backpack: ['radio_dish', 'ammo_drum'],
      accentGlow: ['frost_blue', 'aurora_mint'],
      eyeStyle: ['narrow', 'sleepy', 'focused'],
      mouthStyle: ['neutral', 'frown'],
      faceDetail: ['scar_cheek', 'eye_patch', 'none'],
    },
    callsigns: ['Wraith', 'Static', 'Nyx', 'Hollow', 'Veil', 'Shade'],
  },
  {
    id: 'scout',
    label: 'Snow Scout',
    tagline: 'Kopenhime mountaineer',
    accent: '#7dd3fc',
    prefs: {
      hairStyle: ['long', 'braids', 'side_part', 'ponytail'],
      hairColor: ['platinum', 'blonde', 'silver', 'chestnut', 'ginger'],
      facialHair: ['full_beard', 'stubble', 'none'],
      headgear: ['snow_ushanka', 'beanie'],
      jacketColor: ['snowpeak_white', 'cobalt_navy', 'slate_steel'],
      outfitStyle: ['winter_parka'],
      pantsStyle: ['snow_camo', 'steel_greaves'],
      backpack: ['snow_pack'],
      accentGlow: ['frost_blue', 'silver_chrome'],
      skinTone: ['porcelain', 'fair', 'light', 'olive'],
      faceDetail: ['freckles', 'none', 'scar_cheek'],
    },
    callsigns: ['Frost', 'Ridge', 'Avalanche', 'Glacier', 'Peak', 'Rime'],
  },
  {
    id: 'runner',
    label: 'Aurora Runner',
    tagline: 'Neon street courier',
    accent: '#22d3ee',
    prefs: {
      hairStyle: ['mohawk', 'spiky', 'afro', 'bob', 'undercut'],
      hairColor: ['aurora', 'sakura', 'violet', 'platinum', 'lime'],
      facialHair: ['none', 'none', 'goatee'],
      headgear: ['none', 'crowned_visor', 'headband', 'kitsune_mask'],
      jacketColor: ['aurora_cyan', 'sakura_coral', 'royal_violet', 'midnight_ops'],
      outfitStyle: ['street_bomber', 'neon_runner'],
      pantsStyle: ['aurora_tech', 'charcoal_ops'],
      backpack: ['neon_wings', 'dual_thruster'],
      accentGlow: ['cyan_neon', 'magenta_pulse', 'violet_mist'],
      visorColor: ['cyan_pulse', 'sakura_pink', 'ultraviolet', 'ocean_blue'],
      mouthStyle: ['grin', 'smirk'],
      eyeStyle: ['wide', 'focused'],
      faceDetail: ['kanji_tattoo', 'glasses', 'none', 'war_paint'],
    },
    callsigns: ['Neon', 'Glitch', 'Volt', 'Sakura', 'Pixel', 'Flux'],
  },
  {
    id: 'biohazard',
    label: 'Bio-Hazard',
    tagline: 'Fungi Forest specialist',
    accent: '#84cc16',
    prefs: {
      headgear: ['hazmat_mask', 'none', 'beanie'],
      jacketColor: ['toxic_moss', 'forest_ranger', 'royal_violet'],
      outfitStyle: ['hazmat_suit'],
      pantsStyle: ['moss_trail', 'khaki_cargo'],
      backpack: ['bio_canister'],
      accentGlow: ['toxic_lime', 'violet_mist'],
      hairColor: ['lime', 'violet', 'dark_brown', 'jet_black'],
      visorColor: ['emerald_bio', 'forest_green', 'hazel'],
      faceDetail: ['none', 'bandage', 'glasses'],
    },
    callsigns: ['Spore', 'Mycel', 'Toxin', 'Cordyceps', 'Lichen', 'Bloom'],
  },
];

const FIRST_NAMES = [
  'Aiko', 'Haruto', 'Ren', 'Yuki', 'Kenji', 'Mika', 'Sora', 'Daichi', 'Hana', 'Takeshi', 'Rin', 'Kaito',
  'Nadia', 'Marcus', 'Elena', 'Tariq', 'Zoe', 'Mateo', 'Freya', 'Kwame', 'Lena', 'Diego', 'Amara', 'Ivan',
  'Priya', 'Noah', 'Sana', 'Leo', 'Ines', 'Jae', 'Asha', 'Felix',
];
const LAST_NAMES = [
  'Kuroba', 'Takeda', 'Mori', 'Saito', 'Fujiwara', 'Nakamura', 'Ishikawa', 'Okada', 'Hayashi', 'Kondo',
  'Reyes', 'Novak', 'Okafor', 'Lindqvist', 'Haddad', 'Moreau', 'Silva', 'Petrov', 'Kaur', 'Adeyemi', 'Brandt', 'Castillo',
];
const GENERIC_CALLSIGNS = ['Ember', 'Hawk', 'Torii', 'Crow', 'Comet', 'Viper', 'Echo', 'Atlas', 'Mako', 'Jinx', 'Rook', 'Tango'];

/** Trait groups that can be locked while re-rolling. */
export type TraitLockGroup = Exclude<CustomGroup, 'finish'>;
export const LOCK_GROUPS: TraitLockGroup[] = ['face', 'hair', 'body', 'outfit', 'gear'];

export interface OperatorProfile {
  name: string;
  callsign: string;
  seed: string;
  archetype: ArchetypeId;
}

export const DEFAULT_PROFILE: OperatorProfile = { name: 'Haruto Kuroba', callsign: 'Junction', seed: 'KUROBA-04', archetype: 'ranger' };

/** Deterministic 32-bit PRNG (mulberry32). */
export function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(rng: () => number = Math.random): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(rng() * chars.length)];
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

export interface GenerateOptions {
  seed: string;
  archetype: ArchetypeId;
  /** Current operator, used for locked groups. */
  current: LoadoutConfig;
  locks: TraitLockGroup[];
  playerLevel: number;
}

export interface GeneratedOperator {
  loadout: LoadoutConfig;
  profile: OperatorProfile;
}

/** Natural-looking hair colours are far more likely unless the archetype says otherwise. */
const NATURAL_HAIR = ['jet_black', 'dark_brown', 'chestnut', 'auburn', 'ginger', 'blonde', 'platinum', 'silver'];
const NATURAL_EYES = ['dark_brown', 'hazel', 'ocean_blue', 'forest_green', 'steel_grey', 'amber_warm'];

export function generateOperator(opts: GenerateOptions): GeneratedOperator {
  const rng = seededRng(`${opts.archetype}:${opts.seed}`);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const arch = ARCHETYPES.find((a) => a.id === opts.archetype) ?? ARCHETYPES[0];
  const out: LoadoutConfig = { ...DEFAULT_LOADOUT, ...opts.current };

  for (const cat of CUSTOMIZATION_CATEGORIES) {
    if (cat.tab !== 'character') continue;
    // Always consume randomness so a lock never shifts the other rolls for this seed
    const roll = rng();
    const roll2 = rng();
    if (opts.locks.includes(cat.group as TraitLockGroup)) continue;
    const unlocked = cat.options.filter((o) => (o.unlockLevel ?? 1) <= opts.playerLevel).map((o) => o.id);
    let pool = unlocked;
    const pref = arch.prefs[cat.key]?.filter((id) => unlocked.includes(id));
    if (pref && pref.length > 0 && roll2 < 0.82) {
      pool = pref;
    } else if (cat.key === 'hairColor') {
      pool = NATURAL_HAIR.filter((id) => unlocked.includes(id));
    } else if (cat.key === 'visorColor') {
      pool = NATURAL_EYES.filter((id) => unlocked.includes(id));
    } else if (cat.key === 'faceDetail') {
      pool = roll2 < 0.92 ? ['none', 'none', 'freckles', 'scar_cheek', 'glasses'] : unlocked;
    }
    out[cat.key] = pool[Math.floor(roll * pool.length)] ?? out[cat.key];
  }

  // Coherence: no hair colour shows on a shaved head, so keep brows natural there
  if (out.hairStyle === 'bald' && !NATURAL_HAIR.includes(out.hairColor)) out.hairColor = 'jet_black';

  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const callsign = pick(arch.callsigns.length > 0 ? [...arch.callsigns, ...GENERIC_CALLSIGNS.slice(0, 2)] : GENERIC_CALLSIGNS);
  return {
    loadout: out,
    profile: { name: `${first} ${last}`, callsign, seed: opts.seed, archetype: opts.archetype },
  };
}

const PROFILE_KEY = 'kuroba_operator_profile_v1';

export function loadProfile(): OperatorProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const p = JSON.parse(raw) as Partial<OperatorProfile>;
    return {
      name: typeof p.name === 'string' && p.name.trim() ? p.name.slice(0, 28) : DEFAULT_PROFILE.name,
      callsign: typeof p.callsign === 'string' && p.callsign.trim() ? p.callsign.slice(0, 16) : DEFAULT_PROFILE.callsign,
      seed: typeof p.seed === 'string' ? p.seed.slice(0, 16) : DEFAULT_PROFILE.seed,
      archetype: ARCHETYPES.some((a) => a.id === p.archetype) ? (p.archetype as ArchetypeId) : DEFAULT_PROFILE.archetype,
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(p: OperatorProfile): void {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // ignore storage errors
  }
}
