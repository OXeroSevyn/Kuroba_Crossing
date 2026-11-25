import type { LoadoutConfig } from './types';

export interface CustomOption {
  id: string;
  label: string;
  swatch: string;
  hex: number;
  secondaryHex?: number;
  note?: string;
  /** Operator (player) level required to equip; omitted = always available. */
  unlockLevel?: number;
}

/** Character studio sections (Face, Hair, Body, Outfit, Gear) and the weapon cosmetics tab. */
export type CustomGroup = 'face' | 'hair' | 'body' | 'outfit' | 'gear' | 'finish';

export interface CustomCategory {
  key: keyof LoadoutConfig;
  tab: 'character' | 'gun';
  group: CustomGroup;
  label: string;
  options: CustomOption[];
}

export const DEFAULT_LOADOUT: LoadoutConfig = {
  bodyType: 'athletic',
  skinTone: 'warm_beige',
  faceShape: 'oval',
  eyeStyle: 'focused',
  visorColor: 'dark_brown',
  browStyle: 'straight',
  noseStyle: 'straight',
  mouthStyle: 'neutral',
  hairStyle: 'undercut',
  hairColor: 'jet_black',
  facialHair: 'stubble',
  faceDetail: 'none',
  headgear: 'tactical_cap',
  jacketColor: 'kuroba_orange',
  outfitStyle: 'classic_ranger',
  pantsStyle: 'navy_tac',
  backpack: 'dual_thruster',
  accentGlow: 'cyan_neon',
  gunSkin: 'gunmetal',
  tracerFx: 'classic_gold',
  charm: 'mini_torii',
};

const STORAGE_KEY = 'kuroba_crossing_loadout_v3';
const LEGACY_STORAGE_KEY = 'kuroba_crossing_loadout_v2';

const sw = (hex: number) => '#' + hex.toString(16).padStart(6, '0');
const tone = (
  id: string,
  label: string,
  hex: number,
  secondaryHex?: number,
  extra: Partial<CustomOption> = {},
): CustomOption => ({ id, label, swatch: sw(hex), hex, secondaryHex, ...extra });

