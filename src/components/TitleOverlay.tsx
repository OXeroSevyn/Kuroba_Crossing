import React, { useState, useRef } from 'react';
import type { GameMode, TimeOfDay } from '../game/types';
import { multiplayer } from '../game/multiplayer';

interface TitleOverlayProps {
  bestScore: number;
  muted: boolean;
  musicVolume?: number;
  onMusicVolumeChange?: (vol: number) => void;
  gameMode: GameMode;
  timeOfDay: TimeOfDay;
  onSelectMode: (mode: GameMode) => void;
  onToggleTimeOfDay: () => void;
  onStart: () => void;
  onOpenCustomize: () => void;
  onToggleMute: () => void;
  onHostTdm?: (roomCode?: string) => Promise<string>;
  onJoinTdm?: (code: string) => Promise<string>;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  bestScore,
  muted,
  musicVolume = 0.5,
  onMusicVolumeChange,
  gameMode,
  timeOfDay,
  onSelectMode,
  onToggleTimeOfDay,
  onStart,
  onOpenCustomize,
  onToggleMute,
  onHostTdm,
  onJoinTdm,
}) => {
  const isNight = timeOfDay === 'night';
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showTdmModal, setShowTdmModal] = useState(false);
  const [showModesFlyout, setShowModesFlyout] = useState(false);
  const [showSoundPopover, setShowSoundPopover] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [roomCopied, setRoomCopied] = useState(false);
  const [activeRoomCode, setActiveRoomCode] = useState(multiplayer.roomCode || '');
  const [isHosting, setIsHosting] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnterDeploy = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setShowModesFlyout(true);
  };

  const handleMouseLeaveDeploy = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setShowModesFlyout(false);
    }, 280);
  };

  const handleCopyLink = () => {
    const url = multiplayer.getShareableUrl();
    navigator.clipboard.writeText(url).then(() => {
      setRoomCopied(true);
      setTimeout(() => setRoomCopied(false), 2400);
    });
  };

  const handleCreateHost = async () => {
    setIsHosting(true);
    try {
      if (onHostTdm) {
        const code = await onHostTdm();
        setActiveRoomCode(code);
      } else {
        const code = await multiplayer.hostGame();
        setActiveRoomCode(code);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsHosting(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCodeInput.trim()) return;
    try {
      if (onJoinTdm) {
        await onJoinTdm(joinCodeInput.trim());
      } else {
        await multiplayer.joinGame(joinCodeInput.trim());
      }
      setShowTdmModal(false);
      onStart();
    } catch (e) {
      alert('Could not join match with that code. Make sure host is active.');
    }
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 sm:p-6 lg:p-8 select-none font-sans text-white">
      {/* ==================== 1. TOP UTILITY HEADER ==================== */}
      <div className="flex items-center justify-end w-full">
        {/* Right: Notification, Settings, Help, Day/Night, Audio Cluster */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Notification with Badge */}
          <button
            type="button"
            title="Notifications"
            className="h-9 w-9 sm:h-10 sm:w-10 hover:brightness-125 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
          >
            <img
              src="/assets/neon_zombie_ui/notifications.png"
              alt="Notifications"
              className="w-full h-full object-contain drop-shadow"
            />
          </button>

          {/* Settings Gear */}
          <button
            type="button"
            title="Options"
            onClick={() => setShowOptionsModal(true)}
            className="h-9 w-9 sm:h-10 sm:w-10 hover:brightness-125 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
          >
            <img
              src="/assets/neon_zombie_ui/settings.png"
              alt="Settings"
              className="w-full h-full object-contain drop-shadow"
            />
          </button>

          {/* Guide / Help */}
          <button
            type="button"
            title="Field Manual & Controls"
            onClick={() => setShowGuideModal(true)}
            className="h-9 w-9 sm:h-10 sm:w-10 hover:brightness-125 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
          >
            <img
              src="/assets/neon_zombie_ui/help.png"
              alt="Help"
              className="w-full h-full object-contain drop-shadow"
            />
          </button>

          {/* Day / Night Dropdown */}
          <button
            type="button"
            title="Toggle Lighting [N]"
            onClick={onToggleTimeOfDay}
            className="h-9 sm:h-10 w-auto hover:brightness-125 active:scale-95 transition-all cursor-pointer flex items-center"
          >
            <img
              src={isNight ? '/assets/neon_zombie_ui/night_dropdown.png' : '/assets/neon_zombie_ui/day_dropdown.png'}
              alt={isNight ? 'Night' : 'Day'}
              className="h-full w-auto object-contain drop-shadow"
            />
          </button>

          {/* Sound Control Cluster with Adjustable Volume Popover */}
          <div className="relative">
            <button
              type="button"
              title={muted ? 'Unmute Audio' : `Lobby Music: ${Math.round(musicVolume * 100)}% (Click to adjust volume)`}
              onClick={() => setShowSoundPopover((prev) => !prev)}
              className={`h-9 w-9 sm:h-10 sm:w-10 hover:brightness-125 active:scale-95 transition-all cursor-pointer flex items-center justify-center relative ${
                muted ? 'opacity-50 grayscale' : ''
              }`}
            >
              <img
                src="/assets/neon_zombie_ui/sound.png"
                alt="Sound"
                className="w-full h-full object-contain drop-shadow"
              />
              {!muted && (
                <span className="absolute -bottom-1 -right-1 text-[9px] font-black font-mono text-[#fbbf24] bg-[#111622]/95 px-1 rounded border border-[#fbbf24]/50 leading-tight">
                  {Math.round(musicVolume * 100)}%
                </span>
              )}
            </button>

            {/* Volume Popover */}
            {showSoundPopover && (
              <div className="absolute right-0 top-12 z-50 w-72 rounded-xl bg-[#131722]/95 border border-[#fbbf24]/40 p-4 shadow-2xl backdrop-blur-md flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🎵</span>
                    <span className="text-xs font-black uppercase text-[#fbbf24] tracking-wider">
                      Lobby Music
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase transition-colors ${
                      muted
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    }`}
                  >
                    {muted ? 'MUTED' : 'ACTIVE'}
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-gray-400">Music Volume</span>
                    <span className="text-white font-bold">{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={musicVolume}
                    onChange={(e) => {
                      if (muted) onToggleMute();
                      onMusicVolumeChange?.(parseFloat(e.target.value));
                    }}
                    className="w-full h-2 bg-[#202534] rounded-lg appearance-none cursor-pointer accent-[#fbbf24]"
                  />
                  <div className="flex justify-between text-[9px] text-gray-400 font-mono mt-0.5">
                    <button
                      type="button"
                      onClick={() => onMusicVolumeChange?.(0.2)}
                      className="hover:text-[#fbbf24] cursor-pointer"
                    >
                      20%
                    </button>
                    <button
                      type="button"
                      onClick={() => onMusicVolumeChange?.(0.5)}
                      className="hover:text-[#fbbf24] cursor-pointer"
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() => onMusicVolumeChange?.(0.8)}
                      className="hover:text-[#fbbf24] cursor-pointer"
                    >
                      80%
                    </button>
                    <button
                      type="button"
                      onClick={() => onMusicVolumeChange?.(1.0)}
                      className="hover:text-[#fbbf24] cursor-pointer"
                    >
                      100%
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-gray-300 bg-black/40 rounded p-2 border border-white/5 flex items-center gap-1.5">
                  <span className="text-[#fbbf24]">📻</span>
                  <span className="truncate font-mono">Japanese Tactical FPS Cover</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== 2. MAIN CENTER BODY ==================== */}
      <div className="flex flex-col lg:flex-row items-start justify-between gap-6 my-auto max-w-[1400px] w-full mx-auto relative">
        {/* LEFT COLUMN: BRANDING & PRIMARY ACTION BUTTONS */}
        <div className="flex flex-col max-w-md w-full relative z-30">
          {/* Main Logo from Official PNG Asset */}
          <div className="mb-2 max-w-[320px] sm:max-w-[390px]">
            <img
              src="/assets/neon_zombie_ui/kuroba crossing logo.png"
              alt="Kuroba Crossing"
              className="w-full h-auto object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)]"
            />
          </div>

          {/* Description */}
          <p className="text-xs sm:text-[13px] text-gray-300 leading-relaxed max-w-sm mb-5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-medium">
            Customize your operator, build weapons, defend crossings, and survive the horde in Kuroba Crossing.
          </p>

          {/* VERTICAL ACTION BUTTONS */}
          <div className="pointer-events-auto flex flex-col gap-2.5 max-w-[270px] w-full relative">
            {/* 1. DEPLOY BUTTON WITH HOVER FLYOUT FOR MODES */}
            <div
              className="relative w-full"
              onMouseEnter={handleMouseEnterDeploy}
              onMouseLeave={handleMouseLeaveDeploy}
            >
              <button
                type="button"
                onClick={() => {
                  if (gameMode === 'deathmatch' && !multiplayer.roomCode) {
                    setShowTdmModal(true);
                  } else {
                    onStart();
                  }
                }}
                className="w-full hover:brightness-125 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center drop-shadow-[0_4px_16px_rgba(239,68,68,0.4)]"
              >
                <img
                  src="/assets/neon_zombie_ui/deploy.png"
                  alt="Deploy"
                  className="w-full h-auto object-contain"
                />
              </button>

              {/* FLYOUT MODES MENU: Appears on Hover on DEPLOY button */}
              {showModesFlyout && (
                <div
                  className="absolute left-0 lg:left-[104%] top-full lg:top-0 mt-2 lg:mt-0 z-50 w-full sm:w-[620px] rounded-xl bg-[#0f121b]/95 border-2 border-[#f59e0b] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.95),0_0_28px_rgba(245,158,11,0.35)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-200"
                  onMouseEnter={handleMouseEnterDeploy}
                  onMouseLeave={handleMouseLeaveDeploy}
                >
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-[#fbbf24] font-black text-xs tracking-wider">///</span>
                      <span className="text-xs font-black tracking-[0.2em] uppercase text-white">
                        CHOOSE MODE TO DEPLOY
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold tracking-wider">
                      SELECTED: <span className="text-[#fbbf24] uppercase">{gameMode}</span>
                    </span>
                  </div>

                  {/* 3 Game Mode Cards in Flyout */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* CARD 1: ZOMBIE SURVIVAL */}
                    <div
                      onClick={() => onSelectMode('zombies')}
                      className={`group relative rounded-lg p-2 flex flex-col justify-between transition-all cursor-pointer overflow-hidden ${
                        gameMode === 'zombies'
                          ? 'bg-[#181c26]/95 border-2 border-[#ef4444] shadow-[0_0_16px_rgba(239,68,68,0.4)] ring-1 ring-[#ef4444]'
                          : 'bg-[#12151e]/85 border border-white/10 hover:border-white/25 hover:bg-[#181c26]/85'
                      }`}
                    >
                      {gameMode === 'zombies' && (
                        <div className="absolute top-1.5 right-1.5 z-10 w-4 h-4 rounded-sm bg-[#ef4444] text-white font-black text-[10px] flex items-center justify-center shadow">
                          ✓
                        </div>
                      )}

                      <div className="w-full h-20 rounded overflow-hidden mb-2 relative bg-black/60">
                        <img
                          src="/assets/neon_zombie_ui/Voxel Zombie Horde at Sunset.png"
                          alt="Zombie Survival"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      </div>

                      <div>
                        <div className="flex items-center gap-1 mb-0.5 text-[#f87171] font-black text-[11px] tracking-wider uppercase">
                          <span>☣</span>
                          <span>ZOMBIE SURVIVAL</span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Survive endless waves & hold the crossings.
                        </p>
                      </div>
                    </div>

                    {/* CARD 2: TEAM DEATHMATCH */}
                    <div
                      onClick={() => {
                        onSelectMode('deathmatch');
                        if (!multiplayer.roomCode) {
                          setShowTdmModal(true);
                        }
                      }}
                      className={`group relative rounded-lg p-2 flex flex-col justify-between transition-all cursor-pointer overflow-hidden ${
                        gameMode === 'deathmatch'
                          ? 'bg-[#181c26]/95 border-2 border-[#3b82f6] shadow-[0_0_16px_rgba(59,130,246,0.4)] ring-1 ring-[#3b82f6]'
                          : 'bg-[#12151e]/85 border border-white/10 hover:border-white/25 hover:bg-[#181c26]/85'
                      }`}
                    >
                      {gameMode === 'deathmatch' && (
                        <div className="absolute top-1.5 right-1.5 z-10 w-4 h-4 rounded-sm bg-[#3b82f6] text-white font-black text-[10px] flex items-center justify-center shadow">
                          ✓
                        </div>
                      )}

                      <div className="w-full h-20 rounded overflow-hidden mb-2 relative bg-black/60">
                        <img
                          src="/assets/neon_zombie_ui/Voxel Battlefield Standoff.png"
                          alt="Team Deathmatch"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      </div>

                      <div>
                        <div className="flex items-center gap-1 mb-0.5 text-[#60a5fa] font-black text-[11px] tracking-wider uppercase">
                          <span>⚔</span>
                          <span>DEATHMATCH</span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          P2P 2 Teams. Instant respawn & pings.
                        </p>
                      </div>
                    </div>

                    {/* CARD 3: MECHA DEFENSE */}
                    <div
                      onClick={() => onSelectMode('mecha')}
                      className={`group relative rounded-lg p-2 flex flex-col justify-between transition-all cursor-pointer overflow-hidden ${
                        gameMode === 'mecha'
                          ? 'bg-[#181c26]/95 border-2 border-[#a855f7] shadow-[0_0_16px_rgba(168,85,247,0.4)] ring-1 ring-[#a855f7]'
                          : 'bg-[#12151e]/85 border border-white/10 hover:border-white/25 hover:bg-[#181c26]/85'
                      }`}
                    >
                      {gameMode === 'mecha' && (
                        <div className="absolute top-1.5 right-1.5 z-10 w-4 h-4 rounded-sm bg-[#a855f7] text-white font-black text-[10px] flex items-center justify-center shadow">
                          ✓
                        </div>
                      )}

                      <div className="w-full h-20 rounded overflow-hidden mb-2 relative bg-black/60">
                        <img
                          src="/assets/neon_zombie_ui/Voxel Mech Versus Zombie Horde.png"
                          alt="Mecha Defense"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      </div>

                      <div>
                        <div className="flex items-center gap-1 mb-0.5 text-[#c084fc] font-black text-[11px] tracking-wider uppercase">
                          <span>🛡</span>
                          <span>MECHA DEFENSE</span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-tight">
                          Heavy mechs, laser salvos, boss titans.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Flyout bottom actions */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/10 text-[11px]">
                    <span className="text-gray-400 font-medium">Click any card to switch mode</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (gameMode === 'deathmatch' && !multiplayer.roomCode) {
                          setShowTdmModal(true);
                        } else {
                          onStart();
                        }
                      }}
                      className="px-4 py-1.5 rounded bg-[#ef4444] hover:bg-[#dc2626] text-white font-black uppercase tracking-wider text-xs shadow-md cursor-pointer transition-all active:scale-95"
                    >
                      DEPLOY NOW ›
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. CUSTOMIZE BUTTON */}
            <button
              type="button"
              onClick={onOpenCustomize}
              className="w-full hover:brightness-120 active:scale-[0.98] transition-all cursor-pointer flex items-center"
            >
              <img
                src="/assets/neon_zombie_ui/customize.png"
                alt="Customize"
                className="w-full h-auto object-contain drop-shadow"
              />
            </button>

            {/* 3. LOADOUT BUTTON */}
            <button
              type="button"
              onClick={onOpenCustomize}
              className="w-full hover:brightness-120 active:scale-[0.98] transition-all cursor-pointer flex items-center"
            >
              <img
                src="/assets/neon_zombie_ui/loadout.png"
                alt="Loadout"
                className="w-full h-auto object-contain drop-shadow"
              />
            </button>

            {/* 4. OPTIONS BUTTON */}
            <button
              type="button"
              onClick={() => setShowOptionsModal(true)}
              className="w-full hover:brightness-120 active:scale-[0.98] transition-all cursor-pointer flex items-center"
            >
              <img
                src="/assets/neon_zombie_ui/options.png"
                alt="Options"
                className="w-full h-auto object-contain drop-shadow"
              />
            </button>

            {/* TDM Active Room Info / Quick Invite Link */}
            {gameMode === 'deathmatch' && (
              <div className="mt-1 pt-1">
                {multiplayer.roomCode ? (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="w-full px-3 py-2 rounded-md bg-[#2563eb]/20 border border-[#3b82f6]/60 text-xs font-bold text-[#93c5fd] hover:bg-[#2563eb]/30 flex items-center justify-center gap-2 cursor-pointer shadow"
                  >
                    <span>{roomCopied ? '✓ LINK COPIED!' : '🔗 COPY MATCH LINK'}</span>
                    <span className="bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white uppercase">{multiplayer.roomCode}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTdmModal(true)}
                    className="w-full px-3 py-2 rounded-md bg-[#2563eb]/20 border border-[#3b82f6]/60 text-xs font-bold text-[#93c5fd] hover:bg-[#2563eb]/30 flex items-center justify-center gap-2 cursor-pointer shadow"
                  >
                    <span>⚔ HOST / JOIN MATCH</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center / Right: Open 3D Viewport - Clean and unobstructed */}
        <div className="hidden lg:flex flex-col items-end pointer-events-none self-end mb-4">
          <div className="px-3 py-1.5 rounded-md bg-black/40 backdrop-blur-sm border border-white/10 text-[11px] font-bold text-gray-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>MAP: KUROBA CROSSING</span>
            <span className="text-white/40">|</span>
            <span className="text-[#fbbf24] uppercase">{gameMode === 'deathmatch' ? 'TEAM DEATHMATCH' : gameMode === 'mecha' ? 'MECHA DEFENSE' : 'ZOMBIE SURVIVAL'}</span>
          </div>
        </div>
      </div>

      {/* ==================== 3. BOTTOM FOOTER BAR ==================== */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full pt-3 sm:pt-4 border-t border-white/10">
        {/* Left: Highest Score Badge & Navigation Links */}
        <div className="pointer-events-auto flex items-center gap-3 sm:gap-4 lg:gap-5 flex-wrap">
          {/* Highest Score Image Pill with Pinpoint Perfectly Aligned Score */}
          <div className="relative h-16 sm:h-20 lg:h-24 w-auto flex items-center select-none">
            <img
              src="/assets/neon_zombie_ui/highest_score.png"
              alt="Highest Score"
              className="h-full w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)]"
            />
            {/* Dynamic Score Text positioned and aligned directly under 'HIGHEST SCORE' to the right of [S] hexagon */}
            <div className="absolute left-[36%] top-[45%] bottom-[16%] flex items-center pointer-events-none">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-normal tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] font-display leading-none">
                {bestScore > 0 ? bestScore.toLocaleString() : '5,710'}
              </span>
            </div>
          </div>

          {/* Quick Links: Leaderboard, Achievements, Guide */}
          <button
            type="button"
            onClick={() => alert(`Leaderboard: Kuroba Crossing Global Rank #1 - Score ${bestScore > 0 ? bestScore.toLocaleString() : '5,710'}`)}
            className="h-11 sm:h-13 lg:h-15 w-auto hover:brightness-125 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center"
          >
            <img
              src="/assets/neon_zombie_ui/leaderboard.png"
              alt="Leaderboard"
              className="h-full w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            />
          </button>

          <button
            type="button"
            onClick={() => alert('Achievements: 14/20 Unlocked')}
            className="h-11 sm:h-13 lg:h-15 w-auto hover:brightness-125 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center"
          >
            <img
              src="/assets/neon_zombie_ui/achievements.png"
              alt="Achievements"
              className="h-full w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            />
          </button>

          <button
            type="button"
            onClick={() => setShowGuideModal(true)}
            className="h-11 sm:h-13 lg:h-15 w-auto hover:brightness-125 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center"
          >
            <img
              src="/assets/neon_zombie_ui/guide.png"
              alt="Guide"
              className="h-full w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            />
          </button>
        </div>

        {/* Right: Red Glowing Event Banner (Bigger & High Contrast) */}
        <button
          type="button"
          onClick={() => {
            onSelectMode('zombies');
            onStart();
          }}
          className="pointer-events-auto h-16 sm:h-20 lg:h-24 w-auto hover:brightness-115 hover:scale-105 active:scale-[0.98] transition-all cursor-pointer flex items-center"
        >
          <img
            src="/assets/neon_zombie_ui/zombie_survival_event.png"
            alt="Event Zombie Survival"
            className="h-full w-auto object-contain drop-shadow-[0_4px_24px_rgba(220,38,38,0.55)]"
          />
        </button>
      </div>

      {/* ==================== MODALS ==================== */}

      {/* TEAM DEATHMATCH HOST / INVITE MODAL */}
      {showTdmModal && (
        <div className="pointer-events-auto fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-[#161922] border-2 border-[#f59e0b] p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚔</span>
                <h3 className="text-lg font-black tracking-wide uppercase text-[#fbbf24]">
                  TEAM DEATHMATCH (P2P)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTdmModal(false)}
                className="text-gray-400 hover:text-white font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-300 mb-5">
              Connect directly with friends browser-to-browser using WebRTC (No server required!).
            </p>

            {/* Option A: Host Match & Invite Link */}
            <div className="rounded-lg bg-black/40 border border-white/10 p-4 mb-4">
              <h4 className="text-xs font-black tracking-wider text-[#60a5fa] uppercase mb-2">
                1. HOST MATCH &amp; SEND INVITE
              </h4>
              {activeRoomCode ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between bg-black/60 px-3 py-2 rounded border border-[#f59e0b]/40">
                    <span className="text-xs text-gray-400">ROOM CODE:</span>
                    <span className="text-base font-black text-[#fbbf24] tracking-widest uppercase">
                      {activeRoomCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="w-full py-2.5 rounded bg-[#eab308] hover:bg-[#facc15] text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <span>📋</span>
                    <span>{roomCopied ? 'INVITE LINK COPIED!' : 'COPY INVITE LINK'}</span>
                  </button>
                  <p className="text-[10px] text-gray-400 text-center">
                    Send this link to friends so they can join your Team Deathmatch!
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isHosting}
                  onClick={handleCreateHost}
                  className="w-full py-2.5 rounded bg-[#2563eb] hover:bg-[#3b82f6] text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
                >
                  {isHosting ? 'CREATING ROOM...' : 'CREATE & HOST MATCH'}
                </button>
              )}
            </div>

            {/* Option B: Join by Room Code */}
            <div className="rounded-lg bg-black/40 border border-white/10 p-4 mb-5">
              <h4 className="text-xs font-black tracking-wider text-[#ef4444] uppercase mb-2">
                2. JOIN FRIEND&apos;S MATCH
              </h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter Room Code (e.g. tdm-xxxx)"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/20 rounded px-3 py-2 text-xs text-white placeholder-gray-500 uppercase tracking-wider focus:outline-none focus:border-[#f59e0b]"
                />
                <button
                  type="button"
                  onClick={handleJoin}
                  className="px-4 py-2 rounded bg-[#dc2626] hover:bg-[#ef4444] text-white font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
                >
                  JOIN
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowTdmModal(false);
                onStart();
              }}
              className="w-full py-3 rounded-md bg-[#eab308] hover:bg-[#facc15] text-black font-black text-sm uppercase tracking-widest cursor-pointer shadow-lg"
            >
              START MATCH &amp; ENTER ARENA
            </button>
          </div>
        </div>
      )}

      {/* OPTIONS MODAL */}
      {showOptionsModal && (
        <div className="pointer-events-auto fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl bg-[#161922] border border-white/20 p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black uppercase text-[#fbbf24]">GAME OPTIONS</h3>
              <button
                type="button"
                onClick={() => setShowOptionsModal(false)}
                className="text-gray-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-3 text-xs mb-6">
              <div className="flex items-center justify-between">
                <span>Audio Sound Effects:</span>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="px-3 py-1 rounded bg-[#202534] font-bold"
                >
                  {muted ? 'MUTED' : 'ENABLED'}
                </button>
              </div>
              <div className="flex flex-col gap-1.5 py-2 border-t border-b border-white/10">
                <div className="flex items-center justify-between">
                  <span>Lobby Cover Music:</span>
                  <span className="font-mono text-[#fbbf24] font-bold">
                    {muted ? 'MUTED' : `${Math.round(musicVolume * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={musicVolume}
                  onChange={(e) => {
                    if (muted) onToggleMute();
                    onMusicVolumeChange?.(parseFloat(e.target.value));
                  }}
                  className="w-full h-2 bg-[#202534] rounded-lg appearance-none cursor-pointer accent-[#fbbf24]"
                />
                <div className="text-[10px] text-gray-400 font-mono">
                  Track: Japanese Tactical FPS Cover
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Atmospheric Lighting:</span>
                <button
                  type="button"
                  onClick={onToggleTimeOfDay}
                  className="px-3 py-1 rounded bg-[#202534] font-bold uppercase text-[#fcd34d]"
                >
                  {timeOfDay}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowOptionsModal(false)}
              className="w-full py-2.5 rounded bg-[#eab308] text-black font-black uppercase tracking-wider"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* GUIDE MODAL */}
      {showGuideModal && (
        <div className="pointer-events-auto fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-[#161922] border border-[#f59e0b]/50 p-6 text-white max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black uppercase text-[#fbbf24]">OPERATOR MANUAL</h3>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="text-gray-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs text-gray-300">
              <p><strong className="text-white">WASD:</strong> Walk / Sprint / Drive Vehicle</p>
              <p><strong className="text-white">Mouse:</strong> Aim &amp; Shoot</p>
              <p><strong className="text-white">E:</strong> Enter or Exit Vehicles (Kei-Truck, Jeep, Coupe, Buggy)</p>
              <p><strong className="text-white">Shift:</strong> Tactical Dash (Infantry) / Nitro Boost (Car)</p>
              <p><strong className="text-white">Space:</strong> Jump (Infantry) / Handbrake Drift (Car)</p>
              <p><strong className="text-white">1, 2, 3:</strong> Swap Pulse Carbine / Shotgun / Railgun</p>
              <p><strong className="text-white">R:</strong> Reload Magazine</p>
              <p><strong className="text-white">N:</strong> Instant Day / Night Lighting Switch</p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full mt-6 py-2.5 rounded bg-[#eab308] text-black font-black uppercase tracking-wider cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
