import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWavePlan,
  calculateKillScore,
  computeReloadPose,
  createInitialPlayerState,
  createInitialWeaponState,
  ENEMY_STATS,
  pointHitsBox,
  queryNearbyColliders,
  resolveCylinderWorldCollision,
  stepPlayerKinematics,
  stepWeaponState,
  TOTAL_WAVES,
  WEAPONS,
  applyWeaponOverrides,
  BASE_WEAPONS,
} from './rules';
import {
  attachmentsFor,
  DEFAULT_GUN_BUILDS,
  FIREARMS,
  resolveGun,
  sanitizeBuild,
  slotAvailable,
} from './armory';
import { generateOperator } from './character';
import {
  awardKill,
  createProgression,
  levelInfo,
  playerLevelInfo,
  weaponLevelInfo,
  xpForLevel,
} from './progression';
import type { ColliderBox } from './types';

test('player kinematics: smooth movement, jump coyote time, and landing squash', () => {
  const player = createInitialPlayerState(0, 0, 6);
  const colliders: ColliderBox[] = [];

  for (let i = 0; i < 18; i++) {
    stepPlayerKinematics(
      player,
      {
        forward: 1,
        right: 0,
        cameraYaw: 0,
        jumpJustPressed: false,
        jumpHeld: false,
        dashJustPressed: false,
        aimingOrShooting: false,
      },
      colliders,
      1 / 60,
    );
  }
  assert.ok(player.z < 4.5, 'player should advance along -Z when cameraYaw is 0');
  assert.ok(player.walkDistance > 1.2, 'walkDistance should advance for distance-synced gait');

  const jumpRes = stepPlayerKinematics(
    player,
    {
      forward: 0,
      right: 0,
      cameraYaw: 0,
      jumpJustPressed: true,
      jumpHeld: true,
      dashJustPressed: false,
      aimingOrShooting: false,
    },
    colliders,
    1 / 60,
  );
  assert.equal(jumpRes.jumped, true);
  assert.equal(player.grounded, false);
  assert.ok(player.vy > 8);
  assert.ok(player.squashY > 1.05);

  let landed = false;
  for (let i = 0; i < 90; i++) {
    const r = stepPlayerKinematics(
      player,
      {
        forward: 0,
        right: 0,
        cameraYaw: 0,
        jumpJustPressed: false,
        jumpHeld: false,
        dashJustPressed: false,
        aimingOrShooting: false,
      },
      colliders,
      1 / 60,
    );
    if (r.landed) {
      landed = true;
      break;
    }
  }
  assert.equal(landed, true);
  assert.equal(player.grounded, true);
  assert.equal(player.y, 0);
});

test('player dash consumes charge, grants i-frames, and recharges over time', () => {
  const player = createInitialPlayerState(0, 0, 6);
  const res = stepPlayerKinematics(
    player,
    {
      forward: 1,
      right: 0,
      cameraYaw: 0,
      jumpJustPressed: false,
      jumpHeld: false,
      dashJustPressed: true,
      aimingOrShooting: false,
    },
    [],
    1 / 60,
  );
  assert.equal(res.dashed, true);
  assert.equal(player.dashCharges, 1);
  assert.ok(player.invulnTimer > 0.15);
  assert.ok(Math.abs(player.vz) > 18);

  for (let i = 0; i < 180; i++) {
    stepPlayerKinematics(
      player,
      {
        forward: 0,
        right: 0,
        cameraYaw: 0,
        jumpJustPressed: false,
        jumpHeld: false,
        dashJustPressed: false,
        aimingOrShooting: false,
      },
      [],
      1 / 60,
    );
  }
  assert.equal(player.dashCharges, 2);
});

test('cylinder-vs-AABB collision slides smoothly and allows stepping onto walkable veranda', () => {
  const wall: ColliderBox = {
    id: 'wall',
    minX: -2,
    maxX: 2,
    minY: 0,
    maxY: 4,
    minZ: -2,
    maxZ: 2,
    walkableTop: false,
  };
  const veranda: ColliderBox = {
    id: 'veranda',
    minX: 4,
    maxX: 8,
    minY: 0,
    maxY: 0.45,
    minZ: -2,
    maxZ: 2,
    walkableTop: true,
  };

  const wallRes = resolveCylinderWorldCollision(0, 0, 2.2, 0.45, 1.65, [wall]);
  assert.equal(wallRes.hitWall, true);
  assert.ok(wallRes.z >= 2.44, 'should push player out of solid wall');

  const deckRes = resolveCylinderWorldCollision(6, 0, 0, 0.45, 1.65, [veranda]);
  assert.equal(deckRes.hitWall, false);
  assert.equal(deckRes.groundY, 0.45, 'should step up onto walkable veranda');
});

