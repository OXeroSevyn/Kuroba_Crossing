import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { gameAudio } from './audio';
import {
  computeLoadoutModifiers,
  DEFAULT_LOADOUT,
  loadSavedLoadout,
  saveLoadout,
  type LoadoutCombatModifiers,
} from './customization';
import {
  buildDrivableVehicleRig,
  buildEnemyRig,
  buildHeroRig,
  type DrivableVehicleRig,
  type EnemyMeshBundle,
  type HeroRig,
} from './entities';
import {
  ARENA_HALF_EXTENT,
  buildWavePlan,
  calculateExplosionDamage,
  calculateKillScore,
  calculateVehicleCrashDamage,
  calculateVehicleImpactDamage,
  clamp,
  computeReloadPose,
  createInitialPlayerState,
  createInitialWeaponState,
  dampAngle,
  detectWorldZone,
  ENEMY_STATS,
  getEffectiveMagSize,
  normalizeAngle,
  PLAYER_HEIGHT,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  pointHitsBox,
  resolveCylinderWorldCollision,
  resolvePlayerVehicleCollision,
  resolveVehiclePairCollision,
  stepPlayerKinematics,
  stepVehicleKinematics,
  stepWeaponState,
  TOTAL_WAVES,
  WEAPON_ORDER,
  WEAPONS,
  WORLD_ZONE_INFO,
  ZOMBIE_LABELS,
} from './rules';
import type {
  ColliderBox,
  EnemyArchetype,
  GameMode,
  GamePhase,
  HudSnapshot,
  LoadoutConfig,
  PlayerKinematicsState,
  RunSummary,
  TimeOfDay,
  VehicleKind,
  VehicleKinematicsState,
  WavePlan,
  WeaponId,
  WeaponRuntimeState,
  WorldZoneId,
} from './types';
import { multiplayer, type RemotePlayerState, type PlayerTeam, type KillFeedEntry } from './multiplayer';
import { createSharedVoxelMaterials, type SharedVoxelMaterials } from './voxelBuilder';
import { buildKurobaWorld, type BuiltWorld, type ExplosiveBarrelItem } from './worldBuilder';

const BEST_SCORE_STORAGE_KEY = 'kuroba_crossing_best_score_v1';
const MAX_PARTICLES = 480;
const MAX_SMOKE = 96;
const MAX_BLOOD_DECALS = 64;
const MAX_ATTACK_TOKENS = 3;

interface ActiveProjectile {
  active: boolean;
  fromPlayer: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  piercing: boolean;
  hitIds: Set<number>;
  life: number;
  maxLife: number;
  color: number;
  hitstopSec: number;
  mesh: THREE.Mesh;
}

type EnemyAIState = 'move' | 'telegraph' | 'attack' | 'recover' | 'ko';

interface ActiveEnemy {
  id: number;
  archetype: EnemyArchetype;
  rig: EnemyMeshBundle;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  radius: number;
  height: number;
  speed: number;
  damage: number;
  scoreValue: number;
  aiState: EnemyAIState;
  stateTimer: number;
  attackCooldown: number;
  hasToken: boolean;
  hitFlashTimer: number;
  strafeDir: number;
  walkPhase: number;
  chargeDirX: number;
  chargeDirZ: number;
  koTimer: number;
  koFallDirX: number;
  koFallDirZ: number;
  sightLine: THREE.Line | null;
}

interface ActivePickup {
  active: boolean;
  kind: 'heal' | 'overdrive';
  x: number;
  y: number;
  z: number;
  life: number;
  bobPhase: number;
  mesh: THREE.Mesh;
}

interface ActiveVehicle {
  state: VehicleKinematicsState;
  rig: DrivableVehicleRig;
  ramCooldowns: Map<number, number>;
  smokeAccum: number;
  damageSmokeAccum: number;
}

interface ExplosionEffect {
  active: boolean;
  age: number;
  duration: number;
  maxRadius: number;
  ring: THREE.Mesh;
  core: THREE.Mesh;
}

interface RemotePlayerEntity {
  id: string;
  rig: HeroRig;
  badge: THREE.Sprite;
  state: RemotePlayerState;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  walkPhase: number;
  drivenVehicle?: ActiveVehicle | null;
  fallbackVehicleRig?: DrivableVehicleRig | null;
}

interface VoxelParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  vRot: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  life: number;
  maxLife: number;
  gravity: number;
  ambientPollen: boolean;
  isSmoke: boolean;
  color: number;
}

// Module-scope reusable scratch math objects (Zero GC inside render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _ejectPos = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _raycaster = new THREE.Raycaster();
const _ndcCenter = new THREE.Vector2(0, 0);

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRunEnd: (summary: RunSummary) => void;
}

export class VoxelGameEngine {
  private container: HTMLDivElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;

  private renderer!: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private materials!: SharedVoxelMaterials;
  private world!: BuiltWorld;
  private hero!: HeroRig;
  private resizeObserver: ResizeObserver | null = null;

  // Game State
  private phase: GamePhase = 'title';
  private gameMode: GameMode = 'zombies';
  private timeOfDay: TimeOfDay = 'night';
  private currentZone: WorldZoneId = 'kuroba';
  private zoneBannerTimer = 0;
  private loadout: LoadoutConfig = loadSavedLoadout();
  private loadoutMods: LoadoutCombatModifiers = computeLoadoutModifiers(this.loadout);
  private customizeTab: 'character' | 'gun' = 'character';
  private customizeOrbitYaw = 0.28;
  private customizeDragging = false;
  private player: PlayerKinematicsState = createInitialPlayerState();
  private weapon: WeaponRuntimeState = createInitialWeaponState(
    this.loadoutMods.magMult,
    this.loadoutMods.reloadMult,
  );
  private playerHp = PLAYER_MAX_HP;
  private ghostHp = PLAYER_MAX_HP;
  private score = 0;
  private bestScore = 0;
  private combo = 0;
  private comboDecayTimer = 0;
  private kills = 0;
  private damageTaken = 0;
  private elapsedSec = 0;
  private defeatBeatTimer = 0;
  private pendingDefeat = false;

  // Waves
  private waveNumber = 1;
  private wavePlan: WavePlan = buildWavePlan(1, 'zombies');
  private waveSpawnIndex = 0;
  private waveClock = 0;
  private waveBannerTimer = 0;
  private nextWaveDelayTimer = 0;
  private nextEnemyId = 1;
  private activeAttackTokens = 0;

  // Dynamic Lighting & Atmosphere (Day / Night)
  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;
  private shopWarmLight!: THREE.PointLight;
  private vendingCyanLight!: THREE.PointLight;
  private flashlight!: THREE.SpotLight;
  private flashlightTarget!: THREE.Object3D;
  private starfieldPoints!: THREE.Points;

  // Entities & Pools
  private vehicles: ActiveVehicle[] = [];
  private vehicleStates: VehicleKinematicsState[] = [];
  private activeVehicle: ActiveVehicle | null = null;
  private nearbyVehicle: ActiveVehicle | null = null;
  private vehicleEnterJustPressed = false;
  private enemies: ActiveEnemy[] = [];
  private projectiles: ActiveProjectile[] = [];
  private pickups: ActivePickup[] = [];
  private particles: VoxelParticle[] = [];
  private particleMesh!: THREE.InstancedMesh;
  private particleCursor = 0;
  private smokeParticles: VoxelParticle[] = [];
  private smokeMesh!: THREE.InstancedMesh;
  private smokeCursor = 0;
  private bloodDecals: THREE.Group[] = [];
  private bloodDecalCursor = 0;
  private muzzleLight!: THREE.PointLight;
  private muzzleLightTimer = 0;
  private explosionLight!: THREE.PointLight;
  private explosionLightTimer = 0;
  private explosionEffects: ExplosionEffect[] = [];
  private muzzleFlashTimer = 0;
  private boltKickTimer = 0;
  private lastReloadStage: 'none' | 'eject' | 'insert' | 'rack' = 'none';

  // Camera & Feel
  private camYaw = 0; // 0 looks toward -Z (straight at Kuroba Station)
  private camPitch = 0.24;
  private camPos = new THREE.Vector3(0, 4, 14);
  private camLook = new THREE.Vector3(0, 1.5, 0);
  private trauma = 0;
  private hitstopTimer = 0;
  private recoilVisual = 0;
  private crosshairSpread = 0;
  private hitmarkerTimer = 0;
  private hitmarkerCrit = false;
  private hurtFlash = 0;
  private titleClock = 0;

  // Unified Input Hub (held vs edge-triggered justPressed)
  private keysHeld = new Set<string>();
  private jumpJustPressed = false;
  private dashJustPressed = false;
  private reloadJustPressed = false;
  private pendingWeaponSwitch: WeaponId | undefined = undefined;
  private mouseLeftDown = false;
  private mouseRightDown = false;
  private pointerLocked = false;
  private draggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Loop & Throttling
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = 0;
  private hudEmitAccum = 0;
  private forceHudEmit = true;

  // Bound event listeners
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onBlurBound: () => void;
  private onVisibilityBound: () => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onContextMenuBound: (e: MouseEvent) => void;
  private onPointerLockChangeBound: () => void;

  // Team Deathmatch Multiplayer
  private remotePlayers = new Map<string, RemotePlayerEntity>();
  private netBroadcastTimer = 0;
  private tdmRespawnTimer = 0;

  constructor(container: HTMLDivElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.bestScore = this.loadBestScore();
    this.isSoftwareGl = VoxelGameEngine.detectSoftwareWebGL();

    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onBlurBound = this.handleWindowBlur.bind(this);
    this.onVisibilityBound = () => {
      if (document.hidden) this.clearHeldInputs();
    };
    this.onMouseDownBound = this.handleMouseDown.bind(this);
    this.onMouseUpBound = this.handleMouseUp.bind(this);
    this.onMouseMoveBound = this.handleMouseMove.bind(this);
    this.onWheelBound = this.handleWheel.bind(this);
    this.onContextMenuBound = (e: MouseEvent) => e.preventDefault();
    this.onPointerLockChangeBound = () => {
      this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
      this.forceHudEmit = true;
    };

    this.initScene();
    this.bindEvents();
    this.initMultiplayer();
    this.syncBodyState();
    this.emitHudSnapshot();

    // Render frame 0 immediately so the live 3D Kuroba Crossing diorama is visible on first paint
    this.updateTitleTour(0.016);
    this.renderFrame();

    this.lastTimeMs = performance.now();
    this.scheduleNextFrame();
  }

