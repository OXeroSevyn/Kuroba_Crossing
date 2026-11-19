import React from 'react';
import type { GameMode, GamePhase, RunSummary } from '../game/types';

interface StatusModalProps {
  phase: GamePhase;
  gameMode: GameMode;
  summary: RunSummary | null;
  score: number;
  wave: number;
  totalWaves: number | null;
  kills: number;
  onResume: () => void;
  onRestart: () => void;
  onCustomize: () => void;
  onTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  phase,
  gameMode,
  summary,
  score,
  wave,
  totalWaves,
  kills,
  onResume,
  onRestart,
  onCustomize,
  onTitle,
}) => {
  if (phase !== 'paused' && phase !== 'victory' && phase !== 'gameover') {
    return null;
  }

  const isPaused = phase === 'paused';
  const isVictory = phase === 'victory';
  const isZombies = (summary ? summary.gameMode : gameMode) === 'zombies';

  const heading = isPaused
    ? 'MISSION PAUSED'
    : isVictory
      ? 'CROSSING SECURED'
      : isZombies
        ? 'OVERRUN BY HORDE'
        : 'UNIT K-04 DISABLED';

  const subheading = isPaused
    ? isZombies
      ? 'Outbreak containment standing by.'
      : 'Kuroba Station defense standing by.'
    : isVictory
      ? 'Shogun Mk-IV neutralized — Kuroba Crossing is safe.'
      : isZombies
        ? 'The infected horde breached Kuroba Crossing.'
        : 'Hostile mecha overran the railway perimeter.';

  const displayScore = summary ? summary.score : score;
  const displayBest = summary ? summary.bestScore : score;
  const displayWave = summary ? summary.waveReached : wave;
  const displayKills = summary ? summary.kills : kills;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(14, 12, 16, 0.76)' }}
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div className="w-full max-w-md bg-[#231914] border-2 border-[#e6be74]/70 rounded shadow-[0_18px_48px_rgba(0,0,0,0.75)] p-7 text-center">
        <div
          className="text-[11px] font-display font-bold uppercase tracking-[0.26em] mb-1.5"
          style={{ color: isVictory ? '#4ef2a1' : isPaused ? '#f2c66d' : '#ff6b52' }}
        >
          {isPaused ? 'STANDBY' : isVictory ? 'VICTORY' : 'GAME OVER'}
        </div>

        <h2 className="text-3xl font-display font-bold tracking-[0.08em] text-[#fff5e4] mb-2">
          {heading}
        </h2>
        <p className="text-sm text-[#cbb699] mb-6">{subheading}</p>

        {/* Stat Tiles (3 tabular-nums readouts) */}
        <div className="grid grid-cols-3 gap-2.5 mb-7">
          <div className="bg-[#18110d] border border-[#544030] rounded py-3 px-2">
            <div className="text-[10px] font-display uppercase tracking-[0.18em] text-[#bfa98d]">
              SCORE
            </div>
            <div className="text-xl font-display font-bold text-[#ffe699] tabular-nums">
              {displayScore.toLocaleString()}
            </div>
          </div>

          <div className="bg-[#18110d] border border-[#544030] rounded py-3 px-2">
            <div className="text-[10px] font-display uppercase tracking-[0.18em] text-[#bfa98d]">
              {isZombies ? 'HORDE' : 'WAVE'}
            </div>
            <div className="text-xl font-display font-bold text-[#fff5e4] tabular-nums">
              {totalWaves !== null ? `${displayWave}/${totalWaves}` : displayWave}
            </div>
          </div>

          <div className="bg-[#18110d] border border-[#544030] rounded py-3 px-2">
            <div className="text-[10px] font-display uppercase tracking-[0.18em] text-[#bfa98d]">
              {isPaused ? (isZombies ? 'ZOMBIES' : 'MECHS KO') : isVictory ? 'CLEAR TIME' : 'BEST'}
            </div>
            <div className="text-xl font-display font-bold text-[#45f2ff] tabular-nums">
              {isPaused
                ? displayKills
                : isVictory && summary
                  ? `${summary.elapsedSec}s`
                  : displayBest.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          {isPaused ? (
            <button
              type="button"
              onClick={onResume}
              className="w-full font-display font-bold uppercase tracking-[0.16em] py-3.5 rounded bg-[#e2712c] hover:bg-[#f2843e] text-[#1a110b] border border-[#ffdca0] transition-colors cursor-pointer"
            >
              RESUME DEFENSE
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="w-full font-display font-bold uppercase tracking-[0.16em] py-3.5 rounded bg-[#e2712c] hover:bg-[#f2843e] text-[#1a110b] border border-[#ffdca0] transition-colors cursor-pointer"
            >
              {isVictory ? 'PLAY AGAIN' : 'TRY AGAIN'}
            </button>
          )}

          <button
            type="button"
            onClick={onCustomize}
            className="w-full font-display font-bold uppercase tracking-[0.14em] text-xs py-3 rounded bg-[#1c2a36] hover:bg-[#263a4a] text-[#8beeff] border border-[#45f2ff]/50 transition-colors cursor-pointer"
          >
            CUSTOMIZE OPERATOR &amp; GUNS
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            {isPaused && (
              <button
                type="button"
                onClick={onRestart}
                className="font-display font-bold uppercase tracking-[0.14em] text-xs py-3 rounded bg-[#32241c] hover:bg-[#423025] text-[#f5efe6] border border-[#7d624a] transition-colors cursor-pointer"
              >
                RESTART
              </button>
            )}
            <button
              type="button"
              onClick={onTitle}
              className={`font-display font-bold uppercase tracking-[0.14em] text-xs py-3 rounded bg-[#1b130f] hover:bg-[#2b1f18] text-[#d9c5aa] border border-[#594434] transition-colors cursor-pointer ${
                isPaused ? '' : 'col-span-2'
              }`}
            >
              TITLE SCREEN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