test('weapon ammo, auto-reload, manual reload, and weapon switching', () => {
  const ws = createInitialWeaponState();
  assert.equal(ws.ammo.pulse, WEAPONS.pulse.magSize);

  const shot1 = stepWeaponState(ws, 0.016, true, false);
  assert.equal(shot1.fired, true);
  assert.equal(ws.ammo.pulse, WEAPONS.pulse.magSize - 1);

  const shotBlocked = stepWeaponState(ws, 0.016, true, false);
  assert.equal(shotBlocked.fired, false);

  const sw = stepWeaponState(ws, 0.016, false, false, 'rail');
  assert.equal(sw.spec.id, 'rail');
  assert.equal(ws.active, 'rail');

  ws.ammo.rail = 1;
  ws.fireCooldown = 0;
  const lastShot = stepWeaponState(ws, 0.016, true, false);
  assert.equal(lastShot.fired, true);
  assert.equal(lastShot.startedReload, true);
  assert.equal(ws.reloading, true);

  const finished = stepWeaponState(ws, WEAPONS.rail.reloadDuration + 0.05, false, false);
  assert.equal(finished.finishedReload, true);
  assert.equal(ws.reloading, false);
  assert.equal(ws.ammo.rail, WEAPONS.rail.magSize);
});

test('wave plans escalate difficulty for both Mecha Defense and endless Zombie Survival', () => {
  const w1 = buildWavePlan(1, 'mecha');
  const w3 = buildWavePlan(3, 'mecha');
  const w5 = buildWavePlan(TOTAL_WAVES, 'mecha');

  assert.ok(w1.entries.length >= 5);
  assert.ok(w3.entries.length > w1.entries.length);
  assert.ok(w3.speedMultiplier > w1.speedMultiplier);
  assert.ok(w5.entries.some((e) => e.archetype === 'shogun'));
  assert.ok(ENEMY_STATS.shogun.maxHp > ENEMY_STATS.charger.maxHp);

  // Endless Zombie Survival scaling past wave 5
  const z1 = buildWavePlan(1, 'zombies');
  const z5 = buildWavePlan(5, 'zombies');
  const z8 = buildWavePlan(8, 'zombies');
  assert.equal(z8.wave, 8);
  assert.ok(z8.entries.length > z1.entries.length);
  assert.ok(z5.entries.some((e) => e.archetype === 'shogun'), 'Every 5th zombie wave includes Alpha Nemesis');
  assert.ok(z8.speedMultiplier > z1.speedMultiplier);
});

test('3-stage reload animation choreography ejects mag, inserts fresh mag, and racks bolt', () => {
  const eject = computeReloadPose(0.2);
  const insert = computeReloadPose(0.55);
  const rack = computeReloadPose(0.86);

  assert.equal(eject.stage, 'eject');
  assert.ok(eject.magDropY < -0.1, 'mag drops downward during eject');
  assert.equal(insert.stage, 'insert');
  assert.ok(insert.leftArmRaise > 0.65, 'left hand raises to magwell');
  assert.equal(rack.stage, 'rack');
  assert.ok(rack.boltPullZ < -0.05, 'bolt/pump pulls back during rack');
});

test('scoring combo multiplier and projectile box collision check', () => {
  assert.equal(calculateKillScore(100, 1), 100);
  assert.equal(calculateKillScore(100, 4), 150);
  assert.ok(calculateKillScore(100, 12) >= 200);

  const crate: ColliderBox = {
    id: 'crate',
    minX: -1,
    maxX: 1,
    minY: 0,
    maxY: 1,
    minZ: -1,
    maxZ: 1,
  };
  assert.equal(pointHitsBox(0, 0.5, 0, crate), true);
  assert.equal(pointHitsBox(3, 0.5, 0, crate), false);
});

