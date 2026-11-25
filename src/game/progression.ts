/**
 * Play-to-unlock progression.
 *  - Operator (player) level: earned from every kill. Unlocks gun models and premium cosmetics.
 *  - Weapon level (per gun): earned from kills with that gun. Unlocks its attachments & scopes.
 */
import { ATTACHMENTS, attachmentFits, attachmentUnlockLevel, FIREARMS, GUN_VARIANTS } from './armory';
import { CUSTOMIZATION_CATEGORIES } from './customization';
import type { FirearmId, WeaponId } from './types';

export const MAX_WEAPON_LEVEL = 10;
export const MAX_PLAYER_LEVEL = 30;
const WEAPON_STEP = 500; // XP to go from level L to L+1 is WEAPON_STEP * L
const PLAYER_STEP = 1000;

export interface ProgressionState {
  playerXp: number;
  weaponXp: Record<WeaponId, number>;
}

export interface LevelInfo {
  level: number;
  /** XP into the current level. */
  into: number;
  /** XP needed for the next level (0 at max level). */
  needed: number;
  /** 0..1 progress to the next level (1 at max). */
  progress: number;
}

/** Total XP required to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number, step: number): number {
  return (step * (level - 1) * level) / 2;
}

export function levelInfo(xp: number, step: number, maxLevel: number): LevelInfo {
  let level = 1;
  while (level < maxLevel && xp >= xpForLevel(level + 1, step)) level++;
  if (level >= maxLevel) return { level: maxLevel, into: 0, needed: 0, progress: 1 };
  const start = xpForLevel(level, step);
  const end = xpForLevel(level + 1, step);
  return { level, into: xp - start, needed: end - start, progress: (xp - start) / (end - start) };
}

export const playerLevelInfo = (s: ProgressionState) => levelInfo(s.playerXp, PLAYER_STEP, MAX_PLAYER_LEVEL);
export const weaponLevelInfo = (s: ProgressionState, w: WeaponId) =>
  levelInfo(s.weaponXp[w] ?? 0, WEAPON_STEP, MAX_WEAPON_LEVEL);

export function weaponLevels(s: ProgressionState): Record<WeaponId, number> {
  return {
    pulse: weaponLevelInfo(s, 'pulse').level,
    scatter: weaponLevelInfo(s, 'scatter').level,
    rail: weaponLevelInfo(s, 'rail').level,
    rpg: weaponLevelInfo(s, 'rpg').level,
    katana: weaponLevelInfo(s, 'katana').level,
  };
}

export function createProgression(): ProgressionState {
  return { playerXp: 0, weaponXp: { pulse: 0, scatter: 0, rail: 0, rpg: 0, katana: 0 } };
}

export interface UnlockEvent {
  kind: 'player_level' | 'weapon_level' | 'attachment' | 'variant' | 'cosmetic';
  title: string;
  detail: string;
}

const WEAPON_SHORT: Record<WeaponId, string> = {
  pulse: 'Rifle',
  scatter: 'Shotgun',
  rail: 'Marksman',
  rpg: 'Launcher',
  katana: 'Katana',
};

/** Everything that becomes available exactly at `level` of `weapon`. */
export function unlocksAtWeaponLevel(weapon: FirearmId, level: number): UnlockEvent[] {
  return ATTACHMENTS.filter((a) => attachmentFits(a, weapon) && attachmentUnlockLevel(a, weapon) === level).map((a) => ({
    kind: 'attachment' as const,
    title: `${a.label} unlocked`,
    detail: `${WEAPON_SHORT[weapon]} ${a.slot} · ${a.note}`,
  }));
}

/** Everything that becomes available exactly at operator `level`. */
export function unlocksAtPlayerLevel(level: number): UnlockEvent[] {
  const out: UnlockEvent[] = [];
  for (const v of GUN_VARIANTS) {
    if (v.playerLevel === level && level > 1) {
      out.push({ kind: 'variant', title: `${v.name} unlocked`, detail: `New ${WEAPON_SHORT[v.firearm]} model · ${v.role}` });
    }
  }
  for (const cat of CUSTOMIZATION_CATEGORIES) {
    for (const o of cat.options) {
      if (o.unlockLevel === level) {
        out.push({ kind: 'cosmetic', title: `${o.label} unlocked`, detail: `${cat.label}` });
      }
    }
  }
  return out;
}

/**
 * Adds XP for a kill. Returns the new state plus level-up & unlock events (for HUD toasts).
 * Pure function: the caller persists the result.
 */
export function awardKill(
  state: ProgressionState,
  weapon: WeaponId | null,
  xp: number,
): { state: ProgressionState; events: UnlockEvent[] } {
  const events: UnlockEvent[] = [];
  const next: ProgressionState = { playerXp: state.playerXp + xp, weaponXp: { ...state.weaponXp } };

  const before = playerLevelInfo(state).level;
  const after = playerLevelInfo(next).level;
  for (let l = before + 1; l <= after; l++) {
    events.push({ kind: 'player_level', title: `Operator Level ${l}`, detail: 'Rank up!' });
    events.push(...unlocksAtPlayerLevel(l));
  }

  if (weapon) {
    next.weaponXp[weapon] = (next.weaponXp[weapon] ?? 0) + xp;
    const wb = weaponLevelInfo(state, weapon).level;
    const wa = weaponLevelInfo(next, weapon).level;
    for (let l = wb + 1; l <= wa; l++) {
      events.push({ kind: 'weapon_level', title: `${WEAPON_SHORT[weapon]} Level ${l}`, detail: 'Weapon level up' });
      if ((FIREARMS as WeaponId[]).includes(weapon)) events.push(...unlocksAtWeaponLevel(weapon as FirearmId, l));
    }
  }
  return { state: next, events };
}

const STORAGE_KEY = 'kuroba_progression_v1';

export function loadProgression(): ProgressionState {
  const base = createProgression();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<ProgressionState>;
    return {
      playerXp: Math.max(0, Number(parsed.playerXp) || 0),
      weaponXp: { ...base.weaponXp, ...(parsed.weaponXp ?? {}) },
    };
  } catch {
    return base;
  }
}

export function saveProgression(state: ProgressionState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}
