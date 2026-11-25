import type {
  ColliderBox,
  EnemyArchetype,
  GameMode,
  PlayerKinematicsState,
  VehicleKinematicsState,
  WavePlan,
  WaveSpawnEntry,
  WeaponId,
  WeaponRuntimeState,
  WeaponSpec,
  WorldZoneId,
} from './types';

export const TOTAL_WAVES = 5;
export const PLAYER_MAX_HP = 100;
export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.65;
export const ARENA_HALF_EXTENT = 148;

export interface WorldZoneInfo {
  id: WorldZoneId;
  name: string;
  subtitle: string;
  accentHex: string;
  dayFogHex: number;
  nightFogHex: number;
}

export const WORLD_ZONE_INFO: Record<WorldZoneId, WorldZoneInfo> = {
  kuroba: {
    id: 'kuroba',
    name: 'KUROBA CROSSING',
    subtitle: 'Central Railway Heartland',
    accentHex: '#f2c46d',
    dayFogHex: 0xa9d0f5,
    nightFogHex: 0x080e1a,
  },
  aurora: {
    id: 'aurora',
    name: 'AURORA CITY',
    subtitle: 'Western Harbor City',
    accentHex: '#45f2ff',
    dayFogHex: 0x9fcbf3,
    nightFogHex: 0x081326,
  },
  fungi: {
    id: 'fungi',
    name: 'FUNGI FOREST',
    subtitle: 'East Bioluminescent Wilds',
    accentHex: '#a3ff5c',
    dayFogHex: 0xb9d9c8,
    nightFogHex: 0x0a1614,
  },
  snowpeak: {
    id: 'snowpeak',
    name: 'KOPENHIME SNOWPEAK',
    subtitle: 'Northern Alpine Ridge',
    accentHex: '#9be4ff',
    dayFogHex: 0xd9e8f2,
    nightFogHex: 0x0b1628,
  },
};

export function detectWorldZone(x: number, z: number): WorldZoneId {
  if (z < -44) return 'snowpeak';
  if (x < -44) return 'aurora';
  if (x > 44) return 'fungi';
  return 'kuroba';
}

export function getEffectiveMagSize(id: WeaponId, magMult = 1): number {
  return Math.max(1, Math.round(WEAPONS[id].magSize * magMult));
}

export function getEffectiveReloadDuration(id: WeaponId, reloadMult = 1): number {
  return Math.max(0.45, WEAPONS[id].reloadDuration * reloadMult);
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pulse: {
    id: 'pulse',
    slot: 1,
    name: 'M4-K Tactical Carbine',
    role: 'Full-Auto Rifle',
    damage: 21,
    fireInterval: 0.135,
    magSize: 28,
    reloadDuration: 1.35,
    pellets: 1,
    spreadRad: 0.011,
    projectileSpeed: 58,
    piercing: false,
    recoilKick: 0.2,
    hitstopSec: 0.018,
    accentHex: '#ffb952',
    accentColor: 0xffc65c,
  },
  scatter: {
    id: 'scatter',
    slot: 2,
    name: 'M870 Breach Shotgun',
    role: 'Buckshot Burst',
    damage: 15,
    fireInterval: 0.58,
    magSize: 8,
    reloadDuration: 1.55,
    pellets: 6,
    spreadRad: 0.084,
    projectileSpeed: 46,
    piercing: false,
    recoilKick: 0.6,
    hitstopSec: 0.052,
    accentHex: '#ff7d3b',
    accentColor: 0xff8a3b,
  },
  rail: {
    id: 'rail',
    slot: 3,
    name: 'K-50 Precision Rifle',
    role: 'Piercing Heavy',
    damage: 74,
    fireInterval: 0.8,
    magSize: 6,
    reloadDuration: 1.75,
    pellets: 1,
    spreadRad: 0.002,
    projectileSpeed: 88,
    piercing: true,
    recoilKick: 0.72,
    hitstopSec: 0.064,
    accentHex: '#4ef2a1',
    accentColor: 0x4ef2a1,
  },
  rpg: {
    id: 'rpg',
    slot: 4,
    name: 'RPG-7 Rocket Launcher',
    role: 'Anti-Armor Rocket',
    damage: 320,
    fireInterval: 1.6,
    magSize: 1,
    reloadDuration: 2.1,
    pellets: 1,
    spreadRad: 0.001,
    projectileSpeed: 38,
    piercing: false,
    recoilKick: 0.95,
    hitstopSec: 0.08,
    accentHex: '#ef4444',
    accentColor: 0xef4444,
  },
  katana: {
    id: 'katana',
    slot: 5,
    name: 'Cyber Katana',
    role: 'Hyper-Sonic Slash',
    damage: 140,
    fireInterval: 0.38,
    magSize: 999,
    reloadDuration: 0.1,
    pellets: 1,
    spreadRad: 0,
    projectileSpeed: 24,
    piercing: true,
    recoilKick: 0.35,
    hitstopSec: 0.075,
    accentHex: '#ec4899',
    accentColor: 0xec4899,
  },
};

/**
 * The original slot specs. Gun models and attachments (armory.ts) are resolved on top of these
 * and written into WEAPONS with applyWeaponOverrides, so combat code keeps reading WEAPONS[id].
 */
export const BASE_WEAPONS: Readonly<Record<WeaponId, Readonly<WeaponSpec>>> = Object.fromEntries(
  Object.entries(WEAPONS).map(([id, spec]) => [id, Object.freeze({ ...spec })]),
) as Record<WeaponId, WeaponSpec>;

