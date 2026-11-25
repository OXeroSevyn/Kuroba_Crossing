import type * as THREE from 'three';

/** Axis-aligned collider in Aurora City's diorama-local space (y from 0 to maxY). */
export interface AuroraLocalCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  blocksBullets: boolean;
}

export interface AuroraCity {
  /** City root group, built in diorama-local units; position/rotate/scale it into the world. */
  root: THREE.Group;
  colliders: AuroraLocalCollider[];
  /** Open-road points (diorama-local [x, z]) used as zombie approach anchors. */
  spawnAnchors: Array<[number, number]>;
  /** Animates water, foliage wind, fountain, traffic & train. Traffic yields to the player. */
  update(elapsed: number, dt: number, playerWorld: THREE.Vector3 | null): void;
  /** Syncs water/petal palettes, sea fog and the aurora curtains with the game's day/night. */
  setTimeOfDay(isNight: boolean, fogHex: number, fogDensity: number, sunDirWorld?: THREE.Vector3): void;
  /** Must be called after `root` is placed so the water shaders can map world <-> city space. */
  syncWorldMatrix(): void;
  dispose(): void;
}

export function createAuroraCity(): AuroraCity;

export interface AuroraHouseOptions {
  x: number;
  z: number;
  w?: number;
  d?: number;
  h?: number;
  wallCol?: number;
  roofCol?: number;
  roofAlt?: number;
  ridgeLeftRight?: boolean;
  hasDormer?: boolean;
  hasChimney?: boolean;
  hasSideDeck?: boolean;
  flatTerracotta?: boolean;
}

export interface AuroraPetalSource {
  x: number;
  y: number;
  z: number;
  r: number;
  count: number;
}

/**
 * Aurora City's micro-voxel building blocks, for restyling other districts. All coordinates are
 * kit-local (place/scale `root` like the city: 1 kit unit = AURORA_SCALE world units).
 */
export interface AuroraStyleKit {
  root: THREE.Group;
  rand(): number;
  jitterColor(hex: number, amount?: number): number;
  lushTree(x: number, z: number, scale?: number): void;
  villageTree(x: number, z: number, scale?: number): void;
  sakuraTree(x: number, z: number, scale?: number): void;
  pineTree(x: number, z: number, scale?: number): void;
  streetLamp(x: number, z: number, y?: number): void;
  flowerBed(x0: number, z0: number, w: number, d: number): void;
  gardenBed(x0: number, z0: number, w: number, d: number): void;
  picketFence(x1: number, z1: number, x2: number, z2: number): void;
  walkway(x0: number, z0: number, w: number, d: number, y?: number): void;
  cobbles(x0: number, z0: number, w: number, d: number): void;
  banner(x: number, z: number): void;
  house(opts: AuroraHouseOptions): void;
  /** Raw voxel access for one-off details (same API as the diorama's VoxelBuilder). */
  vb: {
    add(x: number, y: number, z: number, color: number, sx?: number, sy?: number, sz?: number, isGlow?: boolean): void;
    addBox(x0: number, y0: number, z0: number, w: number, h: number, d: number, color: number, isGlow?: boolean): void;
    addFoliage(x: number, y: number, z: number, color: number, sx?: number, sy?: number, sz?: number): void;
  };
  petals(sources: AuroraPetalSource[]): void;
  /** Emits the queued voxels into `root`; returns generated colliders in kit-local units. */
  finish(): AuroraLocalCollider[];
  update(elapsed: number): void;
  setTimeOfDay(isNight: boolean): void;
  dispose(): void;
}

export function createAuroraStyleKit(): AuroraStyleKit;
