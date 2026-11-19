import React, { useMemo, useState } from 'react';
import {
  computeLoadoutModifiers,
  CUSTOMIZATION_CATEGORIES,
  getTotalCustomizationCount,
} from '../game/customization';
import { WEAPON_ORDER, WEAPONS } from '../game/rules';
import type { LoadoutConfig, TimeOfDay, WeaponId } from '../game/types';

interface CustomizationOverlayProps {
  loadout: LoadoutConfig;
  activeWeapon: WeaponId;
  timeOfDay: TimeOfDay;
  onSelectOption: (key: keyof LoadoutConfig, value: string) => void;
  onRandomize: () => void;
  onReset: () => void;
  onTabChange: (tab: 'character' | 'gun', weapon?: WeaponId) => void;
  onSelectWeapon: (id: WeaponId) => void;
  onToggleTimeOfDay: () => void;
  onBackToTitle: () => void;
  onDeploy: () => void;
}

export const CustomizationOverlay: React.FC<CustomizationOverlayProps> = ({
  loadout,
  activeWeapon,
  timeOfDay,
  onSelectOption,
  onRandomize,
  onReset,
  onTabChange,
  onSelectWeapon,
  onToggleTimeOfDay,
  onBackToTitle,
  onDeploy,
}) => {
  const [activeTab, setActiveTab] = useState<'character' | 'gun'>('character');
  const [selectedCharCat, setSelectedCharCat] = useState<keyof LoadoutConfig>('headgear');
  const [selectedGunCat, setSelectedGunCat] = useState<keyof LoadoutConfig>('gunSkin');

  const totalCount = useMemo(() => getTotalCustomizationCount(), []);
  const charCategories = useMemo(
    () => CUSTOMIZATION_CATEGORIES.filter((c) => c.tab === 'character'),
    [],
  );
  const gunCategories = useMemo(
    () => CUSTOMIZATION_CATEGORIES.filter((c) => c.tab === 'gun'),
    [],
  );
  const charCount = useMemo(
    () => charCategories.reduce((s, c) => s + c.options.length, 0),
    [charCategories],
  );
  const gunCount = useMemo(
    () => gunCategories.reduce((s, c) => s + c.options.length, 0),
    [gunCategories],
  );

  const visibleCategories = activeTab === 'character' ? charCategories : gunCategories;
  const currentCatKey = activeTab === 'character' ? selectedCharCat : selectedGunCat;
  const currentCategory =
    visibleCategories.find((c) => c.key === currentCatKey) ?? visibleCategories[0];

  const mods = useMemo(() => computeLoadoutModifiers(loadout), [loadout]);
  const isNight = timeOfDay === 'night';

  const switchTab = (tab: 'character' | 'gun') => {
    setActiveTab(tab);
    onTabChange(tab, activeWeapon);
  };

  const formatPct = (mult: number, invertGood = false) => {
    const pct = Math.round((mult - 1) * 100);
    if (pct === 0) return { text: 'BASE', color: '#a89a88' };
    const good = invertGood ? pct < 0 : pct > 0;
    return {
      text: `${pct > 0 ? '+' : ''}${pct}%`,
      color: good ? '#4ef2a1' : '#ff9b70',
    };
  };

  const dmgStat = formatPct(mods.damageMult);
  const magStat = formatPct(mods.magMult);
  const reloadStat = formatPct(mods.reloadMult, true);
  const spreadStat = formatPct(mods.spreadMult, true);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex justify-between">
      {/* Left Studio Preview Overlay (Canvas stays completely interactive for 360° drag spin) */}
      <div className="hidden sm:flex flex-col justify-between p-6 flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onBackToTitle();
            }}
            className="pointer-events-auto px-3.5 py-2 rounded bg-[#18141c]/92 border border-[#e6be74]/40 text-xs font-display font-bold uppercase tracking-[0.14em] text-[#f5efe6] hover:bg-[#2a2330] hover:border-[#ffd782] transition-colors cursor-pointer"
          >
            ← TITLE
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleTimeOfDay();
            }}
            className="pointer-events-auto px-3.5 py-2 rounded bg-[#18141c]/92 border border-[#e6be74]/40 text-xs font-display font-bold uppercase tracking-[0.14em] text-[#f5efe6] hover:bg-[#2a2330] hover:border-[#ffd782] transition-colors cursor-pointer"
          >
            LIGHTING: {isNight ? 'NIGHT' : 'DAY'} [N]
          </button>
        </div>

        <div className="flex flex-col items-start gap-2">
          <div className="px-3.5 py-2 rounded bg-[#16131a]/88 border border-[#e6be74]/35 text-xs font-display tracking-[0.16em] uppercase text-[#f2cf84]">
            DRAG VIEWPORT TO ROTATE 360° · {activeTab === 'gun' ? 'ARMORY CLOSE-UP' : 'OPERATOR TURNTABLE'}
          </div>
          <div className="px-3.5 py-1.5 rounded bg-[#16131a]/84 border border-[#45f2ff]/30 text-[11px] text-[#d6e4f0] tracking-wide">
            OPEN WORLD CONNECTED: KUROBA CROSSING · AURORA CITY · FUNGI FOREST · KOPENHIME SNOWPEAK
          </div>
        </div>
      </div>

      {/* Right-Docked Tactical Customization Studio Drawer */}
      <aside
        aria-label="Character and Gun Customization Studio"
        className="pointer-events-auto w-full sm:w-[468px] h-full bg-[#151219]/96 border-l-2 border-[#e6be74]/45 shadow-[-12px_0_36px_rgba(0,0,0,0.65)] flex flex-col"
      >
        {/* Studio Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[#4c3e32]/70 flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-display font-bold uppercase tracking-[0.24em] text-[#45f2ff]">
              UNIT K-04 · CUSTOMIZATION STUDIO
            </div>
            <h1 className="text-xl font-display font-bold uppercase tracking-[0.1em] text-[#fff5e4]">
              OPERATOR &amp; ARMORY
            </h1>
          </div>
          <div className="text-right">
            <div className="px-2.5 py-1 rounded bg-[#261d17] border border-[#e6be74]/55 text-xs font-display font-bold text-[#ffd782] tabular-nums">
              {totalCount} OPTIONS
            </div>
          </div>
        </div>

        {/* Primary Tab Bar: Character vs Gun Armory */}
        <div className="px-5 pt-3 pb-2">
          <div className="grid grid-cols-2 gap-2 p-1 rounded bg-[#0e0c12] border border-[#4a3d33]" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'character'}
              onClick={() => switchTab('character')}
              className={`py-2.5 rounded text-xs font-display font-bold uppercase tracking-[0.14em] transition-colors cursor-pointer ${
                activeTab === 'character'
                  ? 'bg-[#e2712c] text-[#1a110b] border border-[#ffd894]'
                  : 'text-[#cbb699] hover:text-[#fff5e4] hover:bg-[#1e1a24]'
              }`}
            >
              CHARACTER ({charCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'gun'}
              onClick={() => switchTab('gun')}
              className={`py-2.5 rounded text-xs font-display font-bold uppercase tracking-[0.14em] transition-colors cursor-pointer ${
                activeTab === 'gun'
                  ? 'bg-[#20a8c4] text-[#09151c] border border-[#8cf5ff]'
                  : 'text-[#cbb699] hover:text-[#fff5e4] hover:bg-[#1e1a24]'
              }`}
            >
              GUN ARMORY ({gunCount})
            </button>
          </div>

          {/* Weapon Preview Switcher & Live Attachment Modifiers on Gun Tab */}
          {activeTab === 'gun' && (
            <div className="mt-2.5 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {WEAPON_ORDER.map((id) => {
                  const spec = WEAPONS[id];
                  const active = activeWeapon === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectWeapon(id)}
                      className={`px-2 py-1.5 rounded border text-[11px] font-display font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#1c3240] border-[#45f2ff] text-[#fff6e6]'
                          : 'bg-[#1a1620] border-[#42383a] text-[#b8a58e] hover:border-[#806e5e]'
                      }`}
                    >
                      {spec.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-4 gap-1.5 bg-[#0f0d13] border border-[#3d3436] rounded p-2 text-center">
                <div>
                  <div className="text-[9px] font-display uppercase tracking-widest text-[#9c8c7a]">DMG</div>
                  <div className="text-xs font-display font-bold tabular-nums" style={{ color: dmgStat.color }}>
                    {dmgStat.text}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-display uppercase tracking-widest text-[#9c8c7a]">MAG</div>
                  <div className="text-xs font-display font-bold tabular-nums" style={{ color: magStat.color }}>
                    {magStat.text}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-display uppercase tracking-widest text-[#9c8c7a]">RELOAD</div>
                  <div className="text-xs font-display font-bold tabular-nums" style={{ color: reloadStat.color }}>
                    {reloadStat.text}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-display uppercase tracking-widest text-[#9c8c7a]">SPREAD</div>
                  <div className="text-xs font-display font-bold tabular-nums" style={{ color: spreadStat.color }}>
                    {spreadStat.text}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Category Selector Strip (7 categories per tab) */}
        <div className="px-5 py-2 border-y border-[#3b3233] bg-[#100e14]">
          <div className="flex flex-wrap gap-1.5">
            {visibleCategories.map((cat) => {
              const active = cat.key === currentCategory.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() =>
                    activeTab === 'character'
                      ? setSelectedCharCat(cat.key)
                      : setSelectedGunCat(cat.key)
                  }
                  className={`px-2.5 py-1.5 rounded text-[11px] font-display font-bold uppercase tracking-[0.08em] border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#2c221d] border-[#ffd47a] text-[#fff5e4]'
                      : 'bg-[#191620] border-[#3d3436] text-[#bfa98d] hover:text-[#fff5e4] hover:border-[#78634d]'
                  }`}
                >
                  {cat.label} ({cat.options.length})
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Swatch & Option Grid for Active Category */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-display font-bold uppercase tracking-[0.16em] text-[#e6be74]">
              {currentCategory.label}
            </span>
            <span className="text-[11px] text-[#a89886]">
              {currentCategory.options.length} Variants
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {currentCategory.options.map((opt) => {
              const selected = loadout[currentCategory.key] === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectOption(currentCategory.key, opt.id)}
                  className={`flex items-center gap-2.5 p-2.5 rounded border text-left transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#2b211a] border-[#ffd47a] text-[#fff7e8]'
                      : 'bg-[#1b1822] border-[#3a3338] text-[#d6c8b6] hover:bg-[#24202e] hover:border-[#736252]'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-sm shrink-0 border border-white/25 shadow-inner"
                    style={{ backgroundColor: opt.swatch }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-display font-bold tracking-wide truncate">
                      {opt.label}
                    </div>
                    {opt.note && (
                      <div className="text-[10px] text-[#7ae6ff] truncate">{opt.note}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Actions: Randomize, Reset & Deploy to Open World */}
        <div className="p-4 border-t border-[#4c3e32]/80 bg-[#110e15] space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onRandomize();
              }}
              className="py-2 rounded bg-[#231e2c] hover:bg-[#31293d] border border-[#6e5d85] text-xs font-display font-bold uppercase tracking-[0.14em] text-[#e8dcf7] transition-colors cursor-pointer"
            >
              RANDOMIZE ALL
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onReset();
              }}
              className="py-2 rounded bg-[#1f1816] hover:bg-[#2e231f] border border-[#5c493c] text-xs font-display font-bold uppercase tracking-[0.14em] text-[#cbb699] transition-colors cursor-pointer"
            >
              RESET DEFAULT
            </button>
          </div>

          <button
            type="button"
            data-deploy="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onDeploy();
            }}
            className="w-full py-3.5 rounded bg-[#d63329] hover:bg-[#eb463b] text-[#fff6e8] border-2 border-[#ffb3a8] shadow-[0_5px_0_#6e1510,0_10px_22px_rgba(0,0,0,0.5)] active:translate-y-[1px] font-display font-bold uppercase tracking-[0.18em] text-sm transition-colors cursor-pointer"
          >
            DEPLOY TO OPEN WORLD →
          </button>
        </div>
      </aside>
    </div>
  );
};