/** Resets every weapon to its base spec, then applies the given per-weapon overrides. */
export function applyWeaponOverrides(overrides: Partial<Record<WeaponId, Partial<WeaponSpec>>>): void {
  for (const id of Object.keys(BASE_WEAPONS) as WeaponId[]) {
    Object.assign(WEAPONS[id], BASE_WEAPONS[id], overrides[id] ?? {});
  }
}

export const ZOMBIE_LABELS: Record<EnemyArchetype, string> = {
  rusher: 'Infected Sprinter',
  trooper: 'Station Walker',
  charger: 'Hulk Brute',
  drone: 'Acid Spitter',
  shogun: 'Alpha Nemesis',
};

export const WEAPON_ORDER: WeaponId[] = ['pulse', 'scatter', 'rail', 'rpg', 'katana'];

export interface EnemyBaseStats {
  archetype: EnemyArchetype;
  label: string;
  maxHp: number;
  speed: number;
  radius: number;
  height: number;
  scoreValue: number;
  damage: number;
  telegraphSec: number;
  attackCooldown: number;
  preferredRange: number;
}

export const ENEMY_STATS: Record<EnemyArchetype, EnemyBaseStats> = {
  rusher: {
    archetype: 'rusher',
    label: 'Kitsune Rusher',
    maxHp: 46,
    speed: 6.4,
    radius: 0.52,
    height: 1.5,
    scoreValue: 120,
    damage: 14,
    telegraphSec: 0.36,
    attackCooldown: 1.6,
    preferredRange: 2.2,
  },
  trooper: {
    archetype: 'trooper',
    label: 'Tanuki Gunner',
    maxHp: 64,
    speed: 3.9,
    radius: 0.55,
    height: 1.7,
    scoreValue: 160,
    damage: 13,
    telegraphSec: 0.5,
    attackCooldown: 2.1,
    preferredRange: 13.5,
  },
  charger: {
    archetype: 'charger',
    label: 'Oni Charger',
    maxHp: 128,
    speed: 3.5,
    radius: 0.78,
    height: 2.15,
    scoreValue: 260,
    damage: 22,
    telegraphSec: 0.65,
    attackCooldown: 3.0,
    preferredRange: 9.0,
  },
  drone: {
    archetype: 'drone',
    label: 'Tengu Drone',
    maxHp: 58,
    speed: 4.8,
    radius: 0.58,
    height: 1.4,
    scoreValue: 200,
    damage: 11,
    telegraphSec: 0.55,
    attackCooldown: 2.6,
    preferredRange: 14.5,
  },
  shogun: {
    archetype: 'shogun',
    label: 'Shogun Mk-IV',
    maxHp: 560,
    speed: 3.4,
    radius: 1.15,
    height: 3.2,
    scoreValue: 1200,
    damage: 24,
    telegraphSec: 0.72,
    attackCooldown: 2.35,
    preferredRange: 12.0,
  },
};

export function createInitialPlayerState(spawnX = 0, spawnY = 0, spawnZ = 6.5): PlayerKinematicsState {
  return {
    x: spawnX,
    y: spawnY,
    z: spawnZ,
    vx: 0,
    vy: 0,
    vz: 0,
    facingYaw: Math.PI, // Facing north (-Z) toward the iconic station shop
    grounded: true,
    coyoteTimer: 0.11,
    jumpBufferTimer: 0,
    dashTimer: 0,
    dashCooldown: 0,
    dashCharges: 2,
    maxDashCharges: 2,
    dashRechargeTimer: 0,
    dashDirX: 0,
    dashDirZ: -1,
    invulnTimer: 0,
    squashX: 1,
    squashY: 1,
    walkDistance: 0,
  };
}

export function createInitialWeaponState(magMult = 1, reloadMult = 1): WeaponRuntimeState {
  return {
    active: 'pulse',
    ammo: {
      pulse: getEffectiveMagSize('pulse', magMult),
      scatter: getEffectiveMagSize('scatter', magMult),
      rail: getEffectiveMagSize('rail', magMult),
      rpg: getEffectiveMagSize('rpg', magMult),
      katana: 999,
    },
    fireCooldown: 0,
    reloading: false,
    reloadTimer: 0,
    reloadTotal: getEffectiveReloadDuration('pulse', reloadMult),
  };
}