  private renderFrame(): void {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private static detectSoftwareWebGL(): boolean {
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private loadBestScore(): number {
    try {
      const v = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY);
      return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(score: number): void {
    try {
      window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(Math.round(score)));
    } catch {
      // ignore storage errors
    }
  }

  private initScene(): void {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'game-canvas');
    this.container.appendChild(this.renderer.domElement);

    // Warm golden-afternoon horizon atmosphere matching the reference diorama
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0xc8ddd0);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0xc8ddd0, 0.0055);

    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.15, 260);

    // Studio PBR environment reflections via RoomEnvironment + PMREMGenerator
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Warm/cool color-temperature balanced lighting rig (dynamically switched between Day & Night!)
    this.sunLight = new THREE.DirectionalLight(0xffd68e, 2.35);
    this.sunLight.position.set(22, 30, 18);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 6;
    this.sunLight.shadow.camera.far = 96;
    const d = 34;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.hemiLight = new THREE.HemisphereLight(0x8ecae8, 0x355427, 0.85);
    this.scene.add(this.hemiLight);

    // Cool subtle rim backlight for sharp voxel edge separation
    this.rimLight = new THREE.DirectionalLight(0x88c8f5, 0.45);
    this.rimLight.position.set(-22, 16, -24);
    this.scene.add(this.rimLight);

    // Warm shop veranda & neon spill lights (glow vibrantly in Night Mode!)
    this.shopWarmLight = new THREE.PointLight(0xffa952, 2.4, 22, 1.5);
    this.shopWarmLight.position.set(0, 3.6, -7.2);
    this.scene.add(this.shopWarmLight);

    this.vendingCyanLight = new THREE.PointLight(0x45e8ff, 1.2, 11, 1.6);
    this.vendingCyanLight.position.set(3.4, 2.0, -7.8);
    this.scene.add(this.vendingCyanLight);

    // Tactical weapon-mounted flashlight beam (auto-illuminates zombies & crossing at night!)
    this.flashlight = new THREE.SpotLight(0xfff4dc, 0, 36, 0.46, 0.55, 1.35);
    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    this.muzzleLight = new THREE.PointLight(0xffb44c, 0, 14, 1.8);
    this.scene.add(this.muzzleLight);

    this.explosionLight = new THREE.PointLight(0xff7e26, 0, 38, 1.4);
    this.scene.add(this.explosionLight);

    // Procedural voxel starfield overhead for Night Mode
    this.initStarfield();

    // Build shared materials, Kuroba Crossing world, and K-04 Hero
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.materials = createSharedVoxelMaterials(maxAniso);
    this.world = buildKurobaWorld(this.materials, maxAniso);
    this.scene.add(this.world.root);

    this.hero = buildHeroRig(this.materials, this.loadout);
    this.hero.root.position.set(this.player.x, this.player.y, this.player.z);
    this.hero.root.rotation.y = this.player.facingYaw;
    this.scene.add(this.hero.root);
    this.syncWeaponMeshes();

    // Spawn all live drivable open-world vehicles across all 4 regions
    this.initVehicles();

    // Pre-allocate pooled voxel particles, blood splatters, explosions, projectiles & pickups
    this.initParticlePool();
    this.initExplosionPool();
    this.initBloodDecalPool();
    this.initProjectilePool();
    this.initPickupPool();

    // Seed ambient drifting pollen / fireflies
    this.seedAmbientPollen();

    // Subtle cinematic bloom post-processing (GPU-only so software WebGL stays responsive!)
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.composer.setSize(width, height);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.1, 0.24, 0.98);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    // Apply initial atmosphere (Night Mode by default so user sees volumetric lights & bloom immediately!)
    this.applyTimeOfDay();
    gameAudio.playLobbyMusic();

    // Pre-warm shaders once on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Live ResizeObserver for crisp viewport scaling
    this.resizeObserver = new ResizeObserver(() => {
      const w = Math.max(1, this.container.clientWidth || window.innerWidth);
      const h = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.composer) {
        this.composer.setSize(w, h);
        this.bloomPass?.resolution.set(w, h);
      }
    });
    this.resizeObserver.observe(this.container);
  }

  private initStarfield(): void {
    const count = 160;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.36;
      const r = 75 + Math.random() * 25;
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.cos(phi) * r * 0.65 + 14;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xdbeaff,
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.88,
      fog: false,
    });
    this.starfieldPoints = new THREE.Points(geo, mat);
    this.scene.add(this.starfieldPoints);
  }

  private applyTimeOfDay(): void {
    const isNight = this.timeOfDay === 'night';
    const zoneInfo = WORLD_ZONE_INFO[this.currentZone];
    const fogHex = isNight ? zoneInfo.nightFogHex : zoneInfo.dayFogHex;
    const isCustomize = this.phase === 'customize';

    const nightFogDensity =
      this.currentZone === 'snowpeak'
        ? 0.0068
        : this.currentZone === 'fungi'
          ? 0.0082
          : 0.0076;
    const dayFogDensity =
      this.currentZone === 'snowpeak'
        ? 0.003
        : this.currentZone === 'fungi'
          ? 0.004
          : 0.0032;

    if (isNight) {
      this.scene.background = new THREE.Color(fogHex);
      this.scene.fog = new THREE.FogExp2(fogHex, isCustomize ? 0.0035 : nightFogDensity);
      this.scene.environmentIntensity = isCustomize ? 0.55 : 0.24;
      this.sunLight.color.setHex(0x88b4f2); // cool midnight moonlight
      this.sunLight.intensity = isCustomize ? 1.45 : 0.72;
      this.sunLight.position.set(-18, 28, 16);
      this.hemiLight.color.setHex(0x2c487a);
      this.hemiLight.groundColor.setHex(0x10181a);
      this.hemiLight.intensity = isCustomize ? 0.65 : 0.36;
      this.rimLight.color.setHex(0x5a96eb);
      this.rimLight.intensity = isCustomize ? 0.85 : 0.42;
      this.shopWarmLight.intensity = 8.4;
      this.vendingCyanLight.intensity = 4.4;
      this.renderer.toneMappingExposure = 1.05;
      this.materials.emissive.emissiveIntensity = 1.35;
      this.starfieldPoints.visible = true;
      this.flashlight.intensity = this.phase === 'playing' ? (this.activeVehicle ? 18.0 : 12.5) : 4.2;
      if (this.bloomPass) {
        this.bloomPass.strength = 0.16;
        this.bloomPass.radius = 0.28;
        this.bloomPass.threshold = 0.94;
      }
    } else {
      this.scene.background = new THREE.Color(fogHex);
      this.scene.fog = new THREE.FogExp2(fogHex, isCustomize ? 0.0025 : dayFogDensity);
      this.scene.environmentIntensity = 0.85;
      this.sunLight.color.setHex(0xffd68e);
      this.sunLight.intensity = 1.65;
      this.sunLight.position.set(22, 30, 18);
      this.hemiLight.color.setHex(0x8ecae8);
      this.hemiLight.groundColor.setHex(0x355427);
      this.hemiLight.intensity = 0.65;
      this.rimLight.color.setHex(0x88c8f5);
      this.rimLight.intensity = 0.35;
      this.shopWarmLight.intensity = 2.0;
      this.vendingCyanLight.intensity = 1.0;
      this.renderer.toneMappingExposure = 0.98;
      this.materials.emissive.emissiveIntensity = 0.55;
      this.starfieldPoints.visible = false;
      this.flashlight.intensity = 0;
      if (this.bloomPass) {
        this.bloomPass.strength = 0.06;
        this.bloomPass.radius = 0.18;
        this.bloomPass.threshold = 1.02;
      }
    }

    // Sync vehicle volumetric headlight cones
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      v.rig.headlightCones.visible = isNight && !v.state.destroyed;
    }

    // Sync volumetric light cones & mist opacities immediately
    for (let i = 0; i < this.world.volumetricLights.length; i++) {
      const vl = this.world.volumetricLights[i];
      const mat = vl.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = vl.baseOpacity * (isNight ? vl.nightScale : vl.dayScale);
      vl.mesh.visible = mat.opacity > 0.008;
    }
    for (let i = 0; i < this.world.mistLayers.length; i++) {
      const ml = this.world.mistLayers[i];
      const mat = ml.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = isNight ? ml.nightOpacity : ml.dayOpacity;
    }

    // Retint ambient motes: glowing fireflies at night vs golden pollen in daytime
    for (let i = 0; i < 42 && i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.ambientPollen) continue;
      p.color = isNight
        ? i % 2 === 0
          ? 0xd6ff5c
          : 0xffd25a
        : i % 3 === 0
          ? 0xd8ffbf
          : 0xfff3a8;
    }
  }

  private initVehicles(): void {
    this.vehicles = [];
    this.vehicleStates = [];
    for (const spec of this.world.vehicleSpawns) {
      const rig = buildDrivableVehicleRig(spec.kind, this.materials);
      rig.root.position.set(spec.x, 0.03, spec.z);
      rig.root.rotation.y = spec.yaw;
      rig.driverSeat.visible = false;
      rig.nitroFlame.visible = false;
      rig.wreckOverlay.visible = false;
      rig.headlightCones.visible = this.timeOfDay === 'night';
      this.scene.add(rig.root);

      const state: VehicleKinematicsState = {
        id: spec.id,
        kind: spec.kind,
        name: spec.name,
        x: spec.x,
        y: 0.03,
        z: spec.z,
        yaw: spec.yaw,
        speed: 0,
        vx: 0,
        vz: 0,
        steerAngle: 0,
        wheelSpin: 0,
        nitro: 100,
        boosting: false,
        drifting: false,
        maxSpeed: spec.maxSpeed,
        accel: spec.accel,
        radius: spec.radius,
        hp: 120,
        maxHp: 120,
        destroyed: false,
        respawnTimer: 0,
      };
      this.vehicleStates.push(state);
      this.vehicles.push({
        state,
        rig,
        ramCooldowns: new Map(),
        smokeAccum: 0,
        damageSmokeAccum: 0,
      });
    }
  }

  private resetVehicles(): void {
    if (this.activeVehicle) {
      this.activeVehicle.rig.driverSeat.visible = false;
      this.activeVehicle.rig.nitroFlame.visible = false;
      this.activeVehicle = null;
    }
    this.nearbyVehicle = null;
    this.vehicleEnterJustPressed = false;
    this.hero.root.visible = true;

    const isNight = this.timeOfDay === 'night';
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const spec = this.world.vehicleSpawns[i];
      v.state.x = spec.x;
      v.state.y = 0.03;
      v.state.z = spec.z;
      v.state.yaw = spec.yaw;
      v.state.speed = 0;
      v.state.vx = 0;
      v.state.vz = 0;
      v.state.steerAngle = 0;
      v.state.wheelSpin = 0;
      v.state.nitro = 100;
      v.state.boosting = false;
      v.state.drifting = false;
      v.state.hp = v.state.maxHp;
      v.state.destroyed = false;
      v.state.respawnTimer = 0;
      v.ramCooldowns.clear();
      v.smokeAccum = 0;
      v.damageSmokeAccum = 0;
      v.rig.root.position.set(spec.x, 0.03, spec.z);
      v.rig.root.rotation.set(0, spec.yaw, 0);
      v.rig.chassis.visible = true;
      v.rig.wreckOverlay.visible = false;
      v.rig.driverSeat.visible = false;
      v.rig.nitroFlame.visible = false;
      v.rig.headlightCones.visible = isNight;
      for (const p of v.rig.frontWheelSteerPivots) p.rotation.y = 0;
      for (const w of v.rig.wheelSpinMeshes) w.rotation.x = 0;
    }

    // Reset all explosive fuel barrels
    for (let i = 0; i < this.world.explosiveBarrels.length; i++) {
      const b = this.world.explosiveBarrels[i];
      b.active = true;
      b.respawnTimer = 0;
      b.mesh.visible = true;
    }

    // Hide any in-flight explosion rings
    this.explosionLightTimer = 0;
    this.explosionLight.intensity = 0;
    for (let i = 0; i < this.explosionEffects.length; i++) {
      const fx = this.explosionEffects[i];
      fx.active = false;
      fx.ring.visible = false;
      fx.core.visible = false;
    }
  }

  private initExplosionPool(): void {
    const ringGeo = new THREE.RingGeometry(0.45, 1.0, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const coreGeo = new THREE.IcosahedronGeometry(1.0, 1);
    for (let i = 0; i < 6; i++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffae34,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffe46b,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.visible = false;
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.visible = false;
      this.scene.add(ring, core);
      this.explosionEffects.push({
        active: false,
        age: 0,
        duration: 0.58,
        maxRadius: 9,
        ring,
        core,
      });
    }
  }

  private initBloodDecalPool(): void {
    const darkBloodMat = new THREE.MeshStandardMaterial({
      color: 0x6b0b0b,
      roughness: 0.25,
      metalness: 0.12,
    });
    const brightBloodMat = new THREE.MeshStandardMaterial({
      color: 0xa31212,
      roughness: 0.2,
      metalness: 0.15,
    });
    const mainGeo = new THREE.BoxGeometry(0.68, 0.032, 0.54);
    const subGeo = new THREE.BoxGeometry(0.32, 0.028, 0.3);
    const dropGeo = new THREE.BoxGeometry(0.16, 0.024, 0.16);

    for (let i = 0; i < MAX_BLOOD_DECALS; i++) {
      const g = new THREE.Group();
      const center = new THREE.Mesh(mainGeo, darkBloodMat);
      g.add(center);
      const lobe1 = new THREE.Mesh(subGeo, brightBloodMat);
      lobe1.position.set(0.32, 0.002, 0.18);
      const lobe2 = new THREE.Mesh(subGeo, darkBloodMat);
      lobe2.position.set(-0.28, 0.001, -0.2);
      const drop1 = new THREE.Mesh(dropGeo, brightBloodMat);
      drop1.position.set(0.56, 0.002, -0.14);
      const drop2 = new THREE.Mesh(dropGeo, darkBloodMat);
      drop2.position.set(-0.46, 0.002, 0.26);
      g.add(lobe1, lobe2, drop1, drop2);
      g.visible = false;
      this.scene.add(g);
      this.bloodDecals.push(g);
    }
  }

  private spawnBloodPuddle(x: number, groundY: number, z: number, scale = 1.0): void {
    const decal = this.bloodDecals[this.bloodDecalCursor % MAX_BLOOD_DECALS];
    this.bloodDecalCursor++;
    decal.position.set(
      x + (Math.random() - 0.5) * 0.45,
      Math.max(0.028, groundY + 0.028) + (this.bloodDecalCursor % 7) * 0.0015,
      z + (Math.random() - 0.5) * 0.45,
    );
    decal.rotation.y = Math.random() * Math.PI * 2;
    const s = scale * (0.78 + Math.random() * 0.55);
    decal.scale.set(s, 1, s * (0.85 + Math.random() * 0.35));
    decal.visible = true;
  }

  private clearBloodDecals(): void {
    for (let i = 0; i < this.bloodDecals.length; i++) {
      this.bloodDecals[i].visible = false;
    }
    this.bloodDecalCursor = 0;
  }

  private initParticlePool(): void {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.1,
    });
    this.particleMesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        vRot: 0,
        scale: 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        life: 0,
        maxLife: 1,
        gravity: 18,
        ambientPollen: false,
        isSmoke: false,
        color: 0xffffff,
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);

    // Dedicated translucent wispy gunsmoke InstancedMesh (never blocks crosshair!)
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(geo, smokeMat, MAX_SMOKE);
    this.smokeMesh.frustumCulled = false;
    for (let i = 0; i < MAX_SMOKE; i++) {
      this.smokeParticles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        vRot: 0,
        scale: 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        life: 0,
        maxLife: 1,
        gravity: -1.8,
        ambientPollen: false,
        isSmoke: true,
        color: 0x9aa2ab,
      });
      _dummy.position.set(0, -50, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _dummy.matrix);
      this.smokeMesh.setColorAt(i, _color.setHex(0x9aa2ab));
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
    if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.smokeMesh);
  }

  private seedAmbientPollen(): void {
    const isNight = this.timeOfDay === 'night';
    for (let i = 0; i < 42; i++) {
      const p = this.particles[i];
      p.active = true;
      p.ambientPollen = true;
      p.isSmoke = false;
      p.x = (Math.random() - 0.5) * 44;
      p.y = 0.8 + Math.random() * 6.5;
      p.z = (Math.random() - 0.5) * 38;
      p.vx = (Math.random() - 0.5) * 0.45;
      p.vy = 0.15 + Math.random() * 0.2;
      p.vz = (Math.random() - 0.5) * 0.45;
      p.scale = 0.08 + Math.random() * 0.06;
      p.scaleX = 1;
      p.scaleY = 1;
      p.scaleZ = 1;
      p.life = Math.random() * 6;
      p.maxLife = 6;
      p.gravity = 0;
      p.color = isNight
        ? i % 2 === 0
          ? 0xd6ff5c
          : 0xffd25a
        : Math.random() > 0.35
          ? 0xfff3a8
          : 0xd8ffbf;
    }
    this.particleCursor = 42;
  }

  private spawnSmoke(
    x: number,
    y: number,
    z: number,
    count: number,
    scaleMin: number,
    scaleMax: number,
  ): void {
    const smokeColors = [0x9aa3ad, 0x7b838c, 0xc4ccd4];
    for (let i = 0; i < count; i++) {
      const idx = this.smokeCursor % MAX_SMOKE;
      this.smokeCursor++;
      const p = this.smokeParticles[idx];
      const theta = Math.random() * Math.PI * 2;
      const spd = 0.55 + Math.random() * 1.1;
      p.active = true;
      p.isSmoke = true;
      p.ambientPollen = false;
      p.x = x + (Math.random() - 0.5) * 0.14;
      p.y = y + 0.08 + Math.random() * 0.1;
      p.z = z + (Math.random() - 0.5) * 0.14;
      p.vx = Math.cos(theta) * spd;
      p.vy = 1.2 + Math.random() * 1.25;
      p.vz = Math.sin(theta) * spd;
      p.rotX = Math.random() * Math.PI;
      p.rotY = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * 2.2;
      p.scale = scaleMin + Math.random() * (scaleMax - scaleMin);
      p.scaleX = 1;
      p.scaleY = 1;
      p.scaleZ = 1;
      p.life = 0.52 + Math.random() * 0.34;
      p.maxLife = p.life;
      p.gravity = -1.6;
      p.color = smokeColors[i % smokeColors.length];
    }
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    count: number,
    colors: number[],
    speedMin: number,
    speedMax: number,
    scaleMin: number,
    scaleMax: number,
    gravity = 18,
    lifeSec = 0.65,
    isSmoke = false,
  ): void {
    for (let i = 0; i < count; i++) {
      // Reserve slots 0..41 for ambient pollen / fireflies
      const idx = 42 + ((this.particleCursor - 42) % (MAX_PARTICLES - 42));
      this.particleCursor = idx + 1;
      const p = this.particles[idx];
      const theta = Math.random() * Math.PI * 2;
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      p.active = true;
      p.ambientPollen = false;
      p.isSmoke = isSmoke;
      p.x = x + (Math.random() - 0.5) * (isSmoke ? 0.18 : 0.25);
      p.y = y + (Math.random() - 0.5) * (isSmoke ? 0.18 : 0.25);
      p.z = z + (Math.random() - 0.5) * (isSmoke ? 0.18 : 0.25);
      p.vx = Math.cos(theta) * spd;
      p.vy = isSmoke ? 0.75 + Math.random() * 1.15 : 1.6 + Math.random() * spd * 0.9;
      p.vz = Math.sin(theta) * spd;
      p.rotX = Math.random() * Math.PI;
      p.rotY = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * (isSmoke ? 2.5 : 11);
      p.scale = scaleMin + Math.random() * (scaleMax - scaleMin);
      p.scaleX = 1;
      p.scaleY = 1;
      p.scaleZ = 1;
      p.life = lifeSec * (0.75 + Math.random() * 0.5);
      p.maxLife = p.life;
      p.gravity = gravity;
      p.color = colors[i % colors.length];
    }
  }

  private spawnDirectionalBlood(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    count: number,
    isHeadshot: boolean,
  ): void {
    const bloodColors = isHeadshot
      ? [0xe01f1f, 0xb80f0f, 0x8a0909, 0xff3b2f]
      : [0xc41414, 0x8f0d0d, 0x630707, 0xd92626];
    for (let i = 0; i < count; i++) {
      const idx = 42 + ((this.particleCursor - 42) % (MAX_PARTICLES - 42));
      this.particleCursor = idx + 1;
      const p = this.particles[idx];
      const spread = (Math.random() - 0.5) * 1.4;
      const fwdSpd = (isHeadshot ? 3.2 : 2.2) + Math.random() * (isHeadshot ? 5.6 : 4.2);
      p.active = true;
      p.ambientPollen = false;
      p.isSmoke = false;
      p.x = x + (Math.random() - 0.5) * 0.24;
      p.y = y + (Math.random() - 0.5) * 0.24;
      p.z = z + (Math.random() - 0.5) * 0.24;
      p.vx = dirX * fwdSpd + -dirZ * spread * fwdSpd * 0.5;
      p.vy = (isHeadshot ? 2.6 : 1.4) + Math.random() * 3.8;
      p.vz = dirZ * fwdSpd + dirX * spread * fwdSpd * 0.5;
      p.rotX = Math.random() * Math.PI;
      p.rotY = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * 14;
      p.scale = (isHeadshot ? 0.11 : 0.08) + Math.random() * 0.11;
      p.scaleX = 1;
      p.scaleY = 1;
      p.scaleZ = 1;
      p.life = 0.45 + Math.random() * 0.35;
      p.maxLife = p.life;
      p.gravity = 21;
      p.color = bloodColors[i % bloodColors.length];
    }
  }

  private spawnShellCasing(x: number, y: number, z: number, weaponId: WeaponId): void {
    const idx = 42 + ((this.particleCursor - 42) % (MAX_PARTICLES - 42));
    this.particleCursor = idx + 1;
    const p = this.particles[idx];
    // Eject to the player's right-rear relative to camera yaw
    const rightX = Math.cos(this.camYaw);
    const rightZ = -Math.sin(this.camYaw);
    const spd = 2.4 + Math.random() * 1.4;
    p.active = true;
    p.ambientPollen = false;
    p.isSmoke = false;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = rightX * spd + (Math.random() - 0.5) * 0.6;
    p.vy = 2.2 + Math.random() * 1.2;
    p.vz = rightZ * spd + (Math.random() - 0.5) * 0.6;
    p.rotX = Math.random() * Math.PI;
    p.rotY = Math.random() * Math.PI;
    p.vRot = 18 + Math.random() * 10;
    p.scale = weaponId === 'rail' ? 0.12 : 0.09;
    p.scaleX = 0.55;
    p.scaleY = 0.55;
    p.scaleZ = 1.65;
    p.life = 1.25;
    p.maxLife = 1.25;
    p.gravity = 22;
    p.color = weaponId === 'scatter' ? 0xd42c24 : 0xe5b84b;
  }

  private initProjectilePool(): void {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.72);
    for (let i = 0; i < 64; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x38e8ff });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.projectiles.push({
        active: false,
        fromPlayer: true,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        damage: 10,
        piercing: false,
        hitIds: new Set(),
        life: 0,
        maxLife: 1.5,
        color: 0x38e8ff,
        hitstopSec: 0.02,
        mesh,
      });
    }
  }

  private initPickupPool(): void {
    const geo = new THREE.OctahedronGeometry(0.32, 0);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4ef2a1,
        emissive: 0x2fd682,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.pickups.push({
        active: false,
        kind: 'heal',
        x: 0,
        y: 0.6,
        z: 0,
        life: 0,
        bobPhase: i * 1.1,
        mesh,
      });
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    document.addEventListener('visibilitychange', this.onVisibilityBound);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);

    const dom = this.renderer.domElement;
    dom.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    dom.addEventListener('wheel', this.onWheelBound, { passive: true });
    dom.addEventListener('contextmenu', this.onContextMenuBound);
  }

  private clearHeldInputs(): void {
    this.keysHeld.clear();
    this.mouseLeftDown = false;
    this.mouseRightDown = false;
    this.draggingLook = false;
    this.customizeDragging = false;
  }

  private handleWindowBlur(): void {
    this.clearHeldInputs();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const code = e.code;

    if (code === 'KeyN') {
      this.toggleTimeOfDay();
      return;
    }

    if (this.phase === 'title') {
      if (code === 'Enter' || code === 'Space') {
        e.preventDefault();
        this.openCustomize();
      }
      return;
    }

    if (this.phase === 'customize') {
      if (code === 'Escape') {
        e.preventDefault();
        this.returnToTitle();
      }
      return;
    }

    if (code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (this.phase === 'playing') {
        e.preventDefault();
        this.pauseGame();
      } else if (this.phase === 'paused') {
        e.preventDefault();
        this.resumeGame();
      }
      return;
    }

    if (this.phase !== 'playing') return;

    if (!this.keysHeld.has(code)) {
      if (code === 'Space') {
        e.preventDefault();
        this.jumpJustPressed = true;
      } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
        this.dashJustPressed = true;
      } else if (code === 'KeyR') {
        this.reloadJustPressed = true;
      } else if (code === 'KeyE') {
        if (this.activeVehicle || this.nearbyVehicle) {
          e.preventDefault();
          this.vehicleEnterJustPressed = true;
        }
      } else if (code === 'Digit1') {
        this.pendingWeaponSwitch = 'pulse';
      } else if (code === 'Digit2') {
        this.pendingWeaponSwitch = 'scatter';
      } else if (code === 'Digit3') {
        this.pendingWeaponSwitch = 'rail';
      }
    }

    this.keysHeld.add(code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysHeld.delete(e.code);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.phase === 'customize') {
      if (e.button === 0) {
        this.customizeDragging = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      }
      return;
    }

    if (this.phase !== 'playing') return;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    if (e.button === 0) {
      this.mouseLeftDown = true;
      // Request Pointer Lock gracefully for crisp 3rd-person shooter camera feel
      if (!this.pointerLocked && document.pointerLockElement !== this.renderer.domElement) {
        try {
          const req = this.renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
          if (req && typeof req.catch === 'function') {
            req.catch(() => {});
          }
        } catch {
          // Pointer lock unsupported in headless/sandbox -> drag fallback still works seamlessly
        }
      }
    } else if (e.button === 2) {
      this.mouseRightDown = true;
      this.draggingLook = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.mouseLeftDown = false;
      this.customizeDragging = false;
    }
    if (e.button === 2) {
      this.mouseRightDown = false;
      this.draggingLook = false;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.phase === 'customize') {
      if (this.customizeDragging) {
        const dx = clamp(e.clientX - this.lastPointerX, -80, 80);
        this.customizeOrbitYaw = normalizeAngle(this.customizeOrbitYaw + dx * 0.011);
      }
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      return;
    }

    if (this.phase !== 'playing') return;
    const sens = this.mouseRightDown ? 0.0018 : 0.0028;

    if (this.pointerLocked) {
      const dx = clamp(e.movementX || 0, -70, 70);
      const dy = clamp(e.movementY || 0, -70, 70);
      this.camYaw -= dx * sens;
      this.camPitch = clamp(this.camPitch + dy * sens, -0.18, 0.72);
    } else if (this.draggingLook) {
      const dx = clamp(e.clientX - this.lastPointerX, -60, 60);
      const dy = clamp(e.clientY - this.lastPointerY, -60, 60);
      this.camYaw -= dx * sens * 1.15;
      this.camPitch = clamp(this.camPitch + dy * sens * 1.15, -0.18, 0.72);
    }
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  }

  private handleWheel(e: WheelEvent): void {
    if (this.phase !== 'playing' || this.activeVehicle) return;
    const idx = WEAPON_ORDER.indexOf(this.weapon.active);
    const nextIdx = (idx + (e.deltaY > 0 ? 1 : -1) + WEAPON_ORDER.length) % WEAPON_ORDER.length;
    this.pendingWeaponSwitch = WEAPON_ORDER[nextIdx];
  }

  // Public Controls wired from React Shell
  public getLoadout(): LoadoutConfig {
    return { ...this.loadout };
  }

  public openCustomize(): void {
    this.clearEnemies();
    this.clearProjectilesAndPickups();
    this.clearBloodDecals();
    this.clearHeldInputs();
    this.resetVehicles();
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.currentZone = 'kuroba';
    this.zoneBannerTimer = 0;
    this.customizeTab = 'character';
    this.customizeOrbitYaw = 0.32;
    this.hero.root.visible = true;
    this.hero.root.position.set(0.2, 0.16, 4.2);
    this.hero.root.rotation.y = this.customizeOrbitYaw;
    this.hero.muzzleFlash.visible = false;
    this.phase = 'customize';
    this.applyTimeOfDay();
    this.syncBodyState();
    this.snapCustomizeCamera();
    this.forceHudEmit = true;
    this.emitHudSnapshot();
  }

  public setCustomizeView(tab: 'character' | 'gun', weaponId?: WeaponId): void {
    this.customizeTab = tab;
    if (weaponId && weaponId !== this.weapon.active) {
      this.weapon.active = weaponId;
      this.syncWeaponMeshes();
    }
    // Present a crisp 3/4 side profile when switching to Gun Armory so scope, muzzle, mag & charm shine!
    this.customizeOrbitYaw = tab === 'gun' ? -0.68 : 0.32;
    if (this.phase === 'customize') {
      this.snapCustomizeCamera();
    }
    this.forceHudEmit = true;
    this.emitHudSnapshot();
  }

  private snapCustomizeCamera(): void {
    const targetFov = this.customizeTab === 'gun' ? 38 : 42;
    this.camera.fov = targetFov;
    this.camera.updateProjectionMatrix();
    this.updateCustomizeStudio(0.016, true);
    this.renderFrame();
  }

  public setLoadoutOption(key: keyof LoadoutConfig, value: string): LoadoutConfig {
    if (this.loadout[key] === value) return { ...this.loadout };
    this.loadout = { ...this.loadout, [key]: value };
    this.applyLoadoutChange();
    return { ...this.loadout };
  }

  public setFullLoadout(next: LoadoutConfig): LoadoutConfig {
    this.loadout = { ...DEFAULT_LOADOUT, ...next };
    this.applyLoadoutChange();
    return { ...this.loadout };
  }

  private applyLoadoutChange(): void {
    saveLoadout(this.loadout);
    this.loadoutMods = computeLoadoutModifiers(this.loadout);
    this.rebuildHeroRig();
    // Refresh ammo capacities to reflect mag attachment changes
    for (const id of WEAPON_ORDER) {
      const cap = getEffectiveMagSize(id, this.loadoutMods.magMult);
      this.weapon.ammo[id] = cap;
    }
    if (this.phase === 'customize') {
      this.updateCustomizeStudio(0.001, true);
      this.renderFrame();
    }
    this.forceHudEmit = true;
    this.emitHudSnapshot();
  }

  private rebuildHeroRig(): void {
    const prevPos = this.hero.root.position.clone();
    const prevRotY = this.hero.root.rotation.y;
    const prevVisible = this.hero.root.visible;

    const sharedMatSet = new Set<THREE.Material>([
      this.materials.matte,
      this.materials.metal,
      this.materials.emissive,
    ]);
    this.hero.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && !sharedMatSet.has(m)) {
            m.dispose();
          }
        }
      }
    });
    this.scene.remove(this.hero.root);

    this.hero = buildHeroRig(this.materials, this.loadout);
    this.hero.root.position.copy(prevPos);
    this.hero.root.rotation.y = prevRotY;
    this.hero.root.visible = prevVisible;
    this.scene.add(this.hero.root);
    this.syncWeaponMeshes();
  }

  public setGameMode(mode: GameMode): void {
    this.gameMode = mode;
    this.wavePlan = buildWavePlan(1, mode);
    this.forceHudEmit = true;
    this.emitHudSnapshot();
  }

  public async hostTdm(roomCode?: string): Promise<string> {
    this.setGameMode('deathmatch');
    const code = await multiplayer.hostGame(roomCode);
    this.forceHudEmit = true;
    this.emitHudSnapshot();
    return code;
  }

  public async joinTdm(code: string): Promise<string> {
    this.setGameMode('deathmatch');
    const cleanCode = await multiplayer.joinGame(code);
    this.forceHudEmit = true;
    this.emitHudSnapshot();
    return cleanCode;
  }

  public setTimeOfDay(tod: TimeOfDay): void {
    if (this.timeOfDay === tod) return;
    this.timeOfDay = tod;
    this.applyTimeOfDay();
    this.forceHudEmit = true;
    this.emitHudSnapshot();
  }

  public toggleTimeOfDay(): TimeOfDay {
    const next: TimeOfDay = this.timeOfDay === 'night' ? 'day' : 'night';
    this.setTimeOfDay(next);
    return next;
  }

  public startNewRun(): void {
    this.clearEnemies();
    this.clearProjectilesAndPickups();
    this.clearBloodDecals();
    this.clearHeldInputs();
    this.resetVehicles();

    // Blur any active DOM button so Space/Enter never re-triggers it
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Spawn player according to mode & team base
    if (this.gameMode === 'deathmatch') {
      const isRed = multiplayer.localTeam === 'red';
      // Red Base (West Crossing): x = -8.0, z = 4.5 facing East
      // Blue Base (East Crossing): x = 8.0, z = 4.5 facing West
      const spawnX = isRed ? -8.0 : 8.0;
      const spawnZ = 4.5;
      this.player = createInitialPlayerState(spawnX, 0.16, spawnZ);
      this.player.facingYaw = isRed ? Math.PI / 2 : -Math.PI / 2;
    } else {
      this.player = createInitialPlayerState(0, 0.16, 7.6);
    }

    this.loadoutMods = computeLoadoutModifiers(this.loadout);
    this.weapon = createInitialWeaponState(
      this.loadoutMods.magMult,
      this.loadoutMods.reloadMult,
    );
    this.syncWeaponMeshes();
    this.lastReloadStage = 'none';
    this.muzzleFlashTimer = 0;
    this.boltKickTimer = 0;
    this.hero.muzzleFlash.visible = false;
    this.hero.root.visible = true;

    this.currentZone = 'kuroba';
    this.zoneBannerTimer = 2.6;

    this.playerHp = PLAYER_MAX_HP;
    this.ghostHp = PLAYER_MAX_HP;
    this.score = 0;
    this.combo = 0;
    this.comboDecayTimer = 0;
    this.kills = 0;
    this.damageTaken = 0;
    this.elapsedSec = 0;
    this.pendingDefeat = false;
    this.defeatBeatTimer = 0;
    this.trauma = 0;
    this.hitstopTimer = 0;
    this.hurtFlash = 0;
    this.activeAttackTokens = 0;

    // Camera starts right behind K-04 framing the Kuroba Station landmark
    this.camYaw = 0;
    this.camPitch = 0.2;
    this.camPos.set(0.8, 3.0, 12.6);
    this.camLook.set(0, 1.5, -2.0);
    this.camera.fov = 56;
    this.camera.updateProjectionMatrix();

    this.hero.root.position.set(this.player.x, this.player.y, this.player.z);
    this.hero.root.rotation.y = this.player.facingYaw;

    this.beginWave(1);
    this.phase = 'playing';
    gameAudio.stopLobbyMusic();
    this.applyTimeOfDay();
    this.syncBodyState();
    this.forceHudEmit = true;
    this.emitHudSnapshot();
  }

  public pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.clearHeldInputs();
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.syncBodyState();
    this.emitHudSnapshot();
  }

  public resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.clearHeldInputs();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.phase = 'playing';
    this.syncBodyState();
    this.emitHudSnapshot();
  }

  public returnToTitle(): void {
    this.clearEnemies();
    this.clearProjectilesAndPickups();
    this.clearBloodDecals();
    this.clearHeldInputs();
    this.resetVehicles();
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.currentZone = 'kuroba';
    this.zoneBannerTimer = 0;
    this.player = createInitialPlayerState(0, 0.16, 4.2);
    this.hero.root.visible = true;
    this.hero.root.position.set(this.player.x, this.player.y, this.player.z);
    this.hero.root.rotation.y = 0;
    this.hero.muzzleFlash.visible = false;
    this.camera.fov = 54;
    this.camera.updateProjectionMatrix();
    this.phase = 'title';
    gameAudio.playLobbyMusic();
    this.applyTimeOfDay();
    this.syncBodyState();
    this.emitHudSnapshot();
  }

  public selectWeapon(id: WeaponId): void {
    if (this.phase === 'customize') {
      this.setCustomizeView(this.customizeTab, id);
      return;
    }
    if (this.phase !== 'playing') return;
    this.pendingWeaponSwitch = id;
  }

  public toggleMute(): boolean {
    const muted = gameAudio.toggleMute();
    this.forceHudEmit = true;
    this.emitHudSnapshot();
    return muted;
  }

  public teleportToZone(zone: WorldZoneId): void {
    if (this.activeVehicle) {
      this.tryToggleVehicle();
    }
    const presets: Record<WorldZoneId, { x: number; z: number; yaw: number; pitch: number }> = {
      kuroba: { x: 0, z: 7.6, yaw: 0, pitch: 0.2 },
      aurora: { x: -66, z: 13.8, yaw: Math.PI * 0.44, pitch: 0.14 },
      fungi: { x: 64, z: 13.8, yaw: -Math.PI * 0.44, pitch: 0.14 },
      snowpeak: { x: 0, z: -64, yaw: 0.04, pitch: 0.08 },
    };
    const p = presets[zone];
    this.player.x = p.x;
    this.player.y = 0.04;
    this.player.z = p.z;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.vz = 0;
    this.player.facingYaw = normalizeAngle(p.yaw + Math.PI);
    this.camYaw = p.yaw;
    this.camPitch = p.pitch;
    this.hero.root.position.set(this.player.x, this.player.y, this.player.z);
    this.hero.root.rotation.y = this.player.facingYaw;

    const fwdX = -Math.sin(this.camYaw);
    const fwdZ = -Math.cos(this.camYaw);
    this.camPos.set(this.player.x - fwdX * 6.2, 2.8, this.player.z - fwdZ * 6.2);
    this.camLook.set(this.player.x + fwdX * 16, 2.2, this.player.z + fwdZ * 16);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.currentZone = zone;
    this.zoneBannerTimer = 3.2;
    this.applyTimeOfDay();
    this.forceHudEmit = true;
    this.emitHudSnapshot();
  }

  private initMultiplayer(): void {
    multiplayer.callbacks.onConnected = () => {
      this.forceHudEmit = true;
      this.emitHudSnapshot();
    };
    multiplayer.callbacks.onPlayerJoined = (player) => {
      this.spawnOrUpdateRemotePlayer(player);
      this.forceHudEmit = true;
      this.emitHudSnapshot();
    };
    multiplayer.callbacks.onPlayerLeft = (playerId) => {
      this.removeRemotePlayer(playerId);
      this.forceHudEmit = true;
      this.emitHudSnapshot();
    };
    multiplayer.callbacks.onScoreUpdate = () => {
      this.forceHudEmit = true;
      this.emitHudSnapshot();
    };
    multiplayer.callbacks.onKillFeed = () => {
      this.forceHudEmit = true;
      this.emitHudSnapshot();
    };
    multiplayer.callbacks.onRemoteShoot = (data) => {
      this.handleRemoteShoot(data);
    };
    multiplayer.callbacks.onRemoteHit = (data) => {
      if (data.targetId === multiplayer.localId) {
        this.damagePlayer(data.damage, 0, 0);
      }
    };
  }

  private createBadgeSprite(name: string, team: PlayerTeam): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(11, 18, 32, 0.88)';
      ctx.strokeStyle = team === 'red' ? '#ef4444' : '#3b82f6';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(6, 8, 244, 48, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = team === 'red' ? '#fca5a5' : '#93c5fd';
      ctx.font = 'bold 22px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tag = team === 'red' ? '🔴 RED' : '🔵 BLUE';
      ctx.fillText(`${tag} · ${name}`, 128, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.set(0, 2.15, 0);
    return sprite;
  }

  private spawnOrUpdateRemotePlayer(state: RemotePlayerState): void {
    let entry = this.remotePlayers.get(state.id);
    if (!entry) {
      const isRed = state.team === 'red';
      const rig = buildHeroRig(this.materials, {
        ...DEFAULT_LOADOUT,
        headgear: state.headgear || (isRed ? 'cyber_kabuto' : 'ranger_helm'),
        jacketColor: isRed ? 'crimson_guard' : 'cobalt_navy',
        visorColor: isRed ? 'crimson_hunt' : 'cyan_pulse',
      });
      // Synchronize initial active weapon visibility
      for (const id of WEAPON_ORDER) {
        if (rig.weaponRigs[id]) {
          rig.weaponRigs[id].root.visible = id === (state.weapon || 'pulse');
        }
      }
      rig.root.position.set(state.x, state.y, state.z);
      rig.root.rotation.y = state.yaw;
      rig.root.visible = true;

      const badge = this.createBadgeSprite(state.name || (isRed ? 'Red Operator' : 'Blue Operator'), state.team);
      if (state.inVehicle) {
        rig.bodyPivot.visible = false;
        rig.contactShadow.visible = false;
        badge.position.set(0, 2.7, 0);
      }
      rig.root.add(badge);
      this.scene.add(rig.root);

      entry = {
        id: state.id,
        rig,
        badge,
        state,
        targetX: state.x,
        targetY: state.y,
        targetZ: state.z,
        targetYaw: state.yaw,
        walkPhase: 0,
      };
      this.remotePlayers.set(state.id, entry);
    } else {
      entry.state = state;
      entry.targetX = state.x;
      entry.targetY = state.y;
      entry.targetZ = state.z;
      entry.targetYaw = state.yaw;
      // Synchronize weapon if remote player switched
      for (const id of WEAPON_ORDER) {
        if (entry.rig.weaponRigs[id]) {
          entry.rig.weaponRigs[id].root.visible = id === (state.weapon || 'pulse');
        }
      }
    }
  }

  private removeRemotePlayer(playerId: string): void {
    const entry = this.remotePlayers.get(playerId);
    if (entry) {
      if (entry.drivenVehicle) {
        entry.drivenVehicle.rig.driverSeat.visible = false;
        entry.drivenVehicle.rig.nitroFlame.visible = false;
      }
      if (entry.fallbackVehicleRig) {
        this.scene.remove(entry.fallbackVehicleRig.root);
      }
      this.scene.remove(entry.rig.root);
      this.remotePlayers.delete(playerId);
    }
  }

  private handleRemoteShoot(data: {
    playerId: string;
    origin: [number, number, number];
    direction: [number, number, number];
    weapon: WeaponId;
    team: PlayerTeam;
  }): void {
    const spec = WEAPONS[data.weapon] || WEAPONS.pulse;
    const color = data.team === 'red' ? 0xff4436 : 0x3b82f6;
    gameAudio.playShoot(spec.id);
    this.spawnProjectile(
      false,
      data.origin[0],
      data.origin[1],
      data.origin[2],
      data.direction[0] * spec.projectileSpeed,
      data.direction[1] * spec.projectileSpeed,
      data.direction[2] * spec.projectileSpeed,
      spec.damage,
      spec.piercing,
      color,
      spec.hitstopSec,
    );
  }

  private updateMultiplayerSync(dt: number): void {
    this.netBroadcastTimer -= dt;
    if (this.netBroadcastTimer <= 0) {
      this.netBroadcastTimer = 0.045;
      const isDriving = this.activeVehicle !== null;
      multiplayer.sendLocalState({
        x: this.player.x,
        y: this.player.y,
        z: this.player.z,
        yaw: this.player.facingYaw,
        pitch: this.camPitch,
        hp: this.playerHp,
        maxHp: PLAYER_MAX_HP,
        weapon: this.weapon.active,
        headgear: this.loadout.headgear,
        suitColor: this.loadout.jacketColor,
        inVehicle: isDriving,
        vehicleId: this.activeVehicle ? this.activeVehicle.state.id : undefined,
        vehicleKind: this.activeVehicle ? this.activeVehicle.state.kind : undefined,
        vehicleYaw: this.activeVehicle ? this.activeVehicle.state.yaw : undefined,
        vehicleSpeed: this.activeVehicle ? this.activeVehicle.state.speed : undefined,
        vehicleSteerAngle: this.activeVehicle ? this.activeVehicle.state.steerAngle : undefined,
        vehicleWheelSpin: this.activeVehicle ? this.activeVehicle.state.wheelSpin : undefined,
        vehicleBoosting: this.activeVehicle ? this.activeVehicle.state.boosting : undefined,
        isFiring: this.mouseLeftDown && !this.weapon.reloading && this.weapon.ammo[this.weapon.active] > 0,
        isReloading: this.weapon.reloading,
      });
    }

    for (const [_, rp] of this.remotePlayers) {
      const rx = rp.targetX;
      const ry = rp.targetY;
      const rz = rp.targetZ;
      const dx = rx - rp.rig.root.position.x;
      const dz = rz - rp.rig.root.position.z;
      const dist = Math.hypot(dx, dz);

      // Snap immediately if large difference (such as initial spawn or respawn)
      if (dist > 6.0) {
        rp.rig.root.position.set(rx, ry, rz);
      } else {
        rp.rig.root.position.x += dx * Math.min(1, dt * 16);
        rp.rig.root.position.y += (ry - rp.rig.root.position.y) * Math.min(1, dt * 16);
        rp.rig.root.position.z += dz * Math.min(1, dt * 16);
      }
      rp.rig.root.rotation.y = dampAngle(rp.rig.root.rotation.y, rp.targetYaw, 14, dt);
      rp.rig.rightArm.rotation.x = clamp((rp.state.pitch ?? 0) * 0.55 - 0.1, -0.35, 0.45);

      const isDriving = !!rp.state.inVehicle;
      rp.rig.bodyPivot.visible = !isDriving;
      rp.rig.contactShadow.visible = !isDriving;
      rp.badge.position.set(0, isDriving ? 2.7 : 2.15, 0);

      if (isDriving) {
        // Resolve vehicle
        const vehId = rp.state.vehicleId;
        let veh = rp.drivenVehicle;
        if (!veh || (vehId && veh.state.id !== vehId)) {
          if (rp.drivenVehicle) {
            rp.drivenVehicle.rig.driverSeat.visible = false;
            rp.drivenVehicle.rig.nitroFlame.visible = false;
          }
          veh = this.vehicles.find((v) => v.state.id === vehId) || null;
          rp.drivenVehicle = veh;
        }

        let targetVehRig: DrivableVehicleRig | null = null;
        if (veh) {
          if (rp.fallbackVehicleRig) {
            rp.fallbackVehicleRig.root.visible = false;
          }
          targetVehRig = veh.rig;
          veh.state.x = rp.rig.root.position.x;
          veh.state.y = rp.rig.root.position.y;
          veh.state.z = rp.rig.root.position.z;
          veh.state.yaw = rp.state.vehicleYaw ?? rp.targetYaw;
          veh.state.speed = rp.state.vehicleSpeed ?? 0;
          veh.state.steerAngle = rp.state.vehicleSteerAngle ?? 0;
          veh.state.wheelSpin = rp.state.vehicleWheelSpin ?? 0;
          veh.state.boosting = !!rp.state.vehicleBoosting;
        } else {
          if (!rp.fallbackVehicleRig) {
            const kind = (rp.state.vehicleKind as VehicleKind) || 'olive_jeep';
            rp.fallbackVehicleRig = buildDrivableVehicleRig(kind, this.materials);
            this.scene.add(rp.fallbackVehicleRig.root);
          }
          targetVehRig = rp.fallbackVehicleRig;
          targetVehRig.root.visible = true;
        }

        if (targetVehRig) {
          targetVehRig.root.position.set(
            rp.rig.root.position.x,
            rp.rig.root.position.y,
            rp.rig.root.position.z,
          );
          const vYaw = rp.state.vehicleYaw ?? rp.targetYaw;
          targetVehRig.root.rotation.y = vYaw;
          const steer = rp.state.vehicleSteerAngle ?? 0;
          const spd = rp.state.vehicleSpeed ?? 0;
          targetVehRig.root.rotation.z = -steer * clamp(Math.abs(spd) / 22, 0, 1) * 0.08;
          targetVehRig.root.rotation.x = rp.state.vehicleBoosting ? -0.045 : 0;
          targetVehRig.driverSeat.visible = true;
          targetVehRig.nitroFlame.visible = !!rp.state.vehicleBoosting;
          targetVehRig.headlightCones.visible = this.timeOfDay === 'night';
          for (const pivot of targetVehRig.frontWheelSteerPivots) {
            pivot.rotation.y = steer * 0.45;
          }
          for (const wheel of targetVehRig.wheelSpinMeshes) {
            wheel.rotation.x = rp.state.vehicleWheelSpin ?? 0;
          }
        }
      } else {
        if (rp.drivenVehicle) {
          rp.drivenVehicle.rig.driverSeat.visible = false;
          rp.drivenVehicle.rig.nitroFlame.visible = false;
          rp.drivenVehicle = null;
        }
        if (rp.fallbackVehicleRig) {
          rp.fallbackVehicleRig.root.visible = false;
        }

        if (dist > 0.05) {
          rp.walkPhase += dt * 10;
          const swing = Math.sin(rp.walkPhase) * 0.45;
          rp.rig.leftLeg.rotation.x = swing;
          rp.rig.rightLeg.rotation.x = -swing;
          rp.rig.leftArm.rotation.x = -swing * 0.7;
        } else {
          rp.rig.leftLeg.rotation.x *= Math.exp(-10 * dt);
          rp.rig.rightLeg.rotation.x *= Math.exp(-10 * dt);
          rp.rig.leftArm.rotation.x *= Math.exp(-10 * dt);
        }
      }
    }
  }

  private respawnPlayerInTdm(): void {
    gameAudio.playDefeat();
    this.spawnParticles(
      this.player.x,
      this.player.y + 1.0,
      this.player.z,
      20,
      [0xff3838, 0xffa500, 0xffffff],
      3.0,
      6.0,
      0.15,
      0.25,
      20,
      0.5,
    );

    const isRed = multiplayer.localTeam === 'red';
    // Red Base (West Crossing): x = -8.0, z = 4.5
    // Blue Base (East Crossing): x = 8.0, z = 4.5
    const spawnX = isRed ? -8.0 : 8.0;
    const spawnZ = 4.5;
    this.player.x = spawnX;
    this.player.y = 0.16;
    this.player.z = spawnZ;
    this.player.facingYaw = isRed ? Math.PI / 2 : -Math.PI / 2;
    this.player.vx = 0;
    this.player.vz = 0;
    this.playerHp = PLAYER_MAX_HP;
    this.ghostHp = PLAYER_MAX_HP;
    this.player.invulnTimer = 2.5;

    // Immediately notify peers of respawn location
    multiplayer.sendLocalState({
      x: spawnX,
      y: 0.16,
      z: spawnZ,
      yaw: this.player.facingYaw,
      hp: PLAYER_MAX_HP,
    });
    this.weapon.ammo[this.weapon.active] = WEAPONS[this.weapon.active].magSize;

    const oppTeam: PlayerTeam = isRed ? 'blue' : 'red';
    multiplayer.recordKill('Opponent', oppTeam, 'You', multiplayer.localTeam, 'pulse');
    this.forceHudEmit = true;
    this.emitHudSnapshot();
  }

  private syncBodyState(): void {
    const mapped = this.phase === 'victory' ? 'gameover' : this.phase;
    document.body.dataset.state = mapped;
  }

  private beginWave(num: number): void {
    this.waveNumber = num;
    this.wavePlan = buildWavePlan(num, this.gameMode);
    this.waveSpawnIndex = 0;
    this.waveClock = 0;
    this.waveBannerTimer = 3.2;
    this.nextWaveDelayTimer = 0;
    this.forceHudEmit = true;
  }

  private clearEnemies(): void {
    for (const e of this.enemies) {
      this.scene.remove(e.rig.root);
      if (e.sightLine) this.scene.remove(e.sightLine);
    }
    this.enemies = [];
    this.activeAttackTokens = 0;
  }

  private clearProjectilesAndPickups(): void {
    for (const p of this.projectiles) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const pk of this.pickups) {
      pk.active = false;
      pk.mesh.visible = false;
    }
  }

  private syncWeaponMeshes(): void {
    for (const id of WEAPON_ORDER) {
      const rig = this.hero.weaponRigs[id];
      rig.root.visible = id === this.weapon.active;
      rig.magazine.position.y = 0;
      rig.boltOrPump.position.z = 0;
    }
    const activeRig = this.hero.weaponRigs[this.weapon.active];
    this.hero.muzzlePoint.position.set(0, -0.09, activeRig.muzzleOffsetZ * 1.12);
    this.hero.ejectPoint.position.copy(activeRig.ejectOffset).multiplyScalar(1.12);
  }

  // Loop Scheduling (GPU rAF vs Software WebGL afterDraw pacing)
  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick(): void {
    if (this.disposed) return;

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = nowMs;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.updateAmbientWorld(dt);

    if (this.phase === 'title') {
      this.updateTitleTour(dt);
    } else if (this.phase === 'customize') {
      this.updateCustomizeStudio(dt);
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
    } else if (this.phase === 'victory' || this.phase === 'gameover') {
      this.updateParticles(dt);
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }

    this.renderFrame();
    this.scheduleNextFrame();
  }

  private updateAmbientWorld(dt: number): void {
    this.titleClock += dt;
    const isNight = this.timeOfDay === 'night';

    // Gentle lantern sway on station porch
    for (let i = 0; i < this.world.animatedLanterns.length; i++) {
      const m = this.world.animatedLanterns[i];
      m.rotation.z = Math.sin(this.titleClock * 2.1 + i * 1.7) * 0.09;
    }

    // Subtle volumetric light beam shimmer & biome god-ray breathing
    for (let i = 0; i < this.world.volumetricLights.length; i++) {
      const vl = this.world.volumetricLights[i];
      const scale = isNight ? vl.nightScale : vl.dayScale;
      const mat = vl.mesh.material as THREE.MeshBasicMaterial;
      const shimmer = 0.88 + Math.sin(this.titleClock * 1.35 + vl.phase) * 0.12;
      mat.opacity = vl.baseOpacity * scale * shimmer;
      vl.mesh.visible = mat.opacity > 0.008;
    }

    // Drifting low-lying biome fog/mist sheets
    for (let i = 0; i < this.world.mistLayers.length; i++) {
      const ml = this.world.mistLayers[i];
      ml.mesh.position.x = ml.baseX + Math.sin(this.titleClock * ml.speed + ml.phase) * ml.driftAmpX;
      ml.mesh.position.z = ml.baseZ + Math.cos(this.titleClock * ml.speed * 0.72 + ml.phase) * ml.driftAmpZ;
    }

    if (this.muzzleLightTimer > 0) {
      this.muzzleLightTimer = Math.max(0, this.muzzleLightTimer - dt);
      this.muzzleLight.intensity = (this.muzzleLightTimer / 0.065) * (isNight ? 8.5 : 4.8);
    } else {
      this.muzzleLight.intensity = 0;
    }

    if (this.explosionLightTimer > 0) {
      this.explosionLightTimer = Math.max(0, this.explosionLightTimer - dt);
      const t = this.explosionLightTimer / 0.5;
      this.explosionLight.intensity = t * t * (isNight ? 28 : 18);
    } else {
      this.explosionLight.intensity = 0;
    }

    // Animate active shockwave rings & fireball cores
    for (let i = 0; i < this.explosionEffects.length; i++) {
      const fx = this.explosionEffects[i];
      if (!fx.active) continue;
      fx.age += dt;
      if (fx.age >= fx.duration) {
        fx.active = false;
        fx.ring.visible = false;
        fx.core.visible = false;
        continue;
      }
      const p = clamp(fx.age / fx.duration, 0, 1);
      const easeOut = 1 - (1 - p) * (1 - p);
      fx.ring.scale.setScalar(0.8 + easeOut * fx.maxRadius);
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.85;

      const coreP = clamp(fx.age / (fx.duration * 0.58), 0, 1);
      const coreScale = 0.9 + Math.sin(coreP * Math.PI * 0.75) * (fx.maxRadius * 0.42);
      fx.core.scale.setScalar(Math.max(0.05, coreScale));
      fx.core.rotation.y += dt * 4.5;
      (fx.core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - coreP) * 0.92);
      fx.core.visible = coreP < 1;
    }

    // Respawn detonated explosive fuel barrels after 18s
    for (let i = 0; i < this.world.explosiveBarrels.length; i++) {
      const b = this.world.explosiveBarrels[i];
      if (!b.active) {
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) {
          b.active = true;
          b.mesh.visible = true;
        }
      }
    }

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
      const ratio = this.muzzleFlashTimer / 0.055;
      this.hero.muzzleFlash.visible = ratio > 0;
      this.hero.muzzleFlash.scale.setScalar(0.65 + ratio * 0.7);
    } else {
      this.hero.muzzleFlash.visible = false;
    }
    if (this.boltKickTimer > 0) {
      this.boltKickTimer = Math.max(0, this.boltKickTimer - dt);
    }
  }

  private updateTitleTour(dt: number): void {
    // Iconic isometric-style diorama tour showcasing Kuroba Station, White Kei-Truck, Red Postbox, Bus Stop & K-04!
    const angle = -0.34 + Math.sin(this.titleClock * 0.16) * 0.24;
    const radius = 27.5;
    const targetX = Math.sin(angle) * radius - 3.5;
    const targetZ = Math.cos(angle) * radius + 2.5;
    const targetY = 14.2 + Math.sin(this.titleClock * 0.3) * 0.7;

    if (this.titleClock < 0.08) {
      this.camPos.set(targetX, targetY, targetZ);
    } else {
      const t = 1 - Math.exp(-3.2 * dt);
      this.camPos.x += (targetX - this.camPos.x) * t;
      this.camPos.y += (targetY - this.camPos.y) * t;
      this.camPos.z += (targetZ - this.camPos.z) * t;
    }
    this.camera.position.copy(this.camPos);

    // Frame slightly right so left 35% of viewport offers calm negative space for title lockup while right 65% showcases the diorama
    this.camLook.set(-4.2, 2.0, -1.0);
    this.camera.lookAt(this.camLook);

    // K-04 gentle idle breathing & look-around on boardwalk
    this.hero.root.position.set(0.2, 0.16, 4.2);
    this.hero.root.rotation.y = -0.35 + Math.sin(this.titleClock * 0.8) * 0.18;
    this.hero.torsoGroup.position.y = 0.72 + Math.sin(this.titleClock * 2.8) * 0.03;
    this.hero.headGroup.rotation.y = Math.sin(this.titleClock * 1.1) * 0.28;
    this.hero.leftLeg.rotation.x = 0;
    this.hero.rightLeg.rotation.x = 0;
    this.hero.leftArm.rotation.set(0, 0, 0);
    this.hero.rightArm.rotation.set(-0.08, 0, 0);

    // Aim weapon flashlight gently across the boardwalk at night on the title screen
    if (this.timeOfDay === 'night') {
      this.flashlight.position.set(0.2, 1.35, 4.2);
      this.flashlightTarget.position.set(-1.5 + Math.sin(this.titleClock * 0.8) * 3.5, 0.6, 11.5);
    }

    this.updateParticles(dt);
  }

  private updateCustomizeStudio(dt: number, snap = false): void {
    // Gentle turntable rotation when user is not actively dragging the model
    if (!this.customizeDragging && !snap) {
      const spinSpeed = this.customizeTab === 'gun' ? 0.16 : 0.34;
      this.customizeOrbitYaw = normalizeAngle(this.customizeOrbitYaw + spinSpeed * dt);
    }

    const baseX = 0.2;
    const baseY = 0.16;
    const baseZ = 4.2;
    this.hero.root.visible = true;
    this.hero.root.position.set(baseX, baseY, baseZ);
    this.hero.root.rotation.y = this.customizeOrbitYaw;
    this.hero.bodyPivot.scale.set(1, 1, 1);

    // Heroic showcase stance (presents equipped weapon proudly when in Gun Armory tab)
    const breathe = Math.sin(this.titleClock * 2.4) * 0.02;
    this.hero.torsoGroup.position.y = 0.72 + breathe;
    this.hero.torsoGroup.rotation.set(0, 0, 0);
    this.hero.headGroup.rotation.set(0, Math.sin(this.titleClock * 1.2) * 0.1, 0);
    this.hero.leftLeg.rotation.set(0, 0, 0);
    this.hero.rightLeg.rotation.set(0, 0, 0);
    this.hero.leftArm.rotation.set(-0.18, 0, 0.08);
    this.hero.rightArm.rotation.set(this.customizeTab === 'gun' ? -0.05 : -0.18, 0, 0);
    this.hero.rightArm.position.z = 0.06;

    const targetFov = this.customizeTab === 'gun' ? 38 : 42;
    if (snap || Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = snap
        ? targetFov
        : this.camera.fov + (targetFov - this.camera.fov) * (1 - Math.exp(-8 * dt));
      this.camera.updateProjectionMatrix();
    }

    // Offset look target slightly right so K-04 sits cleanly on the left 60% beside the right-docked Studio Panel
    if (this.customizeTab === 'gun') {
      this.hero.root.updateMatrixWorld(true);
      const gunWorld = _v1.set(0, 0, 0);
      this.hero.weaponRigs[this.weapon.active].root.getWorldPosition(gunWorld);
      _camGoal.set(gunWorld.x - 1.55, gunWorld.y + 0.34, gunWorld.z + 2.15);
      _lookGoal.set(gunWorld.x + 0.45, gunWorld.y + 0.04, gunWorld.z + 0.1);
    } else {
      _camGoal.set(baseX + 0.75, baseY + 1.32, baseZ + 3.45);
      _lookGoal.set(baseX + 0.58, baseY + 0.96, baseZ);
    }

    if (snap) {
      this.camPos.copy(_camGoal);
      this.camLook.copy(_lookGoal);
    } else {
      const lerpT = 1 - Math.exp(-9 * dt);
      this.camPos.lerp(_camGoal, lerpT);
      this.camLook.lerp(_lookGoal, lerpT);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    if (this.timeOfDay === 'night') {
      this.flashlight.position.set(baseX + 2.2, baseY + 2.6, baseZ + 3.8);
      this.flashlightTarget.position.set(baseX, baseY + 1.0, baseZ);
    }

    if (!snap) {
      this.updateParticles(dt);
    }
  }

  private tryToggleVehicle(): void {
    if (this.activeVehicle) {
      // Exit vehicle safely to the left driver side
      const v = this.activeVehicle;
      const exitX = v.state.x - Math.cos(v.state.yaw) * 2.55;
      const exitZ = v.state.z + Math.sin(v.state.yaw) * 2.55;
      const resolved = resolveCylinderWorldCollision(
        exitX,
        0.1,
        exitZ,
        PLAYER_RADIUS,
        PLAYER_HEIGHT,
        this.world.colliders,
      );
      this.player.x = resolved.x;
      this.player.y = resolved.groundY;
      this.player.z = resolved.z;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.vz = 0;
      this.player.facingYaw = v.state.yaw;

      v.state.boosting = false;
      v.state.drifting = false;
      v.rig.driverSeat.visible = false;
      v.rig.nitroFlame.visible = false;
      this.activeVehicle = null;
      this.hero.root.visible = true;
      this.applyTimeOfDay();
      gameAudio.playPickup();
      this.forceHudEmit = true;

      // Broadcast vehicle exit immediately across network
      multiplayer.sendLocalState({
        inVehicle: false,
        vehicleId: undefined,
        vehicleKind: undefined,
        x: this.player.x,
        y: this.player.y,
        z: this.player.z,
        yaw: this.player.facingYaw,
      });
      return;
    }

    if (this.nearbyVehicle && !this.nearbyVehicle.state.destroyed) {
      const v = this.nearbyVehicle;
      // Prevent entering if another remote player is currently driving this vehicle
      let drivenByOther = false;
      for (const [_, rp] of this.remotePlayers) {
        if (rp.state.inVehicle && (rp.drivenVehicle === v || rp.state.vehicleId === v.state.id)) {
          drivenByOther = true;
          break;
        }
      }
      if (drivenByOther) return;

      this.activeVehicle = v;
      this.hero.root.visible = false;
      this.hero.muzzleFlash.visible = false;
      v.rig.driverSeat.visible = true;
      this.camYaw = normalizeAngle(v.state.yaw + Math.PI);
      this.camPitch = 0.2;
      this.applyTimeOfDay();
      gameAudio.playDash();
      this.forceHudEmit = true;

      // Broadcast vehicle entry immediately across network
      multiplayer.sendLocalState({
        inVehicle: true,
        vehicleId: v.state.id,
        vehicleKind: v.state.kind,
        vehicleYaw: v.state.yaw,
        vehicleSpeed: v.state.speed,
        vehicleSteerAngle: v.state.steerAngle,
        vehicleWheelSpin: v.state.wheelSpin,
        vehicleBoosting: v.state.boosting,
        x: v.state.x,
        y: v.state.y,
        z: v.state.z,
        yaw: v.state.yaw,
      });
    }
  }

  private damageVehicle(v: ActiveVehicle, damage: number, hitX: number, hitZ: number): void {
    if (v.state.destroyed || damage <= 0) return;
    v.state.hp = Math.max(0, v.state.hp - damage);
    this.spawnParticles(
      hitX,
      0.95,
      hitZ,
      8,
      [0xffc845, 0xff7b24, 0xd8e0e8],
      2.2,
      6.4,
      0.09,
      0.16,
      16,
      0.38,
    );
    if (v === this.activeVehicle) {
      this.forceHudEmit = true;
    }
    if (v.state.hp <= 0) {
      this.explodeVehicle(v);
    }
  }

  private explodeVehicle(v: ActiveVehicle): void {
    if (v.state.destroyed) return;
    v.state.destroyed = true;
    v.state.hp = 0;
    v.state.respawnTimer = 14;
    v.state.speed = 0;
    v.state.vx = 0;
    v.state.vz = 0;
    v.state.boosting = false;
    v.state.drifting = false;

    v.rig.chassis.visible = false;
    v.rig.wreckOverlay.visible = true;
    v.rig.driverSeat.visible = false;
    v.rig.nitroFlame.visible = false;
    v.rig.headlightCones.visible = false;

    // Safely eject player if driving the exploding vehicle!
    if (this.activeVehicle === v) {
      const exitX = v.state.x - Math.cos(v.state.yaw) * 3.1;
      const exitZ = v.state.z + Math.sin(v.state.yaw) * 3.1;
      const resolved = resolveCylinderWorldCollision(
        exitX,
        0.1,
        exitZ,
        PLAYER_RADIUS,
        PLAYER_HEIGHT,
        this.world.colliders,
      );
      this.player.x = resolved.x;
      this.player.y = resolved.groundY;
      this.player.z = resolved.z;
      this.player.vy = 5.5;
      this.activeVehicle = null;
      this.hero.root.visible = true;
      this.applyTimeOfDay();
    }

    this.triggerExplosion(v.state.x, 1.0, v.state.z, 11.5, 220, v);
    this.forceHudEmit = true;
  }

  private detonateBarrel(b: ExplosiveBarrelItem): void {
    if (!b.active) return;
    b.active = false;
    b.respawnTimer = 18;
    b.mesh.visible = false;
    this.triggerExplosion(b.x, b.y + 0.7, b.z, 10.5, 195);
  }

  private triggerExplosion(
    x: number,
    y: number,
    z: number,
    radius: number,
    maxEnemyDmg: number,
    sourceVehicle?: ActiveVehicle,
  ): void {
    gameAudio.playExplosion();
    this.trauma = Math.min(1, this.trauma + 0.96);
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.052);

    // Brilliant radial orange-gold explosion flash light
    this.explosionLight.position.set(x, y + 1.8, z);
    this.explosionLightTimer = 0.5;
    this.explosionLight.intensity = this.timeOfDay === 'night' ? 28 : 18;

    // Expanding additive shockwave ring & blazing fireball core
    const fx = this.explosionEffects.find((e) => !e.active) ?? this.explosionEffects[0];
    if (fx) {
      fx.active = true;
      fx.age = 0;
      fx.duration = 0.62;
      fx.maxRadius = radius * 1.08;
      fx.ring.position.set(x, 0.14, z);
      fx.ring.scale.setScalar(0.8);
      fx.ring.visible = true;
      fx.core.position.set(x, y + 0.4, z);
      fx.core.scale.setScalar(1.0);
      fx.core.visible = true;
    }

    // Blazing voxel fireball cubes, flying debris & billowing smoke column!
    this.spawnParticles(
      x,
      y + 0.5,
      z,
      46,
      [0xffffff, 0xffe46b, 0xff8c24, 0xe83b24, 0x262120],
      4.5,
      14.5,
      0.22,
      0.56,
      15,
      0.95,
    );
    this.spawnSmoke(x, y + 0.6, z, 14, 0.55, 1.15);

    // AoE blast damage to all nearby enemies (instant ragdoll obliteration!)
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.aiState === 'ko') continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const dist = Math.hypot(dx, dz);
      const dmg = calculateExplosionDamage(dist, radius, maxEnemyDmg);
      if (dmg > 0) {
        const nx = dist > 0.01 ? dx / dist : 1;
        const nz = dist > 0.01 ? dz / dist : 0;
        e.x += nx * 2.4;
        e.z += nz * 2.4;
        this.damageEnemy(e, dmg, true, nx, nz, 0xff8c24, 0.04);
      }
    }

    // Chain-reaction blast to nearby explosive barrels!
    for (let i = 0; i < this.world.explosiveBarrels.length; i++) {
      const b = this.world.explosiveBarrels[i];
      if (!b.active) continue;
      const dist = Math.hypot(b.x - x, b.z - z);
      if (dist < radius * 0.82) {
        this.detonateBarrel(b);
      }
    }

    // Chain-reaction knockback & hull damage to nearby vehicles!
    for (let i = 0; i < this.vehicles.length; i++) {
      const other = this.vehicles[i];
      if (other === sourceVehicle || other.state.destroyed) continue;
      const dx = other.state.x - x;
      const dz = other.state.z - z;
      const dist = Math.hypot(dx, dz);
      const vDmg = calculateExplosionDamage(dist, radius * 0.95, 130);
      if (vDmg > 0) {
        const nx = dist > 0.01 ? dx / dist : 1;
        const nz = dist > 0.01 ? dz / dist : 0;
        other.state.vx += nx * 11;
        other.state.vz += nz * 11;
        this.damageVehicle(other, vDmg, other.state.x, other.state.z);
      }
    }

    // Controlled player shockwave knockback & damage if right beside blast
    const pDx = this.player.x - x;
    const pDz = this.player.z - z;
    const pDist = Math.hypot(pDx, pDz);
    const pDmg = calculateExplosionDamage(pDist, radius * 0.72, 24);
    if (pDmg > 0) {
      const nx = pDist > 0.01 ? pDx / pDist : 1;
      const nz = pDist > 0.01 ? pDz / pDist : 0;
      this.damagePlayer(pDmg, nx * 1.4, nz * 1.4);
    }
  }

  private updateParkedVehicles(dt: number): void {
    let closest: ActiveVehicle | null = null;
    let closestDist = 5.4;
    const isNight = this.timeOfDay === 'night';

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];

      // Handle destroyed wreck respawn countdown & smoldering smoke
      if (v.state.destroyed) {
        v.state.respawnTimer -= dt;
        v.damageSmokeAccum += dt;
        if (v.damageSmokeAccum > 0.22) {
          v.damageSmokeAccum = 0;
          v.rig.root.updateMatrixWorld(true);
          v.rig.damageSmokePoint.getWorldPosition(_v1);
          this.spawnSmoke(_v1.x, _v1.y + 0.1, _v1.z, 1, 0.26, 0.45);
        }
        if (v.state.respawnTimer <= 0) {
          const spec = this.world.vehicleSpawns[i];
          v.state.x = spec.x;
          v.state.y = 0.03;
          v.state.z = spec.z;
          v.state.yaw = spec.yaw;
          v.state.speed = 0;
          v.state.vx = 0;
          v.state.vz = 0;
          v.state.hp = v.state.maxHp;
          v.state.destroyed = false;
          v.rig.root.position.set(spec.x, 0.03, spec.z);
          v.rig.root.rotation.set(0, spec.yaw, 0);
          v.rig.chassis.visible = true;
          v.rig.wreckOverlay.visible = false;
          v.rig.headlightCones.visible = isNight;
        }
        continue;
      }

      // Emit dark warning smoke from damaged engines (< 55% HP)
      if (v.state.hp < v.state.maxHp * 0.55) {
        v.damageSmokeAccum += dt;
        if (v.damageSmokeAccum > 0.14) {
          v.damageSmokeAccum = 0;
          v.rig.root.updateMatrixWorld(true);
          v.rig.damageSmokePoint.getWorldPosition(_v1);
          this.spawnSmoke(_v1.x, _v1.y, _v1.z, 1, 0.22, 0.36);
        }
      }

      if (v === this.activeVehicle) continue;
      // Skip if driven by any remote player
      let drivenByOther = false;
      for (const [_, rp] of this.remotePlayers) {
        if (rp.state.inVehicle && (rp.drivenVehicle === v || rp.state.vehicleId === v.state.id)) {
          drivenByOther = true;
          break;
        }
      }
      if (drivenByOther) continue;

      // Parked vehicle rolls/slides smoothly after crash knockback or mid-speed exit
      if (Math.abs(v.state.speed) > 0.05 || Math.hypot(v.state.vx, v.state.vz) > 0.05) {
        const res = stepVehicleKinematics(
          v.state,
          { throttle: 0, steer: 0, handbrake: true, boost: false },
          this.world.colliders,
          dt,
        );
        v.rig.root.position.set(v.state.x, v.state.y, v.state.z);
        v.rig.root.rotation.y = v.state.yaw;
        for (const w of v.rig.wheelSpinMeshes) w.rotation.x = v.state.wheelSpin;

        if (res.hitWall && res.impactSpeed > 7.5) {
          gameAudio.playCrash(clamp(res.impactSpeed / 22, 0.25, 0.9));
          this.damageVehicle(v, calculateVehicleCrashDamage(res.impactSpeed), v.state.x, v.state.z);
        }
      }

      if (!this.activeVehicle) {
        const d = Math.hypot(this.player.x - v.state.x, this.player.z - v.state.z);
        if (d < closestDist) {
          closestDist = d;
          closest = v;
        }
      }
    }

    if (closest !== this.nearbyVehicle) {
      this.nearbyVehicle = closest;
      this.forceHudEmit = true;
    }
  }

  private updateVehicleCollisions(): void {
    // 1. Car-vs-Car collision physics, momentum transfer, sparks, hull damage & explosions!
    for (let i = 0; i < this.vehicles.length; i++) {
      const a = this.vehicles[i];
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const b = this.vehicles[j];
        const crash = resolveVehiclePairCollision(a.state, b.state);
        if (!crash.collided) continue;

        a.rig.root.position.set(a.state.x, a.state.y, a.state.z);
        a.rig.root.rotation.y = a.state.yaw;
        b.rig.root.position.set(b.state.x, b.state.y, b.state.z);
        b.rig.root.rotation.y = b.state.yaw;

        if (a === this.activeVehicle) {
          this.player.x = a.state.x;
          this.player.z = a.state.z;
        } else if (b === this.activeVehicle) {
          this.player.x = b.state.x;
          this.player.z = b.state.z;
        }

        if (crash.impactSpeed > 3.2) {
          const intensity = clamp(crash.impactSpeed / 22, 0.25, 1.0);
          gameAudio.playCrash(intensity);
          this.spawnParticles(
            crash.contactX,
            0.9,
            crash.contactZ,
            Math.round(10 + intensity * 16),
            [0xffe066, 0xff8a24, 0xffffff, 0xc8d2dc],
            2.5,
            8.5,
            0.09,
            0.2,
            16,
            0.45,
          );
          this.spawnSmoke(crash.contactX, 0.85, crash.contactZ, 3, 0.24, 0.42);
          if (a === this.activeVehicle || b === this.activeVehicle) {
            this.trauma = Math.min(1, this.trauma + 0.32 + intensity * 0.48);
          }

          const baseDmg = calculateVehicleCrashDamage(crash.impactSpeed);
          if (baseDmg > 0) {
            // High-speed nitro head-on crash causes catastrophic detonation!
            if (crash.impactSpeed > 23) {
              const target = a === this.activeVehicle ? b : a;
              if (!target.state.destroyed) {
                this.explodeVehicle(target);
              }
            } else {
              this.damageVehicle(a, Math.round(baseDmg * 0.72), crash.contactX, crash.contactZ);
              this.damageVehicle(b, Math.round(baseDmg * 1.15), crash.contactX, crash.contactZ);
            }
          }
        }
      }
    }

    // 2. Moving vehicles ramming red hazard fuel barrels -> instant fiery explosion!
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.state.destroyed) continue;
      const spd = Math.hypot(
        Math.sin(v.state.yaw) * v.state.speed + v.state.vx,
        Math.cos(v.state.yaw) * v.state.speed + v.state.vz,
      );
      if (spd < 3.5) continue;
      for (let bIdx = 0; bIdx < this.world.explosiveBarrels.length; bIdx++) {
        const barrel = this.world.explosiveBarrels[bIdx];
        if (!barrel.active) continue;
        const d = Math.hypot(v.state.x - barrel.x, v.state.z - barrel.z);
        if (d < v.state.radius + 0.85) {
          this.detonateBarrel(barrel);
        }
      }
    }
  }

  private updateActiveVehicle(dt: number): void {
    const v = this.activeVehicle!;
    const throttle =
      (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') ? 1 : 0) -
      (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') ? 1 : 0);
    const steer =
      (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') ? 1 : 0) -
      (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') ? 1 : 0);
    const handbrake = this.keysHeld.has('Space');
    const boost = this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight');

    const res = stepVehicleKinematics(
      v.state,
      { throttle, steer, handbrake, boost },
      this.world.colliders,
      dt,
    );

    if (res.hitWall && res.impactSpeed > 7.5) {
      const intensity = clamp(res.impactSpeed / 22, 0.3, 1.0);
      this.trauma = Math.min(1, this.trauma + 0.25 + intensity * 0.4);
      this.spawnParticles(
        v.state.x,
        v.state.y + 0.85,
        v.state.z,
        12,
        [0xffc845, 0xff8a30, 0xdfe6ed],
        2,
        6.5,
        0.1,
        0.18,
        16,
        0.38,
      );
      gameAudio.playCrash(intensity);
      if (res.impactSpeed > 11.5) {
        this.damageVehicle(
          v,
          Math.round(calculateVehicleCrashDamage(res.impactSpeed) * 0.6),
          v.state.x,
          v.state.z,
        );
        if (!this.activeVehicle) return; // Vehicle exploded & ejected player!
      }
    }

    // Sync player coordinates with vehicle so enemies, radar, pickups & zones track smoothly!
    this.player.x = v.state.x;
    this.player.y = v.state.y;
    this.player.z = v.state.z;
    this.player.vx = Math.sin(v.state.yaw) * v.state.speed + v.state.vx;
    this.player.vz = Math.cos(v.state.yaw) * v.state.speed + v.state.vz;
    this.player.facingYaw = v.state.yaw;

    // Apply visual rig transform, wheel spin, steering angle, body lean & nitro exhaust
    v.rig.root.position.set(v.state.x, v.state.y, v.state.z);
    v.rig.root.rotation.y = v.state.yaw;
    v.rig.root.rotation.z = -v.state.steerAngle * clamp(Math.abs(v.state.speed) / 22, 0, 1) * 0.08;
    v.rig.root.rotation.x = v.state.boosting ? -0.045 : throttle * -0.015;

    for (const pivot of v.rig.frontWheelSteerPivots) {
      pivot.rotation.y = v.state.steerAngle * 0.45;
    }
    for (const wheel of v.rig.wheelSpinMeshes) {
      wheel.rotation.x = v.state.wheelSpin;
    }
    v.rig.nitroFlame.visible = v.state.boosting;
    if (v.state.boosting) {
      v.rig.nitroFlame.scale.set(1, 1, 0.85 + Math.random() * 0.55);
    }

    // Tire smoke on drift & nitro blue exhaust sparks
    v.smokeAccum += dt;
    if (v.smokeAccum > 0.045 && (v.state.drifting || v.state.boosting)) {
      v.smokeAccum = 0;
      v.rig.root.updateMatrixWorld(true);
      v.rig.exhaustPoint.getWorldPosition(_v1);
      if (v.state.drifting) {
        this.spawnSmoke(_v1.x, _v1.y + 0.05, _v1.z, 2, 0.18, 0.34);
      }
      if (v.state.boosting) {
        this.spawnParticles(
          _v1.x,
          _v1.y + 0.1,
          _v1.z,
          3,
          [0x45f2ff, 0xffae34, 0xffffff],
          1.2,
          3.4,
          0.11,
          0.2,
          4,
          0.26,
        );
      }
    }

    // Bright twin headlights illuminating the road at night!
    if (this.timeOfDay === 'night') {
      v.rig.root.updateMatrixWorld(true);
      v.rig.headlightOrigin.getWorldPosition(_v1);
      this.flashlight.position.copy(_v1);
      const fwdX = Math.sin(v.state.yaw);
      const fwdZ = Math.cos(v.state.yaw);
      this.flashlightTarget.position.set(_v1.x + fwdX * 28, 0.25, _v1.z + fwdZ * 28);
    }

    // Auto-align chase camera smoothly behind vehicle when user is not dragging camera
    if (!this.draggingLook && !this.pointerLocked && Math.abs(v.state.speed) > 1.2) {
      const targetCamYaw = normalizeAngle(v.state.yaw + Math.PI);
      this.camYaw = dampAngle(this.camYaw, targetCamYaw, 4.2, dt);
    }

    // Vehicle-vs-Zombie / Enemy high-speed ramming!
    for (const [id, cd] of v.ramCooldowns.entries()) {
      const next = cd - dt;
      if (next <= 0) v.ramCooldowns.delete(id);
      else v.ramCooldowns.set(id, next);
    }

    const impactDmg = calculateVehicleImpactDamage(v.state.speed);
    if (impactDmg > 0) {
      const fwdX = Math.sin(v.state.yaw);
      const fwdZ = Math.cos(v.state.yaw);
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (e.aiState === 'ko' || v.ramCooldowns.has(e.id)) continue;
        const dist = Math.hypot(e.x - v.state.x, e.z - v.state.z);
        if (dist < v.state.radius + e.radius + 0.55) {
          v.ramCooldowns.set(e.id, 0.35);
          const flingX = fwdX * 1.4 + (e.x - v.state.x) * 0.7;
          const flingZ = fwdZ * 1.4 + (e.z - v.state.z) * 0.7;
          const flen = Math.hypot(flingX, flingZ) || 1;
          e.x += (flingX / flen) * 2.2;
          e.z += (flingZ / flen) * 2.2;
          this.damageEnemy(
            e,
            impactDmg,
            Math.abs(v.state.speed) > 13,
            flingX / flen,
            flingZ / flen,
            0xff4d3b,
            0.032,
          );
          this.trauma = Math.min(1, this.trauma + 0.38);
          v.state.speed *= 0.92;
        }
      }
    }
  }

  private updatePlaying(dt: number): void {
    // Real-time visual timers keep ticking during sim hitstop
    this.trauma = Math.max(0, this.trauma - dt * 2.1);
    this.recoilVisual = Math.max(0, this.recoilVisual - dt * 5.5);
    this.crosshairSpread = Math.max(0, this.crosshairSpread - dt * 4.5);
    this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.6);
    this.waveBannerTimer = Math.max(0, this.waveBannerTimer - dt);
    this.zoneBannerTimer = Math.max(0, this.zoneBannerTimer - dt);

    // Trailing ghost health bar smooth catchup
    if (this.ghostHp > this.playerHp) {
      this.ghostHp = Math.max(this.playerHp, this.ghostHp - dt * 26);
    } else {
      this.ghostHp = this.playerHp;
    }

    // Combo decay
    if (this.combo > 0) {
      this.comboDecayTimer -= dt;
      if (this.comboDecayTimer <= 0) {
        this.combo = 0;
      }
    }

    // Pending defeat final beat (0.55s dramatic slow-mo beat before modal)
    if (this.pendingDefeat) {
      this.defeatBeatTimer -= dt;
      this.updateParticles(dt * 0.4);
      this.updateCameraRig(dt);
      if (this.defeatBeatTimer <= 0) {
        this.finishRun('gameover');
      }
      this.maybeEmitHud(dt);
      return;
    }

    // Hitstop freezes simulation physics briefly while flashes & camera shake continue
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateCameraRig(dt);
      this.maybeEmitHud(dt);
      return;
    }

    this.elapsedSec += dt;

    // Handle [E] vehicle enter/exit before movement
    if (this.vehicleEnterJustPressed) {
      this.vehicleEnterJustPressed = false;
      this.tryToggleVehicle();
    }

    // Keyboard camera turn support (Q / E when not near a vehicle and on foot)
    if (this.keysHeld.has('KeyQ')) this.camYaw += 2.1 * dt;
    if (this.keysHeld.has('KeyE') && !this.activeVehicle && !this.nearbyVehicle) {
      this.camYaw -= 2.1 * dt;
    }

    if (this.activeVehicle) {
      // Driving mode: vehicle controls, car-vs-car crashing & zombie roadkill physics
      this.jumpJustPressed = false;
      this.dashJustPressed = false;
      this.reloadJustPressed = false;
      this.pendingWeaponSwitch = undefined;
      this.updateActiveVehicle(dt);
      this.updateParkedVehicles(dt);
      this.updateVehicleCollisions();
      this.updateCameraRig(dt);
    } else {
      // On-foot kinematics, strict wall & parked-car collisions, animations, and tactical shooting
      const forward =
        (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') ? 1 : 0) -
        (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') ? 1 : 0);
      const right =
        (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') ? 1 : 0) -
        (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') ? 1 : 0);

      const aimingOrShooting = this.mouseRightDown || this.mouseLeftDown || this.recoilVisual > 0.05;
      const moveRes = stepPlayerKinematics(
        this.player,
        {
          forward,
          right,
          cameraYaw: this.camYaw,
          jumpJustPressed: this.jumpJustPressed,
          jumpHeld: this.keysHeld.has('Space'),
          dashJustPressed: this.dashJustPressed,
          aimingOrShooting,
        },
        this.world.colliders,
        dt,
      );

      // Prevent on-foot hero from clipping through parked or wrecked vehicles
      const carPush = resolvePlayerVehicleCollision(
        this.player.x,
        this.player.y,
        this.player.z,
        PLAYER_RADIUS,
        this.vehicleStates,
      );
      if (carPush.hitVehicle) {
        this.player.x = carPush.x;
        this.player.z = carPush.z;
      }

      this.jumpJustPressed = false;
      this.dashJustPressed = false;

      if (moveRes.jumped) {
        gameAudio.playJump();
        this.spawnParticles(
          this.player.x,
          this.player.y + 0.1,
          this.player.z,
          6,
          [0x45f2ff, 0xe8e4da],
          1.2,
          3.2,
          0.1,
          0.18,
          8,
          0.35,
        );
      }
      if (moveRes.landed) {
        gameAudio.playFootstep();
        this.spawnParticles(
          this.player.x,
          this.player.y + 0.05,
          this.player.z,
          5,
          [0x86a856, 0xc7b99b],
          1.0,
          2.6,
          0.09,
          0.16,
          12,
          0.3,
        );
      }
      if (moveRes.dashed) {
        gameAudio.playDash();
        this.spawnParticles(
          this.player.x,
          this.player.y + 0.85,
          this.player.z,
          14,
          [0x38e8ff, 0xb8fbff, 0xffd27a],
          2.0,
          5.5,
          0.12,
          0.22,
          4,
          0.4,
        );
        this.forceHudEmit = true;
      }
      if (moveRes.steppedFoot) {
        gameAudio.playFootstep();
      }

      if (this.player.dashTimer > 0) {
        this.spawnParticles(
          this.player.x,
          this.player.y + 0.8,
          this.player.z,
          2,
          [0x38e8ff, 0x9cf7ff],
          0.5,
          1.8,
          0.1,
          0.16,
          2,
          0.24,
        );
      }

      this.updateParkedVehicles(dt);
      this.updateVehicleCollisions();
      this.updateHeroVisuals(dt);
      this.updateCameraRig(dt);

      // Weapon Step & Firing with custom loadout modifiers
      const fireIntent = this.mouseLeftDown || this.keysHeld.has('KeyF');
      const prevWeapon = this.weapon.active;
      const weaponRes = stepWeaponState(
        this.weapon,
        dt,
        fireIntent,
        this.reloadJustPressed,
        this.pendingWeaponSwitch,
        this.loadoutMods.magMult,
        this.loadoutMods.reloadMult,
      );
      this.reloadJustPressed = false;
      this.pendingWeaponSwitch = undefined;

      if (this.weapon.active !== prevWeapon) {
        this.syncWeaponMeshes();
        this.lastReloadStage = 'none';
        this.forceHudEmit = true;
      }
      if (weaponRes.startedReload) {
        this.lastReloadStage = 'eject';
        gameAudio.playReload('eject');
        this.forceHudEmit = true;
      }
      if (weaponRes.finishedReload) {
        this.lastReloadStage = 'none';
        this.forceHudEmit = true;
      }
      if (weaponRes.fired) {
        this.firePlayerWeapon();
        this.forceHudEmit = true;
      }
    }

    // Open-World Region Detection (Kuroba Crossing / Aurora City / Fungi Forest / Kopenhime Snowpeak)
    const nextZone = detectWorldZone(this.player.x, this.player.z);
    if (nextZone !== this.currentZone) {
      this.currentZone = nextZone;
      this.zoneBannerTimer = 3.2;
      this.applyTimeOfDay();
      this.forceHudEmit = true;
    }

    // 5. Wave Spawner & Progression (Bypassed in TDM mode)
    if (this.gameMode !== 'deathmatch') {
      this.updateWaveSpawner(dt);
      this.updateEnemies(dt);
    } else {
      this.updateMultiplayerSync(dt);
    }

    // 6. Projectiles, Pickups, Particles
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);

    this.maybeEmitHud(dt);
  }

  private updateHeroVisuals(dt: number): void {
    this.hero.root.position.set(this.player.x, this.player.y, this.player.z);
    this.hero.root.rotation.y = this.player.facingYaw;

    // Squash & stretch on bodyPivot
    this.hero.bodyPivot.scale.set(
      this.player.squashX,
      this.player.squashY,
      this.player.squashX,
    );

    // Distance-synced procedural leg & arm gait (never skates!)
    const horizSpeed = Math.hypot(this.player.vx, this.player.vz);
    const gaitAmp = this.player.grounded ? clamp(horizSpeed / 8.5, 0, 1) * 0.72 : 0.25;
    const phase = this.player.walkDistance * 2.15;

    this.hero.leftLeg.rotation.x = Math.sin(phase) * gaitAmp;
    this.hero.rightLeg.rotation.x = -Math.sin(phase) * gaitAmp;

    // Torso subtle forward lean + bounce
    const bounce = this.player.grounded ? Math.abs(Math.sin(phase)) * 0.055 * (horizSpeed / 8.5) : 0;
    this.hero.torsoGroup.position.y = 0.72 + bounce;
    const leanTarget = this.player.dashTimer > 0 ? 0.26 : clamp(horizSpeed / 8.5, 0, 1) * 0.1;
    this.hero.torsoGroup.rotation.x += (leanTarget - this.hero.torsoGroup.rotation.x) * (1 - Math.exp(-14 * dt));

    // Active tactical weapon rig + 3-stage reload choreography (eject -> insert -> rack) + bolt recoil
    const activeRig = this.hero.weaponRigs[this.weapon.active];
    const basePitch = clamp(this.camPitch * 0.55 - 0.1, -0.35, 0.45);

    if (this.weapon.reloading) {
      const progress = clamp(
        1 - this.weapon.reloadTimer / Math.max(0.01, this.weapon.reloadTotal),
        0,
        1,
      );
      const pose = computeReloadPose(progress);

      // Fire synchronized 3-stage mechanical reload SFX on each stage transition
      if (pose.stage !== this.lastReloadStage) {
        this.lastReloadStage = pose.stage;
        gameAudio.playReload(pose.stage);
      }

      this.hero.rightArm.rotation.x = basePitch + pose.gunPitch;
      this.hero.rightArm.rotation.z = pose.gunRoll;
      this.hero.rightArm.position.z = 0.04;
      activeRig.magazine.position.y = pose.magDropY;
      activeRig.boltOrPump.position.z = pose.boltPullZ;

      // Left support arm reaches smoothly across toward the magwell/charging handle!
      this.hero.leftArm.rotation.x = -pose.leftArmRaise * 1.18;
      this.hero.leftArm.rotation.z = -pose.leftArmRaise * 0.52;
    } else {
      this.lastReloadStage = 'none';
      this.hero.leftArm.rotation.x = -Math.sin(phase) * gaitAmp * 0.75;
      this.hero.leftArm.rotation.z = 0;

      // Right weapon arm aims with camera pitch + snaps back cleanly on recoil
      this.hero.rightArm.rotation.x = basePitch - this.recoilVisual * 0.45;
      this.hero.rightArm.rotation.z = 0;
      this.hero.rightArm.position.z = 0.04 - this.recoilVisual * 0.16;

      activeRig.magazine.position.y = 0;
      // Post-shot bolt blowback / shotgun pump rack animation!
      if (this.boltKickTimer > 0) {
        const kickDur = this.weapon.active === 'scatter' ? 0.24 : 0.09;
        const p = Math.sin(clamp(this.boltKickTimer / kickDur, 0, 1) * Math.PI);
        activeRig.boltOrPump.position.z = -p * (this.weapon.active === 'scatter' ? 0.2 : 0.12);
      } else {
        activeRig.boltOrPump.position.z = 0;
      }
    }

    // Head subtle gaze alignment
    this.hero.headGroup.rotation.x = clamp(this.camPitch * 0.35 - 0.08, -0.25, 0.28);

    // Tactical weapon flashlight tracks aim direction in Night Mode!
    if (this.timeOfDay === 'night') {
      this.hero.root.updateMatrixWorld(true);
      this.hero.muzzlePoint.getWorldPosition(_muzzlePos);
      this.flashlight.position.copy(_muzzlePos);
      const fwdX = -Math.sin(this.camYaw) * Math.cos(this.camPitch);
      const fwdY = -Math.sin(this.camPitch);
      const fwdZ = -Math.cos(this.camYaw) * Math.cos(this.camPitch);
      this.flashlightTarget.position.set(
        _muzzlePos.x + fwdX * 16,
        Math.max(0.1, _muzzlePos.y + fwdY * 16),
        _muzzlePos.z + fwdZ * 16,
      );
    }

    // Thruster flame visibility during dash or jump ascent
    const flameMat = this.hero.thrusterFlame.material as THREE.MeshBasicMaterial;
    const thrustVisible = this.player.dashTimer > 0 || (!this.player.grounded && this.player.vy > 2.5);
    flameMat.opacity = thrustVisible ? 0.88 : 0;
    this.hero.thrusterFlame.scale.y = this.player.dashTimer > 0 ? 1.7 : 0.9;

    // Player invulnerability / hurt emissive tint
    const hurtTint = this.hurtFlash > 0.35 ? 0.5 : 0;
    for (let i = 0; i < this.hero.flashMaterials.length; i++) {
      const m = this.hero.flashMaterials[i];
      m.emissive.setHex(hurtTint > 0 ? 0xff3b2f : 0x000000);
      m.emissiveIntensity = hurtTint;
    }

    // Contact shadow stays pinned to floor
    this.hero.contactShadow.position.y = -this.player.y + 0.03;
    const shadowScale = clamp(1 - this.player.y * 0.12, 0.45, 1.0);
    this.hero.contactShadow.scale.setScalar(shadowScale);
  }

  private updateCameraRig(dt: number): void {
    const isDriving = this.activeVehicle !== null;
    const isAiming = !isDriving && this.mouseRightDown;
    const isDashing = !isDriving && this.player.dashTimer > 0;

    // Dynamic FOV (tightens on ADS zoom, widens smoothly with vehicle speed & nitro!)
    const speedNorm = isDriving
      ? clamp(Math.abs(this.activeVehicle!.state.speed) / 28, 0, 1)
      : 0;
    const targetFov = isDriving
      ? 60 + speedNorm * 10 + (this.activeVehicle!.state.boosting ? 5 : 0)
      : isAiming
        ? 44
        : isDashing
          ? 64
          : 56;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-10 * dt));
      this.camera.updateProjectionMatrix();
    }

    // Over-the-shoulder or elevated vehicle chase pivot
    const pivotX = this.player.x;
    const pivotY = this.player.y + (isDriving ? 1.85 : 1.52);
    const pivotZ = this.player.z;

    const fwdX = -Math.sin(this.camYaw);
    const fwdZ = -Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw);
    const rightZ = -Math.sin(this.camYaw);

    const dist = isDriving ? 8.6 + speedNorm * 1.4 : isAiming ? 3.35 : 5.95;
    const shoulder = isDriving ? 0 : isAiming ? 0.86 : 0.72;
    const pitch = isDriving ? 0.24 : this.camPitch;
    const horizDist = Math.cos(pitch) * dist;
    const vertOffset = Math.sin(pitch) * dist + (isDriving ? 1.35 : 0.45);

    _camGoal.set(
      pivotX - fwdX * horizDist + rightX * shoulder,
      Math.max(0.85, pivotY + vertOffset),
      pivotZ - fwdZ * horizDist + rightZ * shoulder,
    );

    // Wall pull-in raycast against static building obstructions
    _rayOrigin.set(pivotX, pivotY, pivotZ);
    _rayDir.subVectors(_camGoal, _rayOrigin);
    const desiredDist = _rayDir.length();
    if (desiredDist > 0.1) {
      _rayDir.divideScalar(desiredDist);
      _raycaster.set(_rayOrigin, _rayDir);
      _raycaster.near = 0.2;
      _raycaster.far = desiredDist;
      const hits = _raycaster.intersectObjects(this.world.cameraObstructions, true);
      if (hits.length > 0 && hits[0].distance < desiredDist) {
        const pullDist = Math.max(isDriving ? 2.4 : 1.35, hits[0].distance - 0.35);
        _camGoal.copy(_rayOrigin).addScaledVector(_rayDir, pullDist);
      }
    }

    // Exponentially damped camera glide
    const camLerp = 1 - Math.exp(-(isDriving ? 11 : 16) * dt);
    this.camPos.lerp(_camGoal, camLerp);

    // Look target slightly ahead of player/vehicle along camera view ray
    _lookGoal.set(
      pivotX + fwdX * (isDriving ? 14 : 16) + rightX * (shoulder * 0.55),
      pivotY - Math.sin(pitch) * (isDriving ? 3.5 : 14) + 0.25,
      pivotZ + fwdZ * (isDriving ? 14 : 16) + rightZ * (shoulder * 0.55),
    );
    this.camLook.lerp(_lookGoal, 1 - Math.exp(-18 * dt));

    // Decaying trauma^2 camera shake
    const shakeAmt = this.trauma * this.trauma * 0.34;
    const sx = shakeAmt > 0.001 ? (Math.random() - 0.5) * shakeAmt : 0;
    const sy = shakeAmt > 0.001 ? (Math.random() - 0.5) * shakeAmt : 0;

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook.x, this.camLook.y, this.camLook.z);
  }

  private firePlayerWeapon(): void {
    const spec = WEAPONS[this.weapon.active];
    const mods = this.loadoutMods;
    gameAudio.playShoot(spec.id);

    const effRecoil = spec.recoilKick * mods.recoilMult;
    this.recoilVisual = Math.min(1, this.recoilVisual + effRecoil);
    this.crosshairSpread = Math.min(1, this.crosshairSpread + effRecoil * 0.85);
    this.trauma = Math.min(1, this.trauma + effRecoil * 0.28);

    // Snap hero facing toward camera forward on shot
    this.player.facingYaw = this.camYaw + Math.PI;
    this.hero.root.rotation.y = this.player.facingYaw;
    this.hero.root.updateMatrixWorld(true);

    // Compute world-space aim target from exact center screen reticle!
    _raycaster.setFromCamera(_ndcCenter, this.camera);
    _aimPoint.copy(_raycaster.ray.origin).addScaledVector(_raycaster.ray.direction, 64);

    // Check if crosshair aims directly at an enemy (gentle magnetic snap onto enemy torso for crisp 3rd-person feel)
    let closestT = 64;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.aiState === 'ko') continue;
      _v1.set(e.x, e.y + e.height * 0.55, e.z);
      _v2.subVectors(_v1, _raycaster.ray.origin);
      const proj = _v2.dot(_raycaster.ray.direction);
      if (proj < 1.5 || proj > closestT) continue;
      _v3.copy(_raycaster.ray.origin).addScaledVector(_raycaster.ray.direction, proj);
      const perpDist = _v3.distanceTo(_v1);
      if (perpDist < e.radius + 0.55) {
        closestT = proj;
        _aimPoint.copy(_v3);
      }
    }

    this.hero.muzzlePoint.getWorldPosition(_muzzlePos);
    this.hero.ejectPoint.getWorldPosition(_ejectPos);

    // 1. Volumetric 3D Star Muzzle Flash + Dynamic Muzzle PointLight tinted by custom Tracer/Flash FX
    this.hero.muzzleFlash.visible = true;
    this.hero.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    const flashScale = spec.id === 'scatter' ? 1.5 : spec.id === 'rail' ? 1.35 : 0.95;
    this.hero.muzzleFlash.scale.setScalar(flashScale);
    this.muzzleFlashTimer = 0.055;
    this.boltKickTimer = spec.id === 'scatter' ? 0.24 : 0.09;

    this.muzzleLight.color.setHex(mods.tracerColor);
    this.muzzleLight.position.copy(_muzzlePos);
    this.muzzleLightTimer = 0.065;

    // Hot muzzle flash sparks matching custom tracer FX
    this.spawnParticles(
      _muzzlePos.x,
      _muzzlePos.y,
      _muzzlePos.z,
      spec.pellets > 1 ? 10 : 5,
      [mods.tracerColor, 0xffd27a, 0xffffff],
      2.6,
      6.4,
      0.07,
      0.13,
      5,
      0.18,
      false,
    );

    // 2. Wispy Rising Translucent Gunsmoke Puffs from the Barrel!
    this.spawnSmoke(
      _muzzlePos.x,
      _muzzlePos.y + 0.05,
      _muzzlePos.z,
      spec.id === 'scatter' ? 6 : spec.id === 'rail' ? 5 : 3,
      0.11,
      0.19,
    );

    // 3. Eject Spinning Brass / Red Shotgun Shell Casing from Ejection Port
    this.spawnShellCasing(_ejectPos.x, _ejectPos.y, _ejectPos.z, spec.id);

    const spreadMult = (this.mouseRightDown ? 0.45 : 1.0) * mods.spreadMult;
    const effDamage = Math.round(spec.damage * mods.damageMult);
    const effProjSpeed = spec.projectileSpeed * mods.speedMult;

    for (let p = 0; p < spec.pellets; p++) {
      _v1.subVectors(_aimPoint, _muzzlePos).normalize();
      if (spec.spreadRad > 0) {
        _v1.x += (Math.random() - 0.5) * spec.spreadRad * spreadMult * 2;
        _v1.y += (Math.random() - 0.5) * spec.spreadRad * spreadMult * 2;
        _v1.z += (Math.random() - 0.5) * spec.spreadRad * spreadMult * 2;
        _v1.normalize();
      }
      this.spawnProjectile(
        true,
        _muzzlePos.x,
        _muzzlePos.y,
        _muzzlePos.z,
        _v1.x * effProjSpeed,
        _v1.y * effProjSpeed,
        _v1.z * effProjSpeed,
        effDamage,
        spec.piercing,
        mods.tracerColor,
        spec.hitstopSec,
      );
    }

    if (this.gameMode === 'deathmatch') {
      _v1.subVectors(_aimPoint, _muzzlePos).normalize();
      multiplayer.sendShoot(
        [_muzzlePos.x, _muzzlePos.y, _muzzlePos.z],
        [_v1.x, _v1.y, _v1.z],
        spec.id,
      );
    }
  }

  private spawnProjectile(
    fromPlayer: boolean,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    damage: number,
    piercing: boolean,
    color: number,
    hitstopSec: number,
  ): void {
    const slot = this.projectiles.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.fromPlayer = fromPlayer;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.damage = damage;
    slot.piercing = piercing;
    slot.hitIds.clear();
    slot.life = fromPlayer ? 1.4 : 2.8;
    slot.maxLife = slot.life;
    slot.color = color;
    slot.hitstopSec = hitstopSec;

    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.set(
      fromPlayer ? (piercing ? 1.35 : 0.9) : 1.55,
      fromPlayer ? (piercing ? 1.35 : 0.9) : 1.55,
      fromPlayer ? (piercing ? 3.2 : 1.35) : 0.55,
    );
    _v2.set(x + vx, y + vy, z + vz);
    slot.mesh.lookAt(_v2);
    slot.mesh.visible = true;
  }

  private updateWaveSpawner(dt: number): void {
    this.waveClock += dt;

    const aliveCount = this.enemies.filter((e) => e.aiState !== 'ko').length;
    while (
      this.waveSpawnIndex < this.wavePlan.entries.length &&
      this.waveClock >= this.wavePlan.entries[this.waveSpawnIndex].delay &&
      aliveCount < this.wavePlan.maxConcurrent
    ) {
      const entry = this.wavePlan.entries[this.waveSpawnIndex++];
      this.spawnEnemy(entry.archetype, entry.spawnIndex);
      break; // stagger 1 per frame max
    }

    // Check wave clear
    if (
      this.waveSpawnIndex >= this.wavePlan.entries.length &&
      this.enemies.length === 0
    ) {
      if (this.gameMode === 'mecha' && this.waveNumber >= TOTAL_WAVES) {
        this.finishRun('victory');
      } else {
        if (this.nextWaveDelayTimer <= 0) {
          this.nextWaveDelayTimer = 2.4;
          gameAudio.playWaveClear();
          // Heal player slightly between waves/hordes for heroic flow
          this.playerHp = Math.min(PLAYER_MAX_HP, this.playerHp + (this.gameMode === 'zombies' ? 25 : 20));
          this.forceHudEmit = true;
        } else {
          this.nextWaveDelayTimer -= dt;
          if (this.nextWaveDelayTimer <= 0) {
            this.beginWave(this.waveNumber + 1);
          }
        }
      }
    }
  }

  private pickOpenWorldSpawnNearPlayer(spawnIdx: number): { x: number; z: number } {
    const anchors = this.world.zoneAnchors[this.currentZone];
    // Try nearest anchor in current zone if within 16..52m of player
    if (anchors && anchors.length > 0) {
      const candidate = anchors[spawnIdx % anchors.length];
      const d = Math.hypot(candidate.x - this.player.x, candidate.z - this.player.z);
      if (d >= 14 && d <= 52) {
        return {
          x: candidate.x + (Math.random() - 0.5) * 3.0,
          z: candidate.z + (Math.random() - 0.5) * 3.0,
        };
      }
    }
    // Otherwise place along an open ring 22..36m ahead/around player, resolved cleanly out of buildings
    const baseAngle = this.activeVehicle
      ? this.activeVehicle.state.yaw + (Math.random() - 0.5) * 1.4
      : Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * 14;
    const rawX = clamp(this.player.x + Math.sin(baseAngle) * dist, -ARENA_HALF_EXTENT + 10, ARENA_HALF_EXTENT - 10);
    const rawZ = clamp(this.player.z + Math.cos(baseAngle) * dist, -ARENA_HALF_EXTENT + 10, ARENA_HALF_EXTENT - 10);
    const safe = resolveCylinderWorldCollision(rawX, 0.1, rawZ, 0.9, 2.0, this.world.colliders);
    return { x: safe.x, z: safe.z };
  }

  private spawnEnemy(archetype: EnemyArchetype, spawnIdx: number): void {
    const base = ENEMY_STATS[archetype];
    const pos = this.pickOpenWorldSpawnNearPlayer(spawnIdx);
    const rig = buildEnemyRig(archetype, this.materials, this.gameMode);
    const sx = pos.x;
    const sz = pos.z;
    rig.root.position.set(sx, 0, sz);
    this.scene.add(rig.root);

    // Laser sight line for ranged/boss units during telegraph (Station Walker zombies are pure melee!)
    const isRanged =
      archetype === 'drone' ||
      archetype === 'shogun' ||
      (archetype === 'trooper' && this.gameMode === 'mecha');
    let sightLine: THREE.Line | null = null;
    if (isRanged) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 1),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color:
          archetype === 'drone'
            ? this.gameMode === 'zombies'
              ? 0x8cf536
              : 0xe85cff
            : 0xff4436,
        transparent: true,
        opacity: 0.85,
      });
      sightLine = new THREE.Line(lineGeo, lineMat);
      sightLine.visible = false;
      this.scene.add(sightLine);
    }

    this.enemies.push({
      id: this.nextEnemyId++,
      archetype,
      rig,
      x: sx,
      y: 0,
      z: sz,
      vx: 0,
      vz: 0,
      yaw: 0,
      hp: base.maxHp,
      maxHp: base.maxHp,
      radius: base.radius,
      height: base.height,
      speed: base.speed * this.wavePlan.speedMultiplier,
      damage: base.damage,
      scoreValue: base.scoreValue,
      aiState: 'move',
      stateTimer: 0,
      attackCooldown: 1.0 + Math.random() * 1.1,
      hasToken: false,
      hitFlashTimer: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      walkPhase: Math.random() * Math.PI * 2,
      chargeDirX: 0,
      chargeDirZ: 1,
      koTimer: 0,
      koFallDirX: 0,
      koFallDirZ: 1,
      sightLine,
    });

    // Arrival teleport voxel burst
    this.spawnParticles(sx, 1.0, sz, 10, [0xffae34, 0xffe49e], 1.5, 4.0, 0.12, 0.22, 6, 0.45);
    this.forceHudEmit = true;
  }

  private updateEnemies(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const base = ENEMY_STATS[e.archetype];

      // Hit flash decay
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
        const flashOn = e.hitFlashTimer > 0;
        for (let m = 0; m < e.rig.flashMaterials.length; m++) {
          const mat = e.rig.flashMaterials[m];
          mat.emissive.setHex(flashOn ? 0xffffff : 0x000000);
          mat.emissiveIntensity = flashOn ? 0.85 : 0;
        }
      }

      // KO topple & voxel shatter transition (0.35s)
      if (e.aiState === 'ko') {
        e.koTimer -= dt;
        const p = 1 - Math.max(0, e.koTimer / 0.36);
        e.rig.bodyGroup.rotation.x = p * 1.35;
        e.rig.bodyGroup.position.y = Math.sin(p * Math.PI) * 0.45 - p * 0.3;
        e.x += e.koFallDirX * 3.8 * dt * (1 - p);
        e.z += e.koFallDirZ * 3.8 * dt * (1 - p);
        e.rig.root.position.set(e.x, e.y, e.z);
        e.rig.hpBarBg.visible = false;
        (e.rig.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0;
        if (e.sightLine) e.sightLine.visible = false;

        if (e.koTimer <= 0) {
          this.shatterEnemy(e);
          this.scene.remove(e.rig.root);
          if (e.sightLine) this.scene.remove(e.sightLine);
          this.enemies.splice(i, 1);
          this.forceHudEmit = true;
        }
        continue;
      }

      let dx = this.player.x - e.x;
      let dz = this.player.z - e.z;
      let dist = Math.hypot(dx, dz) || 0.001;

      // Open-world roaming leash: if player speeds > 82m away in a car, relocate trailing zombies ahead along the highway!
      if (dist > 82) {
        const ahead = this.pickOpenWorldSpawnNearPlayer(e.id);
        e.x = ahead.x;
        e.z = ahead.z;
        e.y = 0;
        e.rig.root.position.set(e.x, e.y, e.z);
        dx = this.player.x - e.x;
        dz = this.player.z - e.z;
        dist = Math.hypot(dx, dz) || 0.001;
      }

      const dirX = dx / dist;
      const dirZ = dz / dist;
      const desiredYaw = Math.atan2(dirX, dirZ);

      e.attackCooldown = Math.max(0, e.attackCooldown - dt);

      // Update diegetic HP bar billboard
      if (e.hp < e.maxHp && e.archetype !== 'shogun') {
        e.rig.hpBarBg.visible = true;
        e.rig.hpBarBg.lookAt(this.camera.position);
        const ratio = clamp(e.hp / e.maxHp, 0.01, 1);
        e.rig.hpBarFill.scale.x = ratio;
        e.rig.hpBarFill.position.x = -(1 - ratio) * 0.49;
      }

      const ringMat = e.rig.telegraphRing.material as THREE.MeshBasicMaterial;

      if (e.aiState === 'move') {
        ringMat.opacity = 0;
        if (e.sightLine) e.sightLine.visible = false;

        e.yaw = dampAngle(e.yaw, desiredYaw, 8, dt);

        // Distinct movement policy per archetype!
        let moveX = 0;
        let moveZ = 0;
        if (e.archetype === 'rusher') {
          // Zigzag fast flanking swarmer / Infected Sprinter
          const zig = Math.sin(this.elapsedSec * 4.5 + e.id) * 0.65;
          moveX = (dirX - dirZ * zig) * e.speed;
          moveZ = (dirZ + dirX * zig) * e.speed;
        } else if (e.archetype === 'trooper') {
          if (this.gameMode === 'zombies') {
            // Relentless shambling Station Walker zombie closing straight in for claw swipe!
            const sway = Math.sin(this.elapsedSec * 2.6 + e.id) * 0.28;
            moveX = (dirX - dirZ * sway) * e.speed * 1.15;
            moveZ = (dirZ + dirX * sway) * e.speed * 1.15;
          } else {
            // Tanuki Gunner kiter/ranged strafer maintaining mid-range spacing
            const radial = dist > base.preferredRange + 2.5 ? 0.85 : dist < base.preferredRange - 3.5 ? -0.75 : 0;
            moveX = (dirX * radial - dirZ * e.strafeDir * 0.72) * e.speed;
            moveZ = (dirZ * radial + dirX * e.strafeDir * 0.72) * e.speed;
          }
        } else if (e.archetype === 'charger') {
          // Steady lumbering advance to line up charge
          moveX = dirX * e.speed;
          moveZ = dirZ * e.speed;
        } else if (e.archetype === 'drone') {
          // High-altitude flanker / Acid Spitter orbiting at mid-range
          const radial = dist > base.preferredRange + 3 ? 0.7 : dist < 8 ? -0.6 : 0;
          moveX = (dirX * radial - dirZ * e.strafeDir * 0.95) * e.speed;
          moveZ = (dirZ * radial + dirX * e.strafeDir * 0.95) * e.speed;
        } else {
          // Shogun / Alpha Nemesis Boss: intimidating advance + periodic strafe
          const radial = dist > 11 ? 0.85 : dist < 6 ? -0.35 : 0.15;
          moveX = (dirX * radial - dirZ * e.strafeDir * 0.45) * e.speed;
          moveZ = (dirZ * radial + dirX * e.strafeDir * 0.45) * e.speed;
        }

        // Gentle separation from neighboring enemies so crowds never stack into one blob
        for (let j = 0; j < this.enemies.length; j++) {
          if (i === j || this.enemies[j].aiState === 'ko') continue;
          const other = this.enemies[j];
          const sx = e.x - other.x;
          const sz = e.z - other.z;
          const sDist = Math.hypot(sx, sz);
          const minSep = e.radius + other.radius + 0.65;
          if (sDist > 0.01 && sDist < minSep) {
            const push = ((minSep - sDist) / minSep) * 4.5;
            moveX += (sx / sDist) * push;
            moveZ += (sz / sDist) * push;
          }
        }

        e.vx = moveX;
        e.vz = moveZ;

        // Check if ready to acquire an attack token and enter visible windup telegraph
        const isZombieWalker = this.gameMode === 'zombies' && e.archetype === 'trooper';
        const inRange =
          e.archetype === 'rusher' || isZombieWalker
            ? dist < 4.5
            : e.archetype === 'charger'
              ? dist < 13.5
              : dist < 24;

        if (
          inRange &&
          e.attackCooldown <= 0 &&
          (this.activeAttackTokens < MAX_ATTACK_TOKENS || e.archetype === 'shogun')
        ) {
          e.aiState = 'telegraph';
          e.stateTimer = base.telegraphSec;
          e.chargeDirX = dirX;
          e.chargeDirZ = dirZ;
          if (e.archetype !== 'shogun') {
            this.activeAttackTokens++;
            e.hasToken = true;
          }
          gameAudio.playTelegraph(this.gameMode === 'zombies');
        }
      } else if (e.aiState === 'telegraph') {
        // Visible windup crouch/glow + pulsing ground ring + optional laser sight line!
        e.vx *= Math.exp(-10 * dt);
        e.vz *= Math.exp(-10 * dt);
        e.yaw = dampAngle(e.yaw, desiredYaw, 12, dt);
        e.stateTimer -= dt;

        const progress = 1 - clamp(e.stateTimer / base.telegraphSec, 0, 1);
        ringMat.opacity = 0.25 + progress * 0.65;
        e.rig.telegraphRing.scale.setScalar(0.65 + progress * 0.55);

        // Aim tracking sight line for ranged attackers
        if (e.sightLine) {
          e.sightLine.visible = true;
          const posAttr = e.sightLine.geometry.attributes.position as THREE.BufferAttribute;
          const originY = e.archetype === 'shogun' ? 2.15 : e.archetype === 'drone' ? 1.8 : 1.15;
          posAttr.setXYZ(0, e.x, e.y + originY, e.z);
          posAttr.setXYZ(1, this.player.x, this.player.y + 0.95, this.player.z);
          posAttr.needsUpdate = true;
        }

        // Subtle windup crouch
        e.rig.bodyGroup.scale.set(1 + progress * 0.12, 1 - progress * 0.14, 1 + progress * 0.12);

        if (e.stateTimer <= 0) {
          e.rig.bodyGroup.scale.set(1, 1, 1);
          ringMat.opacity = 0;
          if (e.sightLine) e.sightLine.visible = false;

          e.chargeDirX = dirX;
          e.chargeDirZ = dirZ;
          this.executeEnemyAttack(e, dirX, dirZ);
        }
      } else if (e.aiState === 'attack') {
        // Active dash/charge lunge for Rusher & Oni Charger
        e.stateTimer -= dt;
        const lungeSpeed = e.archetype === 'charger' ? 16.5 : 13.5;
        e.vx = e.chargeDirX * lungeSpeed;
        e.vz = e.chargeDirZ * lungeSpeed;

        // Check melee contact with player
        const pDist = Math.hypot(this.player.x - e.x, this.player.z - e.z);
        if (pDist < e.radius + 0.65 && Math.abs(this.player.y - e.y) < 1.6) {
          this.damagePlayer(e.damage, e.chargeDirX, e.chargeDirZ);
          e.aiState = 'recover';
          e.stateTimer = 0.55;
          this.releaseEnemyToken(e);
        } else if (e.stateTimer <= 0) {
          e.aiState = 'recover';
          e.stateTimer = e.archetype === 'charger' ? 0.65 : 0.35;
          this.releaseEnemyToken(e);
        }
      } else if (e.aiState === 'recover') {
        e.vx *= Math.exp(-8 * dt);
        e.vz *= Math.exp(-8 * dt);
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          e.aiState = 'move';
          e.attackCooldown = base.attackCooldown * (0.85 + Math.random() * 0.35);
          if (Math.random() > 0.5) e.strafeDir *= -1;
        }
      }

      // Apply movement & world collision (only Mecha Tengu Drones fly over low crates; Acid Spitters run on ground!)
      const nextX = e.x + e.vx * dt;
      const nextZ = e.z + e.vz * dt;
      if (e.archetype === 'drone' && this.gameMode === 'mecha') {
        e.x = clamp(nextX, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);
        e.z = clamp(nextZ, -ARENA_HALF_EXTENT, ARENA_HALF_EXTENT);
      } else {
        const res = resolveCylinderWorldCollision(
          nextX,
          e.y,
          nextZ,
          e.radius,
          e.height,
          this.world.colliders,
        );
        e.x = res.x;
        e.z = res.z;
        e.y = res.groundY;
        if (res.hitWall && e.aiState === 'attack' && e.archetype === 'charger') {
          // Charger slams into cover with sparks and staggers briefly!
          this.spawnParticles(e.x, 1.0, e.z, 10, [0xff8c38, 0xd4c8b4], 2, 5, 0.1, 0.2, 14, 0.4);
          e.aiState = 'recover';
          e.stateTimer = 0.85;
          this.releaseEnemyToken(e);
        }
      }

      // Sync visual transform & gait animation
      e.rig.root.position.set(e.x, e.y, e.z);
      e.rig.root.rotation.y = e.yaw;

      const spd = Math.hypot(e.vx, e.vz);
      e.walkPhase += dt * (e.archetype === 'drone' && this.gameMode === 'mecha' ? 8.5 : Math.max(2, spd * 2.1));
      if (e.archetype === 'drone' && this.gameMode === 'mecha') {
        e.rig.bodyGroup.position.y = Math.sin(this.elapsedSec * 3.8 + e.id) * 0.22;
        e.rig.leftLimb.rotation.z = Math.sin(e.walkPhase) * 0.35;
        e.rig.rightLimb.rotation.z = -Math.sin(e.walkPhase) * 0.35;
      } else {
        const swing = clamp(spd / 6, 0, 1) * 0.65;
        e.rig.leftLimb.rotation.x = Math.sin(e.walkPhase) * swing;
        e.rig.rightLimb.rotation.x = -Math.sin(e.walkPhase) * swing;
        if (this.gameMode === 'zombies') {
          // Eerie shambling body sway for zombies
          e.rig.bodyGroup.rotation.z = Math.sin(e.walkPhase * 0.5) * 0.08;
        }
      }
    }
  }

  private executeEnemyAttack(e: ActiveEnemy, dirX: number, dirZ: number): void {
    const isZombieWalker = this.gameMode === 'zombies' && e.archetype === 'trooper';
    if (e.archetype === 'rusher' || e.archetype === 'charger' || isZombieWalker) {
      e.aiState = 'attack';
      e.stateTimer = e.archetype === 'charger' ? 0.62 : 0.36;
      return;
    }

    // Ranged volleys (Mecha Trooper, Drone / Acid Spitter, Shogun / Alpha Nemesis Boss)
    const originY = e.archetype === 'shogun' ? 2.1 : e.archetype === 'drone' ? (this.gameMode === 'zombies' ? 1.35 : 1.85) : 1.15;
    const dy = this.player.y + 0.9 - (e.y + originY);
    const horizDist = Math.hypot(this.player.x - e.x, this.player.z - e.z) || 1;

    if (e.archetype === 'trooper') {
      const spd = 21;
      _v1.set(dirX * horizDist, dy, dirZ * horizDist).normalize();
      this.spawnProjectile(
        false,
        e.x + dirX * 0.7,
        e.y + originY,
        e.z + dirZ * 0.7,
        _v1.x * spd,
        _v1.y * spd,
        _v1.z * spd,
        e.damage,
        false,
        0xff9d38,
        0,
      );
    } else if (e.archetype === 'drone') {
      // 3-bolt fan volley (toxic acid globs in Zombies mode, violet plasma in Mecha mode)
      const spd = 19;
      const boltColor = this.gameMode === 'zombies' ? 0x8cf536 : 0xe85cff;
      for (const offset of [-0.16, 0, 0.16]) {
        const c = Math.cos(offset);
        const s = Math.sin(offset);
        const rx = dirX * c - dirZ * s;
        const rz = dirX * s + dirZ * c;
        _v1.set(rx * horizDist, dy, rz * horizDist).normalize();
        this.spawnProjectile(
          false,
          e.x + rx * 0.6,
          e.y + originY,
          e.z + rz * 0.6,
          _v1.x * spd,
          _v1.y * spd,
          _v1.z * spd,
          e.damage,
          false,
          boltColor,
          0,
        );
      }
    } else if (e.archetype === 'shogun') {
      // Boss 5-bolt crimson barrage from twin shoulder cannons
      const spd = 22;
      for (const offset of [-0.28, -0.14, 0, 0.14, 0.28]) {
        const c = Math.cos(offset);
        const s = Math.sin(offset);
        const rx = dirX * c - dirZ * s;
        const rz = dirX * s + dirZ * c;
        _v1.set(rx * horizDist, dy, rz * horizDist).normalize();
        this.spawnProjectile(
          false,
          e.x + rx * 1.2,
          e.y + originY,
          e.z + rz * 1.2,
          _v1.x * spd,
          _v1.y * spd,
          _v1.z * spd,
          e.damage,
          false,
          0xff4838,
          0,
        );
      }
    }

    e.aiState = 'recover';
    e.stateTimer = 0.45;
    this.releaseEnemyToken(e);
  }

  private releaseEnemyToken(e: ActiveEnemy): void {
    if (e.hasToken) {
      e.hasToken = false;
      this.activeAttackTokens = Math.max(0, this.activeAttackTokens - 1);
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      // Sub-step long fast rays slightly to avoid tunneling thin cover
      const steps = p.fromPlayer ? 2 : 1;
      const stepDt = dt / steps;
      let destroyed = false;

      for (let s = 0; s < steps && !destroyed; s++) {
        p.x += p.vx * stepDt;
        p.y += p.vy * stepDt;
        p.z += p.vz * stepDt;

        // Ground or arena exit
        if (
          p.y < 0.05 ||
          Math.abs(p.x) > ARENA_HALF_EXTENT + 6 ||
          Math.abs(p.z) > ARENA_HALF_EXTENT + 6
        ) {
          this.spawnParticles(p.x, Math.max(0.1, p.y), p.z, 4, [p.color, 0xddd4c2], 1, 3.2, 0.08, 0.14, 14, 0.3);
          destroyed = true;
          break;
        }

        // Static world cover collision
        for (let c = 0; c < this.world.colliders.length; c++) {
          const box: ColliderBox = this.world.colliders[c];
          if (!box.blocksBullets) continue;
          if (pointHitsBox(p.x, p.y, p.z, box, 0.08)) {
            this.spawnParticles(p.x, p.y, p.z, 5, [p.color, 0xfff0c4], 1.5, 4.2, 0.08, 0.15, 14, 0.32);
            destroyed = true;
            break;
          }
        }
        if (destroyed) break;

        if (p.fromPlayer) {
          // 1. Check explosive hazard fuel barrels (instant chain-reaction fireball!)
          for (let bIdx = 0; bIdx < this.world.explosiveBarrels.length; bIdx++) {
            const b = this.world.explosiveBarrels[bIdx];
            if (!b.active) continue;
            if (p.y >= b.y && p.y <= b.y + 1.5) {
              const bdSq = (p.x - b.x) * (p.x - b.x) + (p.z - b.z) * (p.z - b.z);
              if (bdSq <= 0.72 * 0.72) {
                this.hitmarkerTimer = 0.16;
                this.hitmarkerCrit = true;
                this.detonateBarrel(b);
                destroyed = true;
                break;
              }
            }
          }
          if (destroyed) break;

          // 2. Check shootable parked vehicles (sparks, hull damage & fiery detonation!)
          for (let vIdx = 0; vIdx < this.vehicles.length; vIdx++) {
            const v = this.vehicles[vIdx];
            if (v.state.destroyed || v === this.activeVehicle) continue;
            if (p.y >= 0.05 && p.y <= 2.2) {
              const vdSq = (p.x - v.state.x) * (p.x - v.state.x) + (p.z - v.state.z) * (p.z - v.state.z);
              const vr = v.state.radius + 0.15;
              if (vdSq <= vr * vr) {
                this.hitmarkerTimer = 0.12;
                this.hitmarkerCrit = false;
                gameAudio.playHit(false, false);
                this.damageVehicle(v, Math.round(p.damage * 0.75), p.x, p.z);
                if (!p.piercing) {
                  destroyed = true;
                  break;
                }
              }
            }
          }
          if (destroyed) break;

          // 3. Check enemy hits
          for (let eIdx = 0; eIdx < this.enemies.length; eIdx++) {
            const e = this.enemies[eIdx];
            if (e.aiState === 'ko' || p.hitIds.has(e.id)) continue;

            const minY = e.archetype === 'drone' && this.gameMode === 'mecha' ? 1.1 : e.y;
            const maxY = e.archetype === 'drone' && this.gameMode === 'mecha' ? 2.6 : e.y + e.height + 0.25;
            if (p.y < minY || p.y > maxY) continue;

            const distSq = (p.x - e.x) * (p.x - e.x) + (p.z - e.z) * (p.z - e.z);
            const hitR = e.radius + 0.36;
            if (distSq <= hitR * hitR) {
              p.hitIds.add(e.id);
              const isHeadshot = p.y > maxY - 0.58;
              const dmg = isHeadshot ? Math.round(p.damage * 1.45) : p.damage;
              this.damageEnemy(e, dmg, isHeadshot, p.vx, p.vz, p.color, p.hitstopSec);

              if (!p.piercing) {
                destroyed = true;
                break;
              }
            }
          }

          // 4. In TDM, check hits on opposing remote players & opposing bots
          if (this.gameMode === 'deathmatch') {
            for (const [rpId, rp] of this.remotePlayers) {
              if (rp.state.team === multiplayer.localTeam) continue;
              const rpx = rp.rig.root.position.x;
              const rpy = rp.rig.root.position.y;
              const rpz = rp.rig.root.position.z;
              if (p.y >= rpy && p.y <= rpy + PLAYER_HEIGHT + 0.2) {
                const rdx = p.x - rpx;
                const rdz = p.z - rpz;
                if (rdx * rdx + rdz * rdz <= 0.65 * 0.65) {
                  const isHeadshot = p.y > rpy + 1.25;
                  const dmg = isHeadshot ? Math.round(p.damage * 1.5) : p.damage;
                  this.hitmarkerTimer = 0.16;
                  this.hitmarkerCrit = isHeadshot;
                  gameAudio.playHit(false, isHeadshot);
                  this.spawnParticles(p.x, p.y, p.z, 8, [0xff4436, 0xffffff], 2, 4, 0.1, 0.18, 10, 0.3);
                  multiplayer.sendHit(rpId, dmg, this.weapon.active);
                  if (!p.piercing) {
                    destroyed = true;
                    break;
                  }
                }
              }
            }
          }
        } else {
          // Enemy bolt hits player
          const dx = p.x - this.player.x;
          const dz = p.z - this.player.z;
          if (
            p.y >= this.player.y &&
            p.y <= this.player.y + PLAYER_HEIGHT &&
            dx * dx + dz * dz <= 0.62 * 0.62
          ) {
            const len = Math.hypot(p.vx, p.vz) || 1;
            this.damagePlayer(p.damage, p.vx / len, p.vz / len);
            destroyed = true;
            break;
          }
        }
      }

      if (destroyed) {
        p.active = false;
        p.mesh.visible = false;
      } else {
        p.mesh.position.set(p.x, p.y, p.z);
      }
    }
  }

  private damageEnemy(
    e: ActiveEnemy,
    damage: number,
    crit: boolean,
    dirVx: number,
    dirVz: number,
    sparkColor: number,
    hitstopSec: number,
  ): void {
    e.hp -= damage;
    e.hitFlashTimer = 0.055;
    this.hitmarkerTimer = 0.14;
    this.hitmarkerCrit = crit;

    const len = Math.hypot(dirVx, dirVz) || 1;
    const nx = dirVx / len;
    const nz = dirVz / len;

    // Knockback nudge
    if (e.archetype !== 'shogun') {
      e.x += nx * 0.18;
      e.z += nz * 0.18;
    }

    const isOrganic = this.gameMode === 'zombies';
    if (isOrganic) {
      // Visceral directional crimson arterial blood spray + persistent ground splatter puddle!
      this.spawnDirectionalBlood(
        e.x,
        e.y + (crit ? e.height * 0.86 : e.height * 0.58),
        e.z,
        nx,
        nz,
        crit ? 18 : 11,
        crit,
      );
      this.spawnBloodPuddle(e.x + nx * 0.45, e.y, e.z + nz * 0.45, crit ? 1.15 : 0.72);
    } else {
      this.spawnParticles(
        e.x,
        e.y + e.height * 0.6,
        e.z,
        crit ? 10 : 6,
        crit ? [0xffe066, sparkColor, 0xffffff] : [sparkColor, 0xffd27a],
        2.2,
        6.0,
        0.1,
        0.18,
        18,
        0.42,
      );
    }

    if (e.hp <= 0) {
      // Trigger KO topple & voxel shatter
      e.hp = 0;
      e.aiState = 'ko';
      e.koTimer = 0.34;
      e.koFallDirX = nx;
      e.koFallDirZ = nz;
      this.releaseEnemyToken(e);

      this.combo += 1;
      this.comboDecayTimer = 4.6;
      this.kills += 1;
      this.score += calculateKillScore(e.scoreValue, this.combo);
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        this.saveBestScore(this.bestScore);
      }

      if (isOrganic) {
        // Dramatic lethal arterial fountain + large persistent ground blood pool
        this.spawnDirectionalBlood(e.x, e.y + e.height * 0.65, e.z, nx, nz, 22, true);
        this.spawnBloodPuddle(e.x + nx * 0.55, e.y, e.z + nz * 0.55, e.archetype === 'shogun' ? 2.1 : 1.45);
      }

      const heavy = e.archetype === 'charger' || e.archetype === 'shogun';
      this.hitstopTimer = Math.max(this.hitstopTimer, heavy ? 0.068 : Math.max(0.032, hitstopSec));
      this.trauma = Math.min(1, this.trauma + (heavy ? 0.65 : 0.34));
      gameAudio.playKill(heavy);
      this.forceHudEmit = true;
    } else {
      if (hitstopSec >= 0.045) {
        this.hitstopTimer = Math.max(this.hitstopTimer, 0.028);
      }
      gameAudio.playHit(crit, isOrganic);
    }
  }

  private shatterEnemy(e: ActiveEnemy): void {
    const isOrganic = this.gameMode === 'zombies';
    const paletteMap: Record<EnemyArchetype, number[]> = isOrganic
      ? {
          rusher: [0xc41414, 0x8f0d0d, 0x6f8260, 0x3b353a],
          trooper: [0xc41414, 0x7d1414, 0x879476, 0x2a3545],
          charger: [0xd91c1c, 0x7d1414, 0x5c6e4e, 0xd46224],
          drone: [0x8cf536, 0xb81d1d, 0x3b5234, 0x6f8260],
          shogun: [0xe01f1f, 0x8a0909, 0x1e1d22, 0xe8dfd0],
        }
      : {
          rusher: [0xd43838, 0xf5efe6, 0x2a2528, 0xff6b4a],
          trooper: [0x526b48, 0xd99b38, 0xc2984f, 0x333940],
          charger: [0x2d2b35, 0xb83728, 0xff6e24, 0xf2c95c],
          drone: [0x4b3869, 0x7658b8, 0xe85cff, 0x38e8ff],
          shogun: [0xa82424, 0xf2c641, 0x24262e, 0xff5238],
        };
    const count = e.archetype === 'shogun' ? 38 : e.archetype === 'charger' ? 26 : 18;
    this.spawnParticles(
      e.x,
      e.y + e.height * 0.5,
      e.z,
      count,
      paletteMap[e.archetype],
      3.0,
      8.5,
      0.14,
      0.3,
      22,
      0.85,
    );
    if (isOrganic) {
      this.spawnBloodPuddle(e.x, e.y, e.z, e.archetype === 'shogun' ? 2.2 : 1.35);
    }

    // Chance to drop glowing med-core or overdrive battery
    const dropRoll = Math.random();
    if (e.archetype === 'charger' || e.archetype === 'shogun' || dropRoll < 0.36) {
      const kind = this.playerHp < PLAYER_MAX_HP * 0.72 || dropRoll < 0.55 ? 'heal' : 'overdrive';
      this.spawnPickup(kind, e.x, e.z);
    }
  }

  private spawnPickup(kind: 'heal' | 'overdrive', x: number, z: number): void {
    const slot = this.pickups.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.kind = kind;
    slot.x = x;
    slot.y = 0.65;
    slot.z = z;
    slot.life = 14;
    const mat = slot.mesh.material as THREE.MeshStandardMaterial;
    if (kind === 'heal') {
      mat.color.setHex(0x4ef2a1);
      mat.emissive.setHex(0x28c778);
    } else {
      mat.color.setHex(0xffc845);
      mat.emissive.setHex(0xe89420);
    }
    slot.mesh.position.set(x, 0.65, z);
    slot.mesh.visible = true;
  }

  private updatePickups(dt: number): void {
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (!pk.active) continue;
      pk.life -= dt;
      if (pk.life <= 0) {
        pk.active = false;
        pk.mesh.visible = false;
        continue;
      }

      pk.bobPhase += dt * 3.2;
      const dx = this.player.x - pk.x;
      const dz = this.player.z - pk.z;
      const dist = Math.hypot(dx, dz);

      // Gentle magnetic pull within 4.2m
      if (dist < 4.2 && dist > 0.05) {
        const pull = (1 - dist / 4.2) * 11 * dt;
        pk.x += (dx / dist) * pull;
        pk.z += (dz / dist) * pull;
      }

      pk.mesh.position.set(pk.x, 0.65 + Math.sin(pk.bobPhase) * 0.18, pk.z);
      pk.mesh.rotation.y += dt * 2.4;

      if (dist < 1.15) {
        pk.active = false;
        pk.mesh.visible = false;
        gameAudio.playPickup();
        if (pk.kind === 'heal') {
          this.playerHp = Math.min(PLAYER_MAX_HP, this.playerHp + 22);
          this.spawnParticles(this.player.x, this.player.y + 1, this.player.z, 10, [0x4ef2a1, 0xffffff], 1.5, 3.8, 0.1, 0.16, 4, 0.45);
        } else {
          this.score += 150;
          this.weapon.ammo[this.weapon.active] = getEffectiveMagSize(
            this.weapon.active,
            this.loadoutMods.magMult,
          );
          this.weapon.reloading = false;
          this.player.dashCharges = this.player.maxDashCharges;
          this.spawnParticles(this.player.x, this.player.y + 1, this.player.z, 10, [0xffc845, 0xffffff], 1.5, 3.8, 0.1, 0.16, 4, 0.45);
        }
        this.forceHudEmit = true;
      }
    }
  }

  private damagePlayer(amount: number, knockX: number, knockZ: number): void {
    if (this.player.invulnTimer > 0 || this.pendingDefeat) return;

    this.playerHp = Math.max(0, this.playerHp - amount);
    this.damageTaken += amount;
    this.player.invulnTimer = 0.48;
    this.hurtFlash = 1.0;
    this.trauma = Math.min(1, this.trauma + 0.55);
    this.player.vx += knockX * 7.5;
    this.player.vz += knockZ * 7.5;

    gameAudio.playHurt();
    this.spawnParticles(
      this.player.x,
      this.player.y + 1.0,
      this.player.z,
      10,
      [0xff4c3b, 0xffae34],
      2.0,
      5.0,
      0.1,
      0.18,
      16,
      0.4,
    );

    if (this.playerHp <= 0) {
      if (this.gameMode === 'deathmatch') {
        this.respawnPlayerInTdm();
      } else {
        this.pendingDefeat = true;
        this.defeatBeatTimer = 0.55;
        this.clearHeldInputs();
        gameAudio.playDefeat();
      }
    }
    this.forceHudEmit = true;
  }

  private finishRun(outcome: 'victory' | 'gameover'): void {
    this.phase = outcome;
    this.clearHeldInputs();
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.saveBestScore(this.bestScore);
    }
    if (outcome === 'victory') {
      gameAudio.playWaveClear();
    }
    this.syncBodyState();
    this.emitHudSnapshot();
    this.callbacks.onRunEnd({
      outcome,
      gameMode: this.gameMode,
      score: Math.round(this.score),
      bestScore: Math.round(this.bestScore),
      waveReached: this.waveNumber,
      totalWaves: this.gameMode === 'zombies' ? null : TOTAL_WAVES,
      kills: this.kills,
      elapsedSec: Math.round(this.elapsedSec),
      damageTaken: Math.round(this.damageTaken),
    });
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;

      if (p.ambientPollen) {
        p.x += p.vx * dt;
        p.y += Math.sin(this.titleClock * 1.4 + i) * 0.15 * dt;
        p.z += p.vz * dt;
        if (p.x > 24) p.x = -24;
        if (p.x < -24) p.x = 24;
        if (p.z > 20) p.z = -20;
        if (p.z < -20) p.z = 20;

        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(this.titleClock * 0.6 + i, this.titleClock * 0.4, 0);
        const pulse = this.timeOfDay === 'night' ? 0.8 + Math.sin(this.titleClock * 4.5 + i) * 0.45 : 1.0;
        _dummy.scale.setScalar(p.scale * pulse);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        this.particleMesh.setColorAt(i, _color.setHex(p.color));
        continue;
      }

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.vy -= p.gravity * dt;
      if (p.isSmoke) {
        // Gunsmoke billows & slows horizontally as it rises
        p.vx *= Math.exp(-3.2 * dt);
        p.vz *= Math.exp(-3.2 * dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (!p.isSmoke && p.y < p.scale * 0.5) {
        p.y = p.scale * 0.5;
        p.vy *= -0.42;
        p.vx *= 0.72;
        p.vz *= 0.72;
      }
      p.rotX += p.vRot * dt;
      p.rotY += p.vRot * 0.7 * dt;

      const fade = clamp(p.life / p.maxLife, 0, 1);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.rotX, p.rotY, 0);
      if (p.isSmoke) {
        // Smoke puffs expand outward while rising, then shrink away right at the end
        const smokeScale = p.scale * (1.0 + (1 - fade) * 1.45) * Math.min(1, fade * 3.0);
        _dummy.scale.setScalar(smokeScale);
      } else {
        const s = p.scale * (0.35 + fade * 0.65);
        _dummy.scale.set(s * p.scaleX, s * p.scaleY, s * p.scaleZ);
      }
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _color.setHex(p.color));
    }

    if (anyChanged) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }

    // Update translucent gunsmoke puffs
    let smokeChanged = false;
    for (let i = 0; i < MAX_SMOKE; i++) {
      const p = this.smokeParticles[i];
      if (!p.active) continue;
      smokeChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _dummy.position.set(0, -50, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.vx *= Math.exp(-3.4 * dt);
      p.vz *= Math.exp(-3.4 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rotX += p.vRot * dt;
      p.rotY += p.vRot * 0.7 * dt;
      const fade = clamp(p.life / p.maxLife, 0, 1);
      const smokeScale = p.scale * (1.0 + (1 - fade) * 1.25) * Math.min(1, fade * 2.8);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.rotX, p.rotY, 0);
      _dummy.scale.setScalar(smokeScale);
      _dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _dummy.matrix);
      this.smokeMesh.setColorAt(i, _color.setHex(p.color));
    }
    if (smokeChanged) {
      this.smokeMesh.instanceMatrix.needsUpdate = true;
      if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
    }
  }

  private maybeEmitHud(dt: number): void {
    this.hudEmitAccum += dt;
    if (this.forceHudEmit || this.hudEmitAccum >= 0.085) {
      this.hudEmitAccum = 0;
      this.forceHudEmit = false;
      this.emitHudSnapshot();
    }
  }

  private emitHudSnapshot(): void {
    const remainingUnspawned = Math.max(0, this.wavePlan.entries.length - this.waveSpawnIndex);
    const activeAlive = this.enemies.filter((e) => e.aiState !== 'ko');
    const boss = activeAlive.find((e) => e.archetype === 'shogun');
    const zoneInfo = WORLD_ZONE_INFO[this.currentZone];

    const snapshot: HudSnapshot = {
      phase: this.phase,
      gameMode: this.gameMode,
      timeOfDay: this.timeOfDay,
      zone: this.currentZone,
      zoneName: zoneInfo.name,
      zoneBannerTimer: this.zoneBannerTimer,
      hp: Math.round(this.playerHp),
      maxHp: PLAYER_MAX_HP,
      ghostHp: Math.round(this.ghostHp),
      dashCharges: this.player.dashCharges,
      maxDashCharges: this.player.maxDashCharges,
      dashRechargeProgress:
        this.player.dashCharges < this.player.maxDashCharges
          ? clamp(this.player.dashRechargeTimer / 2.6, 0, 1)
          : 1,
      score: Math.round(this.score),
      bestScore: Math.round(this.bestScore),
      combo: this.combo,
      comboTimer: this.combo > 0 ? clamp(this.comboDecayTimer / 4.6, 0, 1) : 0,
      wave: this.waveNumber,
      totalWaves: this.gameMode === 'zombies' ? null : TOTAL_WAVES,
      waveTitle: this.wavePlan.title,
      waveBannerTimer: this.waveBannerTimer,
      enemiesRemaining: remainingUnspawned + activeAlive.length,
      weapon: this.weapon.active,
      ammo: { ...this.weapon.ammo },
      magSizes: {
        pulse: getEffectiveMagSize('pulse', this.loadoutMods.magMult),
        scatter: getEffectiveMagSize('scatter', this.loadoutMods.magMult),
        rail: getEffectiveMagSize('rail', this.loadoutMods.magMult),
      },
      reloading: this.weapon.reloading,
      reloadProgress: this.weapon.reloading
        ? clamp(1 - this.weapon.reloadTimer / Math.max(0.01, this.weapon.reloadTotal), 0, 1)
        : 0,
      aiming: this.mouseRightDown && !this.activeVehicle,
      pointerLocked: this.pointerLocked,
      hitmarkerTimer: this.hitmarkerTimer,
      hitmarkerCrit: this.hitmarkerCrit,
      hurtFlash: this.hurtFlash,
      muted: gameAudio.isMuted(),
      kills: this.kills,
      elapsedSec: Math.round(this.elapsedSec),
      bossHp: boss ? Math.round(boss.hp) : 0,
      bossMaxHp: boss ? boss.maxHp : 0,
      bossName: boss
        ? this.gameMode === 'zombies'
          ? ZOMBIE_LABELS.shogun
          : ENEMY_STATS.shogun.label
        : '',
      crosshairSpread: this.crosshairSpread,
      inVehicle: this.activeVehicle !== null,
      vehicleName: this.activeVehicle ? this.activeVehicle.state.name : '',
      vehicleSpeedKmh: this.activeVehicle
        ? Math.round(Math.abs(this.activeVehicle.state.speed) * 3.6)
        : 0,
      vehicleNitro: this.activeVehicle ? Math.round(this.activeVehicle.state.nitro) : 100,
      vehicleHp: this.activeVehicle ? Math.round(this.activeVehicle.state.hp) : 120,
      vehicleMaxHp: this.activeVehicle ? this.activeVehicle.state.maxHp : 120,
      nearbyVehicleName:
        !this.activeVehicle && this.nearbyVehicle ? this.nearbyVehicle.state.name : null,
      minimapPlayer: {
        x: this.player.x,
        z: this.player.z,
        yaw: this.activeVehicle
          ? normalizeAngle(this.activeVehicle.state.yaw + Math.PI)
          : this.camYaw,
      },
      minimapEnemies: activeAlive.map((e) => ({
        x: e.x,
        z: e.z,
        archetype: e.archetype,
      })),
      minimapVehicles: this.vehicles.map((v) => ({
        x: v.state.x,
        z: v.state.z,
        active: v === this.activeVehicle,
      })),
      tdmScores: this.gameMode === 'deathmatch' ? multiplayer.scores : undefined,
      tdmTeam: this.gameMode === 'deathmatch' ? multiplayer.localTeam : undefined,
      roomCode: multiplayer.roomCode || undefined,
      isHost: multiplayer.isHost,
      connectedPlayersCount: multiplayer.getConnectedCount(),
      killFeed: multiplayer.killFeed,
    };

    this.callbacks.onHudUpdate(snapshot);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    multiplayer.disconnect();
    for (const [_, rp] of this.remotePlayers) {
      this.scene.remove(rp.rig.root);
    }
    this.remotePlayers.clear();

    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    document.removeEventListener('visibilitychange', this.onVisibilityBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);

    const dom = this.renderer.domElement;
    dom.removeEventListener('mousedown', this.onMouseDownBound);
    dom.removeEventListener('wheel', this.onWheelBound);
    dom.removeEventListener('contextmenu', this.onContextMenuBound);

    this.resizeObserver?.disconnect();
    this.world.disposables.forEach((d) => d.dispose());
    this.composer?.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
