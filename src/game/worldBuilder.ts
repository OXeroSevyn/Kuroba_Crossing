import * as THREE from 'three';
import { type AuroraCity, type AuroraStyleKit, createAuroraCity, createAuroraStyleKit } from './aurora/auroraCity';
import {
  AURORA_BORDER_X,
  AURORA_NORTH_Z,
  AURORA_ORIGIN_X,
  AURORA_ORIGIN_Z,
  AURORA_SCALE,
  AURORA_YAW,
  auroraLocalToWorld,
  isInAuroraFootprint,
} from './aurora/auroraLayout';
import type { ColliderBox, VehicleKind, WorldZoneId } from './types';
import {
  createAsphaltRoadTexture,
  createContactShadowMesh,
  createShopSignTexture,
  type SharedVoxelMaterials,
  VoxelAssembler,
} from './voxelBuilder';

export interface VehicleSpawnSpec {
  id: string;
  kind: VehicleKind;
  name: string;
  x: number;
  z: number;
  yaw: number;
  maxSpeed: number;
  accel: number;
  radius: number;
}

export interface VolumetricLightItem {
  mesh: THREE.Mesh;
  baseOpacity: number;
  dayScale: number;
  nightScale: number;
  phase: number;
}

export interface MistLayerItem {
  mesh: THREE.Mesh;
  baseX: number;
  baseZ: number;
  driftAmpX: number;
  driftAmpZ: number;
  speed: number;
  phase: number;
  dayOpacity: number;
  nightOpacity: number;
}

export interface ExplosiveBarrelItem {
  id: string;
  x: number;
  y: number;
  z: number;
  mesh: THREE.Group;
  active: boolean;
  respawnTimer: number;
}

export interface BuiltWorld {
  root: THREE.Group;
  colliders: ColliderBox[];
  cameraObstructions: THREE.Object3D[];
  spawnPoints: THREE.Vector3[];
  vehicleSpawns: VehicleSpawnSpec[];
  zoneAnchors: Record<WorldZoneId, THREE.Vector3[]>;
  animatedLanterns: THREE.Object3D[];
  volumetricLights: VolumetricLightItem[];
  mistLayers: MistLayerItem[];
  explosiveBarrels: ExplosiveBarrelItem[];
  disposables: Array<{ dispose: () => void }>;
  /** Ported Aurora City diorama (west zone): needs per-frame update & day/night sync. */
  auroraCity: AuroraCity;
  /** Aurora-style micro-voxel dressing of Kuroba Crossing (wind-swayed trees, petals). */
  kurobaStyle: AuroraStyleKit;
}

/** The Kuroba railway (z = 2) now ends at a buffer stop on the Aurora border. */
export const RAILWAY_WEST_END_X = AURORA_BORDER_X + 3;

/**
 * Constructs the expansive 4-region voxel open world ("Kuroba Crossing", "Aurora City",
 * "Fungi Forest", and "Kopenhime Snowpeak") with dense landscaping, multi-tier voxel buildings,
 * towering stepped snowy mountains, volumetric god-rays & lamp cones, drifting biome mist,
 * and complete solid wall colliders for characters and vehicles.
 */
export function buildKurobaWorld(
  materials: SharedVoxelMaterials,
  maxAnisotropy: number,
): BuiltWorld {
  const root = new THREE.Group();
  const colliders: ColliderBox[] = [];
  const cameraObstructions: THREE.Object3D[] = [];
  const animatedLanterns: THREE.Object3D[] = [];
  const volumetricLights: VolumetricLightItem[] = [];
  const mistLayers: MistLayerItem[] = [];
  const explosiveBarrels: ExplosiveBarrelItem[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const registerCollider = (box: ColliderBox) => {
    colliders.push(box);
  };

  // 1. EXPANSIVE 360x360 OPEN-WORLD MEADOW TERRAIN — Aurora City's flat island green, broken up
  // with micro-voxel tonal grass patches around Kuroba (see dressKurobaInAuroraStyle)
  const groundMat = new THREE.MeshStandardMaterial({
    color: AURORA_GRASS,
    roughness: 0.92,
    metalness: 0.0,
  });
  // The Aurora City quadrant (west of the Kuroba border, south of Snowpeak) brings its own island
  // base and sea, so the meadow is laid as two rectangles around it. UVs stay in world space so
  // the grass tiling is seamless across both pieces.
  const addGroundRect = (x0: number, x1: number, z0: number, z1: number) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) * 0.5, 0, (z0 + z1) * 0.5);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + 180) / 360, 1 - (pos.getZ(i) + 180) / 360);
    }
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(geo);
  };
  addGroundRect(AURORA_BORDER_X, 180, -180, 180);
  addGroundRect(-180, AURORA_BORDER_X, -180, AURORA_NORTH_Z);
  disposables.push(groundMat);

  // Aurora City style kit for Kuroba's trees, sidewalks, crosswalks & gardens (same layout)
  const kurobaStyle = createAuroraStyleKit();
  kurobaStyle.root.name = 'KurobaAuroraStyle';
  kurobaStyle.root.scale.setScalar(AURORA_SCALE);

  // 2. OPEN-WORLD BIOME GROUND PADS & EXTENSIVE MULTI-HIGHWAY ROAD NETWORK
  buildBiomeGroundPads(root, disposables);
  buildOpenWorldRoadNetwork(root, materials, maxAnisotropy, disposables);

  // 3. CENTRAL LANDMARK: TWO-STORY KUROBA STATION SHOP (centered at x = 0, z = -12)
  const stationGroup = buildKurobaStationHouse(materials, maxAnisotropy, disposables);
  stationGroup.position.set(0, 0, -12);
  root.add(stationGroup);
  cameraObstructions.push(stationGroup);

  // Main building solid footprint collider
  registerCollider({
    id: 'station_main',
    minX: -6.8,
    maxX: 6.8,
    minY: 0,
    maxY: 7.5,
    minZ: -15.4,
    maxZ: -8.8,
    walkableTop: false,
    blocksBullets: true,
  });
  // Walkable wooden veranda deck in front of the shop
  registerCollider({
    id: 'station_veranda',
    minX: -7.2,
    maxX: 7.2,
    minY: 0,
    maxY: 0.36,
    minZ: -8.8,
    maxZ: -6.3,
    walkableTop: true,
    blocksBullets: false,
  });

  // 4. RAILWAY TRACKS & WOODEN BOARDWALK CROSSING
  const railwayGroup = buildRailwayAndBoardwalk(materials);
  root.add(railwayGroup);

  // Walkable boardwalk strips (very low raised deck)
  registerCollider({
    id: 'boardwalk_center',
    minX: -1.8,
    maxX: 1.8,
    minY: 0,
    maxY: 0.16,
    minZ: -6.3,
    maxZ: 10.6,
    walkableTop: true,
    blocksBullets: false,
  });

  // 5. DRIVABLE VEHICLES SPAWNED DYNAMICALLY BY ENGINE (White Kei-Truck starts right here at x=-5.4, z=13.0!)

  // 6. BRIGHT RED JAPANESE POSTBOX (beside crossing, x = -0.8, z = 9.8)
  const postbox = buildJapanesePostbox(materials);
  postbox.position.set(-1.9, 0, 9.5);
  root.add(postbox);
  registerCollider({
    id: 'postbox',
    minX: -2.35,
    maxX: -1.45,
    minY: 0,
    maxY: 1.55,
    minZ: 9.05,
    maxZ: 9.95,
    walkableTop: false,
    blocksBullets: true,
  });

  // 7. WOODEN BUS STOP SHELTER & STATION TIMETABLE SIGN (southeast, x = 8.4, z = 9.0)
  const busStop = buildBusStopShelter(materials, maxAnisotropy, disposables);
  busStop.position.set(8.4, 0, 9.0);
  root.add(busStop);
  cameraObstructions.push(busStop);
  registerCollider({
    id: 'bus_stop_platform',
    minX: 6.2,
    maxX: 10.6,
    minY: 0,
    maxY: 0.26,
    minZ: 7.7,
    maxZ: 10.3,
    walkableTop: true,
    blocksBullets: false,
  });
  registerCollider({
    id: 'bus_stop_bench',
    minX: 6.7,
    maxX: 10.1,
    minY: 0,
    maxY: 1.2,
    minZ: 8.1,
    maxZ: 8.9,
    walkableTop: false,
    blocksBullets: true,
  });

  // 8. ROAD GUARDRAILS & STREETLAMPS (along z = 10.7 and z = 16.9) + Solid Guardrail Colliders
  const roadFixtures = buildGuardrailsAndLamps(materials, animatedLanterns);
  root.add(roadFixtures);
  // Solid guardrail colliders flanking Kuroba Crossing road (leaving crossing & intersections wide open)
  for (const [gx1, gx2] of [[-21, -4.5], [11.5, 22]] as Array<[number, number]>) {
    registerCollider({
      id: `guardrail_north_${gx1}`,
      minX: gx1,
      maxX: gx2,
      minY: 0,
      maxY: 1.4,
      minZ: 10.35,
      maxZ: 11.05,
      walkableTop: false,
      blocksBullets: false,
    });
  }
  for (const [gx1, gx2] of [[-21, -3.5], [4.5, 22]] as Array<[number, number]>) {
    registerCollider({
      id: `guardrail_south_${gx1}`,
      minX: gx1,
      maxX: gx2,
      minY: 0,
      maxY: 1.4,
      minZ: 16.55,
      maxZ: 17.25,
      walkableTop: false,
      blocksBullets: false,
    });
  }

  // 9. WEST TACTICAL ZONE: RAILWAY SIGNAL CABIN (Olive 4x4 Jeep is now a real drivable vehicle!)
  const signalCabin = buildSignalCabin(materials);
  signalCabin.position.set(-19.5, 0, 1.5);
  root.add(signalCabin);
  cameraObstructions.push(signalCabin);
  registerCollider({
    id: 'signal_cabin',
    minX: -21.9,
    maxX: -17.1,
    minY: 0,
    maxY: 4.8,
    minZ: -0.7,
    maxZ: 3.7,
    walkableTop: false,
    blocksBullets: true,
  });

  // 10. EAST TACTICAL ZONE: VERMILION SHRINE TORII GATE & STORAGE SHED
  const torii = buildToriiGate(materials);
  torii.position.set(18.5, 0, -4.5);
  torii.rotation.y = -Math.PI * 0.15;
  root.add(torii);
  // Solid colliders for Torii gate twin pillars
  registerCollider({
    id: 'torii_pillar_l',
    minX: 16.1,
    maxX: 17.1,
    minY: 0,
    maxY: 5.5,
    minZ: -5.4,
    maxZ: -4.4,
    blocksBullets: true,
  });
  registerCollider({
    id: 'torii_pillar_r',
    minX: 19.9,
    maxX: 20.9,
    minY: 0,
    maxY: 5.5,
    minZ: -4.6,
    maxZ: -3.6,
    blocksBullets: true,
  });

  const eastShed = buildStorageShed(materials);
  eastShed.position.set(19.5, 0, 4.2);
  eastShed.rotation.y = -Math.PI * 0.5;
  root.add(eastShed);
  cameraObstructions.push(eastShed);
  registerCollider({
    id: 'east_shed',
    minX: 17.5,
    maxX: 21.5,
    minY: 0,
    maxY: 3.4,
    minZ: 1.9,
    maxZ: 6.5,
    walkableTop: false,
    blocksBullets: true,
  });

  // 11. TACTICAL COVER CLUSTERS (stacked wooden cargo crates & stone rail barriers)
  const cratePositions: Array<[number, number, number]> = [
    [-9.2, 0, 2.8],
    [10.8, 0, -2.2],
    [-11.8, 0, -3.5],
    [4.6, 0, 4.4],
    [-4.8, 0, -2.6],
    [13.8, 0, 6.2],
    [-14.2, 0, 8.2],
  ];
  cratePositions.forEach(([cx, cy, cz], idx) => {
    const cluster = buildCrateCoverCluster(materials, idx);
    cluster.position.set(cx, cy, cz);
    root.add(cluster);
    cameraObstructions.push(cluster);
    registerCollider({
      id: `crate_cover_${idx}`,
      minX: cx - 1.15,
      maxX: cx + 1.15,
      minY: 0,
      maxY: 1.45,
      minZ: cz - 0.95,
      maxZ: cz + 0.95,
      walkableTop: false,
      blocksBullets: true,
    });
  });

  // 12. LUSH FOLIAGE AROUND KUROBA CROSSING (Aurora micro-voxel trees & sakura) + STREET DRESSING
  buildLushFoliageAndPerimeter(root, disposables, kurobaStyle);
  dressKurobaInAuroraStyle(kurobaStyle);
  root.add(kurobaStyle.root);
  for (const c of kurobaStyle.finish()) {
    colliders.push({
      id: `kuroba_style_${colliders.length}`,
      minX: c.minX * AURORA_SCALE,
      maxX: c.maxX * AURORA_SCALE,
      minY: 0,
      maxY: c.maxY * AURORA_SCALE,
      minZ: c.minZ * AURORA_SCALE,
      maxZ: c.maxZ * AURORA_SCALE,
      blocksBullets: c.blocksBullets,
    });
  }
  disposables.push({ dispose: () => kurobaStyle.dispose() });

  // 13. SHARED VOLUMETRIC LIGHT & GROUND MIST TEXTURES + ALL 3 HIGH-DETAIL CONNECTED BIOMES
  const volTex = createVolumetricBeamTexture();
  const mistTex = createMistTexture();
  disposables.push(volTex, mistTex);

  // Warm cinematic volumetric lamp cones & god-rays over Kuroba Crossing Station
  for (const [lx, ly, lz] of KUROBA_STREETLAMP_COORDS) {
    const headX = lx;
    const headY = ly + 4.35;
    const headZ = lz + (lz > 12 ? -0.8 : 0.8);
    addVolumetricCone(
      root,
      volumetricLights,
      disposables,
      volTex,
      headX,
      headY,
      headZ,
      2.1,
      headY,
      0xffd07a,
      0.15,
      0.10,
      0.85,
      mistTex,
    );
  }
  addVolumetricGodRay(root, volumetricLights, disposables, volTex, -2, 18, -8, 6.2, 24, 0xffe4a8, 0.07, 0.18, 0.35, 0.22, -0.18);

  const auroraCity = placeAuroraCity(root, colliders, cameraObstructions, disposables);
  buildFungiForest(
    root,
    materials,
    colliders,
    cameraObstructions,
    volumetricLights,
    mistLayers,
    volTex,
    mistTex,
    disposables,
  );
  buildKopenhimeSnowpeak(
    root,
    materials,
    maxAnisotropy,
    colliders,
    cameraObstructions,
    volumetricLights,
    mistLayers,
    volTex,
    mistTex,
    disposables,
  );

  // 14. TACTICAL EXPLOSIVE HAZARD FUEL BARRELS ACROSS ALL 4 REGIONS
  buildExplosiveBarrels(root, materials, explosiveBarrels);

  // 15. KUROBA MILITARY HELIPAD (with landing beacon lights & bold 'H' markings)
  const heliPadAsm = new VoxelAssembler();
  heliPadAsm.boxBottom(-18.0, 0, 26.0, 8.5, 0.18, 8.5, 0x22262c, 'metal');
  heliPadAsm.boxBottom(-18.0, 0.18, 26.0, 8.1, 0.04, 8.1, 0x2b323a);
  heliPadAsm.boxBottom(-18.0, 0.22, 29.9, 8.1, 0.02, 0.25, 0xfacc15, 'emissive');
  heliPadAsm.boxBottom(-18.0, 0.22, 22.1, 8.1, 0.02, 0.25, 0xfacc15, 'emissive');
  heliPadAsm.boxBottom(-21.9, 0.22, 26.0, 0.25, 0.02, 8.1, 0xfacc15, 'emissive');
  heliPadAsm.boxBottom(-14.1, 0.22, 26.0, 0.25, 0.02, 8.1, 0xfacc15, 'emissive');
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    heliPadAsm.boxBottom(-18.0 + Math.cos(ang) * 3.0, 0.22, 26.0 + Math.sin(ang) * 3.0, 0.6, 0.02, 0.6, 0xffffff);
  }
  heliPadAsm.boxBottom(-19.1, 0.22, 26.0, 0.42, 0.02, 2.8, 0xffffff);
  heliPadAsm.boxBottom(-16.9, 0.22, 26.0, 0.42, 0.02, 2.8, 0xffffff);
  heliPadAsm.boxBottom(-18.0, 0.22, 26.0, 1.8, 0.02, 0.42, 0xffffff);
  heliPadAsm.boxBottom(-21.8, 0.22, 29.8, 0.32, 0.35, 0.32, 0x38bdf8, 'emissive');
  heliPadAsm.boxBottom(-14.2, 0.22, 29.8, 0.32, 0.35, 0.32, 0x38bdf8, 'emissive');
  heliPadAsm.boxBottom(-21.8, 0.22, 22.2, 0.32, 0.35, 0.32, 0x38bdf8, 'emissive');
  heliPadAsm.boxBottom(-14.2, 0.22, 22.2, 0.32, 0.35, 0.32, 0x38bdf8, 'emissive');
  root.add(heliPadAsm.build(materials));

  colliders.push({
    id: 'kuroba_helipad',
    minX: -22.3,
    maxX: -13.7,
    minY: 0,
    maxY: 0.22,
    minZ: 21.7,
    maxZ: 30.3,
    blocksBullets: false,
    walkableTop: true,
  });

  // 16. DRIVABLE VEHICLES DISTRIBUTED ACROSS ALL 4 REGIONS (7 cars for highway cruising & car-vs-car crashes!)
  const vehicleSpawns: VehicleSpawnSpec[] = [
    {
      id: 'veh_kei_kuroba',
      kind: 'kei_truck',
      name: 'Kuroba Kei-Truck',
      x: -2.8,
      z: 13.0,
      yaw: -Math.PI * 0.5,
      maxSpeed: 24,
      accel: 17,
      radius: 1.55,
    },
    {
      id: 'veh_kei_east',
      kind: 'olive_jeep',
      name: 'Crossing Patrol Jeep',
      x: 13.5,
      z: 14.2,
      yaw: -Math.PI * 0.5,
      maxSpeed: 25,
      accel: 18,
      radius: 1.65,
    },
    {
      id: 'veh_jeep_express',
      kind: 'olive_jeep',
      name: 'Olive 4x4 Jeep',
      x: -26.0,
      z: 4.5,
      yaw: Math.PI,
      maxSpeed: 25,
      accel: 17,
      radius: 1.65,
    },
    {
      id: 'veh_aurora_coupe',
      kind: 'aurora_coupe',
      name: 'Aurora Sport Coupe',
      // West Downtown Avenue (no ambient traffic on this street)
      ...auroraLocalToWorld(-22.9, -24.0),
      yaw: AURORA_YAW.pz,
      maxSpeed: 31,
      accel: 22,
      radius: 1.7,
    },
    {
      id: 'veh_aurora_interceptor',
      kind: 'aurora_coupe',
      name: 'Harbor GT Interceptor',
      // East Perimeter Avenue beside the village (no ambient traffic on this street)
      ...auroraLocalToWorld(39.9, -2.0),
      yaw: AURORA_YAW.pz,
      maxSpeed: 32,
      accel: 23,
      radius: 1.7,
    },
    {
      id: 'veh_fungi_buggy',
      kind: 'fungi_buggy',
      name: 'Fungi Trail Buggy',
      x: 66.0,
      z: 13.8,
      yaw: Math.PI * 0.5,
      maxSpeed: 27,
      accel: 19,
      radius: 1.65,
    },
    {
      id: 'veh_snow_patrol',
      kind: 'snow_patrol',
      name: 'Snowpeak Patrol 4x4',
      x: -26.0,
      z: -66.0,
      yaw: Math.PI * 0.5,
      maxSpeed: 26,
      accel: 18,
      radius: 1.75,
    },
    {
      id: 'veh_bike_kuroba',
      kind: 'bike',
      name: 'Type-01 Cyberbike',
      x: -7.5,
      z: 14.8,
      yaw: -Math.PI * 0.5,
      maxSpeed: 33,
      accel: 24,
      radius: 1.15,
    },
    {
      id: 'veh_bike_aurora',
      kind: 'bike',
      name: 'Aurora Neo-Racer',
      // City Hall spine gateway, just inside the border
      ...auroraLocalToWorld(1.2, -40.5),
      yaw: AURORA_YAW.pz,
      maxSpeed: 35,
      accel: 26,
      radius: 1.15,
    },
    {
      id: 'veh_bike_fungi',
      kind: 'bike',
      name: 'Fungi Enduro-Bike',
      x: 74.0,
      z: 14.8,
      yaw: -Math.PI * 0.5,
      maxSpeed: 33,
      accel: 24,
      radius: 1.15,
    },
  ];

  // 16. ENEMY SPAWN APPROACH POINTS ACROSS KUROBA CROSSING & ALL 3 CONNECTED REGIONS
  const spawnPoints = [
    new THREE.Vector3(-13.5, 0, -4.5),
    new THREE.Vector3(14.0, 0, -4.5),
    new THREE.Vector3(-23, 0, 11),
    new THREE.Vector3(23, 0, 11),
    new THREE.Vector3(-16, 0, -16),
    new THREE.Vector3(16, 0, -16),
  ];

  const zoneAnchors: Record<WorldZoneId, THREE.Vector3[]> = {
    kuroba: spawnPoints,
    aurora: auroraCity.spawnAnchors.map(([lx, lz]) => {
      const p = auroraLocalToWorld(lx, lz);
      return new THREE.Vector3(p.x, 0, p.z);
    }),
    fungi: [
      new THREE.Vector3(76, 0, 13.8),
      new THREE.Vector3(122, 0, 13.8),
      new THREE.Vector3(76, 0, 56),
      new THREE.Vector3(100, 0, -24),
      new THREE.Vector3(122, 0, 74),
      new THREE.Vector3(76, 0, 96),
    ],
    snowpeak: [
      new THREE.Vector3(-26, 0, -66),
      new THREE.Vector3(28, 0, -66),
      new THREE.Vector3(-60, 0, -104),
      new THREE.Vector3(0, 0, -104),
      new THREE.Vector3(64, 0, -104),
      new THREE.Vector3(-26, 0, -132),
    ],
  };

  return {
    root,
    colliders,
    cameraObstructions,
    spawnPoints,
    vehicleSpawns,
    zoneAnchors,
    animatedLanterns,
    volumetricLights,
    mistLayers,
    explosiveBarrels,
    disposables,
    auroraCity,
    kurobaStyle,
  };
}