export function buildWavePlan(waveNumber: number, mode: GameMode = 'mecha'): WavePlan {
  if (mode === 'deathmatch') {
    return {
      wave: 1,
      title: 'TEAM DEATHMATCH',
      subtitle: 'RED TEAM VS BLUE TEAM · FIRST TO 25 KILLS',
      entries: [],
      speedMultiplier: 1,
      maxConcurrent: 0,
    };
  }
  if (mode === 'zombies') {
    const wave = Math.max(1, waveNumber);
    const entries: WaveSpawnEntry[] = [];
    let spawnCursor = (wave * 2) % 6;
    const push = (archetype: EnemyArchetype, count: number, startDelay: number, spacing: number) => {
      for (let i = 0; i < count; i++) {
        entries.push({
          archetype,
          delay: startDelay + i * spacing,
          spawnIndex: (spawnCursor++) % 6,
        });
      }
    };

    const isBossWave = wave % 5 === 0;
    const sprinters = Math.min(14, 3 + Math.floor(wave * 1.4));
    const walkers = Math.min(10, 2 + Math.floor(wave * 0.9));
    const spitters = wave >= 2 ? Math.min(6, Math.floor((wave - 1) * 0.85) + 1) : 0;
    const brutes = wave >= 3 ? Math.min(5, Math.floor((wave - 2) * 0.7) + 1) : 0;

    if (isBossWave) {
      push('shogun', 1, 0.5, 0);
    }
    push('rusher', sprinters, 0.15, Math.max(0.55, 1.25 - wave * 0.05));
    push('trooper', walkers, 0.55, Math.max(0.7, 1.5 - wave * 0.05));
    if (spitters > 0) push('drone', spitters, 1.8, 1.6);
    if (brutes > 0) push('charger', brutes, 2.2, 2.5);

    const speedMultiplier = Math.min(1.52, 0.96 + (wave - 1) * 0.055);
    return {
      wave,
      title: isBossWave
        ? `HORDE ${wave} · ALPHA NEMESIS`
        : `HORDE ${wave} · OUTBREAK SURGE`,
      subtitle: isBossWave
        ? 'An Alpha Nemesis leads the undead horde across Kuroba Crossing'
        : 'Survive the escalating infected horde',
      entries: entries.sort((a, b) => a.delay - b.delay),
      speedMultiplier,
      maxConcurrent: Math.min(12, 6 + Math.floor(wave * 0.7)),
    };
  }

  const wave = Math.max(1, Math.min(TOTAL_WAVES, waveNumber));
  const entries: WaveSpawnEntry[] = [];
  let spawnCursor = 0;
  const push = (archetype: EnemyArchetype, count: number, startDelay: number, spacing: number) => {
    for (let i = 0; i < count; i++) {
      entries.push({
        archetype,
        delay: startDelay + i * spacing,
        spawnIndex: (spawnCursor++) % 6,
      });
    }
  };

  if (wave === 1) {
    push('rusher', 3, 0.15, 1.35);
    push('trooper', 2, 0.65, 2.0);
    return {
      wave,
      title: 'WAVE 1 · CROSSING BREACH',
      subtitle: 'Kitsune scouts and Tanuki gunners approaching the tracks',
      entries: entries.sort((a, b) => a.delay - b.delay),
      speedMultiplier: 1.0,
      maxConcurrent: 5,
    };
  }
  if (wave === 2) {
    push('rusher', 4, 0.6, 1.2);
    push('trooper', 3, 1.4, 1.5);
    push('drone', 2, 3.2, 2.2);
    return {
      wave,
      title: 'WAVE 2 · SKYLINE WATCH',
      subtitle: 'Tengu hover drones flanking above the crossing',
      entries: entries.sort((a, b) => a.delay - b.delay),
      speedMultiplier: 1.06,
      maxConcurrent: 6,
    };
  }
  if (wave === 3) {
    push('charger', 2, 0.8, 3.2);
    push('rusher', 4, 1.0, 1.2);
    push('trooper', 3, 2.0, 1.6);
    push('drone', 2, 3.8, 2.0);
    return {
      wave,
      title: 'WAVE 3 · IRON STAMPEDE',
      subtitle: 'Armored Oni Chargers breaking down the south road',
      entries: entries.sort((a, b) => a.delay - b.delay),
      speedMultiplier: 1.12,
      maxConcurrent: 7,
    };
  }
  if (wave === 4) {
    push('charger', 2, 0.7, 2.8);
    push('drone', 4, 1.2, 1.4);
    push('trooper', 4, 1.6, 1.3);
    push('rusher', 5, 2.5, 1.0);
    return {
      wave,
      title: 'WAVE 4 · STATION SIEGE',
      subtitle: 'Coordinated assault from every rail approach',
      entries: entries.sort((a, b) => a.delay - b.delay),
      speedMultiplier: 1.18,
      maxConcurrent: 8,
    };
  }

  // Wave 5: Boss Wave
  push('shogun', 1, 0.8, 0);
  push('trooper', 3, 2.6, 2.2);
  push('drone', 2, 4.0, 2.6);
  push('rusher', 3, 6.2, 2.0);
  return {
    wave: 5,
    title: 'FINAL WAVE · SHOGUN MK-IV',
    subtitle: 'Defeat the heavy command mech to secure Kuroba Crossing',
    entries: entries.sort((a, b) => a.delay - b.delay),
    speedMultiplier: 1.2,
    maxConcurrent: 7,
  };
}

export interface ReloadAnimPose {
  stage: 'eject' | 'insert' | 'rack';
  gunPitch: number;
  gunRoll: number;
  magDropY: number; // 0 seated, negative dropped out
  boltPullZ: number; // 0 forward, negative pulled back
  leftArmRaise: number; // 0 idle, 1 reaching to magwell/bolt
}

/**
 * Pure 3-stage tactical reload choreography curve (0..1 normalized progress).
 */
export function computeReloadPose(progress: number): ReloadAnimPose {
  const p = clamp(progress, 0, 1);
  if (p < 0.35) {
    const t = p / 0.35;
    const ease = Math.sin(t * Math.PI * 0.5);
    return {
      stage: 'eject',
      gunPitch: -0.45 * ease,
      gunRoll: 0.42 * ease,
      magDropY: -0.42 * ease,
      boltPullZ: 0,
      leftArmRaise: ease * 0.65,
    };
  }
  if (p < 0.72) {
    const t = (p - 0.35) / 0.37;
    const seat = 1 - Math.sin(t * Math.PI * 0.5);
    return {
      stage: 'insert',
      gunPitch: -0.45,
      gunRoll: 0.42,
      magDropY: -0.42 * seat,
      boltPullZ: 0,
      leftArmRaise: 0.65 + (1 - seat) * 0.35,
    };
  }
  const t = (p - 0.72) / 0.28;
  const rack = Math.sin(t * Math.PI);
  const settle = 1 - t;
  return {
    stage: 'rack',
    gunPitch: -0.45 * settle - rack * 0.14,
    gunRoll: 0.42 * settle,
    magDropY: 0,
    boltPullZ: -0.18 * rack,
    leftArmRaise: settle * 0.9,
  };
}

