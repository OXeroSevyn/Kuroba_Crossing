import React, { useMemo, useState } from 'react';
import {
  CUSTOMIZATION_CATEGORIES,
} from '../game/customization';
import type { GameMode, LoadoutConfig, TimeOfDay, WeaponId } from '../game/types';

interface CustomizationOverlayProps {
  loadout: LoadoutConfig;
  activeWeapon: WeaponId;
  timeOfDay: TimeOfDay;
  gameMode?: GameMode;
  onSelectOption: (key: keyof LoadoutConfig, value: string) => void;
  onRandomize: () => void;
  onReset: () => void;
  onTabChange: (tab: 'character' | 'gun', weapon?: WeaponId) => void;
  onSelectWeapon: (id: WeaponId) => void;
  onToggleTimeOfDay: () => void;
  onSelectMode?: (mode: GameMode) => void;
  onBackToTitle: () => void;
  onDeploy: () => void;
}

export const CustomizationOverlay: React.FC<CustomizationOverlayProps> = ({
  loadout,
  activeWeapon,
  timeOfDay,
  gameMode = 'zombies',
  onSelectOption,
  onRandomize,
  onReset,
  onTabChange,
  onSelectWeapon,
  onToggleTimeOfDay,
  onSelectMode,
  onBackToTitle,
  onDeploy,
}) => {
  const [mainTab, setMainTab] = useState<'character' | 'gun'>('character');
  const [selectedCharCat, setSelectedCharCat] = useState<keyof LoadoutConfig>('headgear');
  const [selectedGunCat, setSelectedGunCat] = useState<keyof LoadoutConfig>('gunSkin');
  const [leftNavTab, setLeftNavTab] = useState<'operator' | 'weapons' | 'outfit' | 'gear' | 'emotes'>('operator');

  const charCategories = useMemo(
    () => CUSTOMIZATION_CATEGORIES.filter((c) => c.tab === 'character'),
    [],
  );
  const gunCategories = useMemo(
    () => CUSTOMIZATION_CATEGORIES.filter((c) => c.tab === 'gun'),
    [],
  );

  const visibleCategories = mainTab === 'character' ? charCategories : gunCategories;
  const currentCatKey = mainTab === 'character' ? selectedCharCat : selectedGunCat;
  const currentCategory =
    visibleCategories.find((c) => c.key === currentCatKey) ?? visibleCategories[0];

  const isNight = timeOfDay === 'night';

  const switchMainTab = (tab: 'character' | 'gun') => {
    setMainTab(tab);
    onTabChange(tab, activeWeapon);
  };

  const handleLeftNavClick = (tab: 'operator' | 'weapons' | 'outfit' | 'gear' | 'emotes') => {
    setLeftNavTab(tab);
    if (tab === 'weapons') {
      switchMainTab('gun');
    } else if (tab === 'outfit') {
      switchMainTab('character');
      setSelectedCharCat('outfitStyle');
    } else if (tab === 'gear') {
      switchMainTab('character');
      setSelectedCharCat('backpack');
    } else {
      switchMainTab('character');
      setSelectedCharCat('headgear');
    }
  };

  const subcategoryPills: Array<{ key: keyof LoadoutConfig; label: string; count: number }> =
    mainTab === 'character'
      ? [
          { key: 'headgear', label: 'HEADGEAR', count: 9 },
          { key: 'visorColor', label: 'VISOR / EYES', count: 12 },
          { key: 'jacketColor', label: 'ARMOR & JACKET', count: 14 },
          { key: 'outfitStyle', label: 'OUTFIT', count: 18 },
          { key: 'pantsStyle', label: 'LEGS & BOOTS', count: 10 },
          { key: 'backpack', label: 'BACK GEAR', count: 8 },
          { key: 'accentGlow', label: 'SUIT COLOR', count: 10 },
        ]
      : [
          { key: 'gunSkin', label: 'GUN CAMO', count: 12 },
          { key: 'optic', label: 'OPTIC SIGHT', count: 8 },
          { key: 'muzzle', label: 'MUZZLE BRAKE', count: 8 },
          { key: 'underbarrel', label: 'FOREGRIP', count: 8 },
          { key: 'magazine', label: 'EXTENDED MAG', count: 8 },
          { key: 'tracerFx', label: 'TRACER FX', count: 8 },
          { key: 'charm', label: 'GUN CHARM', count: 8 },
        ];

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 sm:p-6 lg:p-7 select-none font-sans text-white">
      {/* ==================== 1. TOP HEADER BAR ==================== */}
      <div className="flex items-center justify-between w-full">
        {/* Left: Back button & Customization pill & Lighting pill */}
        <div className="pointer-events-auto flex items-center gap-2.5">
          <button
            type="button"
            title="Back to Title Screen"
            onClick={onBackToTitle}
            className="w-9 h-9 rounded-md bg-[#161922]/90 border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-[#202534] transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#161922]/90 border border-[#f59e0b]/40">
            <span className="text-sm">🧥</span>
            <span className="text-xs font-bold tracking-wider uppercase text-[#fcd34d]">
              CUSTOMIZATION
            </span>
          </div>

          <button
            type="button"
            title="Toggle Lighting [N]"
            onClick={onToggleTimeOfDay}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#161922]/90 border border-white/10 text-xs font-bold tracking-wider uppercase text-gray-300 hover:text-white hover:bg-[#202534] transition-colors cursor-pointer"
          >
            <span>{isNight ? '🌙' : '☀'}</span>
            <span>LIGHTING: {isNight ? 'NIGHT (N)' : 'DAY (N)'}</span>
          </button>
        </div>

        {/* Center/Right: Camera, Fullscreen, Settings */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            title="Snapshot Camera"
            onClick={() => alert('Photo saved to gallery!')}
            className="w-9 h-9 rounded-md bg-[#161922]/90 border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-[#202534] cursor-pointer"
          >
            <span>📷</span>
          </button>
          <button
            type="button"
            title="Toggle Fullscreen"
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen();
              else document.exitFullscreen();
            }}
            className="w-9 h-9 rounded-md bg-[#161922]/90 border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-[#202534] cursor-pointer"
          >
            <span>⛶</span>
          </button>
          <button
            type="button"
            title="Settings"
            className="w-9 h-9 rounded-md bg-[#161922]/90 border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-[#202534] cursor-pointer"
          >
            <span>⚙</span>
          </button>

          {/* Far Right Studio Header Title */}
          <div className="hidden sm:flex items-center gap-2.5 ml-4 pl-4 border-l border-white/15">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg viewBox="0 0 32 32" className="w-7 h-7 text-[#fbbf24]" fill="currentColor">
                <polygon points="16,2 24,14 8,14" />
                <polygon points="8,16 16,28 0,28" />
                <polygon points="24,16 32,28 16,28" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-black tracking-widest text-[#fbbf24] uppercase">
                UNIT K-04 · CUSTOMIZATION STUDIO
              </div>
              <div className="text-base font-black text-white tracking-wider uppercase leading-none">
                OPERATOR &amp; ARMORY
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== 2. MAIN CENTER ROW (LEFT SIDEBAR & RIGHT DRAWER) ==================== */}
      <div className="flex items-center justify-between w-full my-auto gap-4">
        {/* LEFT SIDEBAR: UNIT K-04 NAV */}
        <div className="pointer-events-auto flex flex-col max-w-[240px] w-full">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm bg-[#dc2626] text-white text-[10px] font-black tracking-wider uppercase w-max mb-2">
            <span>🛡</span> OPERATOR
          </div>
          <h2 className="text-3xl font-black tracking-tight text-white uppercase drop-shadow mb-1 font-display">
            UNIT K-04
          </h2>
          <p className="text-xs text-gray-300 leading-snug mb-5">
            Customize your operator, equipment and loadout.
          </p>

          {/* Vertical Menu Tabs */}
          <div className="flex flex-col gap-2">
            {[
              { id: 'operator', label: 'OPERATOR', icon: '👤' },
              { id: 'weapons', label: 'WEAPONS', icon: '🔫' },
              { id: 'outfit', label: 'OUTFIT', icon: '👕' },
              { id: 'gear', label: 'GEAR', icon: '🎒' },
              { id: 'emotes', label: 'EMOTES', icon: '🏃' },
            ].map((tab) => {
              const active = leftNavTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleLeftNavClick(tab.id as any)}
                  className={`h-11 px-4 rounded-lg font-black text-xs tracking-wider uppercase flex items-center gap-3 transition-all cursor-pointer ${
                    active
                      ? 'bg-[#eab308] text-black shadow-[0_0_16px_rgba(234,179,8,0.4)]'
                      : 'bg-[#161922]/90 border border-white/10 text-white/90 hover:bg-[#202534] hover:text-white'
                  }`}
                >
                  <span className="text-base">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* CENTER INDICATOR (DRAG TO ROTATE) */}
        <div className="hidden md:flex flex-col items-center justify-center my-auto pointer-events-none opacity-85">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#12141c]/80 border border-white/15 text-xs font-bold text-gray-300 shadow-lg">
            <span>🔄</span>
            <span>DRAG TO ROTATE</span>
          </div>
        </div>

        {/* RIGHT DRAWER: CATEGORIES & ITEM GRID */}
        <div className="pointer-events-auto w-full max-w-[500px] rounded-xl bg-[#141824]/95 border border-white/15 p-4 sm:p-5 flex flex-col gap-4 shadow-2xl backdrop-blur-md">
          {/* Top Primary Tabs: CHARACTER (68) | GUN ARMORY (60) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => switchMainTab('character')}
              className={`py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                mainTab === 'character'
                  ? 'bg-[#eab308] text-black shadow-[0_0_12px_rgba(234,179,8,0.3)]'
                  : 'bg-[#1b2030] text-gray-300 hover:text-white'
              }`}
            >
              CHARACTER (68)
            </button>
            <button
              type="button"
              onClick={() => switchMainTab('gun')}
              className={`py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                mainTab === 'gun'
                  ? 'bg-[#eab308] text-black shadow-[0_0_12px_rgba(234,179,8,0.3)]'
                  : 'bg-[#1b2030] text-gray-300 hover:text-white'
              }`}
            >
              GUN ARMORY (60)
            </button>
          </div>

          {/* Subcategory Pills Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {subcategoryPills.map((sub) => {
              const active = currentCatKey === sub.key;
              return (
                <button
                  key={sub.key}
                  type="button"
                  onClick={() => {
                    if (mainTab === 'character') setSelectedCharCat(sub.key);
                    else setSelectedGunCat(sub.key);
                  }}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-black tracking-wider uppercase whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#fbbf24] text-black'
                      : 'bg-[#1a1f2e] text-gray-300 hover:bg-[#252c40] hover:text-white'
                  }`}
                >
                  {sub.label} ({sub.count})
                </button>
              );
            })}
          </div>

          {/* Active Category Header + Variants count */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-black uppercase text-[#fbbf24] tracking-wider">
              {currentCategory.label.toUpperCase()}
            </span>
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <span>🎲</span>
              <span>{currentCategory.options.length} Variants</span>
            </div>
          </div>

          {/* 2x4 Item Grid */}
          <div className="grid grid-cols-4 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
            {currentCategory.options.map((opt) => {
              const active = loadout[currentCategory.key] === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectOption(currentCategory.key, opt.id)}
                  className={`relative rounded-lg p-2 flex flex-col items-center justify-between aspect-square transition-all cursor-pointer ${
                    active
                      ? 'bg-[#22293d] border-2 border-[#fbbf24] shadow-[0_0_12px_rgba(251,191,36,0.25)]'
                      : 'bg-[#161a26] border border-white/10 hover:border-white/30 hover:bg-[#1d2334]'
                  }`}
                >
                  {/* Top-Right Checkmark when active */}
                  {active && (
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-sm bg-[#fbbf24] text-black font-black text-[10px] flex items-center justify-center">
                      ✓
                    </div>
                  )}

                  {/* Visual Swatch / Icon Box */}
                  <div className="w-9 h-9 rounded-md flex items-center justify-center my-auto shadow-inner" style={{ backgroundColor: opt.swatch }}>
                    <div className="w-3 h-3 rounded-full border border-white/40" style={{ backgroundColor: opt.secondaryHex ? `#${opt.secondaryHex.toString(16).padStart(6, '0')}` : '#ffffff40' }} />
                  </div>

                  {/* Label */}
                  <span className="text-[10px] font-bold text-center text-gray-200 line-clamp-1 leading-tight">
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom Actions: RANDOMIZE ALL & RESET DEFAULT */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onRandomize}
              className="py-2.5 rounded-md bg-[#1f2536] hover:bg-[#2b334a] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>🔀</span>
              <span>RANDOMIZE ALL</span>
            </button>
            <button
              type="button"
              onClick={onReset}
              className="py-2.5 rounded-md bg-[#1f2536] hover:bg-[#2b334a] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>🔄</span>
              <span>RESET DEFAULT</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================== 3. BOTTOM DOCK (MODE PICKER & DEPLOY) ==================== */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full pt-3 border-t border-white/10">
        {/* Left: Mini Game Mode Selector */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-1 mr-2 text-[11px] font-black uppercase text-white/80">
            <span className="text-[#fbbf24]">///</span> SELECT GAME MODE
          </div>

          {/* Mini Zombie Survival */}
          <button
            type="button"
            onClick={() => onSelectMode?.('zombies')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer ${
              gameMode === 'zombies'
                ? 'bg-[#181c26] border-2 border-[#fbbf24]'
                : 'bg-[#141824] border border-white/10 hover:border-white/25'
            }`}
          >
            <span className="text-base">🧟</span>
            <div className="text-left">
              <div className="text-[10px] font-black uppercase leading-none text-[#f87171]">
                ZOMBIE SURVIVAL
              </div>
            </div>
            {gameMode === 'zombies' && <span className="text-xs text-[#fbbf24] font-bold">✓</span>}
          </button>

          {/* Mini Team Deathmatch */}
          <button
            type="button"
            onClick={() => onSelectMode?.('deathmatch')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer ${
              gameMode === 'deathmatch'
                ? 'bg-[#181c26] border-2 border-[#fbbf24]'
                : 'bg-[#141824] border border-white/10 hover:border-white/25'
            }`}
          >
            <span className="text-base">⚔</span>
            <div className="text-left">
              <div className="text-[10px] font-black uppercase leading-none text-[#60a5fa]">
                TEAM DEATHMATCH
              </div>
            </div>
            {gameMode === 'deathmatch' && <span className="text-xs text-[#fbbf24] font-bold">✓</span>}
          </button>

          {/* Mini Mecha Defense */}
          <button
            type="button"
            onClick={() => onSelectMode?.('mecha')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer ${
              gameMode === 'mecha'
                ? 'bg-[#181c26] border-2 border-[#fbbf24]'
                : 'bg-[#141824] border border-white/10 hover:border-white/25'
            }`}
          >
            <span className="text-base">🛡</span>
            <div className="text-left">
              <div className="text-[10px] font-black uppercase leading-none text-[#fde047]">
                MECHA DEFENSE
              </div>
            </div>
            {gameMode === 'mecha' && <span className="text-xs text-[#fbbf24] font-bold">✓</span>}
          </button>
        </div>

        {/* Right: Open World Map Dropdown & Giant DEPLOY Button */}
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="px-3.5 py-2.5 rounded-lg bg-[#141824] border border-white/10 flex items-center gap-2 text-xs font-bold text-gray-300">
            <span>📍</span>
            <span>OPEN WORLD: KUROBA CROSSING</span>
            <span>⌵</span>
          </div>

          {/* Giant DEPLOY >> Button */}
          <button
            type="button"
            onClick={onDeploy}
            className="h-12 px-8 rounded-lg bg-[#dc2626] hover:bg-[#ef4444] active:translate-y-0.5 text-white font-black text-sm tracking-widest uppercase flex items-center gap-2 shadow-[0_4px_0_#991b1b,0_8px_20px_rgba(220,38,38,0.4)] transition-all cursor-pointer"
          >
            <span>DEPLOY</span>
            <span className="text-base">››</span>
          </button>
        </div>
      </div>
    </div>
  );
};