/** Aurora City's island grass colour (shared by the open-world meadow). */
const AURORA_GRASS = 0x3f7d3a;

/**
 * Restyles Kuroba Crossing's streets in Aurora City's micro-voxel look without moving anything:
 * tonal grass patches, tiled sidewalks, zebra crosswalks, garden beds and Aurora street lamps.
 * Kit coordinates are world / AURORA_SCALE.
 */
function dressKurobaInAuroraStyle(kit: AuroraStyleKit): void {
  const k = (v: number) => v / AURORA_SCALE;
  const vb = kit.vb;

  // Tonal grass patches across the Kuroba heartland (flush with the ground, under roads)
  for (let x = -46; x < 46; x += 5) {
    for (let z = -44; z < 100; z += 5) {
      if (kit.rand() > 0.55) {
        vb.add(k(x + 2.5), 0.004, k(z + 2.5), kit.jitterColor(0x478c3e, 0.05), k(4.9), 0.008, k(4.9));
      }
    }
  }

  // Tiled sidewalks along the Grand Central highway (gaps for crossroads, boardwalk & bus stop)
  const northRuns: Array<[number, number]> = [[-46, -29.6], [-22.4, -2.6], [2.6, 5.8], [11.0, 24.4], [31.6, 46]];
  const southRuns: Array<[number, number]> = [[-46, -29.6], [-22.4, 24.4], [31.6, 46]];
  for (const [x0, x1] of northRuns) kit.walkway(k(x0), k(9.2), k(x1 - x0), k(1.05), 0.02);
  for (const [x0, x1] of southRuns) kit.walkway(k(x0), k(17.35), k(x1 - x0), k(1.1), 0.02);

  // Zebra crosswalks: across the highway at the station boardwalk & both crossroads,
  // and across the two north-south expressways
  const white = 0xf8fafc;
  for (const cx of [0, -33, 35]) {
    for (let i = -3; i <= 3; i++) vb.add(k(cx) + i * 0.5, 0.045, k(13.8), white, 0.26, 0.03, k(5.8));
  }
  for (const nsx of [-26, 28]) {
    for (const cz of [7.6, 20.0]) {
      for (let i = -3; i <= 3; i++) vb.add(k(nsx), 0.045, k(cz) + i * 0.5, white, k(5.8), 0.03, 0.26);
    }
  }

  // Low garden beds beside the station boardwalk & around the torii (walk-over height, no colliders)
  kit.gardenBed(k(2.3), k(-5.6), k(1.2), k(4.6));
  kit.gardenBed(k(-3.5), k(-5.6), k(1.2), k(4.6));
  kit.gardenBed(k(2.3), k(4.2), k(1.2), k(4.8));
  kit.gardenBed(k(-3.5), k(4.2), k(1.2), k(4.8));
  kit.gardenBed(k(15.2), k(-8.6), k(2.0), k(1.6));
  kit.gardenBed(k(21.4), k(-6.8), k(2.0), k(1.6));

  // Aurora street lamps along the outer sidewalks
  for (const lx of [-40, -34, 37, 43]) {
    kit.streetLamp(k(lx), k(9.5), 0.06);
    kit.streetLamp(k(lx), k(18.1), 0.06);
  }
}

/**
 * Builds the ported Aurora City diorama, places it in the western quadrant and registers its
 * generated colliders plus invisible camera-occlusion proxies for its taller blocks.
 */
function placeAuroraCity(
  root: THREE.Group,
  colliders: ColliderBox[],
  cameraObstructions: THREE.Object3D[],
  disposables: Array<{ dispose: () => void }>,
): AuroraCity {
  const city = createAuroraCity();
  city.root.position.set(AURORA_ORIGIN_X, 0, AURORA_ORIGIN_Z);
  city.root.rotation.y = -Math.PI * 0.5;
  city.root.scale.setScalar(AURORA_SCALE);
  root.add(city.root);
  root.updateMatrixWorld(true);
  city.syncWorldMatrix();
  disposables.push({ dispose: () => city.dispose() });

  const proxies: Array<{ cx: number; cz: number; w: number; d: number; h: number }> = [];
  city.colliders.forEach((c, idx) => {
    // Local x -> world z, local z -> world -x (see auroraLocalToWorld)
    const a = auroraLocalToWorld(c.minX, c.maxZ);
    const b = auroraLocalToWorld(c.maxX, c.minZ);
    const box: ColliderBox = {
      id: `aurora_${idx}`,
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: 0,
      maxY: c.maxY * AURORA_SCALE,
      minZ: Math.min(a.z, b.z),
      maxZ: Math.max(a.z, b.z),
      blocksBullets: c.blocksBullets,
    };
    colliders.push(box);
    if (box.maxY > 2.4 && c.blocksBullets) {
      proxies.push({
        cx: (box.minX + box.maxX) * 0.5,
        cz: (box.minZ + box.maxZ) * 0.5,
        w: box.maxX - box.minX,
        d: box.maxZ - box.minZ,
        h: box.maxY,
      });
    }
  });

  // Camera occlusion proxies: never rendered, only ray-cast by the third-person camera
  if (proxies.length > 0) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const proxyMesh = new THREE.InstancedMesh(geo, mat, proxies.length);
    const dummy = new THREE.Object3D();
    proxies.forEach((p, i) => {
      dummy.position.set(p.cx, 0, p.cz);
      dummy.scale.set(p.w, p.h, p.d);
      dummy.updateMatrix();
      proxyMesh.setMatrixAt(i, dummy.matrix);
    });
    proxyMesh.instanceMatrix.needsUpdate = true;
    proxyMesh.computeBoundingSphere();
    proxyMesh.name = 'AuroraCameraProxies';
    root.add(proxyMesh);
    cameraObstructions.push(proxyMesh);
    disposables.push(geo, mat);
  }

  return city;
}

/**
 * Two-story traditional Japanese wooden shop & station house matching the reference diorama.
 */