export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = normalizeAngle(target - current);
  const t = 1 - Math.exp(-lambda * dt);
  return normalizeAngle(current + diff * t);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export interface MoveInput {
  forward: number; // -1..1
  right: number; // -1..1
  cameraYaw: number;
  jumpJustPressed: boolean;
  jumpHeld: boolean;
  dashJustPressed: boolean;
  aimingOrShooting: boolean;
}

export interface MoveStepResult {
  jumped: boolean;
  landed: boolean;
  dashed: boolean;
  steppedFoot: boolean;
}

/**
 * Pure circle-vs-AABB collision resolver with step-up support for walkable decks/stairs.
 */
export function resolveCylinderWorldCollision(
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  colliders: ColliderBox[],
  stepUpHeight = 0.55,
): { x: number; y: number; z: number; groundY: number; hitWall: boolean } {
  let outX = clamp(x, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);
  let outZ = clamp(z, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);
  let groundY = 0;
  let hitWall = outX !== x || outZ !== z;

  // Broadphase: only boxes near the query point (push-outs move at most ~radius per pass)
  const candidates = queryNearbyColliders(colliders, outX, outZ, radius * 4 + 1.0);

  // Four passes guarantee zero corner/wall clipping for both characters and cars
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < candidates.length; i++) {
      const box = candidates[i];
      const closestX = clamp(outX, box.minX, box.maxX);
      const closestZ = clamp(outZ, box.minZ, box.maxZ);
      const dx = outX - closestX;
      const dz = outZ - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq >= radius * radius) continue;

      // Check vertical overlap
      if (y + height <= box.minY + 0.02) continue;

      // If walkable top and player is at/near top, stand on it instead of pushing out horizontally
      if (box.walkableTop && y >= box.maxY - stepUpHeight) {
        if (box.maxY > groundY) {
          groundY = box.maxY;
        }
        continue;
      }

      if (y >= box.maxY - 0.05) {
        if (box.walkableTop && box.maxY > groundY) {
          groundY = box.maxY;
        }
        continue;
      }

      // Horizontal push-out
      hitWall = true;
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist + 0.002;
        outX += (dx / dist) * push;
        outZ += (dz / dist) * push;
      } else {
        // Center is inside box: push out along shallowest axis
        const penLeft = Math.abs(outX - box.minX);
        const penRight = Math.abs(box.maxX - outX);
        const penBack = Math.abs(outZ - box.minZ);
        const penFront = Math.abs(box.maxZ - outZ);
        const minPen = Math.min(penLeft, penRight, penBack, penFront);
        if (minPen === penLeft) outX = box.minX - radius;
        else if (minPen === penRight) outX = box.maxX + radius;
        else if (minPen === penBack) outZ = box.minZ - radius;
        else outZ = box.maxZ + radius;
      }
    }
    outX = clamp(outX, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);
    outZ = clamp(outZ, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);
  }

  return { x: outX, y, z: outZ, groundY, hitWall };
}

// ---------------------------------------------------------------------------
// Collider broadphase: a uniform grid over the static collider list, cached per array.
// The grid is rebuilt whenever the array's length changes (colliders are only ever added
// with push() or removed with splice(), e.g. destructible props), so callers need no changes.
// ---------------------------------------------------------------------------
const GRID_CELL = 8;
const GRID_MIN_COLLIDERS = 64;

interface ColliderGrid {
  len: number;
  minX: number;
  minZ: number;
  nx: number;
  nz: number;
  cells: Array<number[] | undefined>;
  stamps: Uint32Array;
  stamp: number;
}

const colliderGrids = new WeakMap<ColliderBox[], ColliderGrid>();
const _nearby: ColliderBox[] = [];

function buildColliderGrid(colliders: ColliderBox[]): ColliderGrid {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const b of colliders) {
    if (b.minX < minX) minX = b.minX;
    if (b.minZ < minZ) minZ = b.minZ;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxZ > maxZ) maxZ = b.maxZ;
  }
  const nx = Math.max(1, Math.ceil((maxX - minX) / GRID_CELL) + 1);
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / GRID_CELL) + 1);
  const cells: Array<number[] | undefined> = new Array(nx * nz);
  colliders.forEach((b, idx) => {
    const ix0 = Math.floor((b.minX - minX) / GRID_CELL);
    const ix1 = Math.floor((b.maxX - minX) / GRID_CELL);
    const iz0 = Math.floor((b.minZ - minZ) / GRID_CELL);
    const iz1 = Math.floor((b.maxZ - minZ) / GRID_CELL);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const k = iz * nx + ix;
        (cells[k] ??= []).push(idx);
      }
    }
  });
  return { len: colliders.length, minX, minZ, nx, nz, cells, stamps: new Uint32Array(colliders.length), stamp: 0 };
}

/**
 * Returns the colliders whose footprint may lie within `reach` of (x, z). The returned array is
 * reused between calls: consume it before calling again.
 */