import {
  CUSTOMIZATION_CATEGORIES,
  DEFAULT_LOADOUT,
  getTotalCustomizationCount,
  randomizeLoadout,
} from './customization';
import {
  ARENA_HALF_EXTENT,
  calculateExplosionDamage,
  calculateVehicleCrashDamage,
  calculateVehicleImpactDamage,
  detectWorldZone,
  resolvePlayerVehicleCollision,
  resolveVehiclePairCollision,
  stepVehicleKinematics,
  WORLD_ZONE_INFO,
} from './rules';
import type { VehicleKinematicsState } from './types';

function makeTestVehicle(overrides: Partial<VehicleKinematicsState> = {}): VehicleKinematicsState {
  return {
    id: 'kei_1',
    kind: 'kei_truck',
    name: 'Kuroba Kei-Truck',
    x: 0,
    y: 0.03,
    z: 13.8,
    yaw: Math.PI * 0.5, // Facing +X east along Grand Highway
    speed: 0,
    vx: 0,
    vz: 0,
    steerAngle: 0,
    wheelSpin: 0,
    nitro: 100,
    boosting: false,
    drifting: false,
    maxSpeed: 22,
    accel: 16,
    radius: 1.55,
    hp: 100,
    maxHp: 100,
    destroyed: false,
    respawnTimer: 0,
    ...overrides,
  };
}

test('customization catalog exposes a deep operator creator plus weapon finishes', () => {
  const total = getTotalCustomizationCount();
  assert.ok(total >= 150, `Expected at least 150 customizations, got ${total}`);
  const keys = new Set(CUSTOMIZATION_CATEGORIES.map((c) => c.key));
  for (const k of ['skinTone', 'faceShape', 'eyeStyle', 'browStyle', 'noseStyle', 'mouthStyle', 'hairStyle', 'hairColor', 'facialHair']) {
    assert.ok(keys.has(k as keyof typeof DEFAULT_LOADOUT), `missing face/hair category ${k}`);
  }
  for (const cat of CUSTOMIZATION_CATEGORIES) {
    assert.ok(cat.options.some((o) => o.id === DEFAULT_LOADOUT[cat.key]), `default for ${cat.key} must exist`);
  }
  const rand = randomizeLoadout(() => 0.5);
  assert.ok(rand.headgear && rand.gunSkin && rand.charm && rand.hairStyle);
});

test('armory resolves gun models and attachments into real stat changes', () => {
  const base = resolveGun('pulse', DEFAULT_GUN_BUILDS.pulse, BASE_WEAPONS.pulse);
  assert.equal(base.spec.magSize, BASE_WEAPONS.pulse.magSize);
  assert.equal(base.spec.damage, BASE_WEAPONS.pulse.damage);

  const drum = resolveGun('pulse', { ...DEFAULT_GUN_BUILDS.pulse, magazine: 'drum_mag' }, BASE_WEAPONS.pulse);
  assert.ok(drum.spec.magSize > base.spec.magSize * 1.5, 'drum mag adds capacity');
  const brake = resolveGun('pulse', { ...DEFAULT_GUN_BUILDS.pulse, muzzle: 'twin_cannon' }, BASE_WEAPONS.pulse);
  assert.ok(brake.spec.damage > base.spec.damage, 'twin-port brake adds damage');
  const sniper = resolveGun('pulse', { ...DEFAULT_GUN_BUILDS.pulse, optic: 'long_sniper' }, BASE_WEAPONS.pulse);
  assert.ok(sniper.adsSpreadMult < base.adsSpreadMult, '8x scope tightens aimed spread');
  assert.equal(sniper.optic.zoom, 8);

  const smg = resolveGun('pulse', { ...DEFAULT_GUN_BUILDS.pulse, variant: 'smg' }, BASE_WEAPONS.pulse);
  assert.ok(smg.spec.fireInterval < base.spec.fireInterval, 'SMG fires faster');
  assert.equal(smg.spec.name, 'Hornet MP-9');

  // Double-barrel has no magazine mount: mag attachments never change its 2 shells
  const coach = resolveGun('scatter', { ...DEFAULT_GUN_BUILDS.scatter, variant: 'coach', magazine: 'drum_mag' }, BASE_WEAPONS.scatter);
  assert.equal(coach.spec.magSize, 2);
  assert.equal(slotAvailable('scatter', 'coach', 'magazine'), false);

  // Every firearm can mount at least one magnified scope
  for (const f of FIREARMS) {
    assert.ok(attachmentsFor(f, 'optic').some((a) => (a.optic?.zoom ?? 1) >= 2), `${f} needs a scope option`);
  }
});