function buildKurobaStationHouse(
  materials: SharedVoxelMaterials,
  maxAnisotropy: number,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();

  const DARK_WOOD = 0x4b2f1c;
  const CEDAR = 0x6c4327;
  const LIGHT_CEDAR = 0x8d5a34;
  const PLANK_DECK = 0x5d3921;
  const SLATE_ROOF = 0x2d3237;
  const SLATE_ALT = 0x3a4046;
  const RIDGE_WHITE = 0xd9dad6;
  const WARM_GLOW = 0xffca6b;
  const AMBER_GLOW = 0xff9b38;
  const CYAN_GLOW = 0x45e8ff;
  const AWNING_BLUE = 0x2e6d9c;
  const AWNING_WHITE = 0xe8e4da;
  const AC_WHITE = 0xdcdad2;
  const AC_GRILLE = 0x4c5258;

  // Raised wooden veranda deck + front steps
  vb.boxBottom(0, 0, 3.8, 14.2, 0.36, 3.4, PLANK_DECK);
  // Veranda plank accent strips
  for (let x = -6.6; x <= 6.6; x += 1.1) {
    vb.boxBottom(x, 0.36, 3.8, 0.08, 0.03, 3.3, DARK_WOOD);
  }
  // Support posts under deck
  for (let x = -6.5; x <= 6.5; x += 2.6) {
    vb.boxBottom(x, 0, 5.2, 0.34, 0.38, 0.34, DARK_WOOD);
  }
  // Front step down to boardwalk
  vb.boxBottom(0, 0, 5.75, 3.8, 0.2, 0.7, LIGHT_CEDAR);

  // Main structural core (2 floors: ground y=0.36..3.2, upper y=3.2..5.9)
  vb.boxBottom(0, 0.36, 0, 12.8, 5.5, 6.2, CEDAR);
  // Heavy dark timber corner & bay pillars
  const pillarXs = [-6.4, -2.4, 2.2, 6.4];
  const pillarZs = [-3.1, 3.1];
  for (const px of pillarXs) {
    for (const pz of pillarZs) {
      vb.boxBottom(px, 0.36, pz, 0.42, 5.65, 0.42, DARK_WOOD);
    }
  }
  // Horizontal timber tie beams
  vb.boxBottom(0, 3.1, 3.16, 13.2, 0.3, 0.32, DARK_WOOD);
  vb.boxBottom(0, 5.75, 3.16, 13.2, 0.3, 0.32, DARK_WOOD);
  vb.boxBottom(0, 0.36, 3.16, 13.2, 0.25, 0.28, DARK_WOOD);

  // Ground floor: center shoji doorway + warm glowing shop windows
  vb.boxBottom(-0.1, 0.5, 3.15, 3.6, 2.4, 0.16, WARM_GLOW, 'emissive');
  // Slatted wooden door mullions over glowing interior
  for (let x = -1.7; x <= 1.5; x += 0.4) {
    vb.boxBottom(x, 0.5, 3.24, 0.09, 2.4, 0.1, DARK_WOOD);
  }
  vb.boxBottom(-0.1, 1.35, 3.24, 3.7, 0.1, 0.12, DARK_WOOD);
  vb.boxBottom(-0.1, 2.2, 3.24, 3.7, 0.1, 0.12, DARK_WOOD);

  // Left bay (x = -4.4): warm window + blue/white striped fabric awning!
  vb.boxBottom(-4.4, 0.7, 3.15, 3.0, 1.9, 0.15, AMBER_GLOW, 'emissive');
  for (let x = -5.6; x <= -3.2; x += 0.45) {
    vb.boxBottom(x, 0.7, 3.22, 0.1, 1.9, 0.08, DARK_WOOD);
  }
  // Striped awning sloping out over left veranda
  for (let s = 0; s < 8; s++) {
    const sx = -6.0 + s * 0.45;
    const stripeColor = s % 2 === 0 ? AWNING_BLUE : AWNING_WHITE;
    vb.boxBottom(sx, 2.75, 3.65, 0.45, 0.22, 1.1, stripeColor);
    vb.boxBottom(sx, 2.52, 4.15, 0.45, 0.25, 0.36, stripeColor);
  }

  // Right bay (x = 4.3): open counter alcove with cyan-glowing retro vending machine + jars
  vb.boxBottom(4.3, 0.6, 2.9, 3.4, 2.2, 0.65, 0x261a12);
  // Counter shelf
  vb.boxBottom(4.3, 0.6, 3.2, 3.6, 0.75, 0.55, LIGHT_CEDAR);
  // Cute cyan-glowing vending machine on right veranda
  vb.boxBottom(3.3, 1.35, 3.15, 0.95, 1.25, 0.65, 0x2a88a8, 'metal');
  vb.boxBottom(3.3, 1.7, 3.5, 0.72, 0.65, 0.08, CYAN_GLOW, 'emissive');
  // White goods jars on the counter
  vb.boxBottom(4.6, 1.35, 3.2, 0.42, 0.5, 0.42, 0xf2eee4);
  vb.boxBottom(5.2, 1.35, 3.2, 0.42, 0.5, 0.42, 0xf2eee4);

  // Veranda wooden benches (just like the reference)
  vb.boxBottom(3.5, 0.36, 4.7, 1.5, 0.42, 0.55, LIGHT_CEDAR);
  vb.boxBottom(-3.4, 0.36, 4.7, 1.5, 0.42, 0.55, LIGHT_CEDAR);

  // Second floor: wooden louver shutters & warm glowing windows
  vb.boxBottom(-4.4, 3.55, 3.16, 2.8, 1.9, 0.14, 0x3b2a1e);
  for (let y = 3.7; y <= 5.2; y += 0.32) {
    vb.boxBottom(-4.4, y, 3.26, 2.6, 0.12, 0.12, LIGHT_CEDAR);
  }
  vb.boxBottom(4.3, 3.55, 3.16, 3.3, 1.9, 0.14, WARM_GLOW, 'emissive');
  for (let x = 2.85; x <= 5.75; x += 0.58) {
    vb.boxBottom(x, 3.55, 3.24, 0.1, 1.9, 0.1, DARK_WOOD);
  }
  vb.boxBottom(4.3, 4.45, 3.24, 3.4, 0.12, 0.12, DARK_WOOD);

  // Wall-mounted white AC units (matching the exact iconic detail in the reference!)
  const addACUnit = (ax: number, ay: number, az: number, side: 'front' | 'left') => {
    vb.boxBottom(ax, ay, az, 0.9, 0.72, 0.48, AC_WHITE, 'metal');
    if (side === 'front') {
      vb.boxBottom(ax - 0.12, ay + 0.14, az + 0.25, 0.42, 0.42, 0.06, AC_GRILLE);
    } else {
      vb.boxBottom(ax - 0.46, ay + 0.14, az, 0.06, 0.42, 0.34, AC_GRILLE);
    }
  };
  addACUnit(2.3, 3.85, 3.38, 'front');
  addACUnit(-6.75, 3.45, 1.1, 'left');
  addACUnit(-6.75, 4.35, 1.1, 'left');

  // Lower pent eaves roof over veranda
  for (let step = 0; step < 3; step++) {
    vb.boxBottom(0, 2.95 + step * 0.22, 4.45 - step * 0.42, 13.8, 0.22, 0.55, step % 2 === 0 ? SLATE_ROOF : SLATE_ALT);
  }

  // Stepped dark slate gabled main roofs (split-level Japanese shop roof silhouette!)
  // Left higher gable (x = -6.8 .. 1.6)
  for (let tier = 0; tier < 7; tier++) {
    const depth = 7.4 - tier * 0.92;
    const roofY = 5.85 + tier * 0.34;
    const col = tier % 2 === 0 ? SLATE_ROOF : SLATE_ALT;
    vb.boxBottom(-2.5, roofY, 0, 8.8, 0.36, depth, col);
    // Crisp white stepped gable edge trim
    vb.boxBottom(-6.85, roofY + 0.06, 0, 0.24, 0.24, depth + 0.16, RIDGE_WHITE);
    vb.boxBottom(1.85, roofY + 0.06, 0, 0.24, 0.24, depth + 0.16, RIDGE_WHITE);
  }
  // White roof ridge beam
  vb.boxBottom(-2.5, 8.2, 0, 9.1, 0.32, 0.62, RIDGE_WHITE);

  // Right slightly lower wing roof (x = 1.6 .. 7.0)
  for (let tier = 0; tier < 5; tier++) {
    const depth = 7.0 - tier * 1.1;
    const roofY = 5.65 + tier * 0.32;
    const col = tier % 2 === 0 ? SLATE_ALT : SLATE_ROOF;
    vb.boxBottom(4.2, roofY, 0, 5.6, 0.34, depth, col);
    vb.boxBottom(6.95, roofY + 0.06, 0, 0.22, 0.22, depth + 0.14, RIDGE_WHITE);
  }
  vb.boxBottom(4.2, 7.25, 0, 5.8, 0.28, 0.54, RIDGE_WHITE);

  // Roof glowing accent beacon lamps
  vb.boxBottom(-6.4, 5.9, 3.4, 0.26, 0.26, 0.26, WARM_GLOW, 'emissive');
  vb.boxBottom(6.4, 5.7, 3.3, 0.26, 0.26, 0.26, WARM_GLOW, 'emissive');

  group.add(vb.build(materials));

  // Glowing Main Neon Kanji Signboard on 2nd-floor center facade ("黒葉本屋" like reference!)
  const mainSignTex = createShopSignTexture('黒葉本屋', '#381e2c', '#ffe999', true, maxAnisotropy);
  const mainSignMat = new THREE.MeshStandardMaterial({
    map: mainSignTex,
    emissive: 0xffd27a,
    emissiveMap: mainSignTex,
    emissiveIntensity: 0.9,
    roughness: 0.35,
  });
  const mainSignGeo = new THREE.BoxGeometry(4.4, 1.35, 0.22);
  const mainSignMesh = new THREE.Mesh(mainSignGeo, mainSignMat);
  mainSignMesh.position.set(-0.2, 4.45, 3.42);
  group.add(mainSignMesh);

  // Glowing Orange Side Sign ("クロバ珈琲") on left corner
  const sideSignTex = createShopSignTexture('クロバ商店', '#4a1b12', '#ff8c42', false, maxAnisotropy);
  const sideSignMat = new THREE.MeshStandardMaterial({
    map: sideSignTex,
    emissive: 0xff6e2e,
    emissiveMap: sideSignTex,
    emissiveIntensity: 0.95,
    roughness: 0.35,
  });
  const sideSignGeo = new THREE.BoxGeometry(2.4, 0.65, 0.18);
  const sideSignMesh = new THREE.Mesh(sideSignGeo, sideSignMat);
  sideSignMesh.position.set(-4.6, 3.08, 3.42);
  group.add(sideSignMesh);

  disposables.push(mainSignTex, mainSignMat, mainSignGeo, sideSignTex, sideSignMat, sideSignGeo);
  return group;
}

/**
 * Weathered wooden railway tracks + timber pedestrian boardwalk crossing.
 */
function buildRailwayAndBoardwalk(materials: SharedVoxelMaterials): THREE.Group {
  const vb = new VoxelAssembler();
  const TIE_WOOD = 0x513421;
  const TIE_ALT = 0x422a1b;
  const RAIL_STEEL = 0x7b838a;
  const RAIL_TOP = 0xc2c9d2;
  const BALLAST = 0x3e4248;
  const BOARDWALK = 0x6f472b;
  const BOARDWALK_EDGE = 0x4e301c;
  const HAZARD_YELLOW = 0xfacc15;
  const HAZARD_BLACK = 0x18181b;
  const SIGNAL_RED = 0xef4444;

  // 1. Continuous East-West railway line (west buffer stop at the Aurora border -> east tunnel, z = 2.0)
  const RAIL_X0 = RAILWAY_WEST_END_X;
  const RAIL_X1 = 138;
  const RAIL_LEN = RAIL_X1 - RAIL_X0;
  const RAIL_MID = (RAIL_X0 + RAIL_X1) * 0.5;
  // Continuous crushed granite ballast gravel bed
  vb.boxBottom(RAIL_MID, 0.01, 2.0, RAIL_LEN, 0.06, 3.2, BALLAST);

  // Wooden railroad ties / sleepers across entire span
  for (let x = RAIL_X0 + 0.5; x <= RAIL_X1 - 0.5; x += 0.95) {
    vb.boxBottom(x, 0.04, 2.0, 0.34, 0.1, 2.5, Math.round(x) % 2 === 0 ? TIE_WOOD : TIE_ALT);
  }

  // Twin continuous steel rails
  vb.boxBottom(RAIL_MID, 0.1, 1.25, RAIL_LEN, 0.12, 0.14, RAIL_STEEL, 'metal');
  vb.boxBottom(RAIL_MID, 0.1, 2.75, RAIL_LEN, 0.12, 0.14, RAIL_STEEL, 'metal');
  // Polished chrome rail running surface
  vb.boxBottom(RAIL_MID, 0.22, 1.25, RAIL_LEN, 0.02, 0.08, RAIL_TOP, 'metal');
  vb.boxBottom(RAIL_MID, 0.22, 2.75, RAIL_LEN, 0.02, 0.08, RAIL_TOP, 'metal');

  // West terminus: hazard-striped buffer stop with red stop lamps
  vb.boxBottom(RAIL_X0 + 0.5, 0, 2.0, 1.0, 1.1, 3.0, 0x7f1d1d, 'metal');
  vb.boxBottom(RAIL_X0 + 0.5, 0.75, 2.0, 1.05, 0.22, 3.05, HAZARD_YELLOW);
  vb.boxBottom(RAIL_X0 + 0.5, 1.1, 0.75, 0.28, 0.28, 0.28, SIGNAL_RED, 'emissive');
  vb.boxBottom(RAIL_X0 + 0.5, 1.1, 3.25, 0.28, 0.28, 0.28, SIGNAL_RED, 'emissive');

  // 2. North-South wooden boardwalk connecting station veranda (z = -6.3) across tracks to south road (z = 10.6)
  for (let z = -6.2; z <= 10.4; z += 0.68) {
    vb.boxBottom(0, 0.02, z, 3.4, 0.14, 0.56, Math.round(z * 2) % 2 === 0 ? BOARDWALK : TIE_WOOD);
  }
  vb.boxBottom(-1.72, 0.02, 2.1, 0.18, 0.22, 17.0, BOARDWALK_EDGE);
  vb.boxBottom(1.72, 0.02, 2.1, 0.18, 0.22, 17.0, BOARDWALK_EDGE);

  // Crossing timber planks flush between rails at pedestrian boardwalk
  vb.boxBottom(0, 0.06, 2.0, 4.2, 0.16, 1.35, BOARDWALK);

  // 3. Flush asphalt/rubber crossing pads where roads cross the railway (x = -26, 28, 76)
  const roadCrossings = [-26, 28, 76];
  for (const rx of roadCrossings) {
    // Flush asphalt pad between and beside rails for smooth driving
    vb.boxBottom(rx, 0.04, 2.0, 6.8, 0.14, 1.35, 0x272b30);
    vb.boxBottom(rx, 0.04, 0.62, 6.8, 0.14, 0.95, 0x272b30);
    vb.boxBottom(rx, 0.04, 3.38, 6.8, 0.14, 0.95, 0x272b30);

    // Classic Japanese railway crossing signal post (Fumikiri) on both sides of road
    for (const sx of [rx - 4.2, rx + 4.2]) {
      // Tall iron signal pole with yellow & black diagonal stripes
      vb.boxBottom(sx, 0, 4.2, 0.2, 3.6, 0.2, HAZARD_YELLOW);
      vb.boxBottom(sx, 0.8, 4.2, 0.22, 0.4, 0.22, HAZARD_BLACK);
      vb.boxBottom(sx, 1.8, 4.2, 0.22, 0.4, 0.22, HAZARD_BLACK);
      vb.boxBottom(sx, 2.8, 4.2, 0.22, 0.4, 0.22, HAZARD_BLACK);

      // Warning crossbuck (X)
      vb.boxBottom(sx, 3.2, 4.2, 1.2, 0.14, 0.06, HAZARD_YELLOW);
      vb.boxBottom(sx, 3.2, 4.2, 0.14, 0.14, 0.08, HAZARD_BLACK);

      // Dual alternating red flashing warning lights
      vb.boxBottom(sx - 0.35, 2.9, 4.22, 0.22, 0.22, 0.12, SIGNAL_RED, 'emissive');
      vb.boxBottom(sx + 0.35, 2.9, 4.22, 0.22, 0.22, 0.12, SIGNAL_RED, 'emissive');
      // Sunshade hoods over lights
      vb.boxBottom(sx - 0.35, 3.05, 4.26, 0.26, 0.06, 0.16, 0x18181b, 'metal');
      vb.boxBottom(sx + 0.35, 3.05, 4.26, 0.26, 0.06, 0.16, 0x18181b, 'metal');
    }
  }

  // 4. Mountain tunnel portal at the eastern border (x = 138)
  for (const tx of [137.5]) {
    const isWest = tx < 0;
    // Heavy reinforced stone/concrete tunnel arch mouth
    vb.boxBottom(tx, 0, 2.0, 3.5, 5.2, 5.6, 0x374151);
    vb.boxBottom(tx, 0.1, 2.0, 3.8, 4.2, 3.6, 0x111827); // Dark tunnel interior void
    vb.boxBottom(tx + (isWest ? 1.6 : -1.6), 4.8, 2.0, 0.6, 0.6, 4.8, 0x4b5563);
    // Glowing tunnel warning lanterns
    vb.boxBottom(tx + (isWest ? 1.6 : -1.6), 4.2, 0.4, 0.25, 0.25, 0.25, 0xf59e0b, 'emissive');
    vb.boxBottom(tx + (isWest ? 1.6 : -1.6), 4.2, 3.6, 0.25, 0.25, 0.25, 0xf59e0b, 'emissive');
  }

  return vb.build(materials, { castShadow: false, receiveShadow: true });
}