export function queryNearbyColliders(colliders: ColliderBox[], x: number, z: number, reach: number): ColliderBox[] {
  if (colliders.length < GRID_MIN_COLLIDERS) return colliders;
  let grid = colliderGrids.get(colliders);
  if (!grid || grid.len !== colliders.length) {
    grid = buildColliderGrid(colliders);
    colliderGrids.set(colliders, grid);
  }
  _nearby.length = 0;
  grid.stamp = (grid.stamp + 1) >>> 0;
  if (grid.stamp === 0) {
    grid.stamps.fill(0);
    grid.stamp = 1;
  }
  const ix0 = Math.max(0, Math.floor((x - reach - grid.minX) / GRID_CELL));
  const ix1 = Math.min(grid.nx - 1, Math.floor((x + reach - grid.minX) / GRID_CELL));
  const iz0 = Math.max(0, Math.floor((z - reach - grid.minZ) / GRID_CELL));
  const iz1 = Math.min(grid.nz - 1, Math.floor((z + reach - grid.minZ) / GRID_CELL));
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const cell: number[] | undefined = grid.cells[iz * grid.nx + ix];
      if (!cell) continue;
      for (let j = 0; j < cell.length; j++) {
        const idx = cell[j];
        if (grid.stamps[idx] === grid.stamp) continue;
        grid.stamps[idx] = grid.stamp;
        _nearby.push(colliders[idx]);
      }
    }
  }
  return _nearby;
}

/**
 * Prevents on-foot characters from walking through parked or wrecked vehicles.
 */
export function resolvePlayerVehicleCollision(
  x: number,
  y: number,
  z: number,
  playerRadius: number,
  vehicles: Array<{ x: number; z: number; radius: number; destroyed?: boolean }>,
): { x: number; z: number; hitVehicle: boolean } {
  let outX = x;
  let outZ = z;
  let hitVehicle = false;
  if (y > 2.05) return { x: outX, z: outZ, hitVehicle };

  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    const minDist = playerRadius + v.radius * 0.92;
    const dx = outX - v.x;
    const dz = outZ - v.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist) {
      hitVehicle = true;
      const dist = Math.sqrt(distSq);
      if (dist > 1e-4) {
        const push = minDist - dist + 0.002;
        outX += (dx / dist) * push;
        outZ += (dz / dist) * push;
      } else {
        outX += minDist;
      }
    }
  }
  return { x: outX, z: outZ, hitVehicle };
}

/**
 * Pure player kinematics integrator: smooth acceleration, coyote time, jump buffering,
 * variable jump cut, boost dash with i-frames, squash-and-stretch, and collision sliding.
 */
