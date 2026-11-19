import React from 'react';
import type { GameMode, TimeOfDay } from '../game/types';

interface TitleOverlayProps {
  bestScore: number;
  muted: boolean;
  gameMode: GameMode;
  timeOfDay: TimeOfDay;
  onSelectMode: (mode: GameMode) => void;
  onToggleTimeOfDay: () => void;
  onStart: () => void;
  onToggleMute: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  bestScore,
  muted,
  gameMode,
  timeOfDay,
  onSelectMode,
  onToggleTimeOfDay,
  onStart,
  onToggleMute,
}) => {
  const isZombies = gameMode === 'zombies';
  const isNight = timeOfDay === 'night';

  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 sm:p-10"
      style={{
        background: isNight
          ? 'linear-gradient(95deg, rgba(10, 14, 24, 0.84) 0%, rgba(10, 14, 24, 0.48) 40%, rgba(10, 14, 24, 0.06) 70%, rgba(10, 14, 24, 0) 100%)'
          : 'linear-gradient(95deg, rgba(22, 16, 12, 0.78) 0%, rgba(22, 16, 12, 0.42) 38%, rgba(22, 16, 12, 0.04) 68%, rgba(22, 16, 12, 0) 100%)',
      }}
    >
      {/* Top Utility Row */}
      <div className="flex items-start justify-between">
        <div className="text-xs font-display tracking-[0.22em] uppercase text-[#f2cf84]/90 hud-stroke">
          黒葉踏切 · {isZombies ? 'ZOMBIE OUTBREAK' : 'STATION DEFENSE'}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={isNight ? 'Switch to Day Mode' : 'Switch to Night Mode'}
            title="Toggle Night / Day [N]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleTimeOfDay();
            }}
            className="pointer-events-auto h-10 px-3 flex items-center gap-2 rounded bg-[#1b1a24]/92 border border-[#e6be74]/45 text-xs font-display font-bold uppercase tracking-[0.14em] text-[#f5efe6] hover:bg-[#2a2838] hover:border-[#ffd782] transition-colors cursor-pointer"
          >
            {isNight ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#8cb8ff]" fill="currentColor">
                <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#ffd76e]" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            )}
            <span>{isNight ? 'NIGHT' : 'DAY'}</span>
          </button>

          <button
            type="button"
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded bg-[#211914]/90 border border-[#e6be74]/40 text-[#f5efe6] hover:bg-[#33261d] hover:border-[#ffd782] transition-colors cursor-pointer"
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M22 9l-6 6M16 9l6 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Left-Anchored Bespoke Inline SVG Title Emblem, Mode Selector & Start CTA */}
      <div className="max-w-md my-auto">
        <div className="mb-5">
          <svg
            viewBox="0 0 420 148"
            className="w-full max-w-[400px] h-auto drop-shadow-[0_6px_16px_rgba(10,7,5,0.75)]"
            role="img"
            aria-label="Kuroba Crossing"
          >
            <path
              d="M12 8 H408 V18 H414 V130 H408 V140 H12 V130 H6 V18 H12 Z"
              fill={isNight ? '#161924' : '#231813'}
              fillOpacity="0.94"
              stroke={isZombies ? '#e85242' : '#e8b861'}
              strokeWidth="2.5"
            />
            <rect
              x="16"
              y="16"
              width="388"
              height="116"
              fill="none"
              stroke={isZombies ? '#9c2222' : '#c94b32'}
              strokeWidth="1.5"
              strokeOpacity="0.85"
            />
            <rect x="28" y="24" width="8" height="6" fill="#ff7eb6" />
            <rect x="44" y="24" width="8" height="6" fill="#ffe066" />
            <rect x="60" y="24" width="8" height="6" fill="#45e8ff" />
            <rect x="76" y="24" width="8" height="6" fill="#ff9d5c" />
            <text
              x="392"
              y="31"
              textAnchor="end"
              fill={isZombies ? '#ff8578' : '#f3cf82'}
              fontSize="12"
              fontFamily="Chakra Petch, sans-serif"
              letterSpacing="3"
            >
              {isZombies ? 'SURVIVAL' : 'UNIT K-04'}
            </text>

            <text
              x="28"
              y="82"
              fill="#fff5e0"
              fontSize="48"
              fontWeight="700"
              fontFamily="Chakra Petch, sans-serif"
              letterSpacing="4"
            >
              KUROBA
            </text>
            <rect x="28" y="96" width="62" height="5" fill={isZombies ? '#e83e32' : '#45e8ff'} />
            <rect x="96" y="96" width="14" height="5" fill="#e87a2e" />
            <text
              x="28"
              y="122"
              fill="#f2c46d"
              fontSize="22"
              fontWeight="700"
              fontFamily="Chakra Petch, sans-serif"
              letterSpacing="8"
            >
              CROSSING
            </text>
            <g transform="translate(340, 56)">
              <rect x="16" y="0" width="8" height="62" fill="#4a3c35" />
              <rect x="0" y="14" width="40" height="8" fill="#e8b861" />
              <rect x="6" y="14" width="8" height="8" fill="#231813" />
              <rect x="24" y="14" width="8" height="8" fill="#231813" />
              <rect x="8" y="2" width="8" height="8" fill="#ff4d3b" />
              <rect x="24" y="2" width="8" height="8" fill="#ff4d3b" />
            </g>
          </svg>
        </div>

        <p className="text-sm sm:text-base text-[#efe4d4] leading-relaxed mb-5 max-w-sm hud-stroke">
          {isZombies
            ? 'Customize your operator & weapons, drive connected highways across Kuroba Crossing, Aurora City, Fungi Forest & Kopenhime Snowpeak, and survive the horde.'
            : 'Customize Unit K-04, roam 4 connected open-world regions by foot or vehicle, and defend Kuroba Crossing across escalating mecha waves.'}
        </p>

        {/* Compact Mode Selector */}
        <div className="pointer-events-auto inline-flex rounded bg-[#18141c]/92 border border-[#e6be74]/40 p-1 mb-5 gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onSelectMode('zombies');
            }}
            className={`px-3.5 py-2 rounded text-xs font-display font-bold uppercase tracking-[0.14em] transition-colors cursor-pointer ${
              isZombies
                ? 'bg-[#c92a2a] text-[#fff6e6] border border-[#ff8787]/60'
                : 'text-[#cbb699] hover:text-[#fff5e4]'
            }`}
          >
            ZOMBIE SURVIVAL
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onSelectMode('mecha');
            }}
            className={`px-3.5 py-2 rounded text-xs font-display font-bold uppercase tracking-[0.14em] transition-colors cursor-pointer ${
              !isZombies
                ? 'bg-[#d97426] text-[#1a110b] border border-[#ffd894]/70'
                : 'text-[#cbb699] hover:text-[#fff5e4]'
            }`}
          >
            MECHA DEFENSE
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className={`pointer-events-auto font-display font-bold uppercase tracking-[0.16em] text-base px-8 py-4 rounded active:translate-y-[1px] border-2 transition-colors cursor-pointer ${
              isZombies
                ? 'bg-[#d63329] hover:bg-[#eb463b] text-[#fff5e4] border-[#ffb3a8] shadow-[0_6px_0_#6e1510,0_12px_24px_rgba(0,0,0,0.55)]'
                : 'bg-[#e2712c] hover:bg-[#f2843e] text-[#1a110b] border-[#ffdca0] shadow-[0_6px_0_#7d3612,0_12px_24px_rgba(0,0,0,0.5)]'
            }`}
          >
            CUSTOMIZE &amp; DEPLOY
          </button>

          {bestScore > 0 && (
            <div className="px-4 py-2.5 rounded bg-[#211914]/90 border border-[#e6be74]/35">
              <div className="text-[10px] font-display tracking-[0.2em] uppercase text-[#d8b884]">
                BEST SCORE
              </div>
              <div className="text-xl font-display font-bold text-[#fff4de] tabular-nums">
                {bestScore.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Single Flat Control-Hint Line in Bottom Safe Margin */}
      <div>
        <span className="inline-block px-3.5 py-1.5 rounded bg-[#14131a]/86 border border-[#e6be74]/25 text-xs sm:text-sm text-[#f5ebd9] tracking-wide">
          WASD Move/Drive · E Enter/Exit Car · Mouse Shoot · Shift Dash/Nitro · Space Jump/Drift · 1-3 Guns · R Reload · N Night/Day
        </span>
      </div>
    </div>
  );
};