// (Kei-Trucks & Olive Jeeps are now constructed as interactive drivable vehicles in entities.ts!)

/**
 * Classic vermilion-red Japanese Postbox beside the crossing.
 */
function buildJapanesePostbox(materials: SharedVoxelMaterials): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  vb.boxBottom(0, 0, 0, 0.44, 0.14, 0.44, 0x3b3e42, 'metal');
  vb.boxBottom(0, 0.14, 0, 0.22, 0.52, 0.22, 0x26292d, 'metal');
  vb.boxBottom(0, 0.66, 0, 0.68, 0.82, 0.56, 0xd83b2d);
  vb.boxBottom(0, 1.48, 0, 0.76, 0.12, 0.64, 0xbf2c20);
  // Mail slot & silver postal badge
  vb.boxBottom(0, 1.24, 0.29, 0.44, 0.1, 0.06, 0x1d1f22, 'metal');
  vb.boxBottom(0, 0.96, 0.29, 0.26, 0.14, 0.04, 0xf2eee4);
  group.add(vb.build(materials));
  group.add(createContactShadowMesh(0.55, materials.contactShadow));
  return group;
}

/**
 * Wooden bus-stop shelter with corrugated roof, bench, and station timetable sign.
 */
function buildBusStopShelter(
  materials: SharedVoxelMaterials,
  maxAnisotropy: number,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  const WOOD = 0x5c3922;
  const DARK_WOOD = 0x3f2616;
  const ROOF_ORANGE = 0x9c552d;
  const ROOF_ALT = 0x844422;

  // Raised wooden platform
  vb.boxBottom(0, 0, 0, 4.4, 0.24, 2.6, WOOD);
  // Four corner posts
  for (const px of [-1.95, 1.95]) {
    for (const pz of [-1.05, 1.05]) {
      vb.boxBottom(px, 0.24, pz, 0.22, 2.35, 0.22, DARK_WOOD);
    }
  }
  // Bench
  vb.boxBottom(0, 0.24, -0.45, 3.2, 0.48, 0.65, 0x7c4e2e);
  // Back slat wall
  vb.boxBottom(0, 0.72, -1.05, 3.8, 1.55, 0.12, WOOD);
  // Corrugated stepped roof
  for (let i = 0; i < 9; i++) {
    const rx = -2.0 + i * 0.5;
    vb.boxBottom(rx, 2.55, 0, 0.46, 0.16, 2.9, i % 2 === 0 ? ROOF_ORANGE : ROOF_ALT);
  }
  // Timetable frame post on the left
  vb.boxBottom(-3.0, 0, 0.2, 0.16, 1.85, 0.16, 0x3a4046, 'metal');
  vb.boxBottom(-3.0, 0.95, 0.2, 1.35, 0.95, 0.12, 0xdad5c8);

  group.add(vb.build(materials));

  const signTex = createShopSignTexture('黒葉バス停', '#e8e2d2', '#2b2420', false, maxAnisotropy);
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 });
  const signGeo = new THREE.BoxGeometry(1.4, 0.42, 0.12);
  const signMesh = new THREE.Mesh(signGeo, signMat);
  signMesh.position.set(0, 2.25, 1.08);
  group.add(signMesh);

  disposables.push(signTex, signMat, signGeo);
  return group;
}

/**
 * Japanese streetlamp pole coordinates along Kuroba Crossing station road and approaches.
 */
export const KUROBA_STREETLAMP_COORDS: Array<[number, number, number]> = [
  [-10.5, 0, 10.4],
  [11.8, 0, 10.4],
  [-16.0, 0, 17.0],
  [13.5, 0, 17.0],
  [-8.5, 0, -5.5],
  [9.2, 0, -5.5],
];

/**
 * White metal guardrails & dark iron Japanese streetlamp poles along the asphalt road.
 */
function buildGuardrailsAndLamps(
  materials: SharedVoxelMaterials,
  animatedLanterns: THREE.Object3D[],
): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();

  const RAIL_WHITE = 0xe4e2da;
  const POST_IRON = 0x353b40;
  const LAMP_GLOW = 0xffe29c;

  // Guardrail segments (leaving open gaps for the crossing and player movement!)
  const segments: Array<[number, number, number]> = [
    [-22, -11, 10.8],
    [-9.5, -3.2, 10.8],
    [12.0, 23.0, 10.8],
    [-22, -8, 16.8],
    [4, 22, 16.8],
  ];
  for (const [x1, x2, z] of segments) {
    const cx = (x1 + x2) * 0.5;
    const len = x2 - x1;
    vb.boxBottom(cx, 0.68, z, len, 0.16, 0.12, RAIL_WHITE, 'metal');
    vb.boxBottom(cx, 0.36, z, len, 0.12, 0.1, RAIL_WHITE, 'metal');
    for (let px = x1 + 0.3; px <= x2 - 0.2; px += 2.6) {
      vb.boxBottom(px, 0, z, 0.14, 0.92, 0.14, RAIL_WHITE, 'metal');
    }
  }

  // Streetlamp poles (positioned cleanly beside the road without obstructing the central crossing vista)
  for (const [lx, ly, lz] of KUROBA_STREETLAMP_COORDS) {
    vb.boxBottom(lx, ly, lz, 0.22, 4.6, 0.22, POST_IRON, 'metal');
    vb.boxBottom(lx, ly + 4.45, lz + (lz > 12 ? -0.45 : 0.45), 0.2, 0.18, 0.95, POST_IRON, 'metal');
    vb.boxBottom(lx, ly + 4.28, lz + (lz > 12 ? -0.8 : 0.8), 0.34, 0.18, 0.34, LAMP_GLOW, 'emissive');
  }

  group.add(vb.build(materials));

  // Add subtle glowing paper lanterns near station porch that gently sway
  const lanternGeo = new THREE.BoxGeometry(0.32, 0.42, 0.32);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xff9248,
    emissive: 0xff6e24,
    emissiveIntensity: 0.95,
    roughness: 0.4,
  });
  const lanternCoords: Array<[number, number, number]> = [
    [-2.4, 2.55, -7.2],
    [2.2, 2.55, -7.2],
  ];
  for (const [x, y, z] of lanternCoords) {
    const m = new THREE.Mesh(lanternGeo, lanternMat);
    m.position.set(x, y, z);
    group.add(m);
    animatedLanterns.push(m);
  }

  return group;
}

// (Olive Jeep is now spawned as a live drivable 4x4 vehicle!)

/**
 * West-side vintage wooden railway signal cabin.
 */
function buildSignalCabin(materials: SharedVoxelMaterials): THREE.Group {
  const vb = new VoxelAssembler();
  vb.boxBottom(0, 0, 0, 4.4, 2.2, 4.0, 0x5c412c);
  vb.boxBottom(0, 2.2, 0, 4.6, 1.6, 4.2, 0x3b5949);
  vb.boxBottom(0, 2.45, 2.12, 3.6, 0.95, 0.12, 0xffd27a, 'emissive');
  vb.boxBottom(2.32, 2.45, 0, 0.12, 0.95, 3.2, 0xffd27a, 'emissive');
  for (let t = 0; t < 4; t++) {
    vb.boxBottom(0, 3.8 + t * 0.28, 0, 5.2 - t * 0.85, 0.3, 4.8 - t * 0.85, 0x2d3237);
  }
  // Railway semaphore signal post beside cabin
  vb.boxBottom(3.0, 0, 1.8, 0.22, 4.8, 0.22, 0x454c54, 'metal');
  vb.boxBottom(3.0, 4.2, 1.95, 0.45, 0.95, 0.25, 0x23272c, 'metal');
  vb.boxBottom(3.0, 4.45, 2.1, 0.22, 0.22, 0.08, 0x42f59b, 'emissive');
  vb.boxBottom(3.0, 4.05, 2.1, 0.22, 0.22, 0.08, 0xff4c3b, 'emissive');
  return vb.build(materials);
}

/**
 * Vermilion Japanese shrine Torii gate marking the eastern forest trail.
 */
function buildToriiGate(materials: SharedVoxelMaterials): THREE.Group {
  const vb = new VoxelAssembler();
  const VERMILION = 0xc93b2b;
  const DARK_CAP = 0x232528;
  vb.boxBottom(-2.2, 0, 0, 0.56, 0.5, 0.56, DARK_CAP);
  vb.boxBottom(2.2, 0, 0, 0.56, 0.5, 0.56, DARK_CAP);
  vb.boxBottom(-2.2, 0.5, 0, 0.44, 4.6, 0.44, VERMILION);
  vb.boxBottom(2.2, 0.5, 0, 0.44, 4.6, 0.44, VERMILION);
  vb.boxBottom(0, 4.05, 0, 5.6, 0.36, 0.36, VERMILION);
  vb.boxBottom(0, 4.95, 0, 6.4, 0.42, 0.52, VERMILION);
  vb.boxBottom(0, 5.37, 0, 6.9, 0.26, 0.62, DARK_CAP);
  vb.boxBottom(0, 4.4, 0, 0.45, 0.62, 0.28, DARK_CAP);
  return vb.build(materials);
}

/**
 * East wooden storage shed.
 */
function buildStorageShed(materials: SharedVoxelMaterials): THREE.Group {
  const vb = new VoxelAssembler();
  vb.boxBottom(0, 0, 0, 4.2, 2.5, 3.6, 0x6f492d);
  vb.boxBottom(0, 0.2, 1.82, 1.6, 2.1, 0.12, 0x4a2f1d);
  for (let t = 0; t < 4; t++) {
    vb.boxBottom(0, 2.5 + t * 0.26, 0, 4.8 - t * 0.7, 0.28, 4.2 - t * 0.7, 0x353c42);
  }
  return vb.build(materials);
}

/**
 * Tactical waist-high cargo crate cover clusters scattered cleanly across the crossing.
 */
function buildCrateCoverCluster(materials: SharedVoxelMaterials, variant: number): THREE.Group {
  const group = new THREE.Group();
  const vb = new VoxelAssembler();
  const WOOD_A = 0x8c5a32;
  const WOOD_B = 0x734624;
  const TRIM = 0x523118;
  const TARP = variant % 2 === 0 ? 0x326b8c : 0x4e7a42;

  vb.boxBottom(-0.42, 0, 0, 1.05, 1.05, 1.05, WOOD_A);
  vb.boxBottom(-0.42, 0.46, 0, 1.1, 0.14, 1.1, TRIM);
  vb.boxBottom(0.58, 0, 0.12, 0.92, 0.92, 0.92, WOOD_B);
  if (variant % 3 === 0) {
    vb.boxBottom(-0.22, 1.05, -0.05, 0.72, 0.56, 0.72, TARP);
  } else {
    vb.boxBottom(0.55, 0.92, 0.1, 0.66, 0.52, 0.66, 0xa86f3e);
  }

  group.add(vb.build(materials));
  group.add(createContactShadowMesh(1.35, materials.contactShadow));
  return group;
}

/**
 * Builds lush multi-tone voxel trees, purple hydrangeas (signature reference detail!),
 * yellow/white wildflowers, grass tufts, and natural perimeter forested hills via InstancedMesh.
 */
function buildLushFoliageAndPerimeter(
  root: THREE.Group,
  disposables: Array<{ dispose: () => void }>,
  kit: AuroraStyleKit,
): void {
  const _dummy = new THREE.Object3D();
  const _color = new THREE.Color();

  // Deterministic PRNG so layout is always clean and reproducible
  let seed = 4219;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  // A. Composite Voxel Trees placed around perimeter and framing landmarks
  const treeCoords: Array<[number, number, number]> = [
    // Flanking station house (just like reference right & back trees!)
    [10.8, -10.5, 1.25],
    [13.8, -14.2, 1.4],
    [-10.5, -13.5, 1.3],
    [-16.5, -15.0, 1.45],
    [-13.2, 19.2, 1.2],
    [18.0, 19.5, 1.3],
    [-23.5, -6.5, 1.35],
    [25.0, -9.5, 1.35],
  ];

  // Natural grove trees around Kuroba Crossing (keeping all highway corridors completely clear!)
  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2 + (rand() - 0.5) * 0.1;
    const dist = 30 + rand() * 14;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;
    // Keep all major roads completely open for smooth driving!
    if (Math.abs(tz - 13.8) < 6.5) continue;
    if (Math.abs(tx - -26) < 6.5) continue;
    if (Math.abs(tx - 28) < 6.5) continue;
    treeCoords.push([tx, tz, 1.15 + rand() * 0.65]);
  }

  // Aurora City micro-voxel trees (wind-swayed canopies) at the same spots as before: sakura flank
  // the station, lush broadleaf trees frame the crossing, and the grove ring mixes in pines.
  // Trunk colliders are generated by the style kit.
  const k = (v: number) => v / AURORA_SCALE;
  const petalSources: Array<{ x: number; y: number; z: number; r: number; count: number }> = [];
  treeCoords.forEach(([tx, tz, s], idx) => {
    const ks = s * 1.15;
    if (idx < 4) {
      kit.sakuraTree(k(tx), k(tz), ks);
      petalSources.push({ x: k(tx), y: 2.9 * ks, z: k(tz), r: 4.4, count: 46 });
    } else if (idx < 8) {
      kit.lushTree(k(tx), k(tz), ks);
    } else if (idx % 3 === 0) {
      kit.pineTree(k(tx), k(tz), ks * 1.05);
    } else if (idx % 7 === 0) {
      kit.sakuraTree(k(tx), k(tz), ks * 0.95);
    } else {
      kit.villageTree(k(tx), k(tz), ks);
    }
  });
  kit.petals(petalSources);

  // B. Distant Open-World Perimeter Mountains (at radius 158..178 outside all 4 zones!)
  const hillBaseGeo = new THREE.BoxGeometry(26, 6.5, 22);
  hillBaseGeo.translate(0, 3.25, 0);
  const hillTopGeo = new THREE.BoxGeometry(16, 6.0, 14);
  hillTopGeo.translate(0, 9.2, 0);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 });
  const hillCount = 32;
  const hillsBase = new THREE.InstancedMesh(hillBaseGeo, hillMat, hillCount);
  const hillsTop = new THREE.InstancedMesh(hillTopGeo, hillMat, hillCount);
  for (let i = 0; i < hillCount; i++) {
    const angle = (i / hillCount) * Math.PI * 2;
    const dist = 160 + (i % 3) * 10;
    const hx = Math.cos(angle) * dist;
    const hz = Math.sin(angle) * dist;
    _dummy.position.set(hx, -0.2, hz);
    _dummy.rotation.set(0, angle + 0.3, 0);
    _dummy.scale.set(1.25 + rand() * 0.7, 0.95 + rand() * 1.1, 1.1 + rand() * 0.6);
    // Aurora City's quadrant is city + open western sea: no perimeter hills there
    if (isInAuroraFootprint(hx, hz)) {
      _dummy.scale.setScalar(0);
    }
    _dummy.updateMatrix();
    hillsBase.setMatrixAt(i, _dummy.matrix);
    hillsTop.setMatrixAt(i, _dummy.matrix);
    const isSnow = hz < -40;
    const isFungi = hx > 40 && !isSnow;
    const isAurora = hx < -40 && !isSnow;
    hillsBase.setColorAt(
      i,
      _color.setHex(isSnow ? 0x6f849c : isFungi ? 0x264d42 : isAurora ? 0x222c3c : 0x3b662f),
    );
    hillsTop.setColorAt(
      i,
      _color.setHex(isSnow ? 0xe8f2fa : isFungi ? 0x3e6f56 : isAurora ? 0x304159 : 0x487638),
    );
  }
  [hillsBase, hillsTop].forEach((im) => {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    root.add(im);
  });
  disposables.push(hillBaseGeo, hillTopGeo, hillMat);

  // C. Lush Grass Tufts, Purple Hydrangeas (around the station!), & Yellow/White Wildflowers
  const bushGeo = new THREE.BoxGeometry(0.42, 0.36, 0.42);
  bushGeo.translate(0, 0.18, 0);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });

  const tuftEntries: Array<{ x: number; z: number; sx: number; sy: number; color: number }> = [];

  // Signature purple hydrangea beds right beside the station veranda (exact match to reference!)
  const hydrangeaCenters: Array<[number, number]> = [
    [-7.6, -7.8],
    [-4.8, -5.8],
    [4.4, -5.8],
    [8.2, -8.2],
    [-8.6, -11.5],
    [8.4, 6.2],
    [-6.0, 6.8],
  ];
  for (const [hx, hz] of hydrangeaCenters) {
    for (let k = 0; k < 14; k++) {
      const ox = (rand() - 0.5) * 3.0;
      const oz = (rand() - 0.5) * 2.2;
      const isFlower = rand() > 0.35;
      tuftEntries.push({
        x: hx + ox,
        z: hz + oz,
        sx: 0.8 + rand() * 0.9,
        sy: 0.9 + rand() * 1.1,
        color: isFlower
          ? rand() > 0.4
            ? 0x7658d4
            : 0x5d7be8
          : 0x3a6f2e,
      });
    }
  }

  // Scattered meadow grass tufts + sunlit yellow/white wildflowers across the entire crossing
  for (let i = 0; i < 360; i++) {
    const gx = (rand() - 0.5) * 66;
    const gz = (rand() - 0.5) * 60;
    // Keep clear of asphalt road, boardwalk, and station interior
    if (gz > 10.6 && gz < 17.0) continue;
    if (Math.abs(gx) < 2.2 && gz > -6.5 && gz < 10.8) continue;
    if (Math.abs(gx) < 7.3 && gz > -15.6 && gz < -6.2) continue;

    const r = rand();
    let col = 0x528836;
    if (r > 0.88) col = 0xf4e87c; // warm yellow wildflower
    else if (r > 0.78) col = 0xf3f5ec; // white daisy blossom
    else if (r > 0.45) col = 0x67a042; // sunlit bright grass
    else col = 0x3f732e;

    tuftEntries.push({
      x: gx,
      z: gz,
      sx: 0.65 + rand() * 0.8,
      sy: r > 0.78 ? 0.85 + rand() * 0.45 : 0.6 + rand() * 0.75,
      color: col,
    });
  }

  const tufts = new THREE.InstancedMesh(bushGeo, bushMat, tuftEntries.length);
  tufts.receiveShadow = true;
  tuftEntries.forEach((t, idx) => {
    _dummy.position.set(t.x, 0, t.z);
    _dummy.rotation.set(0, rand() * Math.PI, 0);
    _dummy.scale.set(t.sx, t.sy, t.sx);
    _dummy.updateMatrix();
    tufts.setMatrixAt(idx, _dummy.matrix);
    tufts.setColorAt(idx, _color.setHex(t.color));
  });
  tufts.instanceMatrix.needsUpdate = true;
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  tufts.computeBoundingSphere();
  root.add(tufts);
  disposables.push(bushGeo, bushMat);
}