export function stepPlayerKinematics(
  state: PlayerKinematicsState,
  input: MoveInput,
  colliders: ColliderBox[],
  dt: number,
): MoveStepResult {
  const result: MoveStepResult = {
    jumped: false,
    landed: false,
    dashed: false,
    steppedFoot: false,
  };

  const MAX_SPEED = input.aimingOrShooting ? 6.6 : 8.8;
  const GROUND_ACCEL = 58;
  const AIR_ACCEL = 26;
  const GROUND_FRICTION = 14;
  const GRAVITY = 28;
  const JUMP_SPEED = 10.6;
  const DASH_SPEED = 21.5;
  const DASH_DURATION = 0.18;
  const DASH_COOLDOWN = 0.28;
  const DASH_RECHARGE_SEC = 2.6;

  // Timers
  state.coyoteTimer = state.grounded ? 0.11 : Math.max(0, state.coyoteTimer - dt);
  state.jumpBufferTimer = input.jumpJustPressed
    ? 0.13
    : Math.max(0, state.jumpBufferTimer - dt);
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  state.invulnTimer = Math.max(0, state.invulnTimer - dt);

  if (state.dashCharges < state.maxDashCharges) {
    state.dashRechargeTimer += dt;
    if (state.dashRechargeTimer >= DASH_RECHARGE_SEC) {
      state.dashRechargeTimer -= DASH_RECHARGE_SEC;
      state.dashCharges += 1;
    }
  } else {
    state.dashRechargeTimer = 0;
  }

  // Camera-relative horizontal wish direction
  // Camera looks along (-sin(yaw), 0, -cos(yaw)), right is (cos(yaw), 0, -sin(yaw))
  const fwdX = -Math.sin(input.cameraYaw);
  const fwdZ = -Math.cos(input.cameraYaw);
  const rightX = Math.cos(input.cameraYaw);
  const rightZ = -Math.sin(input.cameraYaw);

  let wishX = fwdX * input.forward + rightX * input.right;
  let wishZ = fwdZ * input.forward + rightZ * input.right;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-4) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  // Dash initiation
  if (input.dashJustPressed && state.dashTimer <= 0 && state.dashCooldown <= 0 && state.dashCharges > 0) {
    state.dashCharges -= 1;
    state.dashTimer = DASH_DURATION;
    state.dashCooldown = DASH_COOLDOWN;
    state.invulnTimer = Math.max(state.invulnTimer, DASH_DURATION + 0.08);
    if (wishLen > 0.1) {
      state.dashDirX = wishX;
      state.dashDirZ = wishZ;
    } else {
      state.dashDirX = fwdX;
      state.dashDirZ = fwdZ;
    }
    state.vx = state.dashDirX * DASH_SPEED;
    state.vz = state.dashDirZ * DASH_SPEED;
    state.vy = Math.max(state.vy, 1.2);
    state.squashX = 1.26;
    state.squashY = 0.8;
    result.dashed = true;
  }

  if (state.dashTimer > 0) {
    state.dashTimer = Math.max(0, state.dashTimer - dt);
    state.vx = state.dashDirX * DASH_SPEED;
    state.vz = state.dashDirZ * DASH_SPEED;
  } else {
    // Smooth responsive acceleration + friction
    const accel = state.grounded ? GROUND_ACCEL : AIR_ACCEL;
    if (wishLen > 0.01) {
      const targetVx = wishX * MAX_SPEED;
      const targetVz = wishZ * MAX_SPEED;
      const blend = 1 - Math.exp(-(accel / MAX_SPEED) * dt);
      state.vx += (targetVx - state.vx) * blend;
      state.vz += (targetVz - state.vz) * blend;
    } else if (state.grounded) {
      const damp = Math.exp(-GROUND_FRICTION * dt);
      state.vx *= damp;
      state.vz *= damp;
      if (Math.hypot(state.vx, state.vz) < 0.04) {
        state.vx = 0;
        state.vz = 0;
      }
    } else {
      const airDamp = Math.exp(-2.2 * dt);
      state.vx *= airDamp;
      state.vz *= airDamp;
    }
  }

  // Jump with coyote time & input buffer
  if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
    state.vy = JUMP_SPEED;
    state.grounded = false;
    state.coyoteTimer = 0;
    state.jumpBufferTimer = 0;
    state.squashX = 0.84;
    state.squashY = 1.22;
    result.jumped = true;
  }

  // Variable jump height cut when button released early
  if (!input.jumpHeld && state.vy > 3.2) {
    state.vy *= Math.pow(0.45, dt * 16);
  }

  // Gravity
  state.vy -= GRAVITY * dt;

  // Integrate position
  const prevX = state.x;
  const prevZ = state.z;
  const wasGrounded = state.grounded;

  // Sub-step high-speed movement (e.g. boost dash) so player never tunnels thin walls
  const travelDist = Math.hypot(state.vx * dt, state.vz * dt);
  const subSteps = Math.max(1, Math.min(6, Math.ceil(travelDist / 0.28)));
  const subDt = dt / subSteps;
  let curX = state.x;
  let curY = state.y;
  let curZ = state.z;
  let groundY = 0;

  for (let s = 0; s < subSteps; s++) {
    const resolved = resolveCylinderWorldCollision(
      curX + state.vx * subDt,
      curY + state.vy * subDt,
      curZ + state.vz * subDt,
      PLAYER_RADIUS,
      PLAYER_HEIGHT,
      colliders,
    );
    curX = resolved.x;
    curZ = resolved.z;
    groundY = resolved.groundY;
    if (resolved.hitWall && state.dashTimer > 0) {
      state.vx *= 0.4;
      state.vz *= 0.4;
    }
    curY = curY + state.vy * subDt;
  }

  state.x = curX;
  state.z = curZ;
  const nextY = curY;

  if (nextY <= groundY) {
    state.y = groundY;
    if (!wasGrounded && state.vy < -3.5) {
      state.squashX = 1.22;
      state.squashY = 0.78;
      result.landed = true;
    }
    state.vy = 0;
    state.grounded = true;
  } else {
    state.y = nextY;
    state.grounded = false;
  }

  // Facing yaw: align to aim direction when shooting/aiming, or smoothly turn toward run vector
  const aimYaw = normalizeAngle(input.cameraYaw + Math.PI);
  if (input.aimingOrShooting) {
    state.facingYaw = dampAngle(state.facingYaw, aimYaw, 22, dt);
  } else if (wishLen > 0.05) {
    const moveYaw = Math.atan2(wishX, wishZ);
    state.facingYaw = dampAngle(state.facingYaw, moveYaw, 14, dt);
  }

  // Distance-synced footstep gait
  const movedDist = Math.hypot(state.x - prevX, state.z - prevZ);
  if (state.grounded && movedDist > 0.001 && state.dashTimer <= 0) {
    const prevStride = Math.floor(state.walkDistance / 1.85);
    state.walkDistance += movedDist;
    const nextStride = Math.floor(state.walkDistance / 1.85);
    if (nextStride > prevStride) {
      result.steppedFoot = true;
    }
  }

  // Recover squash-and-stretch exponentially
  const squashT = 1 - Math.exp(-14 * dt);
  state.squashX += (1 - state.squashX) * squashT;
  state.squashY += (1 - state.squashY) * squashT;

  return result;
}

/**
 * Pure weapon state step: updates cooldowns, reload progress, and attempts firing.
 */
export function stepWeaponState(
  weaponState: WeaponRuntimeState,
  dt: number,
  firePressed: boolean,
  reloadJustPressed: boolean,
  switchWeapon?: WeaponId,
  magMult = 1,
  reloadMult = 1,
): { fired: boolean; spec: WeaponSpec; startedReload: boolean; finishedReload: boolean } {
  let startedReload = false;
  let finishedReload = false;

  if (switchWeapon && switchWeapon !== weaponState.active) {
    weaponState.active = switchWeapon;
    weaponState.reloading = false;
    weaponState.reloadTimer = 0;
    weaponState.fireCooldown = Math.min(weaponState.fireCooldown, 0.1);
  }

  const spec = WEAPONS[weaponState.active];
  const maxMag = getEffectiveMagSize(weaponState.active, magMult);
  const reloadDur = getEffectiveReloadDuration(weaponState.active, reloadMult);
  weaponState.fireCooldown = Math.max(0, weaponState.fireCooldown - dt);

  if (weaponState.reloading) {
    weaponState.reloadTimer -= dt;
    if (weaponState.reloadTimer <= 0) {
      weaponState.reloading = false;
      weaponState.reloadTimer = 0;
      weaponState.ammo[weaponState.active] = maxMag;
      finishedReload = true;
    }
  } else {
    const currentAmmo = weaponState.ammo[weaponState.active];
    if (reloadJustPressed && currentAmmo < maxMag) {
      weaponState.reloading = true;
      weaponState.reloadTimer = reloadDur;
      weaponState.reloadTotal = reloadDur;
      startedReload = true;
    } else if (firePressed && weaponState.fireCooldown <= 0) {
      if (currentAmmo > 0) {
        weaponState.ammo[weaponState.active] = currentAmmo - 1;
        weaponState.fireCooldown = spec.fireInterval;
        if (weaponState.ammo[weaponState.active] === 0) {
          weaponState.reloading = true;
          weaponState.reloadTimer = reloadDur;
          weaponState.reloadTotal = reloadDur;
          startedReload = true;
        }
        return { fired: true, spec, startedReload, finishedReload };
      } else {
        weaponState.reloading = true;
        weaponState.reloadTimer = reloadDur;
        weaponState.reloadTotal = reloadDur;
        startedReload = true;
      }
    }
  }

  return { fired: false, spec, startedReload, finishedReload };
}