test('locked gun models and attachments are reverted to defaults', () => {
  const fresh = { playerLevel: 1, weaponLevels: { pulse: 1, scatter: 1, rail: 1, rpg: 1, katana: 1 } };
  const locked = sanitizeBuild('pulse', { ...DEFAULT_GUN_BUILDS.pulse, variant: 'lmg', optic: 'variable_scope', muzzle: 'suppressor' }, fresh);
  assert.equal(locked.variant, DEFAULT_GUN_BUILDS.pulse.variant);
  assert.equal(locked.optic, DEFAULT_GUN_BUILDS.pulse.optic);
  assert.equal(locked.muzzle, DEFAULT_GUN_BUILDS.pulse.muzzle);

  const veteran = { playerLevel: 10, weaponLevels: { pulse: 10, scatter: 10, rail: 10, rpg: 10, katana: 10 } };
  const ok = sanitizeBuild('pulse', { ...DEFAULT_GUN_BUILDS.pulse, variant: 'lmg', optic: 'variable_scope', muzzle: 'suppressor' }, veteran);
  assert.equal(ok.variant, 'lmg');
  assert.equal(ok.optic, 'variable_scope');
  assert.equal(ok.muzzle, 'suppressor');

  // Launcher-only scope cannot go on a rifle; the sniper starts with its 8x
  assert.equal(sanitizeBuild('pulse', { ...DEFAULT_GUN_BUILDS.pulse, optic: 'pgo7' }, veteran).optic, DEFAULT_GUN_BUILDS.pulse.optic);
  assert.equal(sanitizeBuild('rail', DEFAULT_GUN_BUILDS.rail, fresh).optic, 'long_sniper');
});

test('weapon overrides write resolved stats into WEAPONS and can be reset', () => {
  applyWeaponOverrides({ pulse: { damage: 99, magSize: 77 } });
  assert.equal(WEAPONS.pulse.damage, 99);
  assert.equal(WEAPONS.pulse.magSize, 77);
  applyWeaponOverrides({});
  assert.equal(WEAPONS.pulse.damage, BASE_WEAPONS.pulse.damage);
  assert.equal(WEAPONS.pulse.magSize, BASE_WEAPONS.pulse.magSize);
});

test('kills level up the operator and the gun in hand, announcing unlocks', () => {
  assert.equal(xpForLevel(1, 500), 0);
  assert.equal(levelInfo(0, 500, 10).level, 1);
  assert.equal(levelInfo(500, 500, 10).level, 2);

  let state = createProgression();
  const all: string[] = [];
  for (let i = 0; i < 8; i++) {
    const r = awardKill(state, 'pulse', 200);
    state = r.state;
    all.push(...r.events.map((e) => e.title));
  }
  assert.equal(state.playerXp, 1600);
  assert.equal(state.weaponXp.pulse, 1600);
  assert.equal(weaponLevelInfo(state, 'pulse').level, 3);
  assert.equal(playerLevelInfo(state).level, 2);
  assert.ok(all.includes('Rifle Level 2'));
  assert.ok(all.some((t) => t.includes('unlocked')), 'level-ups announce new attachments');
  assert.ok(all.includes('AK-74 "Ronin" unlocked'), 'operator level 2 unlocks the AK');

  // Vehicle kills give operator XP only
  const v = awardKill(state, null, 200);
  assert.equal(v.state.weaponXp.pulse, state.weaponXp.pulse);
  assert.equal(v.state.playerXp, state.playerXp + 200);
});