/**
 * Distinct biome ground pads for Aurora City (West), Fungi Forest (East), and Kopenhime Snowpeak (North).
 */
function buildBiomeGroundPads(
  root: THREE.Group,
  disposables: Array<{ dispose: () => void }>,
): void {
  const addPad = (x: number, z: number, w: number, d: number, color: number, roughness: number) => {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.015, z);
    mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(geo, mat);
  };

  // (Aurora City in the west brings its own island base — see placeAuroraCity)
  // Fungi Forest mossy bioluminescent loam (East: x = 46..152, z = -44..148)
  addPad(99, 52, 106, 192, 0x224a3c, 0.94);
  // Kopenhime Snowpeak alpine snow plateau (North: x = -154..154, z = -152..-44)
  addPad(0, -98, 308, 108, 0xe4eef6, 0.82);
}

/**
 * Extensive connected multi-highway road network tying Kuroba Crossing, Aurora City,
 * Fungi Forest, and Kopenhime Snowpeak into one continuous drivable open world!
 */
function buildOpenWorldRoadNetwork(
  root: THREE.Group,
  materials: SharedVoxelMaterials,
  maxAnisotropy: number,
  disposables: Array<{ dispose: () => void }>,
): void {
  const roadTexEW = createAsphaltRoadTexture(maxAnisotropy);
  roadTexEW.repeat.set(36, 1);
  const roadMatEW = new THREE.MeshStandardMaterial({
    map: roadTexEW,
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.06,
  });

  const roadTexNS = createAsphaltRoadTexture(maxAnisotropy);
  roadTexNS.repeat.set(32, 1);
  const roadMatNS = new THREE.MeshStandardMaterial({
    map: roadTexNS,
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.06,
  });

  const padMat = new THREE.MeshStandardMaterial({
    color: 0x2e3338,
    roughness: 0.85,
    metalness: 0.06,
  });
  disposables.push(roadTexEW, roadMatEW, roadTexNS, roadMatNS, padMat);

  const addRoadEW = (x1: number, x2: number, z: number, width = 6.2) => {
    const len = x2 - x1;
    const geo = new THREE.PlaneGeometry(len, width);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, roadMatEW);
    mesh.position.set((x1 + x2) * 0.5, 0.032, z);
    mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(geo);
  };

  const addRoadNS = (x: number, z1: number, z2: number, width = 6.2) => {
    const len = z2 - z1;
    const geo = new THREE.PlaneGeometry(len, width);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI * 0.5);
    const mesh = new THREE.Mesh(geo, roadMatNS);
    mesh.position.set(x, 0.034, (z1 + z2) * 0.5);
    mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(geo);
  };

  // === EAST-WEST HIGHWAYS & AVENUES ===
  // Aurora City (west of AURORA_BORDER_X) has its own street grid; these roads hand over to it
  // at the border: the highway joins the City Hall spine, the beltway joins Outskirts Avenue A.
  // 1. Grand Central East-West Highway (Aurora City <-> Kuroba Crossing <-> Fungi Forest!)
  addRoadEW(AURORA_BORDER_X, 138, 13.8, 6.2);
  // 2. South Scenic Beltway connecting Aurora Outskirts <-> Kuroba South <-> Fungi South
  addRoadEW(AURORA_BORDER_X, 130, 96, 6.2);
  // 3. Mid-South Cross Boulevard (Fungi connector)
  addRoadEW(26, 128, 56, 5.8);
  // 4. North Cross-Street in Fungi Forest
  addRoadEW(26, 128, -24, 5.8);
  // 5. Kopenhime Snowpeak Alpine Highways (3 scenic snowy mountain passes!)
  addRoadEW(-126, 126, -66, 6.2);
  addRoadEW(-126, 126, -104, 6.0);
  addRoadEW(-126, 126, -134, 5.8);

  // === NORTH-SOUTH EXPRESSWAYS & AVENUES ===
  // 1. Mountain North-South Expressway (just west of Kuroba Crossing straight up into Snowpeak!)
  addRoadNS(-26, -136, 100, 6.2);
  // 2. East Fungi-to-Snowpeak Arterial
  addRoadNS(28, -136, 100, 6.0);
  // 3. Western Snowpeak avenues (end at Aurora City's northern edge)
  addRoadNS(-68, -136, AURORA_NORTH_Z, 6.0);
  addRoadNS(-102, -136, AURORA_NORTH_Z, 5.8);
  addRoadNS(-132, -136, AURORA_NORTH_Z, 5.8);
  // 4. Fungi Forest Paved Scenic Loop Avenues
  addRoadNS(76, -136, 100, 6.0);
  addRoadNS(122, -136, 100, 5.8);

  // Clean asphalt intersection pads at major crossroads
  const padGeo = new THREE.PlaneGeometry(7.2, 7.2);
  padGeo.rotateX(-Math.PI / 2);
  disposables.push(padGeo);
  const xs = [-132, -102, -68, -26, 28, 76, 122];
  const zs = [-134, -104, -66, -24, 13.8, 56, 96];
  const padSpots: Array<[number, number]> = [];
  for (const ix of xs) {
    for (const iz of zs) {
      if (!isInAuroraFootprint(ix, iz)) padSpots.push([ix, iz]);
    }
  }
  const pads = new THREE.InstancedMesh(padGeo, padMat, padSpots.length);
  const _d = new THREE.Object3D();
  padSpots.forEach(([ix, iz], pIdx) => {
    _d.position.set(ix, 0.036, iz);
    _d.updateMatrix();
    pads.setMatrixAt(pIdx, _d.matrix);
  });
  pads.instanceMatrix.needsUpdate = true;
  pads.receiveShadow = true;
  root.add(pads);

  // Overhead Highway Gateway Arches & Directional Signs at Kuroba Crossing borders!
  const addHighwayArch = (
    cx: number,
    cz: number,
    rotY: number,
    signText: string,
    bgHex: string,
    fgHex: string,
    accentHex: number,
  ) => {
    const g = new THREE.Group();
    const vb = new VoxelAssembler();
    vb.boxBottom(-4.2, 0, 0, 0.55, 5.8, 0.55, 0x353c45, 'metal');
    vb.boxBottom(4.2, 0, 0, 0.55, 5.8, 0.55, 0x353c45, 'metal');
    vb.boxBottom(0, 5.5, 0, 9.2, 0.48, 0.65, 0x272d34, 'metal');
    vb.boxBottom(-4.2, 5.95, 0, 0.6, 0.25, 0.6, accentHex, 'emissive');
    vb.boxBottom(4.2, 5.95, 0, 0.6, 0.25, 0.6, accentHex, 'emissive');
    g.add(vb.build(materials));

    const tex = createShopSignTexture(signText, bgHex, fgHex, true, maxAnisotropy);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: accentHex,
      emissiveMap: tex,
      emissiveIntensity: 0.75,
      roughness: 0.4,
    });
    const geo = new THREE.BoxGeometry(5.6, 1.35, 0.24);
    const sign = new THREE.Mesh(geo, mat);
    sign.position.set(0, 5.95, 0);
    g.add(sign);
    disposables.push(tex, mat, geo);

    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;
    root.add(g);
  };

  addHighwayArch(AURORA_BORDER_X + 2.5, 13.8, Math.PI * 0.5, 'AURORA CITY →', '#102438', '#45f2ff', 0x45f2ff);
  addHighwayArch(AURORA_BORDER_X + 2.5, 96, Math.PI * 0.5, 'AURORA OUTSKIRTS →', '#14301f', '#bef264', 0x84cc16);
  addHighwayArch(46, 13.8, -Math.PI * 0.5, 'FUNGI FOREST →', '#153324', '#a3ff5c', 0x9eff3b);
  addHighwayArch(-26, -46, 0, '↑ KOPENHIME SNOWPEAK', '#1d3247', '#d9f4ff', 0x7cc4ff);
}

/**
 * Creates a smooth vertical-falloff volumetric light beam alpha texture for god-rays & lamp cones.
 */
function createVolumetricBeamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, 'rgba(255,255,255,0.72)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.48)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates a soft radial mist/fog cloud texture for low-lying atmospheric ground fog layers.
 */
function createMistTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(255,255,255,0.68)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function addVolumetricCone(
  root: THREE.Group,
  list: VolumetricLightItem[],
  disposables: Array<{ dispose: () => void }>,
  tex: THREE.CanvasTexture,
  x: number,
  topY: number,
  z: number,
  radius: number,
  height: number,
  colorHex: number,
  baseOpacity: number,
  dayScale = 0.2,
  nightScale = 1.0,
  groundTex?: THREE.CanvasTexture,
): void {
  const geo = new THREE.ConeGeometry(radius, height, 24, 1, true);
  geo.translate(0, -height * 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    map: tex,
    transparent: true,
    opacity: baseOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, topY, z);
  root.add(mesh);
  disposables.push(geo, mat);
  list.push({
    mesh,
    baseOpacity,
    dayScale,
    nightScale,
    phase: (x * 0.17 + z * 0.13) % (Math.PI * 2),
  });

  if (groundTex) {
    const groundGeo = new THREE.CircleGeometry(radius * 0.88, 20);
    groundGeo.rotateX(-Math.PI * 0.5);
    const groundMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      map: groundTex,
      transparent: true,
      opacity: baseOpacity * 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.set(x, 0.02, z);
    root.add(groundMesh);
    disposables.push(groundGeo, groundMat);
    list.push({
      mesh: groundMesh,
      baseOpacity: baseOpacity * 0.55,
      dayScale,
      nightScale,
      phase: (x * 0.17 + z * 0.13) % (Math.PI * 2),
    });
  }
}

function addVolumetricGodRay(
  root: THREE.Group,
  list: VolumetricLightItem[],
  disposables: Array<{ dispose: () => void }>,
  tex: THREE.CanvasTexture,
  x: number,
  topY: number,
  z: number,
  radius: number,
  height: number,
  colorHex: number,
  baseOpacity: number,
  dayScale: number,
  nightScale: number,
  tiltX: number,
  tiltZ: number,
): void {
  const geo = new THREE.CylinderGeometry(radius * 0.35, radius, height, 12, 1, true);
  geo.translate(0, -height * 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    map: tex,
    transparent: true,
    opacity: baseOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, topY, z);
  mesh.rotation.set(tiltX, 0, tiltZ);
  root.add(mesh);
  disposables.push(geo, mat);
  list.push({
    mesh,
    baseOpacity,
    dayScale,
    nightScale,
    phase: (x * 0.09 + z * 0.11) % (Math.PI * 2),
  });
}

function addGroundMistLayer(
  root: THREE.Group,
  mistLayers: MistLayerItem[],
  disposables: Array<{ dispose: () => void }>,
  mistTex: THREE.CanvasTexture,
  x: number,
  y: number,
  z: number,
  sizeW: number,
  sizeD: number,
  colorHex: number,
  dayOpacity: number,
  nightOpacity: number,
  speed = 0.25,
): void {
  const geo = new THREE.PlaneGeometry(sizeW, sizeD);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    map: mistTex,
    transparent: true,
    opacity: nightOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  disposables.push(geo, mat);
  mistLayers.push({
    mesh,
    baseX: x,
    baseZ: z,
    driftAmpX: 2.2 + (Math.abs(x) % 3),
    driftAmpZ: 1.8 + (Math.abs(z) % 3),
    speed,
    phase: (x * 0.13 + z * 0.19) % (Math.PI * 2),
    dayOpacity,
    nightOpacity,
  });
}

/**
 * Tactical explosive red hazard barrels placed near intersections and plazas across all 4 biomes.
 * Shoot them or ram them with a car for huge cinematic chain-reaction explosions!
 */