export interface VehicleDriveInput {
  throttle: number; // -1..1 (W = +1, S = -1)
  steer: number; // -1..1 (A = +1 left turn, D = -1 right turn)
  handbrake: boolean; // Space drift / brake
  boost: boolean; // Shift turbo nitro
}

/**
 * Pure arcade vehicle kinematics integrator for open-world road cruising, strict anti-wall-tunneling,
 * crash knockback physics, and zombie ramming.
 * Heading vector in world space is (sin(yaw), 0, cos(yaw)) so vehicle local +Z is forward.
 */
export function stepVehicleKinematics(
  v: VehicleKinematicsState,
  input: VehicleDriveInput,
  colliders: ColliderBox[],
  dt: number,
): { hitWall: boolean; impactSpeed: number; speedKmh: number } {
  if (v.destroyed) {
    v.boosting = false;
    v.drifting = false;
    v.speed *= Math.exp(-5 * dt);
    v.vx *= Math.exp(-5 * dt);
    v.vz *= Math.exp(-5 * dt);
    return { hitWall: false, impactSpeed: 0, speedKmh: 0 };
  }

  const canBoost = input.boost && input.throttle > 0 && v.nitro > 4;
  v.boosting = canBoost;

  if (canBoost) {
    v.nitro = Math.max(0, v.nitro - 28 * dt);
  } else {
    v.nitro = Math.min(100, v.nitro + 12 * dt);
  }

  const topSpeed = canBoost ? v.maxSpeed * 1.38 : v.maxSpeed;
  const reverseTop = -v.maxSpeed * 0.45;
  const accelRate = canBoost ? v.accel * 1.75 : v.accel;

  if (input.throttle > 0.01) {
    if (v.speed < 0) {
      v.speed = Math.min(0, v.speed + accelRate * 2.2 * dt);
    } else {
      v.speed = Math.min(topSpeed, v.speed + accelRate * input.throttle * dt);
    }
  } else if (input.throttle < -0.01) {
    if (v.speed > 0.5) {
      v.speed = Math.max(0, v.speed - accelRate * 2.4 * dt);
    } else {
      v.speed = Math.max(reverseTop, v.speed + accelRate * 0.72 * input.throttle * dt);
    }
  } else {
    // Natural rolling resistance
    const drag = Math.exp(-2.1 * dt);
    v.speed *= drag;
    if (Math.abs(v.speed) < 0.08) v.speed = 0;
  }

  v.drifting = input.handbrake && Math.abs(v.speed) > 6.5;
  if (input.handbrake) {
    v.speed *= Math.exp(-(v.drifting ? 1.4 : 4.5) * dt);
  }

  // Decay lateral/crash knockback velocity smoothly
  const knockDrag = Math.exp(-4.2 * dt);
  v.vx *= knockDrag;
  v.vz *= knockDrag;
  if (Math.hypot(v.vx, v.vz) < 0.06) {
    v.vx = 0;
    v.vz = 0;
  }

  // Smooth visual wheel steer angle & speed-scaled yaw turning
  const steerLerp = 1 - Math.exp(-12 * dt);
  v.steerAngle += (input.steer - v.steerAngle) * steerLerp;

  const absSpeed = Math.abs(v.speed);
  if (absSpeed > 0.25) {
    const dirSign = v.speed >= 0 ? 1 : -1;
    const speedFactor = clamp(absSpeed / 6.5, 0.22, 1.0);
    const highSpeedTighten = 1 - clamp((absSpeed - 14) / 36, 0, 0.35);
    const turnRate = (v.drifting ? 2.65 : 2.15) * speedFactor * highSpeedTighten;
    v.yaw = normalizeAngle(v.yaw + input.steer * turnRate * dirSign * dt);
  }

  const fwdX = Math.sin(v.yaw);
  const fwdZ = Math.cos(v.yaw);
  const totalVx = fwdX * v.speed + v.vx;
  const totalVz = fwdZ * v.speed + v.vz;
  const totalMove = Math.hypot(totalVx * dt, totalVz * dt);

  // Filter out walkable low decks/sidewalks so cars don't snag on 0.16m boardwalk planks
  const solidColliders = colliders.filter((c) => !c.walkableTop);

  // Sub-step high-speed vehicle movement so nitro cars NEVER tunnel through walls or guardrails!
  const subSteps = Math.max(1, Math.min(10, Math.ceil(totalMove / 0.32)));
  const subDt = dt / subSteps;
  let curX = v.x;
  let curZ = v.z;
  let hitWall = false;
  let impactSpeed = 0;

  for (let s = 0; s < subSteps; s++) {
    const tryX = curX + totalVx * subDt;
    const tryZ = curZ + totalVz * subDt;
    const resolved = resolveCylinderWorldCollision(
      tryX,
      0.1,
      tryZ,
      v.radius,
      2.2,
      solidColliders,
      0.35,
    );
    curX = resolved.x;
    curZ = resolved.z;
    if (resolved.hitWall) {
      hitWall = true;
      impactSpeed = Math.max(impactSpeed, Math.hypot(totalVx, totalVz));
      break;
    }
  }

  v.x = curX;
  v.z = curZ;
  v.y = 0.03;

  if (hitWall) {
    // Bounce back slightly & damp velocity on solid wall collision
    v.speed *= -0.22;
    v.vx *= -0.35;
    v.vz *= -0.35;
  }

  v.wheelSpin += (v.speed * dt) / 0.34;

  return {
    hitWall,
    impactSpeed,
    speedKmh: Math.round(Math.abs(v.speed) * 3.6),
  };
}

