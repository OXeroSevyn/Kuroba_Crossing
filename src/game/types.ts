export type GamePhase = 'title' | 'customize' | 'playing' | 'paused' | 'victory' | 'gameover';

export type GameMode = 'zombies' | 'deathmatch' | 'mecha';

export type TimeOfDay = 'day' | 'night';

export type WeaponId = 'pulse' | 'scatter' | 'rail' | 'rpg' | 'katana';

export type WorldZoneId = 'kuroba' | 'aurora' | 'fungi' | 'snowpeak';

export type VehicleKind = 'kei_truck' | 'olive_jeep' | 'aurora_coupe' | 'fungi_buggy' | 'snow_patrol' | 'bike';

export type WildlifeKind = 'pigeon' | 'crow' | 'cat' | 'fox';

export interface LoadoutConfig {
  // Operator body & face (character generator)
  bodyType: string;
  skinTone: string;
  faceShape: string;
  eyeStyle: string;
  /** Iris colour (kept under its legacy key; also tints visor/NVG glow). */
  visorColor: string;
  browStyle: string;
  noseStyle: string;
  mouthStyle: string;
  hairStyle: string;
  hairColor: string;
  facialHair: string;
  faceDetail: string;
  // Outfit & gear
  headgear: string;
  jacketColor: string;
  outfitStyle: string;
  pantsStyle: string;
  backpack: string;
  accentGlow: string;
  // Weapon cosmetics (shared by every gun)
  gunSkin: string;
  tracerFx: string;
  charm: string;
}

/** Firearms that take attachments (the katana has none). */
export type FirearmId = 'pulse' | 'scatter' | 'rail' | 'rpg';

export type AttachmentSlot = 'optic' | 'muzzle' | 'underbarrel' | 'magazine' | 'stock' | 'laser';

/** Per-gun build: which model ("variant") is equipped in the slot and its attachments. */
export interface GunBuild {
  variant: string;
  optic: string;
  muzzle: string;
  underbarrel: string;
  magazine: string;
  stock: string;
  laser: string;
}

export type GunBuilds = Record<FirearmId, GunBuild>;

/** How an optic is presented when aiming. */
export type ReticleKind = 'iron' | 'dot' | 'holo' | 'chevron' | 'mildot' | 'thermal' | 'smart' | 'pgo';

export interface ScopeHudState {
  /** 0..1 blend while raising / lowering the scope. */
  blend: number;
  /** True when a magnified optic is up: full-screen lens view. */
  fullscreen: boolean;
  reticle: ReticleKind;
  zoom: number;
  reticleColor: string;
  opticName: string;
  /** Distance to whatever the reticle is on, in metres (null when nothing in range). */
  rangeM: number | null;
  variableZoom: boolean;
}

export interface UnlockToast {
  id: number;
  title: string;
  detail: string;
  /** Seconds left on screen. */
  timer: number;
}

export interface WeaponSpec {
  id: WeaponId;
  slot: 1 | 2 | 3 | 4 | 5;
  name: string;
  role: string;
  damage: number;
  fireInterval: number; // seconds between shots
  magSize: number;
  reloadDuration: number; // seconds
  pellets: number;
  spreadRad: number;
  projectileSpeed: number;
  piercing: boolean;
  recoilKick: number;
  hitstopSec: number;
  accentHex: string;
  accentColor: number;
}

export type EnemyArchetype = 'rusher' | 'trooper' | 'charger' | 'drone' | 'shogun';

export interface ColliderBox {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  walkableTop?: boolean; // player can stand/step on top (e.g. veranda, platform)
  blocksBullets?: boolean;
}

export interface PlayerKinematicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facingYaw: number;
  grounded: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  dashTimer: number; // > 0 while actively dashing
  dashCooldown: number;
  dashCharges: number;
  maxDashCharges: number;
  dashRechargeTimer: number;
  dashDirX: number;
  dashDirZ: number;
  invulnTimer: number;
  squashX: number;
  squashY: number;
  walkDistance: number;
}

export type GrenadeType = 'frag' | 'smoke';

export interface HelicopterState {
  id: string;
  name: string;
  x: number;
  y: number; // altitude (ground = 0.22, flight = 2..28m)
  z: number;
  yaw: number;
  pitch: number; // nose tilt
  roll: number; // bank angle
  speed: number;
  altitude?: number;
  vx: number;
  vy: number;
  vz: number;
  rotorSpeed: number; // 0..1 normalized RPM
  rotorAngle: number;
  tailRotorAngle: number;
  hp: number;
  maxHp: number;
  bombs: number;
  maxBombs: number;
  bombCooldown: number;
  minigunCooldown: number;
  destroyed: boolean;
  respawnTimer: number;
}

export interface TankState {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  turretYaw: number;
  cannonPitch: number;
  speed: number;
  vx: number;
  vz: number;
  treadSpin: number;
  hp: number;
  maxHp: number;
  cannonCooldown: number;
  coaxialCooldown: number;
  destroyed: boolean;
  respawnTimer: number;
}

