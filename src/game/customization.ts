import type { LoadoutConfig } from './types';

export interface CustomOption {
  id: string;
  label: string;
  swatch: string;
  hex: number;
  secondaryHex?: number;
  note?: string;
}

export interface CustomCategory {
  key: keyof LoadoutConfig;
  tab: 'character' | 'gun';
  label: string;
  options: CustomOption[];
}

export const DEFAULT_LOADOUT: LoadoutConfig = {
  headgear: 'ranger_helm',
  visorColor: 'cyan_pulse',
  jacketColor: 'kuroba_orange',
  outfitStyle: 'classic_ranger',
  pantsStyle: 'navy_tac',
  backpack: 'dual_thruster',
  accentGlow: 'cyan_neon',
  gunSkin: 'gunmetal',
  optic: 'eotech_holo',
  muzzle: 'slotted_brake',
  underbarrel: 'angled_grip',
  magazine: 'standard_mag',
  tracerFx: 'classic_gold',
  charm: 'mini_torii',
};

const STORAGE_KEY = 'kuroba_crossing_loadout_v2';

export const CUSTOMIZATION_CATEGORIES: CustomCategory[] = [
  // ===================== CHARACTER CUSTOMIZATIONS (68 OPTIONS) =====================
  {
    key: 'headgear',
    tab: 'character',
    label: 'Headgear',
    options: [
      { id: 'ranger_helm', label: 'Ranger Helmet', swatch: '#ede8dc', hex: 0xede8dc },
      { id: 'ronin_kasa', label: 'Ronin Kasa', swatch: '#c99b4f', hex: 0xc99b4f },
      { id: 'cyber_kabuto', label: 'Cyber Kabuto', swatch: '#2c313b', hex: 0x2c313b },
      { id: 'nvg_ops', label: 'NVG Tactical', swatch: '#354238', hex: 0x354238 },
      { id: 'kitsune_mask', label: 'Kitsune Mask', swatch: '#f5efe6', hex: 0xf5efe6 },
      { id: 'snow_ushanka', label: 'Snow Ushanka', swatch: '#7c553b', hex: 0x7c553b },
      { id: 'hazmat_mask', label: 'Bio Gas Mask', swatch: '#4a5248', hex: 0x4a5248 },
      { id: 'crowned_visor', label: 'Aurora Crown', swatch: '#45e8ff', hex: 0x45e8ff },
    ],
  },
  {
    key: 'visorColor',
    tab: 'character',
    label: 'Visor / Eyes',
    options: [
      { id: 'cyan_pulse', label: 'Cyan Pulse', swatch: '#45f2ff', hex: 0x45f2ff },
      { id: 'crimson_hunt', label: 'Crimson Hunter', swatch: '#ff3838', hex: 0xff3838 },
      { id: 'emerald_bio', label: 'Emerald Bio', swatch: '#4ef2a1', hex: 0x4ef2a1 },
      { id: 'solar_gold', label: 'Solar Gold', swatch: '#ffd447', hex: 0xffd447 },
      { id: 'ultraviolet', label: 'Ultraviolet', swatch: '#c45cff', hex: 0xc45cff },
      { id: 'arctic_ice', label: 'Arctic Ice', swatch: '#b8ecff', hex: 0xb8ecff },
      { id: 'amber_warm', label: 'Warm Amber', swatch: '#ff9638', hex: 0xff9638 },
      { id: 'sakura_pink', label: 'Sakura Pink', swatch: '#ff7eb6', hex: 0xff7eb6 },
      { id: 'acid_lime', label: 'Acid Lime', swatch: '#9eff3b', hex: 0x9eff3b },
      { id: 'ghost_white', label: 'Ghost White', swatch: '#f5faff', hex: 0xf5faff },
      { id: 'magma_core', label: 'Magma Core', swatch: '#ff5224', hex: 0xff5224 },
      { id: 'stealth_dark', label: 'Stealth Dim', swatch: '#58687a', hex: 0x58687a },
    ],
  },
  {
    key: 'jacketColor',
    tab: 'character',
    label: 'Armor & Jacket',
    options: [
      { id: 'kuroba_orange', label: 'Kuroba Orange', swatch: '#e87a2e', hex: 0xe87a2e, secondaryHex: 0xc25b1d },
      { id: 'midnight_ops', label: 'Midnight Ops', swatch: '#22262e', hex: 0x22262e, secondaryHex: 0x15181e },
      { id: 'aurora_cyan', label: 'Aurora Teal', swatch: '#1e8ea8', hex: 0x1e8ea8, secondaryHex: 0x136275 },
      { id: 'crimson_guard', label: 'Crimson Guard', swatch: '#c42b2b', hex: 0xc42b2b, secondaryHex: 0x8f1c1c },
      { id: 'forest_ranger', label: 'Forest Ranger', swatch: '#3c6e3b', hex: 0x3c6e3b, secondaryHex: 0x284d27 },
      { id: 'snowpeak_white', label: 'Snowpeak White', swatch: '#e4ecf2', hex: 0xe4ecf2, secondaryHex: 0xb8c6d4 },
      { id: 'royal_violet', label: 'Fungi Violet', swatch: '#6a42a8', hex: 0x6a42a8, secondaryHex: 0x4b2c7d },
      { id: 'olive_drab', label: 'Olive Tactical', swatch: '#58613d', hex: 0x58613d, secondaryHex: 0x3e452a },
      { id: 'brass_gold', label: 'Shogun Gold', swatch: '#d6a438', hex: 0xd6a438, secondaryHex: 0xa37820 },
      { id: 'cobalt_navy', label: 'Cobalt Marine', swatch: '#2b4f8c', hex: 0x2b4f8c, secondaryHex: 0x1d3763 },
      { id: 'desert_sand', label: 'Desert Sand', swatch: '#c2a374', hex: 0xc2a374, secondaryHex: 0x947951 },
      { id: 'sakura_coral', label: 'Sakura Coral', swatch: '#e06c88', hex: 0xe06c88, secondaryHex: 0xb04c65 },
      { id: 'slate_steel', label: 'Slate Steel', swatch: '#5e6b78', hex: 0x5e6b78, secondaryHex: 0x404a54 },
      { id: 'toxic_moss', label: 'Spore Moss', swatch: '#557a3c', hex: 0x557a3c, secondaryHex: 0x3a5727 },
    ],
  },
  {
    key: 'outfitStyle',
    tab: 'character',
    label: 'Outfit Rig',
    options: [
      { id: 'classic_ranger', label: 'Classic Ranger', swatch: '#f0e9dc', hex: 0xf0e9dc },
      { id: 'heavy_exo', label: 'Heavy Exo-Plate', swatch: '#4a525e', hex: 0x4a525e },
      { id: 'street_bomber', label: 'Aurora Bomber', swatch: '#262b38', hex: 0x262b38 },
      { id: 'winter_parka', label: 'Snowpeak Parka', swatch: '#d6e4f0', hex: 0xd6e4f0 },
      { id: 'hazmat_suit', label: 'Outbreak Hazmat', swatch: '#d9b532', hex: 0xd9b532 },
      { id: 'cyber_shinobi', label: 'Cyber Shinobi', swatch: '#2c2233', hex: 0x2c2233 },
      { id: 'field_medic', label: 'Field Medic', swatch: '#e8e4da', hex: 0xe8e4da },
      { id: 'neon_runner', label: 'Neon Runner', swatch: '#1c2838', hex: 0x1c2838 },
    ],
  },
  {
    key: 'pantsStyle',
    tab: 'character',
    label: 'Legs & Boots',
    options: [
      { id: 'navy_tac', label: 'Navy Tactical', swatch: '#26344a', hex: 0x26344a, secondaryHex: 0x1c222e },
      { id: 'charcoal_ops', label: 'Charcoal Ops', swatch: '#272a30', hex: 0x272a30, secondaryHex: 0x14161a },
      { id: 'snow_camo', label: 'Alpine White', swatch: '#cfdbe6', hex: 0xcfdbe6, secondaryHex: 0x4b5866 },
      { id: 'khaki_cargo', label: 'Khaki Cargo', swatch: '#8f7d5b', hex: 0x8f7d5b, secondaryHex: 0x423526 },
      { id: 'crimson_leg', label: 'Crimson Guard', swatch: '#6e1e24', hex: 0x6e1e24, secondaryHex: 0x241416 },
      { id: 'moss_trail', label: 'Forest Trail', swatch: '#334a31', hex: 0x334a31, secondaryHex: 0x24201a },
      { id: 'steel_greaves', label: 'Steel Greaves', swatch: '#5c6670', hex: 0x5c6670, secondaryHex: 0x30363d },
      { id: 'aurora_tech', label: 'Aurora Tech', swatch: '#1a2d42', hex: 0x1a2d42, secondaryHex: 0x121d2b },
    ],
  },
  {
    key: 'backpack',
    tab: 'character',
    label: 'Back Gear',
    options: [
      { id: 'dual_thruster', label: 'Dual Thruster', swatch: '#525b66', hex: 0x525b66 },
      { id: 'katana_pack', label: 'Twin Katanas', swatch: '#d6dce0', hex: 0xd6dce0 },
      { id: 'bio_canister', label: 'Bio Canister', swatch: '#66d942', hex: 0x66d942 },
      { id: 'radio_dish', label: 'Comms Array', swatch: '#4a5562', hex: 0x4a5562 },
      { id: 'snow_pack', label: 'Alpine Pack', swatch: '#c95c38', hex: 0xc95c38 },
      { id: 'ammo_drum', label: 'Heavy Ammo Rig', swatch: '#6b5c3e', hex: 0x6b5c3e },
      { id: 'neon_wings', label: 'Aurora Wings', swatch: '#45e8ff', hex: 0x45e8ff },
      { id: 'med_frame', label: 'Medic Frame', swatch: '#e63946', hex: 0xe63946 },
    ],
  },
  {
    key: 'accentGlow',
    tab: 'character',
    label: 'Suit Glow',
    options: [
      { id: 'cyan_neon', label: 'Aurora Cyan', swatch: '#45f2ff', hex: 0x45f2ff },
      { id: 'sunset_gold', label: 'Sunset Gold', swatch: '#ffc845', hex: 0xffc845 },
      { id: 'crimson_alert', label: 'Crimson Alert', swatch: '#ff3b30', hex: 0xff3b30 },
      { id: 'toxic_lime', label: 'Fungi Lime', swatch: '#8cf536', hex: 0x8cf536 },
      { id: 'aurora_mint', label: 'Aurora Mint', swatch: '#4ef2a1', hex: 0x4ef2a1 },
      { id: 'magenta_pulse', label: 'Neon Magenta', swatch: '#ff4fd8', hex: 0xff4fd8 },
      { id: 'frost_blue', label: 'Snowpeak Ice', swatch: '#7cc4ff', hex: 0x7cc4ff },
      { id: 'ember_orange', label: 'Ember Orange', swatch: '#ff7a2e', hex: 0xff7a2e },
      { id: 'silver_chrome', label: 'Pure White', swatch: '#f0f5ff', hex: 0xf0f5ff },
      { id: 'violet_mist', label: 'Violet Mist', swatch: '#a86bff', hex: 0xa86bff },
    ],
  },

  // ===================== GUN ARMORY CUSTOMIZATIONS (60 OPTIONS) =====================
  {
    key: 'gunSkin',
    tab: 'gun',
    label: 'Weapon Finish',
    options: [
      { id: 'gunmetal', label: 'Matte Gunmetal', swatch: '#2b313a', hex: 0x262b32, secondaryHex: 0x3b424c },
      { id: 'arctic_snow', label: 'Arctic Snowpeak', swatch: '#e2ebf2', hex: 0xdce6ee, secondaryHex: 0x8fa2b3 },
      { id: 'aurora_neon', label: 'Aurora Cyber', swatch: '#1c2b3d', hex: 0x1b293b, secondaryHex: 0x38e8ff },
      { id: 'crimson_tiger', label: 'Crimson Fang', swatch: '#9c1f24', hex: 0x9c1f24, secondaryHex: 0x2a1a1c },
      { id: 'gold_plated', label: 'Shogun Gold', swatch: '#e0b33e', hex: 0xd9a832, secondaryHex: 0x332b1c },
      { id: 'olive_spec', label: 'Olive Spec-Ops', swatch: '#4b573b', hex: 0x4b573b, secondaryHex: 0x2c3323 },
      { id: 'desert_fde', label: 'Desert FDE', swatch: '#b59970', hex: 0xb59970, secondaryHex: 0x6e5a3e },
      { id: 'carbon_stealth', label: 'Carbon Stealth', swatch: '#181a1f', hex: 0x17191e, secondaryHex: 0x2c3038 },
      { id: 'fungi_biolume', label: 'Fungi Biolume', swatch: '#473069', hex: 0x473069, secondaryHex: 0x8cf536 },
      { id: 'sakura_bloom', label: 'Sakura Bloom', swatch: '#e07b9a', hex: 0xd97393, secondaryHex: 0xf2e4e9 },
      { id: 'chrome_steel', label: 'Chrome Steel', swatch: '#b8c4cf', hex: 0xb5c2cc, secondaryHex: 0x6d7882 },
      { id: 'woodland_moss', label: 'Woodland Moss', swatch: '#355432', hex: 0x355432, secondaryHex: 0x5c422c },
      { id: 'cobalt_strike', label: 'Cobalt Strike', swatch: '#284a7d', hex: 0x284a7d, secondaryHex: 0x1a283d },
      { id: 'rust_wasteland', label: 'Rust Survivor', swatch: '#7d442a', hex: 0x7d442a, secondaryHex: 0x4a3b34 },
    ],
  },
  {
    key: 'optic',
    tab: 'gun',
    label: 'Optic / Sight',
    options: [
      { id: 'eotech_holo', label: 'EOTech Holo', swatch: '#3bf58a', hex: 0x3bf58a, note: 'Balanced' },
      { id: 'red_dot', label: 'Micro Red Dot', swatch: '#ff3b30', hex: 0xff3b30, note: 'Crisp Aim' },
      { id: 'acog_4x', label: 'ACOG 4x Scope', swatch: '#ffae34', hex: 0xffae34, note: '+10% Tighter Spread' },
      { id: 'thermal_nv', label: 'Thermal Night', swatch: '#45f2ff', hex: 0x45f2ff, note: 'Night Clear' },
      { id: 'long_sniper', label: 'Long Range 8x', swatch: '#4ef2a1', hex: 0x4ef2a1, note: '+18% Tighter Spread' },
      { id: 'iron_ring', label: 'Ghost Iron Ring', swatch: '#a8b0b8', hex: 0xa8b0b8, note: 'Classic' },
      { id: 'cyber_rail', label: 'Aurora Smart-Sight', swatch: '#ff4fd8', hex: 0xff4fd8, note: '+12% Tighter Spread' },
      { id: 'dual_cant', label: 'Dual Canted Optic', swatch: '#ffd447', hex: 0xffd447, note: 'Hybrid' },
    ],
  },
  {
    key: 'muzzle',
    tab: 'gun',
    label: 'Muzzle Mod',
    options: [
      { id: 'slotted_brake', label: 'Slotted Brake', swatch: '#48505a', hex: 0x48505a, note: 'Balanced' },
      { id: 'suppressor', label: 'Spec Suppressor', swatch: '#262b32', hex: 0x262b32, note: '-20% Recoil' },
      { id: 'heavy_comp', label: 'Heavy Compensator', swatch: '#68727d', hex: 0x68727d, note: '-25% Recoil' },
      { id: 'breach_spike', label: 'Breacher Teeth', swatch: '#a8342a', hex: 0xa8342a, note: '+8% Damage' },
      { id: 'flash_hider', label: 'Prong Flash Hider', swatch: '#3c424a', hex: 0x3c424a, note: 'Low Flash' },
      { id: 'twin_cannon', label: 'Twin-Port Brake', swatch: '#d9a844', hex: 0xd9a844, note: '+10% Damage' },
      { id: 'cryo_shroud', label: 'Cryo Barrel Shroud', swatch: '#7cc4ff', hex: 0x7cc4ff, note: '+10% Velocity' },
      { id: 'long_choke', label: 'Extended Choke', swatch: '#525b66', hex: 0x525b66, note: '-15% Spread' },
    ],
  },
  {
    key: 'underbarrel',
    tab: 'gun',
    label: 'Underbarrel',
    options: [
      { id: 'angled_grip', label: 'Angled Foregrip', swatch: '#2a3038', hex: 0x2a3038 },
      { id: 'vertical_grip', label: 'Vertical Tac-Grip', swatch: '#3c434d', hex: 0x3c434d },
      { id: 'laser_pod', label: 'Crimson Laser', swatch: '#ff2f38', hex: 0xff2f38 },
      { id: 'grenade_tube', label: 'M203 Launcher', swatch: '#485244', hex: 0x485244 },
      { id: 'heavy_bipod', label: 'Deployed Bipod', swatch: '#5e6670', hex: 0x5e6670 },
      { id: 'floodlight', label: 'High-Beam Torch', swatch: '#fff3c4', hex: 0xfff3c4 },
      { id: 'bayonet_blade', label: 'Tactical Bayonet', swatch: '#cfd6dd', hex: 0xcfd6dd },
      { id: 'stubby_grip', label: 'Stubby Polymer', swatch: '#8f7a5b', hex: 0x8f7a5b },
    ],
  },
  {
    key: 'magazine',
    tab: 'gun',
    label: 'Magazine / Feed',
    options: [
      { id: 'standard_mag', label: 'Standard Mag', swatch: '#2d3238', hex: 0x2d3238, note: 'Standard' },
      { id: 'extended_mag', label: 'Extended Mag', swatch: '#4c545e', hex: 0x4c545e, note: '+25% Mag Size' },
      { id: 'fast_dual', label: 'Taped Fast-Mag', swatch: '#b89448', hex: 0xb89448, note: '-22% Reload Time' },
      { id: 'drum_mag', label: 'Twin Drum Mag', swatch: '#383e47', hex: 0x383e47, note: '+50% Mag Size' },
      { id: 'light_skel', label: 'Skeletal Light', swatch: '#737d87', hex: 0x737d87, note: '-12% Reload Time' },
      { id: 'cryo_cell', label: 'Aurora Cell-Mag', swatch: '#45e8ff', hex: 0x45e8ff, note: '+15% Cap & Fast' },
    ],
  },
  {
    key: 'tracerFx',
    tab: 'gun',
    label: 'Tracer & Flash',
    options: [
      { id: 'classic_gold', label: 'Classic Brass', swatch: '#ffc65c', hex: 0xffc65c },
      { id: 'aurora_cyan', label: 'Aurora Cyan', swatch: '#38e8ff', hex: 0x38e8ff },
      { id: 'crimson_fire', label: 'Crimson Hellfire', swatch: '#ff3b2f', hex: 0xff3b2f },
      { id: 'toxic_acid', label: 'Fungi Acid', swatch: '#8cf536', hex: 0x8cf536 },
      { id: 'frost_white', label: 'Snowpeak Frost', swatch: '#d6f2ff', hex: 0xd6f2ff },
      { id: 'plasma_violet', label: 'Plasma Violet', swatch: '#d05cff', hex: 0xd05cff },
      { id: 'emerald_bolt', label: 'Emerald Bolt', swatch: '#4ef2a1', hex: 0x4ef2a1 },
      { id: 'solar_flare', label: 'Solar Flare', swatch: '#ff8a24', hex: 0xff8a24 },
    ],
  },
  {
    key: 'charm',
    tab: 'gun',
    label: 'Weapon Charm',
    options: [
      { id: 'none', label: 'No Charm', swatch: '#2e2a28', hex: 0x2e2a28 },
      { id: 'mini_torii', label: 'Mini Torii', swatch: '#d43b2c', hex: 0xd43b2c },
      { id: 'voxel_skull', label: 'Outbreak Skull', swatch: '#e8e2d5', hex: 0xe8e2d5 },
      { id: 'red_postbox', label: 'Kuroba Postbox', swatch: '#e03c28', hex: 0xe03c28 },
      { id: 'snow_crystal', label: 'Snow Crystal', swatch: '#8ce0ff', hex: 0x8ce0ff },
      { id: 'neon_shroom', label: 'Glow Shroom', swatch: '#a84cff', hex: 0xa84cff },
      { id: 'golden_star', label: 'Shogun Star', swatch: '#ffd447', hex: 0xffd447 },
      { id: 'mini_kei', label: 'Mini Kei-Truck', swatch: '#f2f0ea', hex: 0xf2f0ea },
    ],
  },
];