export interface VehicleCrashResult {
  collided: boolean;
  impactSpeed: number;
  contactX: number;
  contactZ: number;
  normalX: number;
  normalZ: number;
}

/**
 * Pure car-vs-car elastic/inelastic crash physics:
 * Separates overlapping vehicles cleanly, transfers momentum/knockback + slight spin deflection,
 * and computes relative closing speed for crash sparks, audio, hull damage, and explosions!
 */
export function resolveVehiclePairCollision(
  a: VehicleKinematicsState,
  b: VehicleKinematicsState,
): VehicleCrashResult {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const minDist = a.radius + b.radius + 0.15;
  const distSq = dx * dx + dz * dz;

  if (distSq >= minDist * minDist) {
    return { collided: false, impactSpeed: 0, contactX: 0, contactZ: 0, normalX: 0, normalZ: 0 };
  }

  const dist = Math.sqrt(distSq);
  const nx = dist > 1e-4 ? dx / dist : Math.sin(a.yaw);
  const nz = dist > 1e-4 ? dz / dist : Math.cos(a.yaw);
  const overlap = minDist - dist;

  // Separate both vehicles symmetrically (or push non-destroyed vehicle if one is a stationary wreck)
  const aMove = b.destroyed ? 0.85 : 0.5;
  const bMove = 1 - aMove;
  a.x = clamp(a.x - nx * overlap * aMove, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);
  a.z = clamp(a.z - nz * overlap * aMove, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);
  b.x = clamp(b.x + nx * overlap * bMove, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);
  b.z = clamp(b.z + nz * overlap * bMove, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);

  // Relative velocity along collision normal
  const avx = Math.sin(a.yaw) * a.speed + a.vx;
  const avz = Math.cos(a.yaw) * a.speed + a.vz;
  const bvx = Math.sin(b.yaw) * b.speed + b.vx;
  const bvz = Math.cos(b.yaw) * b.speed + b.vz;

  const relVx = avx - bvx;
  const relVz = avz - bvz;
  const closingSpeed = relVx * nx + relVz * nz;

  if (closingSpeed > 0.2) {
    const impulse = closingSpeed * 0.78;
    // Knock struck vehicle B along normal + slight spin yaw
    if (!b.destroyed) {
      b.vx += nx * impulse * 1.15;
      b.vz += nz * impulse * 1.15;
      const bFwdDot = Math.sin(b.yaw) * nx + Math.cos(b.yaw) * nz;
      b.speed += bFwdDot * impulse * 0.65;
      const crossSpin = (Math.sin(b.yaw) * nz - Math.cos(b.yaw) * nx) * clamp(impulse * 0.045, 0, 0.55);
      b.yaw = normalizeAngle(b.yaw + crossSpin);
    }
    // Recoil vehicle A backward/sideways
    a.vx -= nx * impulse * 0.52;
    a.vz -= nz * impulse * 0.52;
    a.speed *= 0.36;
  }

  return {
    collided: true,
    impactSpeed: Math.max(0, closingSpeed),
    contactX: a.x + nx * a.radius,
    contactZ: a.z + nz * a.radius,
    normalX: nx,
    normalZ: nz,
  };
}

/**
 * Computes vehicle hull damage from high-speed car-vs-car collisions or wall impacts.
 */
export function calculateVehicleCrashDamage(impactSpeedMs: number): number {
  if (impactSpeedMs < 6.5) return 0;
  return Math.round((impactSpeedMs - 6.5) * 4.4);
}

/**
 * Computes radial AoE explosion damage with smooth falloff (0 outside maxRadius).
 */
export function calculateExplosionDamage(
  distance: number,
  maxRadius: number,
  maxDamage: number,
): number {
  if (distance >= maxRadius || maxRadius <= 0) return 0;
  const t = clamp(1 - distance / maxRadius, 0, 1);
  return Math.round(maxDamage * (0.25 + 0.75 * t * t));
}

/**
 * Computes vehicle ramming impact damage based on vehicle speed (m/s).
 * Returns 0 below low bump speed (~4.2 m/s), scaling to lethal roadkill at highway speed.
 */
export function calculateVehicleImpactDamage(speedMs: number): number {
  const spd = Math.abs(speedMs);
  if (spd < 4.2) return 0;
  return Math.round(28 + (spd - 4.2) * 14.5);
}

export function pointHitsBox(
  px: number,
  py: number,
  pz: number,
  box: ColliderBox,
  pad = 0.08,
): boolean {
  return (
    px >= box.minX - pad &&
    px <= box.maxX + pad &&
    py >= box.minY - pad &&
    py <= box.maxY + pad &&
    pz >= box.minZ - pad &&
    pz <= box.maxZ + pad
  );
}

export function calculateKillScore(baseScore: number, combo: number): number {
  const mult = 1 + Math.min(4, Math.floor(combo / 2) * 0.25);
  return Math.round(baseScore * mult);
}