function buildExplosiveBarrels(
  root: THREE.Group,
  materials: SharedVoxelMaterials,
  outBarrels: ExplosiveBarrelItem[],
): void {
  const coords: Array<[number, number]> = [
    // Kuroba Crossing roadside & station approaches
    [5.8, 10.2],
    [-9.5, 10.2],
    [14.2, -3.5],
    [-15.2, 6.2],
    // Aurora City roadside spots (gateway, boulevard, harbor spine, outskirts avenue)
    ...([
      [3.6, -39.0],
      [-6.2, 22.5],
      [6.0, 27.0],
      [68.3, -8.0],
    ] as Array<[number, number]>).map(([lx, lz]): [number, number] => {
      const p = auroraLocalToWorld(lx, lz);
      return [p.x, p.z];
    }),
    // Fungi Forest highway corners & pagoda plaza
    [69.5, 10.2],
    [82.5, 17.5],
    [92.0, 28.0],
    [115.0, 10.2],
    // Kopenhime Snowpeak alpine pass & lodge lot
    [-19.5, -62.5],
    [21.5, -62.5],
    [-32.5, -98.0],
    [22.0, -98.0],
  ];

  coords.forEach(([bx, bz], idx) => {
    const g = new THREE.Group();
    const vb = new VoxelAssembler();
    // Red hazard drum with bright yellow/black warning bands & glowing cap
    vb.boxBottom(0, 0, 0, 0.78, 1.12, 0.78, 0xd42622, 'metal');
    vb.boxBottom(0, 0.42, 0, 0.82, 0.24, 0.82, 0xf2c641);
    vb.boxBottom(0, 0.94, 0, 0.82, 0.12, 0.82, 0x262930, 'metal');
    vb.boxBottom(0, 1.12, 0, 0.26, 0.12, 0.26, 0xff5a36, 'emissive');
    g.add(vb.build(materials));
    g.position.set(bx, 0.02, bz);
    root.add(g);

    outBarrels.push({
      id: `barrel_${idx}`,
      x: bx,
      y: 0.02,
      z: bz,
      mesh: g,
      active: true,
      respawnTimer: 0,
    });
  });
}

/**
 * EAST REGION: FUNGI FOREST — Lush Multi-Layer Bioluminescent Wonderland!
 * Features 42 giant toadstools + 96 instanced glowing understory mini-mushrooms & spore crystal clusters,
 * undulating mossy voxel hills & granite boulders, a glowing emerald-cyan Forest Pond with an arched
 * wooden voxel bridge, a 3-Tier Ancient Mossy Pagoda Temple, a Timber Forest Ranger Watchtower & Outpost
 * Cabin, overhanging glowing spore-vine highway arches, slanting emerald/violet god-ray shafts,
 * and drifting luminescent forest mist — with solid colliders on every building, trunk, and boulder!
 */
function buildFungiForest(
  root: THREE.Group,
  materials: SharedVoxelMaterials,
  colliders: ColliderBox[],
  cameraObstructions: THREE.Object3D[],
  volumetricLights: VolumetricLightItem[],
  mistLayers: MistLayerItem[],
  volTex: THREE.CanvasTexture,
  mistTex: THREE.CanvasTexture,
  disposables: Array<{ dispose: () => void }>,
): void {
  let seed = 8842;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const isClearOfFungiRoadsAndLandmarks = (x: number, z: number, pad = 6.6): boolean => {
    if (Math.abs(z - 13.8) < pad) return false;
    if (Math.abs(z - 56) < pad) return false;
    if (Math.abs(z - 96) < pad) return false;
    if (Math.abs(z - -24) < pad) return false;
    if (Math.abs(x - 76) < pad) return false;
    if (Math.abs(x - 122) < pad) return false;
    // Keep landmarks clear: Pagoda (98, 34), Pond (102, -4), Ranger Tower (59, -5), Outpost Cabin (100, 74)
    if (Math.abs(x - 98) < 10 && Math.abs(z - 34) < 10) return false;
    if (Math.abs(x - 102) < 13 && Math.abs(z - -4) < 11) return false;
    if (Math.abs(x - 59) < 8 && Math.abs(z - -5) < 8) return false;
    if (Math.abs(x - 100) < 9 && Math.abs(z - 74) < 9) return false;
    return true;
  };

  const _d = new THREE.Object3D();
  const _c = new THREE.Color();

  // 1. 42 Towering Bioluminescent Giant Mushrooms (with spotted caps & glowing gills)
  const shrooms: Array<{ x: number; z: number; s: number; capColor: number; glowColor: number }> = [];
  const capPalettes: Array<[number, number]> = [
    [0xc92c38, 0xfff0c4], // Crimson spotted toadstool
    [0x7a38c9, 0xd87aff], // Bioluminescent Violet
    [0x1e8f88, 0x4ef2a1], // Glowing Teal Shroom
    [0x4c8a28, 0xa8ff42], // Spore-Lime Shroom
  ];

  for (let i = 0; i < 120 && shrooms.length < 44; i++) {
    const sx = 52 + rand() * 88;
    const sz = -36 + rand() * 144;
    if (!isClearOfFungiRoadsAndLandmarks(sx, sz, 6.8)) continue;
    const pal = capPalettes[shrooms.length % capPalettes.length];
    shrooms.push({
      x: sx,
      z: sz,
      s: 0.85 + rand() * 1.15,
      capColor: pal[0],
      glowColor: pal[1],
    });
  }

  const stemGeo = new THREE.BoxGeometry(1.5, 5.4, 1.5);
  stemGeo.translate(0, 2.7, 0);
  const gillGeo = new THREE.BoxGeometry(4.4, 0.65, 4.4);
  gillGeo.translate(0, 5.3, 0);
  const capGeo = new THREE.BoxGeometry(5.6, 1.5, 5.6);
  capGeo.translate(0, 6.25, 0);
  const topGeo = new THREE.BoxGeometry(3.4, 0.9, 3.4);
  topGeo.translate(0, 7.35, 0);

  const stemMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.88 });
  const gillMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.85,
    roughness: 0.35,
  });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.76 });

  const n = shrooms.length;
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, n);
  const gills = new THREE.InstancedMesh(gillGeo, gillMat, n);
  const caps = new THREE.InstancedMesh(capGeo, capMat, n);
  const tops = new THREE.InstancedMesh(topGeo, capMat, n);

  shrooms.forEach((m, idx) => {
    _d.position.set(m.x, 0, m.z);
    _d.rotation.set(0, rand() * Math.PI, 0);
    _d.scale.set(m.s, m.s * (0.9 + rand() * 0.45), m.s);
    _d.updateMatrix();
    stems.setMatrixAt(idx, _d.matrix);
    gills.setMatrixAt(idx, _d.matrix);
    caps.setMatrixAt(idx, _d.matrix);
    tops.setMatrixAt(idx, _d.matrix);

    gills.setColorAt(idx, _c.setHex(m.glowColor));
    caps.setColorAt(idx, _c.setHex(m.capColor));
    tops.setColorAt(idx, _c.setHex(m.capColor));

    colliders.push({
      id: `fungi_stem_${idx}`,
      minX: m.x - 0.9 * m.s,
      maxX: m.x + 0.9 * m.s,
      minY: 0,
      maxY: 6.5,
      minZ: m.z - 0.9 * m.s,
      maxZ: m.z + 0.9 * m.s,
      blocksBullets: true,
    });
  });

  [stems, gills, caps, tops].forEach((im) => {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    root.add(im);
  });
  disposables.push(stemGeo, gillGeo, capGeo, topGeo, stemMat, gillMat, capMat);

  // 2. Dense Understory Landscaping: 96 Glowing Mini-Mushrooms, 48 Spore Crystal Clusters & 36 Mossy Boulders
  const miniCoords: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 180 && miniCoords.length < 96; i++) {
    const mx = 48 + rand() * 94;
    const mz = -38 + rand() * 148;
    if (!isClearOfFungiRoadsAndLandmarks(mx, mz, 5.2)) continue;
    const pal = capPalettes[i % capPalettes.length];
    miniCoords.push([mx, mz, 0.55 + rand() * 0.75, pal[1]]);
  }
  const miniStemGeo = new THREE.BoxGeometry(0.32, 0.9, 0.32);
  miniStemGeo.translate(0, 0.45, 0);
  const miniCapGeo = new THREE.BoxGeometry(1.05, 0.42, 1.05);
  miniCapGeo.translate(0, 0.98, 0);
  const miniStemMesh = new THREE.InstancedMesh(miniStemGeo, stemMat, miniCoords.length);
  const miniCapMesh = new THREE.InstancedMesh(miniCapGeo, gillMat, miniCoords.length);
  miniCoords.forEach(([mx, mz, s, hex], idx) => {
    _d.position.set(mx, 0, mz);
    _d.rotation.set(0, rand() * Math.PI, 0);
    _d.scale.set(s, s, s);
    _d.updateMatrix();
    miniStemMesh.setMatrixAt(idx, _d.matrix);
    miniCapMesh.setMatrixAt(idx, _d.matrix);
    miniCapMesh.setColorAt(idx, _c.setHex(hex));
  });
  miniStemMesh.instanceMatrix.needsUpdate = true;
  miniCapMesh.instanceMatrix.needsUpdate = true;
  if (miniCapMesh.instanceColor) miniCapMesh.instanceColor.needsUpdate = true;
  root.add(miniStemMesh, miniCapMesh);
  disposables.push(miniStemGeo, miniCapGeo);

  // Glowing Spore Crystal Clusters + Mossy Boulders (with solid colliders on large rocks)
  const crystalGeo = new THREE.BoxGeometry(0.55, 2.2, 0.55);
  crystalGeo.translate(0, 1.1, 0);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x4ef2a1,
    emissiveIntensity: 1.05,
    roughness: 0.2,
    metalness: 0.35,
  });
  const boulderGeo = new THREE.BoxGeometry(2.6, 1.65, 2.4);
  boulderGeo.translate(0, 0.82, 0);
  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x3e4f46, roughness: 0.92 });
  const mossTopGeo = new THREE.BoxGeometry(2.4, 0.36, 2.2);
  mossTopGeo.translate(0, 1.72, 0);
  const mossTopMat = new THREE.MeshStandardMaterial({ color: 0x3b7844, roughness: 0.9 });

  const crystalPoints: Array<[number, number, number, number]> = [];
  const boulderPoints: Array<[number, number, number]> = [];
  const crystalColors = [0x4ef2a1, 0x38e8ff, 0xd87aff, 0xa8ff42];
  for (let i = 0; i < 120 && crystalPoints.length < 48; i++) {
    const cx = 48 + rand() * 94;
    const cz = -38 + rand() * 148;
    if (!isClearOfFungiRoadsAndLandmarks(cx, cz, 5.5)) continue;
    crystalPoints.push([cx, cz, 0.7 + rand() * 0.85, crystalColors[i % crystalColors.length]]);
  }
  for (let i = 0; i < 90 && boulderPoints.length < 34; i++) {
    const bx = 50 + rand() * 92;
    const bz = -36 + rand() * 144;
    if (!isClearOfFungiRoadsAndLandmarks(bx, bz, 6.2)) continue;
    boulderPoints.push([bx, bz, 0.85 + rand() * 0.95]);
  }

  const crystalIM = new THREE.InstancedMesh(crystalGeo, crystalMat, crystalPoints.length);
  crystalPoints.forEach(([cx, cz, s, hex], idx) => {
    _d.position.set(cx, 0, cz);
    _d.rotation.set((rand() - 0.5) * 0.35, rand() * Math.PI, (rand() - 0.5) * 0.35);
    _d.scale.set(s, s * (0.9 + rand() * 0.6), s);
    _d.updateMatrix();
    crystalIM.setMatrixAt(idx, _d.matrix);
    crystalIM.setColorAt(idx, _c.setHex(hex));
  });
  crystalIM.instanceMatrix.needsUpdate = true;
  if (crystalIM.instanceColor) crystalIM.instanceColor.needsUpdate = true;
  root.add(crystalIM);

  const boulderIM = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderPoints.length);
  const mossIM = new THREE.InstancedMesh(mossTopGeo, mossTopMat, boulderPoints.length);
  boulderPoints.forEach(([bx, bz, s], idx) => {
    _d.position.set(bx, 0, bz);
    _d.rotation.set(0, rand() * Math.PI, 0);
    _d.scale.set(s, s * 0.95, s);
    _d.updateMatrix();
    boulderIM.setMatrixAt(idx, _d.matrix);
    mossIM.setMatrixAt(idx, _d.matrix);
    colliders.push({
      id: `fungi_boulder_${idx}`,
      minX: bx - 1.2 * s,
      maxX: bx + 1.2 * s,
      minY: 0,
      maxY: 2.0 * s,
      minZ: bz - 1.15 * s,
      maxZ: bz + 1.15 * s,
      blocksBullets: true,
    });
  });
  boulderIM.instanceMatrix.needsUpdate = true;
  mossIM.instanceMatrix.needsUpdate = true;
  root.add(boulderIM, mossIM);
  disposables.push(crystalGeo, crystalMat, boulderGeo, boulderMat, mossTopGeo, mossTopMat);

  // 3. Detailed Voxel Landmarks in Fungi Forest (Pagoda Temple, Glowing Pond + Bridge, Watchtower, Outpost Cabin, Vine Arches)
  const landmarksGroup = new THREE.Group();
  const vb = new VoxelAssembler();

  // A. 3-Tier Ancient Mossy Fungi Pagoda Temple at (98, 34)
  vb.boxBottom(98, 0, 34, 12.2, 0.7, 12.2, 0x455248); // Mossy stone foundation
  vb.boxBottom(98, 0.7, 34, 9.2, 4.4, 9.2, 0x4f3524); // Main temple timber chamber
  vb.boxBottom(98, 1.5, 38.7, 4.2, 2.4, 0.22, 0xa8ff42, 'emissive'); // Glowing spore shrine doors
  vb.boxBottom(98, 1.5, 29.3, 4.2, 2.4, 0.22, 0xa8ff42, 'emissive');
  // Tier 1 curved purple-moss roof
  vb.boxBottom(98, 5.1, 34, 13.0, 0.7, 13.0, 0x5c3296);
  vb.boxBottom(98, 5.8, 34, 10.6, 0.5, 10.6, 0x3b7844); // moss blanket
  // Tier 2 pagoda chamber & roof
  vb.boxBottom(98, 6.3, 34, 6.8, 3.2, 6.8, 0x593c28);
  vb.boxBottom(98, 7.1, 37.5, 3.2, 1.5, 0.2, 0x4ef2a1, 'emissive');
  vb.boxBottom(98, 9.5, 34, 9.6, 0.65, 9.6, 0x6f3ab5);
  // Tier 3 spire & glowing lotus crystal
  vb.boxBottom(98, 10.15, 34, 4.4, 2.2, 4.4, 0x4a3120);
  vb.boxBottom(98, 12.35, 34, 6.2, 0.6, 6.2, 0x8647d6);
  vb.boxBottom(98, 12.95, 34, 1.4, 2.6, 1.4, 0xa8ff42, 'emissive');
  colliders.push({
    id: 'fungi_pagoda',
    minX: 98 - 5.2,
    maxX: 98 + 5.2,
    minY: 0,
    maxY: 14,
    minZ: 34 - 5.2,
    maxZ: 34 + 5.2,
    blocksBullets: true,
  });

  // B. Glowing Bioluminescent Emerald-Cyan Forest Pond & Arched Wooden Footbridge at (102, -4)
  vb.boxBottom(102, 0.02, -4, 18.5, 0.32, 13.5, 0x3b4d44); // rocky mossy shoreline
  vb.boxBottom(102, 0.14, -4, 15.8, 0.24, 10.8, 0x26e8c8, 'emissive'); // glowing turquoise pond!
  // Stepping lily-pads & glowing pond mushrooms
  for (const [lx, lz] of [[97, -6], [106, -2], [100, -1], [107, -6]] as Array<[number, number]>) {
    vb.boxBottom(lx, 0.38, lz, 1.5, 0.12, 1.5, 0x3b8c48);
    vb.boxBottom(lx, 0.5, lz, 0.55, 0.45, 0.55, 0xd87aff, 'emissive');
  }
  // Arched Wooden Japanese Footbridge spanning pond along Z
  vb.boxBottom(102, 0.35, -9.8, 3.2, 0.35, 2.8, 0x6b4226);
  vb.boxBottom(102, 0.72, -4.0, 3.2, 0.38, 9.2, 0x7d4e2d);
  vb.boxBottom(102, 0.35, 1.8, 3.2, 0.35, 2.8, 0x6b4226);
  // Red bridge railings & glowing lantern posts
  for (const rx of [100.5, 103.5]) {
    vb.boxBottom(rx, 1.1, -4.0, 0.22, 0.95, 9.2, 0xb8352a);
    vb.boxBottom(rx, 2.05, -8.2, 0.45, 0.45, 0.45, 0xffe082, 'emissive');
    vb.boxBottom(rx, 2.05, 0.2, 0.45, 0.45, 0.45, 0xffe082, 'emissive');
  }

  // C. Timber Forest Ranger Watchtower at (59, -5)
  for (const px of [-2.4, 2.4]) {
    for (const pz of [-2.4, 2.4]) {
      vb.boxBottom(59 + px, 0, -5 + pz, 0.55, 7.6, 0.55, 0x4f321e);
    }
  }
  vb.boxBottom(59, 0, -5, 4.4, 3.4, 4.4, 0x5c3c24); // lower supply shed
  vb.boxBottom(59, 7.6, -5, 6.8, 0.45, 6.8, 0x6e472b); // lookout deck
  vb.boxBottom(59, 8.05, -5, 5.2, 2.8, 5.2, 0x4f321e); // watch cabin
  vb.boxBottom(59, 8.8, -2.3, 3.8, 1.3, 0.2, 0xffd27a, 'emissive'); // warm glowing lookout windows
  vb.boxBottom(59, 8.8, -7.7, 3.8, 1.3, 0.2, 0xffd27a, 'emissive');
  vb.boxBottom(59, 10.85, -5, 7.2, 0.7, 7.2, 0x2d4a36); // mossy hip roof
  vb.boxBottom(59, 11.55, -5, 4.4, 0.65, 4.4, 0x3b6346);
  colliders.push({
    id: 'fungi_watchtower',
    minX: 59 - 2.9,
    maxX: 59 + 2.9,
    minY: 0,
    maxY: 12,
    minZ: -5 - 2.9,
    maxZ: -5 + 2.9,
    blocksBullets: true,
  });

  // D. Wooden Mycologist Outpost Cabin at (100, 74)
  vb.boxBottom(100, 0, 74, 10.4, 4.2, 7.6, 0x5e3b23);
  vb.boxBottom(100, 1.2, 77.9, 6.8, 1.8, 0.2, 0xffcf70, 'emissive');
  vb.boxBottom(100, 1.2, 70.1, 6.8, 1.8, 0.2, 0x4ef2a1, 'emissive');
  for (let t = 0; t < 4; t++) {
    vb.boxBottom(100, 4.2 + t * 0.55, 74, 11.8 - t * 1.6, 0.58, 9.0 - t * 1.2, t % 2 === 0 ? 0x2d543a : 0x3d6e4c);
  }
  colliders.push({
    id: 'fungi_cabin',
    minX: 100 - 5.4,
    maxX: 100 + 5.4,
    minY: 0,
    maxY: 7,
    minZ: 74 - 4.0,
    maxZ: 74 + 4.0,
    blocksBullets: true,
  });

  // E. Overhanging Glowing Spore-Vine Highway Arches & Timber Lanterns along Fungi Highway
  for (const ax of [62, 98, 132]) {
    vb.boxBottom(ax, 0, 9.2, 0.9, 6.8, 0.9, 0x4c3424);
    vb.boxBottom(ax, 0, 18.4, 0.9, 6.8, 0.9, 0x4c3424);
    vb.boxBottom(ax, 6.6, 13.8, 1.4, 1.1, 10.6, 0x2e5e38);
    vb.boxBottom(ax, 6.1, 11.2, 0.6, 0.9, 0.6, 0xa8ff42, 'emissive');
    vb.boxBottom(ax, 6.1, 16.4, 0.6, 0.9, 0.6, 0xd87aff, 'emissive');
    colliders.push({ id: `fungi_arch_n_${ax}`, minX: ax - 0.55, maxX: ax + 0.55, minY: 0, maxY: 7, minZ: 8.65, maxZ: 9.75, blocksBullets: true });
    colliders.push({ id: `fungi_arch_s_${ax}`, minX: ax - 0.55, maxX: ax + 0.55, minY: 0, maxY: 7, minZ: 17.85, maxZ: 18.95, blocksBullets: true });
  }

  for (let lx = 56; lx <= 130; lx += 18) {
    for (const lz of [9.6, 18.0]) {
      vb.boxBottom(lx, 0, lz, 0.3, 3.8, 0.3, 0x4c3424);
      const glow = lx % 36 === 0 ? 0xd87aff : 0xa8ff42;
      vb.boxBottom(lx, 3.8, lz, 0.92, 0.55, 0.92, glow, 'emissive');
      addVolumetricCone(root, volumetricLights, disposables, volTex, lx, 3.8, lz, 2.0, 4.0, glow, 0.24, 0.22, 1.0);
    }
  }

  landmarksGroup.add(vb.build(materials));
  cameraObstructions.push(landmarksGroup);
  root.add(landmarksGroup);

  // 4. Dramatic Bioluminescent Forest God-Rays & Low Drifting Spore Mist!
  addVolumetricGodRay(root, volumetricLights, disposables, volTex, 98, 26, 34, 6.2, 26, 0xa8ff42, 0.18, 0.55, 1.0, 0.18, -0.2);
  addVolumetricGodRay(root, volumetricLights, disposables, volTex, 102, 24, -4, 5.8, 24, 0x38f2d8, 0.18, 0.55, 1.0, 0.22, 0.15);
  addVolumetricGodRay(root, volumetricLights, disposables, volTex, 68, 25, 42, 5.4, 25, 0xd87aff, 0.16, 0.45, 1.0, -0.15, -0.22);
  addVolumetricGodRay(root, volumetricLights, disposables, volTex, 124, 26, 68, 5.6, 26, 0x4ef2a1, 0.16, 0.45, 1.0, 0.16, 0.18);

  addGroundMistLayer(root, mistLayers, disposables, mistTex, 96, 0.52, 24, 56, 48, 0x62ff9e, 0.14, 0.28, 0.24);
  addGroundMistLayer(root, mistLayers, disposables, mistTex, 104, 0.62, -4, 42, 34, 0x38f2ff, 0.16, 0.3, 0.3);
  addGroundMistLayer(root, mistLayers, disposables, mistTex, 86, 0.48, 72, 52, 42, 0xb870ff, 0.12, 0.24, 0.2);
}

