import React from 'react';
import {
  AURORA_BORDER_X,
  AURORA_COAST_X,
  AURORA_MINIMAP_ROADS,
  AURORA_NORTH_Z,
} from '../game/aurora/auroraLayout';
import { ARENA_HALF_EXTENT, WEAPON_ORDER, WEAPONS, WORLD_ZONE_INFO } from '../game/rules';
import type { HudSnapshot, WeaponId } from '../game/types';
import { AdsReticle, ScopeOverlay } from './ScopeOverlay';

/** Highways & avenues as world-space segments [x1, z1, x2, z2] (mirrors worldBuilder's road network). */
const MINIMAP_ROADS: Array<[number, number, number, number]> = [
  // East-West
  [AURORA_BORDER_X, 13.8, 138, 13.8],
  [AURORA_BORDER_X, 96, 130, 96],
  [26, 56, 128, 56],
  [26, -24, 128, -24],
  [-126, -66, 126, -66],
  [-126, -104, 126, -104],
  [-126, -134, 126, -134],
  // North-South
  [-26, -136, -26, 100],
  [28, -136, 28, 100],
  [-68, -136, -68, AURORA_NORTH_Z],
  [-102, -136, -102, AURORA_NORTH_Z],
  [-132, -136, -132, AURORA_NORTH_Z],
  [76, -136, 76, 100],
  [122, -136, 122, 100],
  // Aurora City streets
  ...AURORA_MINIMAP_ROADS,
];

interface GameHudProps {
  hud: HudSnapshot;
  onSelectWeapon: (id: WeaponId) => void;
  onToggleTimeOfDay: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onFireStart?: () => void;
  onFireEnd?: () => void;
  onAimToggle?: () => void;
  onJump?: () => void;
  onDash?: () => void;
  onReload?: () => void;
  onVehicleToggle?: () => void;
  onC4?: () => void;
  onSentry?: () => void;
  onInteract?: () => void;
  onTouchMove?: (x: number, y: number) => void;
  onTouchLook?: (dx: number, dy: number) => void;
}