export function getTotalCustomizationCount(): number {
  return CUSTOMIZATION_CATEGORIES.reduce((sum, cat) => sum + cat.options.length, 0);
}

export function getOption(key: keyof LoadoutConfig, id: string): CustomOption {
  const cat = CUSTOMIZATION_CATEGORIES.find((c) => c.key === key)!;
  return cat.options.find((o) => o.id === id) ?? cat.options[0];
}

export function randomizeLoadout(rng: () => number = Math.random): LoadoutConfig {
  const out: LoadoutConfig = { ...DEFAULT_LOADOUT };
  for (const cat of CUSTOMIZATION_CATEGORIES) {
    const idx = Math.floor(rng() * cat.options.length);
    out[cat.key] = cat.options[idx].id;
  }
  return out;
}

export interface LoadoutCombatModifiers {
  damageMult: number;
  magMult: number;
  reloadMult: number;
  spreadMult: number;
  recoilMult: number;
  speedMult: number;
  tracerColor: number;
}

export function computeLoadoutModifiers(loadout: LoadoutConfig): LoadoutCombatModifiers {
  let damageMult = 1.0;
  let magMult = 1.0;
  let reloadMult = 1.0;
  let spreadMult = 1.0;
  let recoilMult = 1.0;
  let speedMult = 1.0;

  if (loadout.optic === 'acog_4x') spreadMult *= 0.9;
  else if (loadout.optic === 'long_sniper') spreadMult *= 0.82;
  else if (loadout.optic === 'cyber_rail') spreadMult *= 0.88;

  if (loadout.muzzle === 'suppressor') recoilMult *= 0.8;
  else if (loadout.muzzle === 'heavy_comp') recoilMult *= 0.75;
  else if (loadout.muzzle === 'breach_spike') damageMult *= 1.08;
  else if (loadout.muzzle === 'twin_cannon') damageMult *= 1.1;
  else if (loadout.muzzle === 'cryo_shroud') speedMult *= 1.1;
  else if (loadout.muzzle === 'long_choke') spreadMult *= 0.85;

  if (loadout.magazine === 'extended_mag') magMult *= 1.25;
  else if (loadout.magazine === 'fast_dual') reloadMult *= 0.78;
  else if (loadout.magazine === 'drum_mag') magMult *= 1.5;
  else if (loadout.magazine === 'light_skel') reloadMult *= 0.88;
  else if (loadout.magazine === 'cryo_cell') {
    magMult *= 1.15;
    reloadMult *= 0.9;
  }

  const tracerColor = getOption('tracerFx', loadout.tracerFx).hex;
  return { damageMult, magMult, reloadMult, spreadMult, recoilMult, speedMult, tracerColor };
}

export function loadSavedLoadout(): LoadoutConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LOADOUT };
    const parsed = JSON.parse(raw) as Partial<LoadoutConfig>;
    const merged: LoadoutConfig = { ...DEFAULT_LOADOUT };
    for (const cat of CUSTOMIZATION_CATEGORIES) {
      const candidate = parsed[cat.key];
      if (typeof candidate === 'string' && cat.options.some((o) => o.id === candidate)) {
        merged[cat.key] = candidate;
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_LOADOUT };
  }
}

export function saveLoadout(loadout: LoadoutConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loadout));
  } catch {
    // ignore storage errors
  }
}