/**
 * NORTH REGION: KOPENHIME SNOWPEAK — Monumental Stepped Voxel Snowy Mountains (24–46m tall!),
 * Alpine Ryokan Village (Main Lodge, 2-Story Snow Ryokan Inn, Ski Chalet, 4 Alpine Cabins,
 * Shinto Summit Shrine Pavilion), Frozen Ice-Blue Alpine Lake with Pier, Steaming Onsen,
 * 72 Snow-Laden Pines, Snowbanks & Granite Boulders, Warm Volumetric Lamps, Alpine God-Rays,
 * and Drifting Mountain Mist!
 */
function buildKopenhimeSnowpeak(
  root: THREE.Group,
  materials: SharedVoxelMaterials,
  maxAnisotropy: number,
  colliders: ColliderBox[],
  cameraObstructions: THREE.Object3D[],
  volumetricLights: VolumetricLightItem[],
  mistLayers: MistLayerItem[],
  volTex: THREE.CanvasTexture,
  mistTex: THREE.CanvasTexture,
  disposables: Array<{ dispose: () => void }>,
): void {
  let seed = 9917;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const TIMBER = 0x523420;
  const DARK_WOOD = 0x3a2416;
  const SNOW = 0xf2f7fc;
  const SNOW_SHADE = 0xd6e5f2;
  const ICE_BLUE = 0x7fd8ff;
  const ROCK_DARK = 0x45505e;
  const ROCK_MID = 0x5b6778;
  const WARM = 0xffcf70;
  const ONSEN_WATER = 0x4ce8ff;

  const villageGroup = new THREE.Group();
  const vb = new VoxelAssembler();

  const registerBox = (id: string, cx: number, cz: number, w: number, h: number, d: number) => {
    colliders.push({
      id,
      minX: cx - w * 0.5,
      maxX: cx + w * 0.5,
      minY: 0,
      maxY: h,
      minZ: cz - d * 0.5,
      maxZ: cz + d * 0.5,
      blocksBullets: true,
    });
  };

  // 1. TOWERING STEPPED VOXEL SNOWY MOUNTAIN RANGE (24m–46m tall!) framing the entire northern horizon & passes
  const mountainPeaks: Array<{ x: number; z: number; baseW: number; baseD: number; height: number; registerCliff: boolean }> = [
    // Grand central Mt. Kopenhime Summit & Twin Flanks directly behind the Alpine Village
    { x: 0, z: -158, baseW: 48, baseD: 28, height: 46, registerCliff: true },
    { x: -46, z: -156, baseW: 40, baseD: 26, height: 38, registerCliff: true },
    { x: 48, z: -156, baseW: 42, baseD: 26, height: 40, registerCliff: true },
    { x: -94, z: -152, baseW: 38, baseD: 28, height: 34, registerCliff: true },
    { x: 96, z: -152, baseW: 38, baseD: 28, height: 36, registerCliff: true },
    { x: -138, z: -146, baseW: 32, baseD: 30, height: 30, registerCliff: true },
    { x: 138, z: -146, baseW: 32, baseD: 30, height: 32, registerCliff: true },
    // Dramatic flanking alpine cliff crags inside the NW/NE corners (off all roads!)
    { x: -146, z: -116, baseW: 22, baseD: 24, height: 24, registerCliff: true },
    { x: 146, z: -116, baseW: 22, baseD: 24, height: 26, registerCliff: true },
    { x: -146, z: -84, baseW: 20, baseD: 22, height: 21, registerCliff: true },
    { x: 146, z: -84, baseW: 20, baseD: 22, height: 22, registerCliff: true },
    // Mid-valley sculpted rocky snow knoll overlooking the lodge pass
    { x: -120, z: -84, baseW: 16, baseD: 16, height: 15, registerCliff: true },
  ];

  const mtnVb = new VoxelAssembler();
  mountainPeaks.forEach((pk, idx) => {
    const tiers = Math.max(7, Math.round(pk.height / 3.4));
    const tierH = pk.height / tiers;
    for (let t = 0; t < tiers; t++) {
      const frac = t / tiers;
      const taper = 1 - frac * 0.86;
      const w = Math.max(3.2, pk.baseW * taper);
      const d = Math.max(3.2, pk.baseD * taper);
      // Slight organic peak ridge offset per tier
      const offX = Math.sin(idx * 2.1 + t * 0.55) * (1 - frac) * 1.4;
      const offZ = Math.cos(idx * 1.7 + t * 0.45) * (1 - frac) * 1.0;
      const isSnowZone = frac >= 0.48;
      const color = isSnowZone
        ? t % 2 === 0
          ? SNOW
          : SNOW_SHADE
        : t % 2 === 0
          ? ROCK_DARK
          : ROCK_MID;
      mtnVb.boxBottom(pk.x + offX, t * tierH, pk.z + offZ, w, tierH + 0.15, d, color);

      // Snow ledges draping onto rocky lower shoulders for ultra-crisp MagicaVoxel contrast!
      if (!isSnowZone && t >= 1) {
        mtnVb.boxBottom(pk.x + offX, (t + 1) * tierH - 0.45, pk.z + offZ, w + 0.4, 0.55, d + 0.4, SNOW_SHADE);
      }
    }
    // Secondary jagged side shoulder peak for dramatic silhouette
    const subH = pk.height * 0.58;
    const subX = pk.x + (idx % 2 === 0 ? pk.baseW * 0.28 : -pk.baseW * 0.28);
    const subZ = pk.z + 3.5;
    for (let st = 0; st < 5; st++) {
      const f = st / 5;
      mtnVb.boxBottom(
        subX,
        st * (subH / 5),
        subZ,
        pk.baseW * 0.44 * (1 - f * 0.78),
        subH / 5 + 0.1,
        pk.baseD * 0.44 * (1 - f * 0.78),
        f > 0.45 ? SNOW : ROCK_MID,
      );
    }
    if (pk.registerCliff) {
      registerBox(`snow_mountain_${idx}`, pk.x, pk.z, pk.baseW * 0.92, pk.height, pk.baseD * 0.92);
    }
  });
  const mountainMesh = mtnVb.build(materials);
  cameraObstructions.push(mountainMesh);
  root.add(mountainMesh);

  // 2. Kopenhime Main Alpine Lodge & Cable-Car Station (x = 2, z = -85)
  vb.boxBottom(2, 0, -85, 16.0, 0.5, 10.5, ROCK_MID); // Stone alpine base
  vb.boxBottom(2, 0.5, -85, 14.8, 5.4, 8.6, TIMBER);
  vb.boxBottom(2, 1.3, -80.55, 10.8, 2.3, 0.25, WARM, 'emissive');
  vb.boxBottom(2, 1.3, -89.45, 10.8, 2.3, 0.25, WARM, 'emissive');
  // Timber balcony & stone chimney
  vb.boxBottom(2, 3.6, -79.8, 12.2, 0.36, 1.8, DARK_WOOD);
  vb.boxBottom(7.8, 0.5, -88.2, 1.8, 9.8, 1.8, ROCK_DARK);
  vb.boxBottom(7.8, 10.3, -88.2, 2.1, 0.4, 2.1, SNOW);
  for (let tier = 0; tier < 6; tier++) {
    vb.boxBottom(2, 5.9 + tier * 0.48, -85, 16.6 - tier * 1.45, 0.52, 10.8 - tier * 1.15, tier % 2 === 0 ? SNOW : SNOW_SHADE);
  }
  registerBox('snowpeak_lodge', 2, -85, 15.6, 9.0, 9.6);

  const lodgeTex = createShopSignTexture('雪山荘 · SNOWPEAK', '#1d3247', '#ffe8a8', true, maxAnisotropy);
  const lodgeMat = new THREE.MeshStandardMaterial({
    map: lodgeTex,
    emissive: 0xffd27a,
    emissiveMap: lodgeTex,
    emissiveIntensity: 0.95,
  });
  const lodgeSignGeo = new THREE.BoxGeometry(6.8, 1.35, 0.25);
  const lodgeSign = new THREE.Mesh(lodgeSignGeo, lodgeMat);
  lodgeSign.position.set(2, 4.7, -80.4);
  villageGroup.add(lodgeSign);
  disposables.push(lodgeTex, lodgeMat, lodgeSignGeo);

  // 3. Traditional 2-Story Snowpeak Ryokan Inn (x = -46, z = -119)
  vb.boxBottom(-46, 0, -119, 15.6, 0.45, 11.4, ROCK_DARK);
  vb.boxBottom(-46, 0.45, -119, 14.0, 4.0, 9.4, DARK_WOOD);
  vb.boxBottom(-46, 1.2, -114.2, 10.2, 2.0, 0.22, WARM, 'emissive');
  vb.boxBottom(-46, 4.45, -119, 15.8, 0.6, 11.2, SNOW);
  vb.boxBottom(-46, 5.05, -119, 11.0, 3.2, 7.6, TIMBER);
  vb.boxBottom(-46, 5.8, -115.1, 7.8, 1.5, 0.2, 0xffe49e, 'emissive');
  for (let t = 0; t < 5; t++) {
    vb.boxBottom(-46, 8.25 + t * 0.45, -119, 13.0 - t * 1.4, 0.48, 9.6 - t * 1.1, t % 2 === 0 ? SNOW : SNOW_SHADE);
  }
  registerBox('snowpeak_ryokan', -46, -119, 14.8, 10.5, 10.4);

  // 4. Timber Ski Chalet & Patrol Garage (x = 52, z = -119)
  vb.boxBottom(52, 0, -119, 13.5, 4.8, 9.0, TIMBER);
  vb.boxBottom(52, 1.2, -114.4, 9.2, 2.2, 0.22, 0x9be4ff, 'emissive');
  vb.boxBottom(52, 1.2, -123.6, 9.2, 2.2, 0.22, WARM, 'emissive');
  for (let t = 0; t < 5; t++) {
    vb.boxBottom(52, 4.8 + t * 0.5, -119, 15.2 - t * 1.5, 0.55, 10.8 - t * 1.2, t % 2 === 0 ? SNOW : SNOW_SHADE);
  }
  registerBox('snowpeak_chalet', 52, -119, 14.2, 8.0, 9.8);

  // 5. Four Cozy Snow-Roofed Alpine Cabins tucked neatly between alpine roads!
  const cabins: Array<[number, number]> = [
    [-86, -85],
    [98, -85],
    [-86, -119],
    [98, -119],
  ];
  cabins.forEach(([cx, cz], idx) => {
    vb.boxBottom(cx, 0, cz, 9.2, 3.8, 7.2, TIMBER);
    vb.boxBottom(cx, 1.1, cz + 3.65, 5.4, 1.5, 0.2, WARM, 'emissive');
    vb.boxBottom(cx, 1.1, cz - 3.65, 5.4, 1.5, 0.2, WARM, 'emissive');
    vb.boxBottom(cx + 3.4, 0.2, cz - 2.6, 1.2, 6.2, 1.2, ROCK_DARK);
    for (let t = 0; t < 4; t++) {
      vb.boxBottom(cx, 3.8 + t * 0.48, cz, 10.6 - t * 1.5, 0.52, 8.6 - t * 1.2, t % 2 === 0 ? SNOW : SNOW_SHADE);
    }
    registerBox(`snow_cabin_${idx}`, cx, cz, 9.8, 6.5, 7.8);
  });

  // 6. Frozen Ice-Blue Alpine Lake & Wooden Pier (x = 0, z = -119)
  vb.boxBottom(0, 0.02, -119, 28.0, 0.28, 16.5, SNOW_SHADE);
  vb.boxBottom(0, 0.14, -119, 24.4, 0.22, 13.4, ICE_BLUE, 'emissive');
  // Wooden pier jutting out onto frozen lake + lantern
  vb.boxBottom(0, 0.36, -112.4, 2.8, 0.24, 5.2, DARK_WOOD);
  vb.boxBottom(-1.2, 0.6, -114.6, 0.28, 2.2, 0.28, DARK_WOOD);
  vb.boxBottom(-1.2, 2.8, -114.6, 0.55, 0.55, 0.55, WARM, 'emissive');

  // 7. Steaming Blue-Water Alpine Onsen Pool (x = -48, z = -85) + Glowing Stone Snow Lanterns
  vb.boxBottom(-48, 0, -85, 13.4, 0.68, 10.8, 0x5c6670);
  vb.boxBottom(-48, 0.36, -85, 11.4, 0.38, 8.8, ONSEN_WATER, 'emissive');
  for (const lx of [-55.0, -41.0]) {
    for (const lz of [-90.6, -79.4]) {
      vb.boxBottom(lx, 0, lz, 0.68, 1.8, 0.68, 0x737d87);
      vb.boxBottom(lx, 1.8, lz, 0.54, 0.58, 0.54, WARM, 'emissive');
      vb.boxBottom(lx, 2.38, lz, 0.98, 0.36, 0.98, SNOW);
    }
  }

  // 8. Snowpeak Vermilion Summit Torii Gate + Shinto Snow Shrine Pavilion (x = 52, z = -85)
  vb.boxBottom(48.5, 0, -80.5, 0.65, 6.2, 0.65, 0xc93528);
  vb.boxBottom(55.5, 0, -80.5, 0.65, 6.2, 0.65, 0xc93528);
  vb.boxBottom(52, 5.2, -80.5, 8.8, 0.5, 0.55, 0xc93528);
  vb.boxBottom(52, 6.1, -80.5, 9.8, 0.55, 0.72, 0xc93528);
  vb.boxBottom(52, 6.65, -80.5, 10.0, 0.35, 0.8, SNOW);
  registerBox('snow_torii_l', 48.5, -80.5, 0.9, 6.2, 0.9);
  registerBox('snow_torii_r', 55.5, -80.5, 0.9, 6.2, 0.9);
  // Shinto Shrine Pavilion behind torii
  vb.boxBottom(52, 0, -88.5, 9.6, 0.55, 7.6, ROCK_MID);
  vb.boxBottom(52, 0.55, -88.5, 7.6, 4.0, 5.8, 0xb83528);
  vb.boxBottom(52, 1.4, -85.5, 4.4, 2.0, 0.22, WARM, 'emissive');
  for (let t = 0; t < 4; t++) {
    vb.boxBottom(52, 4.55 + t * 0.45, -88.5, 10.6 - t * 1.4, 0.48, 8.6 - t * 1.1, t % 2 === 0 ? SNOW : SNOW_SHADE);
  }
  registerBox('snow_shrine', 52, -88.5, 8.4, 6.8, 6.6);

  // 9. Cozy Voxel Snowmen & Warm Roadside Alpine Snow Lamps with Volumetric Light Cones!
  for (const [sx, sz] of [[-8.5, -79.5], [-36.5, -112.5], [42.5, -112.5]] as Array<[number, number]>) {
    vb.boxBottom(sx, 0, sz, 1.15, 1.0, 1.15, SNOW);
    vb.boxBottom(sx, 1.0, sz, 0.85, 0.82, 0.85, SNOW);
    vb.boxBottom(sx, 1.82, sz, 0.62, 0.6, 0.62, SNOW);
    vb.boxBottom(sx, 1.72, sz, 0.88, 0.16, 0.88, 0xd43228); // red scarf
    vb.boxBottom(sx, 2.05, sz + 0.34, 0.14, 0.14, 0.32, 0xff7b29); // carrot nose
  }

  for (let lx = -114; lx <= 114; lx += 22) {
    for (const lz of [-61.8, -99.8]) {
      vb.boxBottom(lx, 0, lz, 0.28, 4.5, 0.28, 0x3b444f, 'metal');
      vb.boxBottom(lx, 4.4, lz - 0.55, 0.48, 0.36, 0.48, WARM, 'emissive');
      addVolumetricCone(root, volumetricLights, disposables, volTex, lx, 4.4, lz - 0.55, 2.1, 4.6, 0xffd27a, 0.24, 0.18, 1.0);
    }
  }

  villageGroup.add(vb.build(materials));
  cameraObstructions.push(villageGroup);
  root.add(villageGroup);

  // 10. Instanced Snow-Laden Alpine Pine Forest (72 trees) + 46 Snowdrifts & Alpine Granite Boulders!
  const isClearOfSnowRoadsAndBuildings = (px: number, pz: number, pad = 6.6): boolean => {
    if (Math.abs(pz - -66) < pad) return false;
    if (Math.abs(pz - -104) < pad) return false;
    if (Math.abs(pz - -134) < pad) return false;
    if (Math.abs(px - -26) < pad) return false;
    if (Math.abs(px - 28) < pad) return false;
    if (Math.abs(px - -68) < pad) return false;
    if (Math.abs(px - -102) < pad) return false;
    if (Math.abs(px - 76) < pad) return false;
    if (Math.abs(px - 122) < pad) return false;
    // Keep landmarks clear
    if (Math.abs(px - 2) < 12 && Math.abs(pz - -85) < 9) return false;
    if (Math.abs(px - -48) < 11 && Math.abs(pz - -85) < 9) return false;
    if (Math.abs(px - 52) < 10 && Math.abs(pz - -85) < 10) return false;
    if (Math.abs(px - -46) < 11 && Math.abs(pz - -119) < 9) return false;
    if (Math.abs(px - 52) < 11 && Math.abs(pz - -119) < 9) return false;
    if (Math.abs(px - 0) < 17 && Math.abs(pz - -119) < 11) return false;
    if (Math.abs(px - -86) < 8 && (Math.abs(pz - -85) < 7 || Math.abs(pz - -119) < 7)) return false;
    if (Math.abs(px - 98) < 8 && (Math.abs(pz - -85) < 7 || Math.abs(pz - -119) < 7)) return false;
    if (pz < -138) return false;
    return true;
  };

  const pineCoords: Array<[number, number, number]> = [];
  for (let i = 0; i < 160 && pineCoords.length < 72; i++) {
    const px = -128 + rand() * 256;
    const pz = -136 + rand() * 84;
    if (!isClearOfSnowRoadsAndBuildings(px, pz, 6.2)) continue;
    pineCoords.push([px, pz, 0.9 + rand() * 0.95]);
  }

  const pTrunkGeo = new THREE.BoxGeometry(0.6, 2.2, 0.6);
  pTrunkGeo.translate(0, 1.1, 0);
  const pTier1Geo = new THREE.BoxGeometry(3.2, 1.6, 3.2);
  pTier1Geo.translate(0, 2.4, 0);
  const pTier2Geo = new THREE.BoxGeometry(2.3, 1.5, 2.3);
  pTier2Geo.translate(0, 3.8, 0);
  const pSnowCapGeo = new THREE.BoxGeometry(1.5, 1.35, 1.5);
  pSnowCapGeo.translate(0, 5.15, 0);

  const pTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a311e, roughness: 0.92 });
  const pPineMat = new THREE.MeshStandardMaterial({ color: 0x264c3e, roughness: 0.88 });
  const pSnowMat = new THREE.MeshStandardMaterial({ color: 0xf0f6fc, roughness: 0.78 });

  const pn = pineCoords.length;
  const pTrunks = new THREE.InstancedMesh(pTrunkGeo, pTrunkMat, pn);
  const pT1 = new THREE.InstancedMesh(pTier1Geo, pPineMat, pn);
  const pT2 = new THREE.InstancedMesh(pTier2Geo, pPineMat, pn);
  const pCaps = new THREE.InstancedMesh(pSnowCapGeo, pSnowMat, pn);

  const _d = new THREE.Object3D();
  pineCoords.forEach(([px, pz, s], idx) => {
    _d.position.set(px, 0, pz);
    _d.rotation.set(0, rand() * Math.PI, 0);
    _d.scale.set(s, s * (0.95 + rand() * 0.4), s);
    _d.updateMatrix();
    pTrunks.setMatrixAt(idx, _d.matrix);
    pT1.setMatrixAt(idx, _d.matrix);
    pT2.setMatrixAt(idx, _d.matrix);
    pCaps.setMatrixAt(idx, _d.matrix);

    colliders.push({
      id: `snow_pine_${idx}`,
      minX: px - 0.65 * s,
      maxX: px + 0.65 * s,
      minY: 0,
      maxY: 5.8,
      minZ: pz - 0.65 * s,
      maxZ: pz + 0.65 * s,
      blocksBullets: true,
    });
  });

  [pTrunks, pT1, pT2, pCaps].forEach((im) => {
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    root.add(im);
  });
  disposables.push(pTrunkGeo, pTier1Geo, pTier2Geo, pSnowCapGeo, pTrunkMat, pPineMat, pSnowMat);

  // Instanced Granite Alpine Boulders + Sculpted Snowdrifts
  const sRockGeo = new THREE.BoxGeometry(2.6, 1.8, 2.4);
  sRockGeo.translate(0, 0.9, 0);
  const sRockMat = new THREE.MeshStandardMaterial({ color: 0x525e6e, roughness: 0.92 });
  const sCapGeo = new THREE.BoxGeometry(2.5, 0.42, 2.3);
  sCapGeo.translate(0, 1.92, 0);

  const rockPoints: Array<[number, number, number]> = [];
  for (let i = 0; i < 100 && rockPoints.length < 40; i++) {
    const rx = -132 + rand() * 264;
    const rz = -136 + rand() * 82;
    if (!isClearOfSnowRoadsAndBuildings(rx, rz, 6.4)) continue;
    rockPoints.push([rx, rz, 0.8 + rand() * 1.1]);
  }
  const rockIM = new THREE.InstancedMesh(sRockGeo, sRockMat, rockPoints.length);
  const rockSnowIM = new THREE.InstancedMesh(sCapGeo, pSnowMat, rockPoints.length);
  rockPoints.forEach(([rx, rz, s], idx) => {
    _d.position.set(rx, 0, rz);
    _d.rotation.set(0, rand() * Math.PI, 0);
    _d.scale.set(s, s * 0.9, s);
    _d.updateMatrix();
    rockIM.setMatrixAt(idx, _d.matrix);
    rockSnowIM.setMatrixAt(idx, _d.matrix);
    colliders.push({
      id: `snow_boulder_${idx}`,
      minX: rx - 1.2 * s,
      maxX: rx + 1.2 * s,
      minY: 0,
      maxY: 2.2 * s,
      minZ: rz - 1.15 * s,
      maxZ: rz + 1.15 * s,
      blocksBullets: true,
    });
  });
  rockIM.instanceMatrix.needsUpdate = true;
  rockSnowIM.instanceMatrix.needsUpdate = true;
  root.add(rockIM, rockSnowIM);
  disposables.push(sRockGeo, sRockMat, sCapGeo);

  // 11. Alpine Sun/Moon Volumetric God-Rays slanting over Snowy Peaks + Steaming Onsen & Freezing Mountain Mist!
  addVolumetricGodRay(root, volumetricLights, disposables, volTex, 0, 36, -118, 8.2, 36, 0xbde8ff, 0.17, 0.85, 0.8, 0.24, 0.16);
  addVolumetricGodRay(root, volumetricLights, disposables, volTex, -48, 28, -85, 6.5, 28, 0x9be4ff, 0.16, 0.75, 0.9, 0.2, -0.18);
  addVolumetricGodRay(root, volumetricLights, disposables, volTex, 52, 30, -88, 6.5, 30, 0xffe4b8, 0.16, 0.85, 0.75, 0.22, 0.2);

  addGroundMistLayer(root, mistLayers, disposables, mistTex, -48, 1.05, -85, 28, 24, 0xdbf4ff, 0.24, 0.34, 0.32); // Steaming Onsen mist!
  addGroundMistLayer(root, mistLayers, disposables, mistTex, 0, 0.65, -119, 46, 32, 0xcceeff, 0.16, 0.26, 0.22); // Frozen lake mist
  addGroundMistLayer(root, mistLayers, disposables, mistTex, -30, 2.4, -142, 74, 34, 0xe6f4ff, 0.2, 0.28, 0.18); // Mountain slope clouds
  addGroundMistLayer(root, mistLayers, disposables, mistTex, 48, 2.6, -142, 74, 34, 0xe6f4ff, 0.2, 0.28, 0.16);
}