test('operator generator is deterministic per seed, honours locks and unlock levels', () => {
  const a = generateOperator({ seed: 'ABC-123', archetype: 'ronin', current: DEFAULT_LOADOUT, locks: [], playerLevel: 1 });
  const b = generateOperator({ seed: 'ABC-123', archetype: 'ronin', current: DEFAULT_LOADOUT, locks: [], playerLevel: 1 });
  assert.deepEqual(a, b);
  const c = generateOperator({ seed: 'XYZ-999', archetype: 'ronin', current: DEFAULT_LOADOUT, locks: [], playerLevel: 1 });
  assert.notDeepEqual(a.loadout, c.loadout);
  assert.ok(a.profile.name.length > 3 && a.profile.callsign.length > 1);

  // Nothing above operator level 1 is handed out to a new player
  for (const cat of CUSTOMIZATION_CATEGORIES) {
    const opt = cat.options.find((o) => o.id === a.loadout[cat.key]);
    assert.ok(opt && (opt.unlockLevel ?? 1) <= 1, `${cat.key}=${a.loadout[cat.key]} should be unlocked`);
  }

  // Locked face keeps every face trait from the current operator
  const locked = generateOperator({ seed: 'XYZ-999', archetype: 'runner', current: a.loadout, locks: ['face'], playerLevel: 1 });
  for (const cat of CUSTOMIZATION_CATEGORIES.filter((c) => c.group === 'face')) {
    assert.equal(locked.loadout[cat.key], a.loadout[cat.key]);
  }
});

test('open-world 4-zone detection maps Kuroba Crossing, Aurora City, Fungi Forest, and Kopenhime Snowpeak', () => {
  assert.ok(ARENA_HALF_EXTENT >= 140, 'open world should be expansive');
  assert.equal(detectWorldZone(0, 6), 'kuroba');
  assert.equal(detectWorldZone(-95, 14), 'aurora');
  assert.equal(detectWorldZone(95, 14), 'fungi');
  assert.equal(detectWorldZone(-20, -90), 'snowpeak');
  assert.equal(WORLD_ZONE_INFO.aurora.name, 'AURORA CITY');
  assert.equal(WORLD_ZONE_INFO.fungi.name, 'FUNGI FOREST');
  assert.equal(WORLD_ZONE_INFO.snowpeak.name, 'KOPENHIME SNOWPEAK');
});

test('vehicle kinematics accelerates, steers, boosts with nitro, and computes roadkill damage', () => {
  const v = makeTestVehicle();

  for (let i = 0; i < 60; i++) {
    stepVehicleKinematics(
      v,
      { throttle: 1, steer: 0, handbrake: false, boost: true },
      [],
      1 / 60,
    );
  }
  assert.ok(v.x > 8, 'vehicle should drive east along +X highway');
  assert.ok(v.speed > 12, 'vehicle should accelerate rapidly under boost');
  assert.ok(v.nitro < 90, 'boosting should consume nitro');
  assert.ok(v.wheelSpin > 10, 'wheels should rotate with forward speed');

  const yawBeforeTurn = v.yaw;
  for (let i = 0; i < 20; i++) {
    stepVehicleKinematics(
      v,
      { throttle: 1, steer: 1, handbrake: false, boost: false },
      [],
      1 / 60,
    );
  }
  assert.notEqual(v.yaw, yawBeforeTurn, 'steering should rotate vehicle heading');

  assert.equal(calculateVehicleImpactDamage(2.0), 0, 'slow bump deals 0 roadkill damage');
  assert.ok(calculateVehicleImpactDamage(14.0) >= 150, 'highway speed ramming deals lethal zombie roadkill damage');
});

test('high-speed nitro vehicle cannot tunnel through thin walls, and on-foot player collides with parked cars', () => {
  const thinWall: ColliderBox = {
    id: 'thin_barrier',
    minX: 10.0,
    maxX: 10.4,
    minY: 0,
    maxY: 3.5,
    minZ: -10,
    maxZ: 30,
    walkableTop: false,
    blocksBullets: true,
  };
  const v = makeTestVehicle({ x: 7.5, z: 13.8, speed: 34, maxSpeed: 31 });
  const res = stepVehicleKinematics(
    v,
    { throttle: 1, steer: 0, handbrake: false, boost: true },
    [thinWall],
    0.05,
  );
  assert.equal(res.hitWall, true, 'high-speed vehicle must collide with thin wall');
  assert.ok(v.x < 10.0 - v.radius + 0.05, 'vehicle must stay cleanly on the near side of the wall');
  assert.ok(res.impactSpeed > 20, 'impact speed should be recorded for crash sparks & hull damage');

  const parked = makeTestVehicle({ x: 5, z: 5, radius: 1.6 });
  const footRes = resolvePlayerVehicleCollision(5.5, 0, 5.2, 0.45, [parked]);
  assert.equal(footRes.hitVehicle, true, 'on-foot character cannot walk through parked vehicles');
  assert.ok(Math.hypot(footRes.x - parked.x, footRes.z - parked.z) >= 0.45 + parked.radius * 0.91);
});