export const CUSTOMIZATION_CATEGORIES: CustomCategory[] = [
  // ===================== OPERATOR BODY & FACE =====================
  {
    key: 'bodyType',
    tab: 'character',
    group: 'body',
    label: 'Build',
    options: [
      tone('athletic', 'Athletic', 0x8aa1b8, undefined, { note: 'Balanced frame' }),
      tone('slim', 'Slim Runner', 0x9fb7c9, undefined, { note: 'Narrow & tall' }),
      tone('heavy', 'Heavy Gunner', 0x6d7f91, undefined, { note: 'Broad shoulders' }),
      tone('tall', 'Tall Ranger', 0x7f96ac, undefined, { note: 'Long limbs' }),
      tone('compact', 'Compact Scout', 0xa9bccd, undefined, { note: 'Short & quick' }),
    ],
  },
  {
    key: 'skinTone',
    tab: 'character',
    group: 'face',
    label: 'Skin Tone',
    options: [
      tone('porcelain', 'Porcelain', 0xf6dccb, 0xe8bfa8),
      tone('fair', 'Fair', 0xf0cfb0, 0xdcae8c),
      tone('light', 'Light', 0xe6bd96, 0xcf9e76),
      tone('warm_beige', 'Warm Beige', 0xd9a77c, 0xbf8a60),
      tone('golden', 'Golden', 0xcf9a62, 0xb27d48),
      tone('olive', 'Olive', 0xb98a5c, 0x9a6e44),
      tone('tan', 'Tan', 0xa87346, 0x8a5a33),
      tone('bronze', 'Bronze', 0x8e5c36, 0x724628),
      tone('brown', 'Brown', 0x734528, 0x5a331d),
      tone('deep', 'Deep Brown', 0x553220, 0x3f2417),
    ],
  },
  {
    key: 'faceShape',
    tab: 'character',
    group: 'face',
    label: 'Face Shape',
    options: [
      tone('oval', 'Oval', 0xd9a77c),
      tone('square', 'Square Jaw', 0xc7946a),
      tone('round', 'Round', 0xe3b48a),
      tone('angular', 'Angular', 0xbf8a60),
      tone('long', 'Long', 0xcf9e76),
    ],
  },
  {
    key: 'eyeStyle',
    tab: 'character',
    group: 'face',
    label: 'Eyes',
    options: [
      tone('focused', 'Focused', 0x2b2f36),
      tone('wide', 'Wide Open', 0x3a404a),
      tone('narrow', 'Narrow', 0x22262c),
      tone('sleepy', 'Heavy-Lidded', 0x4a505a),
      tone('fierce', 'Fierce', 0x1a1d22),
      tone('gentle', 'Gentle', 0x5a606a),
    ],
  },
  {
    key: 'visorColor',
    tab: 'character',
    group: 'face',
    label: 'Eye Colour',
    options: [
      tone('dark_brown', 'Dark Brown', 0x4a2c1a),
      tone('hazel', 'Hazel', 0x8a6a2e),
      tone('ocean_blue', 'Ocean Blue', 0x2f6fb0),
      tone('forest_green', 'Forest Green', 0x3f7a3a),
      tone('steel_grey', 'Steel Grey', 0x6f7c88),
      tone('amber_warm', 'Warm Amber', 0xc9822c),
      tone('cyan_pulse', 'Cyber Cyan', 0x45f2ff, undefined, { note: 'Cyber implant', unlockLevel: 3 }),
      tone('emerald_bio', 'Emerald Bio', 0x4ef2a1, undefined, { note: 'Cyber implant', unlockLevel: 4 }),
      tone('crimson_hunt', 'Crimson Hunter', 0xff3838, undefined, { note: 'Cyber implant', unlockLevel: 5 }),
      tone('solar_gold', 'Solar Gold', 0xffd447, undefined, { note: 'Cyber implant', unlockLevel: 6 }),
      tone('ultraviolet', 'Ultraviolet', 0xc45cff, undefined, { note: 'Cyber implant', unlockLevel: 7 }),
      tone('sakura_pink', 'Sakura Pink', 0xff7eb6, undefined, { note: 'Cyber implant', unlockLevel: 8 }),
    ],
  },
  {
    key: 'browStyle',
    tab: 'character',
    group: 'face',
    label: 'Eyebrows',
    options: [
      tone('straight', 'Straight', 0x2a1f18),
      tone('arched', 'Arched', 0x3a2a1f),
      tone('thick', 'Thick', 0x1f1712),
      tone('thin', 'Thin', 0x4a3a2f),
      tone('angry', 'Furrowed', 0x1a1410),
      tone('split', 'Scar-Split', 0x2a1f18),
    ],
  },
  {
    key: 'noseStyle',
    tab: 'character',
    group: 'face',
    label: 'Nose',
    options: [
      tone('straight', 'Straight', 0xc7946a),
      tone('button', 'Button', 0xd9a77c),
      tone('broad', 'Broad', 0xb27d48),
      tone('hooked', 'Hooked', 0xbf8a60),
      tone('small', 'Small', 0xe3b48a),
    ],
  },
  {
    key: 'mouthStyle',
    tab: 'character',
    group: 'face',
    label: 'Expression',
    options: [
      tone('neutral', 'Neutral', 0xa65a4a),
      tone('smirk', 'Smirk', 0xb2604e),
      tone('grin', 'Confident Grin', 0xf2ece4),
      tone('frown', 'Grim', 0x8f4a3c),
      tone('determined', 'Gritted Teeth', 0xe8e2da),
      tone('calm', 'Calm Smile', 0xbf6a58),
    ],
  },
  {
    key: 'faceDetail',
    tab: 'character',
    group: 'face',
    label: 'Scars & Marks',
    options: [
      tone('none', 'Clean', 0x2e2a28),
      tone('scar_eye', 'Eye Scar', 0xb05a50),
      tone('scar_cheek', 'Cheek Scar', 0xa8564c),
      tone('freckles', 'Freckles', 0x9a6a46),
      tone('glasses', 'Tactical Glasses', 0x45f2ff),
      tone('bandage', 'Nose Bandage', 0xf2ece0),
      tone('war_paint', 'War Paint', 0xd43838, undefined, { unlockLevel: 2 }),
      tone('eye_patch', 'Eye Patch', 0x1a1a1a, undefined, { unlockLevel: 3 }),
      tone('kanji_tattoo', 'Kanji Tattoo', 0x1f2937, undefined, { unlockLevel: 4 }),
    ],
  },
  {
    key: 'hairStyle',
    tab: 'character',
    group: 'hair',
    label: 'Hairstyle',
    options: [
      tone('undercut', 'Undercut', 0x1c1c1f),
      tone('buzz', 'Buzz Cut', 0x2a2a2e),
      tone('side_part', 'Side Part', 0x2f241c),
      tone('spiky', 'Spiky', 0x24242a),
      tone('ponytail', 'Ponytail', 0x3a2a1c),
      tone('bob', 'Bob Cut', 0x2a1f18),
      tone('long', 'Long & Loose', 0x3f2c1d),
      tone('topknot', 'Samurai Topknot', 0x141416),
      tone('afro', 'Afro', 0x1f1712),
      tone('braids', 'Braids', 0x2a1f18),
      tone('bald', 'Shaved', 0xd9a77c),
      tone('mohawk', 'Mohawk', 0xd43b8c, undefined, { unlockLevel: 3 }),
    ],
  },
  {
    key: 'hairColor',
    tab: 'character',
    group: 'hair',
    label: 'Hair Colour',
    options: [
      tone('jet_black', 'Jet Black', 0x16161a),
      tone('dark_brown', 'Dark Brown', 0x3a2519),
      tone('chestnut', 'Chestnut', 0x6b3e22),
      tone('auburn', 'Auburn', 0x8f3a1f),
      tone('ginger', 'Ginger', 0xc0602a),
      tone('blonde', 'Blonde', 0xd9b66a),
      tone('platinum', 'Platinum', 0xe8e2d4),
      tone('silver', 'Silver', 0xa8b0b8),
      tone('sakura', 'Sakura Pink', 0xf08ab4, undefined, { unlockLevel: 2 }),
      tone('aurora', 'Aurora Cyan', 0x38d8f0, undefined, { unlockLevel: 3 }),
      tone('violet', 'Fungi Violet', 0x8a5ad8, undefined, { unlockLevel: 4 }),
      tone('lime', 'Acid Lime', 0x9eea3b, undefined, { unlockLevel: 5 }),
    ],
  },
  {
    key: 'facialHair',
    tab: 'character',
    group: 'hair',
    label: 'Facial Hair',
    options: [
      tone('none', 'Clean Shaven', 0xd9a77c),
      tone('stubble', 'Stubble', 0x4a3a2f),
      tone('mustache', 'Mustache', 0x2a1f18),
      tone('goatee', 'Goatee', 0x2a1f18),
      tone('chin_strap', 'Chin Strap', 0x2a1f18),
      tone('full_beard', 'Full Beard', 0x2a1f18),
    ],
  },

  // ===================== OUTFIT & GEAR =====================
  {
    key: 'headgear',
    tab: 'character',
    group: 'gear',
    label: 'Headgear',
    options: [
      { id: 'none', label: 'Bare Head', swatch: '#3a3f47', hex: 0x3a3f47 },
      { id: 'tactical_cap', label: 'Tactical Cap', swatch: '#2f3a2c', hex: 0x2f3a2c },
      { id: 'headband', label: 'Hachimaki Band', swatch: '#f2efe8', hex: 0xf2efe8, secondaryHex: 0xd43b2c },
      { id: 'beanie', label: 'Knit Beanie', swatch: '#3b4a5a', hex: 0x3b4a5a },
      { id: 'ranger_helm', label: 'Ranger Helmet', swatch: '#ede8dc', hex: 0xede8dc },
      { id: 'ronin_kasa', label: 'Ronin Kasa', swatch: '#c99b4f', hex: 0xc99b4f },
      { id: 'snow_ushanka', label: 'Snow Ushanka', swatch: '#7c553b', hex: 0x7c553b },
      { id: 'hazmat_mask', label: 'Bio Gas Mask', swatch: '#4a5248', hex: 0x4a5248, unlockLevel: 3 },
      { id: 'nvg_ops', label: 'NVG Tactical', swatch: '#354238', hex: 0x354238, unlockLevel: 4 },
      { id: 'kitsune_mask', label: 'Kitsune Mask', swatch: '#f5efe6', hex: 0xf5efe6, unlockLevel: 5 },
      { id: 'cyber_kabuto', label: 'Cyber Kabuto', swatch: '#2c313b', hex: 0x2c313b, unlockLevel: 6 },
      { id: 'crowned_visor', label: 'Aurora Crown', swatch: '#45e8ff', hex: 0x45e8ff, unlockLevel: 10 },
    ],
  },
  {
    key: 'jacketColor',
    tab: 'character',
    group: 'outfit',
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
    group: 'outfit',
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
    group: 'outfit',
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
    group: 'gear',
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
    group: 'outfit',
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

  // ===================== WEAPON FINISH (shared cosmetics; attachments live in armory.ts) =====================
  {
    key: 'gunSkin',
    tab: 'gun',
    group: 'finish',
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
    key: 'tracerFx',
    tab: 'gun',
    group: 'finish',
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
    group: 'finish',
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
  tracerColor: number;
}

export function computeLoadoutModifiers(loadout: LoadoutConfig): LoadoutCombatModifiers {
  return { tracerColor: getOption('tracerFx', loadout.tracerFx).hex };
}

/** Whether an option is equippable at the given operator level. */
export function isOptionUnlocked(opt: CustomOption, playerLevel: number): boolean {
  return (opt.unlockLevel ?? 1) <= playerLevel;
}

export function loadSavedLoadout(): LoadoutConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
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
