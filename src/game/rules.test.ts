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
  resolveCylinderWorldCollision,
  stepPlayerKinematics,
  stepWeaponState,
  TOTAL_WAVES,
  WEAPONS,
} from './rules';
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
  computeLoadoutModifiers,
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

test('customization catalog exposes 100+ real character and gun options with combat modifiers', () => {
  const total = getTotalCustomizationCount();
  assert.ok(total >= 120, `Expected at least 120 customizations, got ${total}`);

  const boosted = computeLoadoutModifiers({
    ...DEFAULT_LOADOUT,
    optic: 'long_sniper',
    muzzle: 'twin_cannon',
    magazine: 'drum_mag',
  });
  assert.ok(boosted.magMult >= 1.45, 'drum_mag should increase mag size');
  assert.ok(boosted.damageMult > 1.05, 'twin_cannon should increase damage');
  assert.ok(boosted.spreadMult < 0.9, 'long_sniper should tighten spread');

  const rand = randomizeLoadout(() => 0.5);
  assert.ok(rand.headgear && rand.gunSkin && rand.charm);
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