test('car-vs-car collision separates vehicles, transfers crash impulse, and computes hull & explosion AoE damage', () => {
  const rammer = makeTestVehicle({ id: 'a', x: 0, z: 13.8, yaw: Math.PI * 0.5, speed: 24 });
  const target = makeTestVehicle({ id: 'b', x: 2.8, z: 13.8, yaw: Math.PI * 0.5, speed: 0 });

  const crash = resolveVehiclePairCollision(rammer, target);
  assert.equal(crash.collided, true);
  assert.ok(crash.impactSpeed > 20, 'closing speed should reflect high-speed ram');
  assert.ok(target.vx > 10, 'struck car should receive crash knockback impulse');
  assert.ok(rammer.speed < 12, 'ramming car should lose forward speed on collision');
  assert.ok(
    Math.hypot(target.x - rammer.x, target.z - rammer.z) >= rammer.radius + target.radius + 0.14,
    'vehicles must not remain overlapping after crash',
  );

  const crashDmg = calculateVehicleCrashDamage(crash.impactSpeed);
  assert.ok(crashDmg >= 60, `high-speed car crash should deal severe hull damage (got ${crashDmg})`);
  assert.equal(calculateVehicleCrashDamage(3.0), 0, 'gentle parking tap deals 0 hull damage');

  assert.equal(calculateExplosionDamage(0, 12, 220), 220);
  assert.ok(calculateExplosionDamage(6, 12, 220) > 80);
  assert.equal(calculateExplosionDamage(13, 12, 220), 0);
});


test('collider broadphase grid never misses a box near the query point (large open-world lists)', () => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const boxes = Array.from({ length: 600 }, (_, i) => {
    const x = (rnd() - 0.5) * 280;
    const z = (rnd() - 0.5) * 280;
    const w = 0.2 + rnd() * (i % 17 === 0 ? 30 : 4);
    const d = 0.2 + rnd() * (i % 13 === 0 ? 30 : 4);
    return { id: `b${i}`, minX: x, maxX: x + w, minY: 0, maxY: 3, minZ: z, maxZ: z + d, blocksBullets: true };
  });
  for (let q = 0; q < 400; q++) {
    const x = (rnd() - 0.5) * 300;
    const z = (rnd() - 0.5) * 300;
    const reach = 0.5 + rnd() * 8;
    const near = new Set(queryNearbyColliders(boxes, x, z, reach));
    for (const b of boxes) {
      const dx = Math.max(b.minX - x, 0, x - b.maxX);
      const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      if (dx <= reach && dz <= reach) {
        assert.ok(near.has(b), `box ${b.id} within reach of (${x.toFixed(1)}, ${z.toFixed(1)}) was missed`);
      }
    }
  }
  // Grid rebuilds after the list shrinks (e.g. a destructible prop collider is spliced out)
  const removed = boxes.splice(5, 1)[0];
  const cx = (removed.minX + removed.maxX) / 2;
  const cz = (removed.minZ + removed.maxZ) / 2;
  assert.ok(!queryNearbyColliders(boxes, cx, cz, 1).includes(removed));
  // Character still gets pushed out of a wall through the grid path
  boxes.push({ id: 'wall', minX: 100, maxX: 101, minY: 0, maxY: 3, minZ: 140, maxZ: 146, blocksBullets: true });
  const res = resolveCylinderWorldCollision(100.2, 0, 143, 0.45, 1.65, boxes);
  assert.ok(res.hitWall);
  assert.ok(res.x < 100 - 0.44, 'pushed out of the west face of the wall');
});