const WeaponIcon: React.FC<{ id: WeaponId; active: boolean }> = ({ id, active }) => {
  const accent = active ? WEAPONS[id].accentHex : '#a89a88';
  if (id === 'pulse') {
    return (
      <svg viewBox="0 0 38 18" className="w-8 h-4">
        <path d="M1 7h6v5H1V7zm6 1h17v4H18l2 5h-3l-2-5h-3l-2 4H8l1-4H7V8z" fill="#2c3138" stroke="#f5efe6" strokeWidth="1" />
        <rect x="24" y="8.5" width="12" height="2.4" fill="#a8b2bd" />
        <rect x="11" y="4.5" width="6" height="3" fill={accent} />
      </svg>
    );
  }
  if (id === 'scatter') {
    return (
      <svg viewBox="0 0 38 18" className="w-8 h-4">
        <path d="M1 10l9-2h9v4h-7l-4 4H1v-6z" fill="#6b3e22" stroke="#f5efe6" strokeWidth="1" />
        <rect x="14" y="6.5" width="22" height="3" fill="#b4bec9" />
        <rect x="18" y="9.5" width="11" height="3.5" fill={accent} />
      </svg>
    );
  }
  if (id === 'rail') {
    return (
      <svg viewBox="0 0 38 18" className="w-8 h-4">
        <path d="M1 8h15v4h-3v4h-4v-4H1V8z" fill="#242a32" stroke="#f5efe6" strokeWidth="1" />
        <rect x="16" y="8.5" width="18" height="2.2" fill="#cfd6dd" />
        <rect x="33" y="7.5" width="4" height="4" fill="#3a424c" />
        <rect x="10" y="3.5" width="11" height="3" fill={accent} />
      </svg>
    );
  }
  if (id === 'rpg') {
    return (
      <svg viewBox="0 0 38 18" className="w-8 h-4">
        <path d="M2 9h20v2H2z" fill="#4d5448" />
        <path d="M22 6l8 4-8 4V6z" fill="#3b4238" stroke="#d97706" strokeWidth="0.8" />
        <rect x="7" y="11" width="3" height="4" fill="#1c2025" />
        <rect x="14" y="6.5" width="4" height="2" fill={accent} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 38 18" className="w-8 h-4">
      <path d="M4 14l26-10c2-1 4-1 6 0l-1 2-25 9-6-1z" fill="#e4e4e7" stroke={accent} strokeWidth="1" />
      <circle cx="8" cy="13" r="2.5" fill="#f59e0b" />
      <rect x="2" y="13" width="5" height="2.5" fill="#18181b" transform="rotate(-20 2 13)" />
    </svg>
  );
};

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onSelectWeapon,
  onToggleTimeOfDay,
  onToggleMute,
  onPause,
  onRestart,
  onFireStart,
  onFireEnd,
  onAimToggle,
  onJump,
  onDash,
  onReload,
  onVehicleToggle,
  onC4,
  onSentry,
  onInteract,
  onTouchMove,
  onTouchLook,
}) => {
  const isZombies = hud.gameMode === 'zombies';
  const isDeathmatch = hud.gameMode === 'deathmatch';
  const isNight = hud.timeOfDay === 'night';
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [touchControlsEnabled, setTouchControlsEnabled] = React.useState(
    () => 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  );

  // Virtual Joystick state
  const [joystickActive, setJoystickActive] = React.useState(false);
  const [joystickPos, setJoystickPos] = React.useState({ x: 0, y: 0 });
  const joystickStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const handleJoystickStart = (e: React.PointerEvent) => {
    joystickStartRef.current = { x: e.clientX, y: e.clientY };
    setJoystickActive(true);
    setJoystickPos({ x: 0, y: 0 });
  };

  const handleJoystickMove = (e: React.PointerEvent) => {
    if (!joystickActive || !joystickStartRef.current) return;
    const dx = e.clientX - joystickStartRef.current.x;
    const dy = e.clientY - joystickStartRef.current.y;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 45;
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const cx = Math.cos(angle) * clampedDist;
    const cy = Math.sin(angle) * clampedDist;
    setJoystickPos({ x: cx, y: cy });
    onTouchMove?.(cx / maxRadius, -cy / maxRadius);
  };

  const handleJoystickEnd = () => {
    setJoystickActive(false);
    joystickStartRef.current = null;
    setJoystickPos({ x: 0, y: 0 });
    onTouchMove?.(0, 0);
  };

  // Virtual Touch Look pad
  const lookStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const handleLookPointerDown = (e: React.PointerEvent) => {
    lookStartRef.current = { x: e.clientX, y: e.clientY };
  };
  const handleLookPointerMove = (e: React.PointerEvent) => {
    if (!lookStartRef.current) return;
    const dx = e.clientX - lookStartRef.current.x;
    const dy = e.clientY - lookStartRef.current.y;
    lookStartRef.current = { x: e.clientX, y: e.clientY };
    onTouchLook?.(dx, dy);
  };
  const handleLookPointerUp = () => {
    lookStartRef.current = null;
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${hud.roomCode || 'tdm'}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2400);
    });
  };
  const activeSpec = WEAPONS[hud.weapon];
  const currentAmmo = hud.ammo[hud.weapon];
  const currentMagMax = hud.magSizes[hud.weapon] ?? activeSpec.magSize;
  const zoneInfo = WORLD_ZONE_INFO[hud.zone];
  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const ghostPct = Math.max(hpPct, Math.min(100, (hud.ghostHp / hud.maxHp) * 100));
  const lowHp = hud.hp <= 30;
  const spreadPx = (hud.aiming ? 5 : 10) + hud.crosshairSpread * 16;
  const scopeFull = hud.scope.fullscreen && !hud.inVehicle;
  const opticReticle = hud.aiming && !hud.inVehicle && !scopeFull && hud.scope.blend > 0.35 && hud.weapon !== 'katana';

  // Open-world Minimap coordinate converter (-148..148 -> 0..136)
  const mapSize = 136;
  const toMapX = (wx: number) => ((wx + ARENA_HALF_EXTENT) / (ARENA_HALF_EXTENT * 2)) * mapSize;
  const toMapY = (wz: number) => ((wz + ARENA_HALF_EXTENT) / (ARENA_HALF_EXTENT * 2)) * mapSize;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none">
      {/* Subtle Cinematic Atmospheric Edge Vignette */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 62%, rgba(5,8,14,0.42) 100%)',
        }}
      />

      {/* Low-HP & Hurt Peripheral Vignette */}
      {(hud.hurtFlash > 0.02 || lowHp) && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: `inset 0 0 ${lowHp ? 95 : 70}px rgba(220, 42, 34, ${Math.min(
              0.68,
              hud.hurtFlash * 0.65 + (lowHp ? 0.24 : 0),
            )})`,
          }}
        />
      )}

      {scopeFull && <ScopeOverlay scope={hud.scope} hitmarker={hud.hitmarkerTimer > 0} hitmarkerCrit={hud.hitmarkerCrit} />}

      {/* Optic reticle while aiming with 1x-1.6x sights */}
      {opticReticle && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true">
          <AdsReticle scope={hud.scope} spreadPx={spreadPx} />
        </div>
      )}

      {/* Unlock toasts (new attachments, gun models, level ups) */}
      {hud.unlockToasts.length > 0 && (
        <div className="fixed top-24 right-4 flex flex-col gap-2 w-[280px] pointer-events-none z-30">
          {hud.unlockToasts.map((t) => (
            <div
              key={t.id}
              className="px-3 py-2 rounded-sm bg-[#120f0c]/92 border-l-4 border-[#fbbf24] shadow-[0_6px_20px_rgba(0,0,0,0.5)]"
              style={{ opacity: Math.min(1, t.timer / 0.6), transform: `translateX(${Math.max(0, (t.timer - 5.2) * 120)}px)` }}
            >
              <div className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-[#fbbf24]">
                {t.title.includes('Level') ? 'Level Up' : 'Unlocked'}
              </div>
              <div className="text-sm font-display font-bold text-white leading-tight">{t.title}</div>
              <div className="text-[11px] text-[#cbb699]">{t.detail}</div>
            </div>
          ))}
        </div>
      )}

      {/* Exact Center Dynamic Crosshair + Hitmarker + Reload Arc (hidden while driving / scoped) */}
      {!hud.inVehicle && !scopeFull && (
        <div
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        >
          <svg viewBox="-48 -48 96 96" className="w-24 h-24 overflow-visible">
          {/* Reload progress ring */}
          {hud.reloading && (
            <circle
              cx="0"
              cy="0"
              r="18"
              fill="none"
              stroke={activeSpec.accentHex}
              strokeWidth="3"
              strokeDasharray={`${hud.reloadProgress * 113.1} 113.1`}
              transform="rotate(-90)"
            />
          )}

          {/* Crisp 4-tick reticle with dark outline (replaced by the optic's reticle while aiming) */}
          {!opticReticle && (
          <>
          <g stroke="#140e0a" strokeWidth="4" strokeLinecap="square">
            <line x1="0" y1={-spreadPx - 7} x2="0" y2={-spreadPx} />
            <line x1="0" y1={spreadPx} x2="0" y2={spreadPx + 7} />
            <line x1={-spreadPx - 7} y1="0" x2={-spreadPx} y2="0" />
            <line x1={spreadPx} y1="0" x2={spreadPx + 7} y2="0" />
          </g>
          <g stroke={hud.aiming ? activeSpec.accentHex : '#fff7e8'} strokeWidth="2" strokeLinecap="square">
            <line x1="0" y1={-spreadPx - 7} x2="0" y2={-spreadPx} />
            <line x1="0" y1={spreadPx} x2="0" y2={spreadPx + 7} />
            <line x1={-spreadPx - 7} y1="0" x2={-spreadPx} y2="0" />
            <line x1={spreadPx} y1="0" x2={spreadPx + 7} y2="0" />
          </g>
          <circle cx="0" cy="0" r="2.2" fill={activeSpec.accentHex} stroke="#140e0a" strokeWidth="1.2" />
          </>
          )}

          {/* Hitmarker ticks */}
          {hud.hitmarkerTimer > 0 && (
            <g
              stroke={hud.hitmarkerCrit ? '#ffe066' : '#ff4d3b'}
              strokeWidth={hud.hitmarkerCrit ? '3' : '2.2'}
              strokeLinecap="square"
            >
              <line x1="-11" y1="-11" x2="-5" y2="-5" />
              <line x1="11" y1="-11" x2="5" y2="-5" />
              <line x1="-11" y1="11" x2="-5" y2="5" />
              <line x1="11" y1="11" x2="5" y2="5" />
            </g>
          )}
        </svg>
        {hud.reloading && (
          <div className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-center -mt-3 text-[#ffe7b0] hud-stroke">
            RELOADING
          </div>
        )}
      </div>
      )}

      {/* Vehicle / Helicopter / Tank Interaction Prompt or Active Driving Hint */}
      {!hud.inVehicle && !hud.inHelicopter && !hud.inTank && hud.nearbyTankName && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded bg-[#1c241a]/95 border-2 border-[#84cc16] shadow-[0_0_20px_rgba(132,204,22,0.5)] flex items-center gap-2.5 animate-pulse"
          data-testid="tank-prompt"
        >
          <span className="px-2 py-0.5 rounded bg-[#65a30d] text-[#f7fee7] font-display font-bold text-xs">
            E
          </span>
          <span className="text-xs sm:text-sm font-display font-bold uppercase tracking-[0.14em] text-[#ecfccb]">
            COMMAND {hud.nearbyTankName}
          </span>
        </div>
      )}

      {/* World Interaction Prompt (Ramen Stall / Vending Machine) */}
      {hud.interactionPrompt && !hud.inVehicle && !hud.inHelicopter && !hud.inTank && (
        <div
          className="fixed bottom-36 left-1/2 -translate-x-1/2 px-4 py-2 rounded bg-[#0f172a]/95 border-2 border-[#38bdf8] shadow-[0_0_24px_rgba(56,189,248,0.6)] flex items-center gap-2.5 animate-bounce z-20 pointer-events-auto cursor-pointer"
          onClick={() => onInteract?.()}
        >
          <span className="px-2 py-0.5 rounded bg-[#0284c7] text-[#f0f9ff] font-display font-bold text-xs">
            F
          </span>
          <span className="text-xs sm:text-sm font-display font-bold uppercase tracking-[0.12em] text-[#bae6fd]">
            {hud.interactionPrompt}
          </span>
        </div>
      )}

      {!hud.inVehicle && !hud.inHelicopter && !hud.inTank && hud.nearbyHelicopterName && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded bg-[#0b1320]/95 border-2 border-[#38bdf8] shadow-[0_0_20px_rgba(56,189,248,0.5)] flex items-center gap-2.5 animate-pulse"
          data-testid="helicopter-prompt"
        >
          <span className="px-2 py-0.5 rounded bg-[#0284c7] text-[#f0f9ff] font-display font-bold text-xs">
            E
          </span>
          <span className="text-xs sm:text-sm font-display font-bold uppercase tracking-[0.14em] text-[#e0f2fe]">
            PILOT {hud.nearbyHelicopterName}
          </span>
        </div>
      )}

      {!hud.inVehicle && !hud.inHelicopter && !hud.inTank && !hud.nearbyHelicopterName && !hud.nearbyTankName && hud.nearbyVehicleName && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded bg-[#18141c]/94 border-2 border-[#ffd47a] shadow-[0_6px_18px_rgba(0,0,0,0.6)] flex items-center gap-2.5"
          data-testid="vehicle-prompt"
        >
          <span className="px-2 py-0.5 rounded bg-[#ffd47a] text-[#17110b] font-display font-bold text-xs">
            E
          </span>
          <span className="text-xs sm:text-sm font-display font-bold uppercase tracking-[0.14em] text-[#fff6e6]">
            DRIVE {hud.nearbyVehicleName}
          </span>
        </div>
      )}

      {hud.inTank && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded bg-[#1c241a]/92 border border-[#84cc16]/50 text-[11px] font-display uppercase tracking-[0.12em] text-[#ecfccb]">
          W/S THROTTLE · A/D STEER · MOUSE TURRET 360° · L-CLICK 120MM CANNON · R-CLICK COAXIAL MG · [E] EXIT TANK
        </div>
      )}

      {hud.inHelicopter && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded bg-[#0b1320]/90 border border-[#38bdf8]/50 text-[11px] font-display uppercase tracking-[0.12em] text-[#e0f2fe]">
          SPACE LIFT · SHIFT/C DESCEND · W/S PITCH · A/D ROLL &amp; YAW · L-CLICK MINIGUN · F/R-CLICK BOMB · [E] EXIT
        </div>
      )}

      {hud.inVehicle && !hud.inHelicopter && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded bg-[#14131a]/88 border border-[#45f2ff]/40 text-[11px] font-display uppercase tracking-[0.12em] text-[#e6f7ff]">
          W/S GAS &amp; REVERSE · A/D STEER · SHIFT NITRO · SPACE DRIFT · [E] EXIT VEHICLE
        </div>
      )}

      {/* TOP-LEFT CLUSTER: Vitality Bar (with Trailing Damage Ghost Bar) & Boost Dash Charges */}
      <div className="fixed top-4 left-4 sm:top-5 sm:left-5 flex flex-col gap-2 w-[236px]">
        <div className="bg-[#211813]/90 border border-[#e6be74]/45 rounded px-3.5 py-2.5 shadow-[0_4px_14px_rgba(0,0,0,0.45)]">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-[#e6be74]">
              HULL INTEGRITY
            </span>
            <span
              className={`text-xl font-display font-bold tabular-nums leading-none ${
                lowHp ? 'text-[#ff594a]' : 'text-[#fff5e4]'
              }`}
              data-testid="hud-hp"
            >
              {hud.hp}
              <span className="text-xs text-[#b8a58e] font-normal">/{hud.maxHp}</span>
            </span>
          </div>

          {/* Continuous bar with delayed trailing damage ghost bar */}
          <div className="relative h-3.5 bg-[#120d0a] border border-[#5e4736] rounded-sm overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#ffb052]"
              style={{ width: `${ghostPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-75"
              style={{
                width: `${hpPct}%`,
                backgroundColor: lowHp ? '#e83e32' : '#43d689',
              }}
            />
            {/* Discrete segment notches */}
            <div className="absolute inset-0 flex justify-between px-[20%] pointer-events-none">
              <span className="w-[1px] h-full bg-[#120d0a]/60" />
              <span className="w-[1px] h-full bg-[#120d0a]/60" />
              <span className="w-[1px] h-full bg-[#120d0a]/60" />
            </div>
          </div>

          {/* Dash Thruster Charges */}
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-display uppercase tracking-[0.18em] text-[#8beeff]">
              THRUST [SHIFT]
            </span>
            <div className="flex gap-1.5 flex-1 max-w-[116px]">
              {Array.from({ length: hud.maxDashCharges }).map((_, idx) => {
                const full = idx < hud.dashCharges;
                const recharging = idx === hud.dashCharges;
                const fillPct = full ? 100 : recharging ? hud.dashRechargeProgress * 100 : 0;
                return (
                  <div
                    key={idx}
                    className="h-2 flex-1 bg-[#120d0a] border border-[#45646e] rounded-xs overflow-hidden"
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${fillPct}%`,
                        backgroundColor: full ? '#45f2ff' : '#2d8fa3',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* TOP-CENTER CLUSTER: TDM Scoreboard vs Wave Counter */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        {isDeathmatch ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 bg-[#121622]/95 border-2 border-[#f59e0b]/70 rounded-lg p-2 sm:px-4 sm:py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
              {/* Red Team Score */}
              <div className={`flex items-center gap-3 px-3 py-1.5 rounded bg-red-950/80 border ${hud.tdmTeam === 'red' ? 'border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.4)]' : 'border-red-800/50'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                <div className="text-left">
                  <div className="text-[9px] font-black uppercase tracking-wider text-red-300">
                    RED {hud.tdmTeam === 'red' && '(YOU)'}
                  </div>
                  <div className="text-2xl font-black text-white tabular-nums leading-none">
                    {hud.tdmScores?.redScore ?? 0}
                  </div>
                </div>
              </div>

              {/* VS Pill */}
              <div className="text-center px-1 sm:px-3">
                <div className="text-[11px] font-black text-[#fbbf24] tracking-widest uppercase">
                  VS
                </div>
                <div className="text-[9px] font-bold text-gray-400 uppercase whitespace-nowrap">
                  FIRST TO {hud.tdmScores?.targetKills ?? 25}
                </div>
              </div>

              {/* Blue Team Score */}
              <div className={`flex items-center gap-3 px-3 py-1.5 rounded bg-blue-950/80 border ${hud.tdmTeam === 'blue' ? 'border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.4)]' : 'border-blue-800/50'}`}>
                <div className="text-right">
                  <div className="text-[9px] font-black uppercase tracking-wider text-blue-300">
                    BLUE {hud.tdmTeam === 'blue' && '(YOU)'}
                  </div>
                  <div className="text-2xl font-black text-white tabular-nums leading-none">
                    {hud.tdmScores?.blueScore ?? 0}
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
              </div>
            </div>

            {/* In-Game Copy Invite Link Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="pointer-events-auto px-3 py-1 rounded bg-[#eab308] hover:bg-[#facc15] text-black font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              >
                <span>📋</span>
                <span>{copiedLink ? 'INVITE LINK COPIED!' : 'COPY INVITE LINK'}</span>
              </button>
              {hud.roomCode && (
                <span className="px-2 py-0.5 rounded bg-black/70 border border-white/20 text-[10px] font-mono font-bold text-[#fcd34d] uppercase">
                  ROOM: {hud.roomCode}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5 bg-[#211813]/90 border border-[#e6be74]/45 rounded px-5 py-2 shadow-[0_4px_14px_rgba(0,0,0,0.45)]">
            <div className="text-center">
              <div className="text-[10px] font-display uppercase tracking-[0.2em] text-[#e6be74]">
                {isZombies ? 'HORDE' : 'WAVE'}
              </div>
              <div className="text-xl font-display font-bold text-[#fff5e4] tabular-nums leading-tight" data-testid="hud-wave">
                {hud.wave}
                {hud.totalWaves !== null && (
                  <span className="text-xs text-[#b8a58e]">/{hud.totalWaves}</span>
                )}
              </div>
            </div>

            <div className="w-[1px] h-7 bg-[#5c4635]" />

            <div className="text-center">
              <div className="text-[10px] font-display uppercase tracking-[0.2em] text-[#ff9b70]">
                {isZombies ? 'INFECTED' : 'HOSTILES'}
              </div>
              <div className="text-xl font-display font-bold text-[#ffd7c2] tabular-nums leading-tight" data-testid="hud-enemies">
                {hud.enemiesRemaining}
              </div>
            </div>

            <div className="w-[1px] h-7 bg-[#5c4635]" />

            <div className="text-center min-w-[76px]">
              <div className="text-[10px] font-display uppercase tracking-[0.2em] text-[#e6be74]">
                SCORE
              </div>
              <div className="text-xl font-display font-bold text-[#ffe89e] tabular-nums leading-tight" data-testid="hud-score">
                {hud.score.toLocaleString()}
              </div>
            </div>

            {hud.combo >= 2 && (
              <>
                <div className="w-[1px] h-7 bg-[#5c4635]" />
                <div className="text-center">
                  <div className="text-[10px] font-display uppercase tracking-[0.18em] text-[#45f2ff]">
                    CHAIN
                  </div>
                  <div className="text-xl font-display font-bold text-[#45f2ff] tabular-nums leading-tight">
                    ×{hud.combo}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Active Open-World Region Badge */}
        <div
          className="px-3.5 py-1 rounded bg-[#18141c]/90 border text-[10px] font-display font-bold uppercase tracking-[0.2em]"
          style={{ borderColor: `${zoneInfo.accentHex}77`, color: zoneInfo.accentHex }}
          data-testid="hud-zone"
        >
          {hud.zoneName} · {zoneInfo.subtitle}
        </div>

        {/* Boss Vitality Bar (Wave 5 Shogun Mk-IV) */}
        {hud.bossMaxHp > 0 && (
          <div className="w-[340px] sm:w-[420px] bg-[#241412]/92 border border-[#ff6b4a]/70 rounded px-3.5 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.55)]">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs font-display font-bold uppercase tracking-[0.22em] text-[#ff9370]">
                BOSS · {hud.bossName}
              </span>
              <span className="text-xs font-display font-bold tabular-nums text-[#ffe6db]">
                {hud.bossHp} / {hud.bossMaxHp}
              </span>
            </div>
            <div className="h-2.5 bg-[#120908] rounded-xs overflow-hidden border border-[#6e2d24]">
              <div
                className="h-full bg-[#e84133]"
                style={{ width: `${Math.max(0, (hud.bossHp / hud.bossMaxHp) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Brief Non-Blocking Zone Transition or Wave Callout Banner */}
        {hud.zoneBannerTimer > 0 ? (
          <div
            className="mt-1 px-4 py-1.5 rounded bg-[#18141c]/92 border text-center"
            style={{ borderColor: zoneInfo.accentHex }}
          >
            <div
              className="text-xs sm:text-sm font-display font-bold tracking-[0.22em] uppercase"
              style={{ color: zoneInfo.accentHex }}
            >
              ENTERING {hud.zoneName}
            </div>
          </div>
        ) : hud.waveBannerTimer > 0 ? (
          <div className="mt-1 px-4 py-1.5 rounded bg-[#211813]/88 border border-[#f2c66d]/60 text-center">
            <div className="text-xs sm:text-sm font-display font-bold tracking-[0.22em] uppercase text-[#ffe49e]">
              {hud.waveTitle}
            </div>
          </div>
        ) : null}
      </div>

      {/* TOP-RIGHT CLUSTER: Utility Buttons (Night/Day [N], Mute [M], Pause [P], Restart) */}
      <div className="fixed top-4 right-4 sm:top-5 sm:right-5 flex items-center gap-2">
        <button
          type="button"
          tabIndex={-1}
          aria-label={isNight ? 'Switch to Day Mode' : 'Switch to Night Mode'}
          title="Night / Day [N]"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleTimeOfDay();
          }}
          className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded bg-[#211813]/90 border border-[#e6be74]/40 text-[#f5efe6] hover:bg-[#35261d] hover:border-[#ffd782] transition-colors cursor-pointer"
        >
          {isNight ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#8cb8ff]" fill="currentColor">
              <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#ffd76e]" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          )}
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
          title="Mute [M]"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded bg-[#211813]/90 border border-[#e6be74]/40 text-[#f5efe6] hover:bg-[#35261d] hover:border-[#ffd782] transition-colors cursor-pointer"
        >
          {hud.muted ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M22 9l-6 6M16 9l6 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.5 8.5a5 5 0 010 7" />
            </svg>
          )}
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle mobile touch controls"
          title="Toggle Mobile Touch Controls"
          onClick={(e) => {
            e.currentTarget.blur();
            setTouchControlsEnabled(!touchControlsEnabled);
          }}
          className={`pointer-events-auto px-2.5 h-10 flex items-center justify-center rounded border transition-colors cursor-pointer text-xs font-display font-bold ${
            touchControlsEnabled
              ? 'bg-[#0284c7]/90 border-[#38bdf8] text-[#f0f9ff]'
              : 'bg-[#211813]/90 border-[#e6be74]/40 text-[#f5efe6] hover:bg-[#35261d]'
          }`}
        >
          📱 TOUCH {touchControlsEnabled ? 'ON' : 'OFF'}
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Pause game"
          title="Pause [Esc / P]"
          onClick={(e) => {
            e.currentTarget.blur();
            onPause();
          }}
          className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded bg-[#211813]/90 border border-[#e6be74]/40 text-[#f5efe6] hover:bg-[#35261d] hover:border-[#ffd782] transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        </button>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Restart run"
          title="Restart"
          onClick={(e) => {
            e.currentTarget.blur();
            onRestart();
          }}
          className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded bg-[#211813]/90 border border-[#e6be74]/40 text-[#f5efe6] hover:bg-[#35261d] hover:border-[#ffd782] transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>

      {/* TOP-RIGHT TDM KILL FEED */}
      {isDeathmatch && hud.killFeed && hud.killFeed.length > 0 && (
        <div className="fixed top-16 right-4 sm:top-18 sm:right-5 flex flex-col gap-1.5 pointer-events-none z-30 max-w-[280px]">
          {hud.killFeed.map((kf) => (
            <div
              key={kf.id}
              className="px-3 py-1.5 rounded bg-black/85 border border-white/10 text-xs font-bold flex items-center justify-between gap-2 shadow-lg backdrop-blur-sm"
            >
              <span className={kf.killerTeam === 'red' ? 'text-red-400 font-extrabold' : 'text-blue-400 font-extrabold'}>
                {kf.killerName}
              </span>
              <span className="text-gray-400 text-[10px] uppercase font-mono px-1 py-0.5 rounded bg-white/10">
                {kf.weapon}
              </span>
              <span className={kf.victimTeam === 'red' ? 'text-red-400' : 'text-blue-400'}>
                {kf.victimName}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* BOTTOM-LEFT CLUSTER: Live 4-Region Open-World Highway Radar */}
      <div className="fixed bottom-4 left-4 sm:bottom-5 sm:left-5 hidden sm:block">
        <div className="bg-[#18141c]/92 border border-[#e6be74]/45 rounded p-2 shadow-[0_4px_14px_rgba(0,0,0,0.5)]">
          <svg
            viewBox={`0 0 ${mapSize} ${mapSize}`}
            className="w-[136px] h-[136px] block bg-[#233622] rounded-xs"
            aria-label="Open world highway radar"
          >
            {/* Biome Quadrants */}
            {/* North: Kopenhime Snowpeak (z < -44) */}
            <rect x="0" y="0" width={mapSize} height={toMapY(-44)} fill="#6a8599" />
            {/* West: Aurora City (island + outskirts) with the western sea beyond the quay */}
            <rect
              x="0"
              y={toMapY(AURORA_NORTH_Z)}
              width={toMapX(AURORA_BORDER_X)}
              height={mapSize - toMapY(AURORA_NORTH_Z)}
              fill="#2c5a3a"
            />
            <rect
              x="0"
              y={toMapY(AURORA_NORTH_Z)}
              width={toMapX(AURORA_COAST_X)}
              height={mapSize - toMapY(AURORA_NORTH_Z)}
              fill="#2a7f9c"
            />
            {/* East: Fungi Forest (x > 44) */}
            <rect
              x={toMapX(44)}
              y={toMapY(-44)}
              width={mapSize - toMapX(44)}
              height={mapSize - toMapY(-44)}
              fill="#223b32"
            />

            {/* Connected Multi-Highway Road Grid */}
            <g fill="#42474f">
              {MINIMAP_ROADS.map(([x1, z1, x2, z2], idx) => {
                const left = toMapX(Math.max(-ARENA_HALF_EXTENT, Math.min(x1, x2)));
                const right = toMapX(Math.min(ARENA_HALF_EXTENT, Math.max(x1, x2)));
                const top = toMapY(Math.max(-ARENA_HALF_EXTENT, Math.min(z1, z2)));
                const bottom = toMapY(Math.min(ARENA_HALF_EXTENT, Math.max(z1, z2)));
                return (
                  <rect
                    key={`road-${idx}`}
                    x={left - 1.5}
                    y={top - 1.5}
                    width={right - left + 3}
                    height={bottom - top + 3}
                  />
                );
              })}
            </g>

            {/* Kuroba Station Landmark */}
            <rect
              x={toMapX(-7)}
              y={toMapY(-16)}
              width={Math.max(5, toMapX(7) - toMapX(-7))}
              height={Math.max(4, toMapY(-8) - toMapY(-16))}
              fill="#e89a45"
              stroke="#fff0c4"
              strokeWidth="0.7"
            />

            {/* Region Labels */}
            <text x="68" y="10" textAnchor="middle" fill="#e6f7ff" fontSize="6.5" fontFamily="Chakra Petch, sans-serif">
              SNOWPEAK
            </text>
            <text x="6" y="128" fill="#45f2ff" fontSize="6.5" fontFamily="Chakra Petch, sans-serif">
              AURORA
            </text>
            <text x="130" y="128" textAnchor="end" fill="#a3ff5c" fontSize="6.5" fontFamily="Chakra Petch, sans-serif">
              FUNGI
            </text>

            {/* Drivable Vehicles */}
            {hud.minimapVehicles.map((v, idx) => (
              <rect
                key={`v-${idx}`}
                x={toMapX(v.x) - 2.3}
                y={toMapY(v.z) - 2.3}
                width="4.6"
                height="4.6"
                fill={v.active ? '#45f2ff' : '#ffd447'}
                stroke="#140e0a"
                strokeWidth="0.8"
              />
            ))}

            {/* Live Enemies */}
            {hud.minimapEnemies.map((en, idx) => (
              <circle
                key={idx}
                cx={toMapX(en.x)}
                cy={toMapY(en.z)}
                r={en.archetype === 'shogun' ? 3.5 : 2.1}
                fill={en.archetype === 'drone' ? '#e85cff' : '#ff4d3b'}
                stroke="#140e0a"
                strokeWidth="0.6"
              />
            ))}

            {/* Live Player Direction Arrow */}
            <g
              transform={`translate(${toMapX(hud.minimapPlayer.x)}, ${toMapY(
                hud.minimapPlayer.z,
              )}) rotate(${(-hud.minimapPlayer.yaw * 180) / Math.PI})`}
            >
              <polygon points="0,-5 3.6,4 0,2 -3.6,4" fill="#45f2ff" stroke="#101820" strokeWidth="1" />
            </g>
          </svg>
        </div>
      </div>

      {/* BOTTOM-RIGHT CLUSTER: Tank Avionics (In Tank), Helicopter Avionics (Flying), Vehicle Speedometer (Driving) OR Weapon Readout (On Foot) */}
      <div className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 flex flex-col items-end gap-2">
        {hud.inTank ? (
          <div
            className="bg-[#1c241a]/95 border-2 border-[#84cc16]/80 rounded px-4 py-3 min-w-[280px] shadow-[0_8px_24px_rgba(101,163,13,0.45)]"
            data-testid="tank-hud"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-[#a3e635]">
                  ARMORED CAVALRY · [E] EXIT
                </div>
                <div className="text-sm font-display font-bold uppercase tracking-wider text-[#f7fee7]">
                  {hud.tankName || 'TYPE-90 VOXEL MBT'}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-display font-bold uppercase tracking-wider text-[#bef264] block">
                  120MM CANNON
                </span>
                <span className={`text-base font-display font-bold ${hud.tankCannonReady ? 'text-[#a3e635]' : 'text-[#f87171] animate-pulse'}`}>
                  {hud.tankCannonReady ? 'READY' : 'RELOAD...'}
                </span>
              </div>
            </div>

            <div className="mt-2.5">
              <div className="flex justify-between text-[10px] font-display uppercase tracking-[0.18em] mb-1">
                <span className="text-[#bef264]">COMPOSITE ARMOR</span>
                <span className="tabular-nums text-[#f7fee7]">
                  {hud.tankHp}/{hud.tankMaxHp}
                </span>
              </div>
              <div className="h-2 bg-[#121c10] border border-[#3f6212] rounded-xs overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75"
                  style={{
                    width: `${Math.max(0, Math.min(100, (hud.tankHp / Math.max(1, hud.tankMaxHp)) * 100))}%`,
                    backgroundColor:
                      hud.tankHp / Math.max(1, hud.tankMaxHp) > 0.5
                        ? '#84cc16'
                        : hud.tankHp / Math.max(1, hud.tankMaxHp) > 0.25
                          ? '#eab308'
                          : '#ef4444',
                  }}
                />
              </div>
            </div>

            <div className="mt-2 text-[9px] font-display text-[#bef264] text-center tracking-wider">
              [WASD] DRIVE &amp; TREAD STEER · [MOUSE] 360° TURRET · [L-CLICK] 120MM · [R-CLICK] COAXIAL MG
            </div>
          </div>
        ) : hud.inHelicopter ? (
          <div
            className="bg-[#0b1320]/95 border-2 border-[#38bdf8]/80 rounded px-4 py-3 min-w-[280px] shadow-[0_8px_24px_rgba(2,132,199,0.45)]"
            data-testid="helicopter-hud"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-[#38bdf8]">
                  AIR COMBAT · [E] EXIT
                </div>
                <div className="text-sm font-display font-bold uppercase tracking-wider text-[#f0f9ff]">
                  {hud.helicopterName || 'AH-6X VOXEL GUNSHIP'}
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-display font-bold tabular-nums leading-none text-[#38bdf8]">
                  {hud.helicopterAltitude.toFixed(1)}
                </span>
                <span className="text-[11px] font-display font-bold text-[#93c5fd] ml-1">ALT M</span>
              </div>
            </div>

            <div className="mt-2.5">
              <div className="flex justify-between text-[10px] font-display uppercase tracking-[0.18em] mb-1">
                <span className="text-[#93c5fd]">ARMOR INTEGRITY</span>
                <span className="tabular-nums text-[#f0f9ff]">
                  {hud.helicopterHp}/{hud.helicopterMaxHp}
                </span>
              </div>
              <div className="h-2 bg-[#08101a] border border-[#1e3a5f] rounded-xs overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75"
                  style={{
                    width: `${Math.max(0, Math.min(100, (hud.helicopterHp / Math.max(1, hud.helicopterMaxHp)) * 100))}%`,
                    backgroundColor:
                      hud.helicopterHp / Math.max(1, hud.helicopterMaxHp) > 0.5
                        ? '#38bdf8'
                        : hud.helicopterHp / Math.max(1, hud.helicopterMaxHp) > 0.25
                          ? '#f59e0b'
                          : '#ef4444',
                  }}
                />
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10px] font-display">
              <div className="bg-[#031526]/80 p-1.5 rounded border border-[#1e3a8a]">
                <div className="text-[#60a5fa] font-bold">20MM MINIGUN</div>
                <div className="text-[#e0f2fe] text-[11px]">[L-CLICK] FIRE</div>
              </div>
              <div className="bg-[#031526]/80 p-1.5 rounded border border-[#1e3a8a]">
                <div className="text-[#f59e0b] font-bold">AERO BOMBS</div>
                <div className="text-[#fef3c7] text-[11px] font-bold tabular-nums">
                  {hud.helicopterBombs}/6 · [F/R-CLICK]
                </div>
              </div>
            </div>

            <div className="mt-2 text-[9px] font-display text-[#94a3b8] text-center tracking-wider">
              [SPACE] ASCEND · [SHIFT/C] DESCEND · [WASD] PITCH/ROLL
            </div>
          </div>
        ) : hud.inVehicle ? (
          <div
            className="bg-[#18141c]/94 border-2 border-[#45f2ff]/65 rounded px-4 py-3 min-w-[260px] shadow-[0_6px_18px_rgba(0,0,0,0.55)]"
            data-testid="vehicle-hud"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-[#45f2ff]">
                  DRIVING · [E] EXIT
                </div>
                <div className="text-sm font-display font-bold uppercase tracking-wider text-[#fff6e6]">
                  {hud.vehicleName}
                </div>
              </div>
              <div className="text-right">
                <span className="text-4xl font-display font-bold tabular-nums leading-none text-[#ffd447]" data-testid="vehicle-speed">
                  {hud.vehicleSpeedKmh}
                </span>
                <span className="text-[11px] font-display font-bold text-[#cbb699] ml-1">KM/H</span>
              </div>
            </div>

            <div className="mt-2.5">
              <div className="flex justify-between text-[10px] font-display uppercase tracking-[0.18em] mb-1">
                <span className="text-[#e6be74]">CHASSIS INTEGRITY</span>
                <span className="tabular-nums text-[#fff5e4]" data-testid="vehicle-hp">
                  {hud.vehicleHp}/{hud.vehicleMaxHp}
                </span>
              </div>
              <div className="h-2 bg-[#0e0c12] border border-[#5c4635] rounded-xs overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75"
                  style={{
                    width: `${Math.max(0, Math.min(100, (hud.vehicleHp / Math.max(1, hud.vehicleMaxHp)) * 100))}%`,
                    backgroundColor:
                      hud.vehicleHp / Math.max(1, hud.vehicleMaxHp) > 0.5
                        ? '#43d689'
                        : hud.vehicleHp / Math.max(1, hud.vehicleMaxHp) > 0.25
                          ? '#ffb045'
                          : '#ff493b',
                  }}
                />
              </div>
            </div>

            <div className="mt-2">
              <div className="flex justify-between text-[10px] font-display uppercase tracking-[0.18em] mb-1">
                <span className="text-[#8beeff]">NITRO BOOST [SHIFT]</span>
                <span className="tabular-nums text-[#fff5e4]">{hud.vehicleNitro}%</span>
              </div>
              <div className="h-2.5 bg-[#0e0c12] border border-[#3a6070] rounded-xs overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75"
                  style={{
                    width: `${hud.vehicleNitro}%`,
                    backgroundColor: hud.vehicleNitro > 25 ? '#45f2ff' : '#ff6b52',
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tactical Grenades Slot */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#1c1410]/90 border border-[#e6be74]/50 shadow-md">
              <span className="text-[10px] font-display font-bold text-[#f59e0b] tracking-wider uppercase">[G] THROW</span>
              <span className={`text-xs font-display font-bold uppercase ${hud.grenades.active === 'frag' ? 'text-[#ef4444]' : 'text-[#38bdf8]'}`}>
                {hud.grenades.active === 'frag' ? '💥 FRAG' : '💨 SMOKE'}:
              </span>
              <span className="text-sm font-display font-bold tabular-nums text-white">
                {hud.grenades[hud.grenades.active]}
              </span>
              <span className="text-[9px] font-display font-bold text-[#9ca3af] tracking-wider uppercase ml-1">
                [H] SWITCH
              </span>
            </div>

            {/* Tactical Special Equipment: C4 & Sentry */}
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={() => onC4?.()}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#b91c1c]/85 border border-[#f87171]/60 text-white font-display text-[11px] font-bold shadow active:scale-95 cursor-pointer"
              >
                <span>💥 C4 ({hud.c4Count})</span>
                <span className="text-[9px] opacity-75">[G]</span>
              </button>
              <button
                type="button"
                onClick={() => onSentry?.()}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1d4ed8]/85 border border-[#60a5fa]/60 text-white font-display text-[11px] font-bold shadow active:scale-95 cursor-pointer"
              >
                <span>🤖 SENTRY ({hud.sentriesAvailable})</span>
                <span className="text-[9px] opacity-75">[T]</span>
              </button>
            </div>

            {/* Compact 5-weapon switcher row */}
            <div className="flex items-center gap-1.5">
              {WEAPON_ORDER.map((id) => {
                const spec = WEAPONS[id];
                const isSelected = hud.weapon === id;
                return (
                  <button
                    key={id}
                    type="button"
                    tabIndex={-1}
                    aria-label={`Select ${spec.name} (${spec.slot})`}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onSelectWeapon(id);
                    }}
                    className={`pointer-events-auto flex items-center gap-2 px-2.5 py-1.5 rounded border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#2e221b]/95 border-[#ffd584] text-[#fff6e6]'
                        : 'bg-[#1c1410]/85 border-[#5c4635]/70 text-[#b8a58e] hover:border-[#b59466]'
                    }`}
                  >
                    <span className="text-[10px] font-display font-bold opacity-80">[{spec.slot}]</span>
                    <WeaponIcon id={id} active={isSelected} />
                    <span className="text-xs font-display font-bold tabular-nums">{hud.ammo[id]}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Weapon Hero Readout */}
            <div className="bg-[#211813]/92 border border-[#e6be74]/45 rounded px-4 py-2.5 min-w-[248px] shadow-[0_4px_14px_rgba(0,0,0,0.45)] flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-display font-bold uppercase tracking-[0.12em] text-[#fff4de]">
                  {activeSpec.name}
                </div>
                <div className="text-[11px] text-[#cbb699]">
                  {activeSpec.role} · <span className="text-[#f2c46d]">[R] Reload</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] font-display font-bold text-[#fbbf24]">WPN LV {hud.weaponLevel}</span>
                  <div className="w-16 h-1 rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full bg-[#fbbf24]" style={{ width: `${Math.round(hud.weaponLevelProgress * 100)}%` }} />
                  </div>
                  <span className="text-[9px] font-display font-bold text-[#7dd3fc]">OP LV {hud.playerLevel}</span>
                </div>
              </div>

              <div className="text-right">
                <div
                  className="text-3xl font-display font-bold tabular-nums leading-none"
                  style={{ color: currentAmmo <= Math.ceil(currentMagMax * 0.25) ? '#ff6b52' : activeSpec.accentHex }}
                  data-testid="hud-ammo"
                >
                  {currentAmmo}
                  <span className="text-sm text-[#a8947d] font-normal">/{currentMagMax}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* MOBILE / ANDROID TOUCH CONTROLS OVERLAY */}
      {touchControlsEnabled && (
        <div className="fixed inset-0 pointer-events-none z-30 select-none">
          {/* Left Floating Joystick Touch Area */}
          <div
            className="absolute bottom-6 left-6 w-36 h-36 rounded-full bg-white/5 border border-white/20 pointer-events-auto flex items-center justify-center touch-none backdrop-blur-xs"
            onPointerDown={handleJoystickStart}
            onPointerMove={handleJoystickMove}
            onPointerUp={handleJoystickEnd}
            onPointerCancel={handleJoystickEnd}
          >
            {/* Center Thumb Knob */}
            <div
              className="w-14 h-14 rounded-full bg-gradient-to-b from-[#38bdf8] to-[#0284c7] shadow-[0_0_15px_rgba(56,189,248,0.5)] border-2 border-white/60 pointer-events-none transition-transform duration-75"
              style={{
                transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`,
              }}
            />
          </div>

          {/* Right Touch Look Area (Drag to Aim) */}
          <div
            className="absolute top-16 right-0 bottom-40 left-1/2 pointer-events-auto touch-none"
            onPointerDown={handleLookPointerDown}
            onPointerMove={handleLookPointerMove}
            onPointerUp={handleLookPointerUp}
            onPointerCancel={handleLookPointerUp}
          />

          {/* Right Mobile Action Buttons Cluster */}
          <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2.5 pointer-events-none">
            {/* Upper Action Row: ADS, Jump, Dash, Reload */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onAimToggle?.();
                }}
                className="w-11 h-11 rounded-full bg-[#1e293b]/90 border border-[#38bdf8] text-[#38bdf8] font-display font-bold text-[11px] flex items-center justify-center shadow-lg active:scale-95"
              >
                ADS
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onReload?.();
                }}
                className="w-11 h-11 rounded-full bg-[#1e293b]/90 border border-[#f59e0b] text-[#f59e0b] font-display font-bold text-[11px] flex items-center justify-center shadow-lg active:scale-95"
              >
                RLD
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onDash?.();
                }}
                className="w-11 h-11 rounded-full bg-[#1e293b]/90 border border-[#06b6d4] text-[#06b6d4] font-display font-bold text-[11px] flex items-center justify-center shadow-lg active:scale-95"
              >
                DASH
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onJump?.();
                }}
                className="w-13 h-13 rounded-full bg-[#334155]/90 border-2 border-[#f8fafc] text-white font-display font-bold text-xs flex items-center justify-center shadow-lg active:scale-95"
              >
                JUMP
              </button>
            </div>

            {/* Tactical Special Row: C4, Sentry, Enter/Exit Vehicle, Use [F] */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onC4?.();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-[#b91c1c]/90 border border-[#f87171] text-white font-display font-bold text-[10px] shadow active:scale-95"
              >
                💥 C4 ({hud.c4Count})
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onSentry?.();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-[#1d4ed8]/90 border border-[#60a5fa] text-white font-display font-bold text-[10px] shadow active:scale-95"
              >
                🤖 SENTRY ({hud.sentriesAvailable})
              </button>
              {(hud.nearbyVehicleName || hud.nearbyHelicopterName || hud.nearbyTankName || hud.inVehicle || hud.inHelicopter || hud.inTank) && (
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onVehicleToggle?.();
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[#84cc16]/90 border border-[#bef264] text-[#141d13] font-display font-bold text-[10px] shadow active:scale-95 animate-pulse"
                >
                  {hud.inVehicle || hud.inHelicopter || hud.inTank ? 'EXIT' : 'ENTER'}
                </button>
              )}
              {hud.interactionPrompt && (
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onInteract?.();
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[#0284c7]/95 border border-[#38bdf8] text-white font-display font-bold text-[10px] shadow active:scale-95 animate-bounce"
                >
                  USE [F]
                </button>
              )}
            </div>

            {/* Primary Big Fire Button */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                onFireStart?.();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                onFireEnd?.();
              }}
              onPointerLeave={(e) => {
                e.preventDefault();
                onFireEnd?.();
              }}
              className="w-18 h-18 rounded-full bg-gradient-to-tr from-[#dc2626] to-[#ef4444] border-4 border-[#fca5a5] shadow-[0_0_20px_rgba(239,68,68,0.7)] flex items-center justify-center pointer-events-auto active:scale-90 transition-transform cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-9 h-9 text-white fill-none stroke-current stroke-2">
                <circle cx="12" cy="12" r="8" />
                <line x1="12" y1="2" x2="12" y2="7" />
                <line x1="12" y1="17" x2="12" y2="22" />
                <line x1="2" y1="12" x2="7" y2="12" />
                <line x1="17" y1="12" x2="22" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