export interface C4EntityState {
  id: string;
  x: number;
  y: number;
  z: number;
  stuckVehicleId?: string;
  beepTimer: number;
}

export interface SentryEntityState {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  fireCooldown: number;
  targetEnemyId: number | null;
  scanPhase: number;
}

export interface DestructiblePropSpec {
  id: string;
  kind: 'fence' | 'crate' | 'lantern' | 'canopy';
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  colliderId: string;
}

export interface VehicleKinematicsState {
  id: string;
  kind: VehicleKind;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number; // signed m/s along heading
  vx: number; // residual crash knockback velocity X
  vz: number; // residual crash knockback velocity Z
  steerAngle: number; // -1..1 visual wheel turn
  wheelSpin: number;
  nitro: number; // 0..100
  boosting: boolean;
  drifting: boolean;
  maxSpeed: number;
  accel: number;
  radius: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  respawnTimer: number;
}

export interface WeaponRuntimeState {
  active: WeaponId;
  ammo: Record<WeaponId, number>;
  fireCooldown: number;
  reloading: boolean;
  reloadTimer: number;
  reloadTotal: number;
}

export interface WaveSpawnEntry {
  archetype: EnemyArchetype;
  delay: number;
  spawnIndex: number;
}

export interface WavePlan {
  wave: number;
  title: string;
  subtitle: string;
  entries: WaveSpawnEntry[];
  speedMultiplier: number;
  maxConcurrent: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  gameMode: GameMode;
  timeOfDay: TimeOfDay;
  zone: WorldZoneId;
  zoneName: string;
  zoneBannerTimer: number;
  hp: number;
  maxHp: number;
  ghostHp: number;
  dashCharges: number;
  maxDashCharges: number;
  dashRechargeProgress: number; // 0..1
  score: number;
  bestScore: number;
  combo: number;
  comboTimer: number; // 0..1 normalized
  wave: number;
  totalWaves: number | null; // null in endless Zombie Survival
  waveTitle: string;
  waveBannerTimer: number;
  enemiesRemaining: number;
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  magSizes: Record<WeaponId, number>;
  reloading: boolean;
  reloadProgress: number; // 0..1
  aiming: boolean;
  /** Optic / scope presentation while aiming down sights. */
  scope: ScopeHudState;
  /** "New attachment unlocked" style notifications earned this run. */
  unlockToasts: UnlockToast[];
  /** Operator progression (persistent). */
  playerLevel: number;
  playerLevelProgress: number; // 0..1 to next level
  weaponLevel: number; // level of the active firearm
  weaponLevelProgress: number; // 0..1
  pointerLocked: boolean;
  hitmarkerTimer: number;
  hitmarkerCrit: boolean;
  hurtFlash: number; // 0..1
  muted: boolean;
  kills: number;
  elapsedSec: number;
  bossHp: number;
  bossMaxHp: number;
  bossName: string;
  crosshairSpread: number;
  // Tactical Grenades
  grenades: { frag: number; smoke: number; active: GrenadeType };
  // Helicopter flight state
  inHelicopter: boolean;
  helicopterName: string;
  helicopterAltitude: number;
  helicopterBombs: number;
  helicopterHp: number;
  helicopterMaxHp: number;
  nearbyHelicopterName: string | null;
  // Vehicle state
  inVehicle: boolean;
  vehicleName: string;
  vehicleSpeedKmh: number;
  vehicleNitro: number; // 0..100
  vehicleHp: number;
  vehicleMaxHp: number;
  nearbyVehicleName: string | null;
  // Tank battle state
  inTank: boolean;
  tankName: string;
  tankHp: number;
  tankMaxHp: number;
  tankCannonReady: boolean;
  nearbyTankName: string | null;
  // Gadgets & Special Equipment
  c4Count: number;
  sentriesAvailable: number;
  katanaReady: boolean;
  overhealth: number;
  interactionPrompt: string | null;
  minimapPlayer: { x: number; z: number; yaw: number };
  minimapEnemies: Array<{ x: number; z: number; archetype: EnemyArchetype }>;
  minimapVehicles: Array<{ x: number; z: number; active: boolean }>;
  // Team Deathmatch Multiplayer
  tdmScores?: { redScore: number; blueScore: number; targetKills: number; winner: 'red' | 'blue' | null };
  tdmTeam?: 'red' | 'blue';
  roomCode?: string;
  isHost?: boolean;
  connectedPlayersCount?: number;
  killFeed?: Array<{ id: string; killerName: string; killerTeam: 'red' | 'blue'; victimName: string; victimTeam: 'red' | 'blue'; weapon: WeaponId; timestamp: number }>;
}

export interface RunSummary {
  outcome: 'victory' | 'gameover';
  gameMode: GameMode;
  score: number;
  bestScore: number;
  waveReached: number;
  totalWaves: number | null;
  kills: number;
  elapsedSec: number;
  damageTaken: number;
}

