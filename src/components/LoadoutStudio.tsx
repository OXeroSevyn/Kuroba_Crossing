import React, { useEffect, useMemo, useState } from 'react';
import {
  ATTACHMENT_SLOTS,
  type AttachmentDef,
  attachmentsFor,
  attachmentUnlockLevel,
  FIREARMS,
  getAttachment,
  getVariant,
  gunStatBars,
  type GunStatBars,
  resolveGun,
  SLOT_LABELS,
  slotAvailable,
  variantsFor,
} from '../game/armory';
import {
  ARCHETYPES,
  type ArchetypeId,
  generateOperator,
  LOCK_GROUPS,
  type OperatorProfile,
  randomSeed,
  type TraitLockGroup,
} from '../game/character';
import { CUSTOMIZATION_CATEGORIES, type CustomCategory, type CustomGroup, isOptionUnlocked } from '../game/customization';
import {
  MAX_WEAPON_LEVEL,
  playerLevelInfo,
  type ProgressionState,
  unlocksAtPlayerLevel,
  unlocksAtWeaponLevel,
  weaponLevelInfo,
} from '../game/progression';
import { BASE_WEAPONS } from '../game/rules';
import type {
  AttachmentSlot,
  FirearmId,
  GameMode,
  GunBuild,
  GunBuilds,
  LoadoutConfig,
  TimeOfDay,
  WeaponId,
} from '../game/types';

type Section = 'operator' | 'armory' | 'unlocks';
type StudioView = 'character' | 'face' | 'gun';

export interface LoadoutStudioProps {
  loadout: LoadoutConfig;
  builds: GunBuilds;
  progression: ProgressionState;
  profile: OperatorProfile;
  activeWeapon: WeaponId;
  timeOfDay: TimeOfDay;
  gameMode: GameMode;
  onSelectOption: (key: keyof LoadoutConfig, value: string) => void;
  onApplyGenerated: (loadout: LoadoutConfig, profile: OperatorProfile) => void;
  onProfileChange: (profile: OperatorProfile) => void;
  onResetOperator: () => void;
  onSetGunBuild: (firearm: FirearmId, build: GunBuild) => void;
  onView: (view: StudioView, weapon?: WeaponId) => void;
  onToggleTimeOfDay: () => void;
  onSelectMode: (mode: GameMode) => void;
  onBackToTitle: () => void;
  onDeploy: () => void;
}

const FIREARM_SHORT: Record<FirearmId, string> = { pulse: 'Rifle', scatter: 'Shotgun', rail: 'Marksman', rpg: 'Launcher' };
const GROUP_LABELS: Record<Exclude<CustomGroup, 'finish'>, string> = {
  face: 'Face',
  hair: 'Hair',
  body: 'Body',
  outfit: 'Outfit',
  gear: 'Gear',
};
const STAT_LABELS: Array<[keyof GunStatBars, string]> = [
  ['damage', 'Damage'],
  ['fireRate', 'Fire Rate'],
  ['range', 'Range'],
  ['accuracy', 'Accuracy'],
  ['control', 'Recoil Control'],
  ['handling', 'Handling'],
  ['capacity', 'Capacity'],
  ['reload', 'Reload Speed'],
];

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
const Panel: React.FC<{ title?: string; right?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  right,
  className = '',
  children,
}) => (
  <section className={`chamfer bg-[#0f1420]/92 border border-white/10 backdrop-blur-md shadow-2xl ${className}`}>
    {title && (
      <header className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/8">
        <h3 className="font-display text-[11px] font-bold tracking-[0.22em] uppercase text-amber-300">{title}</h3>
        {right}
      </header>
    )}
    {children}
  </section>
);

const LockBadge: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70">
    <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="currentColor" aria-hidden="true">
      <path d="M4 7V5a4 4 0 118 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 10-4 0v2z" />
    </svg>
    {label}
  </span>
);

const ProgressBar: React.FC<{ value: number; color?: string; className?: string }> = ({ value, color = '#fbbf24', className = '' }) => (
  <div className={`h-1.5 rounded-full bg-white/10 overflow-hidden ${className}`}>
    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
  </div>
);

// ---------------------------------------------------------------------------
// OPERATOR: generator + fine tune
// ---------------------------------------------------------------------------
interface HistoryEntry {
  loadout: LoadoutConfig;
  profile: OperatorProfile;
}

const OperatorSection: React.FC<LoadoutStudioProps & { playerLevel: number }> = (props) => {
  const { loadout, profile, playerLevel, onApplyGenerated, onProfileChange, onSelectOption, onView } = props;
  const [archetype, setArchetype] = useState<ArchetypeId>(profile.archetype);
  const [seed, setSeed] = useState(profile.seed);
  const [locks, setLocks] = useState<TraitLockGroup[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [group, setGroup] = useState<Exclude<CustomGroup, 'finish'>>('face');

  useEffect(() => {
    onView(group === 'face' || group === 'hair' ? 'face' : 'character');
  }, [group, onView]);

  const categories = useMemo(
    () => CUSTOMIZATION_CATEGORIES.filter((c) => c.tab === 'character' && c.group === group),
    [group],
  );

  const generate = (useSeed: string) => {
    const result = generateOperator({ seed: useSeed, archetype, current: loadout, locks, playerLevel });
    setHistory((h) => [{ loadout: { ...loadout }, profile: { ...profile } }, ...h].slice(0, 6));
    setSeed(useSeed);
    onApplyGenerated(result.loadout, result.profile);
  };

  const toggleLock = (g: TraitLockGroup) =>
    setLocks((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const arch = ARCHETYPES.find((a) => a.id === archetype) ?? ARCHETYPES[0];

  return (
    <>
      {/* LEFT: dossier & generator */}
      <div className="pointer-events-auto w-[340px] flex flex-col gap-3 max-h-full overflow-y-auto slim-scroll pr-1">
        <Panel title="Operator Dossier" right={<span className="text-[10px] font-mono text-white/40">ID {profile.seed}</span>}>
          <div className="p-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-white/45">Name</span>
              <input
                value={profile.name}
                maxLength={28}
                onChange={(e) => onProfileChange({ ...profile, name: e.target.value })}
                className="bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-sm font-display font-bold text-white focus:outline-none focus:border-amber-400/70"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-white/45">Callsign</span>
              <input
                value={profile.callsign}
                maxLength={16}
                onChange={(e) => onProfileChange({ ...profile, callsign: e.target.value })}
                className="bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-sm font-mono uppercase tracking-wider text-amber-200 focus:outline-none focus:border-amber-400/70"
              />
            </label>
          </div>
        </Panel>

        <Panel title="Character Generator" right={<span className="text-[10px] text-white/40">Seeded · shareable</span>}>
          <div className="p-4 flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-1.5">
              {ARCHETYPES.map((a) => {
                const on = a.id === archetype;
                return (
                  <button
                    key={a.id}
                    type="button"
                    title={a.tagline}
                    onClick={() => setArchetype(a.id)}
                    className={`chamfer-sm px-1.5 py-2 text-[10px] font-bold uppercase leading-tight tracking-wide transition-all cursor-pointer ${
                      on ? 'text-black' : 'bg-white/5 text-white/75 hover:bg-white/10'
                    }`}
                    style={on ? { background: a.accent } : { borderBottom: `2px solid ${a.accent}55` }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-white/55 -mt-1">
              <span style={{ color: arch.accent }} className="font-bold">
                {arch.label}
              </span>{' '}
              — {arch.tagline}
            </p>

            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/45 w-10">Seed</span>
              <input
                value={seed}
                maxLength={16}
                onChange={(e) => setSeed(e.target.value.toUpperCase())}
                className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono tracking-widest text-white focus:outline-none focus:border-amber-400/70"
              />
              <button
                type="button"
                title="New random seed"
                onClick={() => setSeed(randomSeed())}
                className="w-8 h-7 rounded bg-white/8 hover:bg-white/15 text-sm cursor-pointer"
              >
                🎲
              </button>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/45 mb-1.5">Keep (lock) while generating</div>
              <div className="flex flex-wrap gap-1.5">
                {LOCK_GROUPS.map((g) => {
                  const on = locks.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleLock(g)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                        on ? 'bg-amber-400/20 border-amber-400 text-amber-200' : 'border-white/15 text-white/60 hover:text-white'
                      }`}
                    >
                      {on ? '🔒 ' : ''}
                      {GROUP_LABELS[g]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={() => generate(randomSeed())}
                className="chamfer-sm h-11 bg-amber-400 hover:bg-amber-300 text-black font-display font-black text-sm tracking-[0.18em] uppercase cursor-pointer shadow-[0_0_24px_rgba(251,191,36,0.35)] transition-colors"
              >
                Generate Operator
              </button>
              <button
                type="button"
                title="Rebuild from the seed above"
                onClick={() => generate(seed || randomSeed())}
                className="chamfer-sm h-11 px-3 bg-white/8 hover:bg-white/15 text-[10px] font-bold uppercase tracking-wider text-white/80 cursor-pointer"
              >
                From Seed
              </button>
            </div>

            {history.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/45 mb-1.5">Previous operators</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {history.map((h, i) => {
                    const a = ARCHETYPES.find((x) => x.id === h.profile.archetype) ?? ARCHETYPES[0];
                    return (
                      <button
                        key={`${h.profile.seed}-${i}`}
                        type="button"
                        onClick={() => {
                          setHistory((cur) => cur.filter((_, j) => j !== i));
                          onApplyGenerated(h.loadout, h.profile);
                        }}
                        className="text-left rounded bg-white/5 hover:bg-white/10 px-2 py-1.5 cursor-pointer border-l-2"
                        style={{ borderColor: a.accent }}
                      >
                        <div className="text-[10px] font-bold text-white truncate">{h.profile.name}</div>
                        <div className="text-[9px] text-white/45 truncate">“{h.profile.callsign}”</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="flex-1" />

      {/* RIGHT: fine tune */}
      <div className="pointer-events-auto w-[420px] max-h-full flex flex-col">
        <Panel
          title="Fine Tune"
          className="flex flex-col min-h-0 max-h-full"
          right={
            <button type="button" onClick={props.onResetOperator} className="text-[10px] uppercase tracking-wider text-white/50 hover:text-white cursor-pointer">
              Reset
            </button>
          }
        >
          <nav className="grid grid-cols-5 gap-1 px-3 pt-3">
            {(Object.keys(GROUP_LABELS) as Array<Exclude<CustomGroup, 'finish'>>).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                className={`py-2 text-[11px] font-display font-bold uppercase tracking-widest border-b-2 transition-colors cursor-pointer ${
                  group === g ? 'border-amber-400 text-amber-300' : 'border-transparent text-white/50 hover:text-white'
                }`}
              >
                {GROUP_LABELS[g]}
              </button>
            ))}
          </nav>
          <div className="px-4 pb-4 pt-2 overflow-y-auto slim-scroll min-h-0 flex flex-col gap-4">
            {categories.map((cat) => (
              <CategoryPicker
                key={cat.key}
                category={cat}
                value={loadout[cat.key]}
                playerLevel={playerLevel}
                onSelect={(v) => onSelectOption(cat.key, v)}
              />
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
};

const CategoryPicker: React.FC<{
  category: CustomCategory;
  value: string;
  playerLevel: number;
  onSelect: (id: string) => void;
}> = ({ category, value, playerLevel, onSelect }) => {
  const current = category.options.find((o) => o.id === value);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-white/80">{category.label}</h4>
        <span className="text-[10px] text-amber-200/80 truncate ml-2">{current?.label}</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {category.options.map((opt) => {
          const active = opt.id === value;
          const unlocked = isOptionUnlocked(opt, playerLevel);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!unlocked}
              title={unlocked ? `${opt.label}${opt.note ? ` · ${opt.note}` : ''}` : `${opt.label} — unlocks at Operator LV ${opt.unlockLevel}`}
              onClick={() => onSelect(opt.id)}
              className={`group relative aspect-square rounded-md flex items-center justify-center transition-all ${
                active
                  ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#0f1420]'
                  : unlocked
                    ? 'hover:ring-1 hover:ring-white/40 cursor-pointer'
                    : 'opacity-40 cursor-not-allowed'
              }`}
              style={{ background: opt.swatch }}
            >
              {opt.secondaryHex !== undefined && (
                <span className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border border-black/30" style={{ background: hex(opt.secondaryHex) }} />
              )}
              {!unlocked && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white drop-shadow">
                  LV{opt.unlockLevel}
                </span>
              )}
              <span className="pointer-events-none absolute -bottom-0.5 left-1/2 -translate-x-1/2 translate-y-full whitespace-nowrap rounded bg-black/90 px-1.5 py-0.5 text-[9px] text-white opacity-0 group-hover:opacity-100 z-10">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ARMORY: weapons, models, attachments, stats
// ---------------------------------------------------------------------------
const ArmorySection: React.FC<LoadoutStudioProps & { playerLevel: number }> = (props) => {
  const { builds, progression, playerLevel, onSetGunBuild, onView, loadout, onSelectOption } = props;
  const [firearm, setFirearm] = useState<FirearmId>(
    (FIREARMS as WeaponId[]).includes(props.activeWeapon) ? (props.activeWeapon as FirearmId) : 'pulse',
  );
  const [slot, setSlot] = useState<AttachmentSlot>('optic');
  const [mode, setMode] = useState<'attachments' | 'finish'>('attachments');
  const [preview, setPreview] = useState<GunBuild | null>(null);

  useEffect(() => {
    onView('gun', firearm);
  }, [firearm, onView]);

  const build = builds[firearm];
  const wl = weaponLevelInfo(progression, firearm);
  const current = useMemo(() => resolveGun(firearm, build, BASE_WEAPONS[firearm]), [firearm, build]);
  const bars = gunStatBars(current);
  const previewBars = preview ? gunStatBars(resolveGun(firearm, preview, BASE_WEAPONS[firearm])) : null;
  const variant = getVariant(firearm, build.variant);
  const slotOk = slotAvailable(firearm, build.variant, slot);

  const equip = (next: GunBuild) => {
    setPreview(null);
    onSetGunBuild(firearm, next);
  };

  return (
    <>
      {/* LEFT: weapons & models */}
      <div className="pointer-events-auto w-[320px] flex flex-col gap-3 max-h-full overflow-y-auto slim-scroll pr-1">
        <Panel title="Arsenal">
          <div className="p-3 flex flex-col gap-1.5">
            {FIREARMS.map((f, i) => {
              const v = getVariant(f, builds[f].variant);
              const lv = weaponLevelInfo(progression, f);
              const on = f === firearm;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFirearm(f);
                    setPreview(null);
                    if (!slotAvailable(f, builds[f].variant, slot)) setSlot('optic');
                  }}
                  className={`chamfer-sm text-left px-3 py-2.5 transition-all cursor-pointer ${
                    on ? 'bg-amber-400/15 border-l-4 border-amber-400' : 'bg-white/[0.04] hover:bg-white/[0.08] border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-white/40">
                      [{i + 1}] {FIREARM_SHORT[f].toUpperCase()}
                    </span>
                    <span className="text-[10px] font-bold text-amber-300">LV {lv.level}</span>
                  </div>
                  <div className="font-display font-bold text-sm text-white leading-tight mt-0.5">{v.name}</div>
                  <ProgressBar value={lv.progress} className="mt-1.5" />
                </button>
              );
            })}
            <div className="chamfer-sm px-3 py-2 bg-white/[0.03] text-[11px] text-white/45">
              [5] Cyber Katana — melee, no attachments
            </div>
          </div>
        </Panel>

        <Panel title={`${FIREARM_SHORT[firearm]} Models`} right={<span className="text-[10px] text-white/40">Operator LV {playerLevel}</span>}>
          <div className="p-3 flex flex-col gap-1.5">
            {variantsFor(firearm).map((v) => {
              const unlocked = v.playerLevel <= playerLevel;
              const on = v.id === build.variant;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={!unlocked}
                  onMouseEnter={() => unlocked && setPreview({ ...build, variant: v.id })}
                  onMouseLeave={() => setPreview(null)}
                  onClick={() => equip({ ...build, variant: v.id })}
                  className={`text-left rounded px-3 py-2 border transition-colors ${
                    on
                      ? 'border-amber-400 bg-amber-400/10'
                      : unlocked
                        ? 'border-white/10 hover:border-white/30 cursor-pointer'
                        : 'border-white/5 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[13px] text-white">{v.name}</span>
                    {on ? (
                      <span className="text-[9px] font-black uppercase tracking-wider text-amber-300">Equipped</span>
                    ) : !unlocked ? (
                      <LockBadge label={`Operator LV ${v.playerLevel}`} />
                    ) : null}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-white/45">{v.role}</div>
                  <div className="text-[11px] text-white/60 mt-0.5">{v.description}</div>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="flex-1" />

      {/* RIGHT: attachments / finish + stats */}
      <div className="pointer-events-auto w-[430px] max-h-full flex flex-col gap-3 min-h-0">
        <Panel
          className="flex flex-col min-h-0 flex-1"
          title={variant.name}
          right={
            <div className="flex rounded bg-black/40 p-0.5">
              {(['attachments', 'finish'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                    mode === m ? 'bg-amber-400 text-black' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          }
        >
          {mode === 'attachments' ? (
            <div className="flex min-h-0 flex-1">
              {/* slot rail */}
              <div className="w-[132px] border-r border-white/8 p-2 flex flex-col gap-1">
                {ATTACHMENT_SLOTS.map((s) => {
                  const ok = slotAvailable(firearm, build.variant, s);
                  const att = getAttachment(build[s]);
                  const on = s === slot;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!ok}
                      onClick={() => setSlot(s)}
                      className={`text-left rounded px-2 py-1.5 transition-colors ${
                        on ? 'bg-amber-400/15 text-white' : ok ? 'hover:bg-white/5 text-white/80 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                      }`}
                    >
                      <div className="text-[9px] uppercase tracking-widest text-white/45">{SLOT_LABELS[s]}</div>
                      <div className="text-[11px] font-bold truncate flex items-center gap-1.5">
                        {ok && att && <span className="w-2 h-2 rounded-full flex-none" style={{ background: hex(att.hex) }} />}
                        {ok ? att?.label ?? '—' : 'N/A'}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* options */}
              <div className="flex-1 p-2 overflow-y-auto slim-scroll min-h-0 flex flex-col gap-1">
                {!slotOk ? (
                  <p className="text-xs text-white/50 p-3">This model has no {SLOT_LABELS[slot].toLowerCase()} mount.</p>
                ) : (
                  attachmentsFor(firearm, slot).map((att) => (
                    <AttachmentRow
                      key={att.id}
                      att={att}
                      firearm={firearm}
                      weaponLevel={wl.level}
                      equipped={build[slot] === att.id}
                      onHover={(on) => setPreview(on ? { ...build, [slot]: att.id } : null)}
                      onEquip={() => equip({ ...build, [slot]: att.id })}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 overflow-y-auto slim-scroll min-h-0 flex flex-col gap-4">
              {CUSTOMIZATION_CATEGORIES.filter((c) => c.group === 'finish').map((cat) => (
                <CategoryPicker key={cat.key} category={cat} value={loadout[cat.key]} playerLevel={playerLevel} onSelect={(v) => onSelectOption(cat.key, v)} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Performance"
          right={
            <span className="text-[10px] font-mono text-white/50">
              {current.optic.name} · {current.optic.maxZoom ? `${current.optic.zoom}-${current.optic.maxZoom}x` : `${current.optic.zoom}x`}
            </span>
          }
        >
          <div className="px-4 py-3 grid grid-cols-2 gap-x-5 gap-y-2">
            {STAT_LABELS.map(([key, label]) => {
              const base = bars[key];
              const next = previewBars ? previewBars[key] : base;
              const diff = next - base;
              return (
                <div key={key}>
                  <div className="flex justify-between text-[10px] uppercase tracking-wider">
                    <span className="text-white/55">{label}</span>
                    {Math.abs(diff) > 0.005 && (
                      <span className={diff > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {diff > 0 ? '+' : ''}
                        {Math.round(diff * 100)}
                      </span>
                    )}
                  </div>
                  <div className="relative h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-white/80 rounded-full" style={{ width: `${Math.min(base, next) * 100}%` }} />
                    {diff > 0.005 && (
                      <div className="absolute inset-y-0 bg-emerald-400" style={{ left: `${base * 100}%`, width: `${diff * 100}%` }} />
                    )}
                    {diff < -0.005 && (
                      <div className="absolute inset-y-0 bg-rose-500" style={{ left: `${next * 100}%`, width: `${-diff * 100}%` }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 pb-3 flex items-center gap-3 text-[10px] text-white/45 font-mono">
            <span>DMG {current.spec.damage}{current.spec.pellets > 1 ? `×${current.spec.pellets}` : ''}</span>
            <span>RPM {Math.round(60 / current.spec.fireInterval)}</span>
            <span>MAG {current.spec.magSize}</span>
            <span>RLD {current.spec.reloadDuration.toFixed(2)}s</span>
          </div>
        </Panel>
      </div>
    </>
  );
};

const AttachmentRow: React.FC<{
  att: AttachmentDef;
  firearm: FirearmId;
  weaponLevel: number;
  equipped: boolean;
  onHover: (on: boolean) => void;
  onEquip: () => void;
}> = ({ att, firearm, weaponLevel, equipped, onHover, onEquip }) => {
  const need = attachmentUnlockLevel(att, firearm);
  const unlocked = need <= weaponLevel;
  return (
    <button
      type="button"
      disabled={!unlocked}
      onMouseEnter={() => unlocked && onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onEquip}
      className={`text-left rounded px-2.5 py-2 flex items-center gap-2.5 border transition-colors ${
        equipped
          ? 'border-amber-400 bg-amber-400/10'
          : unlocked
            ? 'border-transparent hover:border-white/20 hover:bg-white/5 cursor-pointer'
            : 'border-transparent opacity-45 cursor-not-allowed'
      }`}
    >
      <span className="w-7 h-7 rounded flex-none border border-white/15" style={{ background: `linear-gradient(135deg, ${hex(att.hex)}, #0b0e14)` }} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-bold text-white truncate">{att.label}</span>
          {equipped ? (
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-300 flex-none">Equipped</span>
          ) : !unlocked ? (
            <LockBadge label={`${FIREARM_SHORT[firearm]} LV ${need}`} />
          ) : null}
        </span>
        <span className="block text-[10px] text-white/50 truncate">{att.note}</span>
      </span>
    </button>
  );
};

// ---------------------------------------------------------------------------
// UNLOCKS: progression tracks
// ---------------------------------------------------------------------------
const UnlocksSection: React.FC<{ progression: ProgressionState }> = ({ progression }) => {
  const pl = playerLevelInfo(progression);
  const [track, setTrack] = useState<'operator' | FirearmId>('operator');
  const rows =
    track === 'operator'
      ? Array.from({ length: 12 }, (_, i) => i + 2).map((lv) => ({ lv, items: unlocksAtPlayerLevel(lv), reached: pl.level >= lv }))
      : Array.from({ length: MAX_WEAPON_LEVEL - 1 }, (_, i) => i + 2).map((lv) => ({
          lv,
          items: unlocksAtWeaponLevel(track, lv),
          reached: weaponLevelInfo(progression, track).level >= lv,
        }));
  const info = track === 'operator' ? pl : weaponLevelInfo(progression, track);

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-[860px] max-h-full flex flex-col min-h-0">
      <Panel title="Unlock Tracks" className="flex flex-col min-h-0" right={<span className="text-[10px] text-white/45">Earn XP from every kill · weapon XP from kills with that weapon</span>}>
        <nav className="flex gap-1 px-3 pt-3">
          {(['operator', ...FIREARMS] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrack(t)}
              className={`px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider cursor-pointer ${
                track === t ? 'bg-amber-400 text-black' : 'bg-white/5 text-white/65 hover:text-white'
              }`}
            >
              {t === 'operator' ? 'Operator' : FIREARM_SHORT[t]}
            </button>
          ))}
        </nav>
        <div className="px-4 pt-3 flex items-center gap-3">
          <div className="font-display text-2xl font-black text-white">LV {info.level}</div>
          <div className="flex-1">
            <ProgressBar value={info.progress} />
            <div className="text-[10px] text-white/45 mt-1 font-mono">
              {info.needed > 0 ? `${Math.round(info.into)} / ${info.needed} XP to next level` : 'MAX LEVEL'}
            </div>
          </div>
        </div>
        <ol className="p-4 grid grid-cols-2 gap-2 overflow-y-auto slim-scroll min-h-0">
          {rows.map((r) => (
            <li
              key={r.lv}
              className={`chamfer-sm px-3 py-2 border-l-2 ${r.reached ? 'bg-emerald-400/10 border-emerald-400' : 'bg-white/[0.03] border-white/15'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-black ${r.reached ? 'text-emerald-300' : 'text-white/60'}`}>LEVEL {r.lv}</span>
                {r.reached ? <span className="text-[9px] uppercase text-emerald-300">Unlocked</span> : <LockBadge label="Locked" />}
              </div>
              {r.items.length === 0 ? (
                <div className="text-[11px] text-white/35 mt-0.5">Rank insignia</div>
              ) : (
                r.items.slice(0, 4).map((it) => (
                  <div key={it.title} className="text-[11px] text-white/80 truncate mt-0.5">
                    {it.title.replace(' unlocked', '')} <span className="text-white/40">· {it.detail}</span>
                  </div>
                ))
              )}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
export const LoadoutStudio: React.FC<LoadoutStudioProps> = (props) => {
  const { progression, profile, timeOfDay, gameMode, onBackToTitle, onDeploy, onToggleTimeOfDay, onSelectMode, onView } = props;
  const [section, setSection] = useState<Section>('operator');
  const pl = playerLevelInfo(progression);

  useEffect(() => {
    if (section === 'unlocks') onView('character');
  }, [section, onView]);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col p-4 gap-3 select-none text-white">
      {/* TOP BAR */}
      <header className="pointer-events-auto flex items-center gap-3">
        <button
          type="button"
          title="Back to title"
          onClick={onBackToTitle}
          className="chamfer-sm w-10 h-10 bg-[#0f1420]/90 border border-white/10 flex items-center justify-center text-white/75 hover:text-white cursor-pointer"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="mr-2">
          <div className="text-[10px] font-mono tracking-[0.3em] text-amber-300/80">KUROBA // LOADOUT</div>
          <div className="font-display text-lg font-black tracking-wider leading-none">
            {profile.name} <span className="text-amber-300">“{profile.callsign}”</span>
          </div>
        </div>
        <nav className="chamfer-sm flex bg-[#0f1420]/90 border border-white/10 p-1 gap-1">
          {(
            [
              ['operator', 'Operator'],
              ['armory', 'Armory'],
              ['unlocks', 'Unlocks'],
            ] as Array<[Section, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`px-5 py-2 font-display text-xs font-bold tracking-[0.2em] uppercase transition-colors cursor-pointer ${
                section === id ? 'bg-amber-400 text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="chamfer-sm flex items-center gap-3 bg-[#0f1420]/90 border border-white/10 pl-2 pr-4 py-1.5">
          <div className="w-9 h-9 flex items-center justify-center bg-amber-400 text-black font-display font-black text-sm [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
            {pl.level}
          </div>
          <div className="w-40">
            <div className="flex justify-between text-[9px] uppercase tracking-widest text-white/55">
              <span>Operator Rank</span>
              <span className="font-mono">{pl.needed > 0 ? `${Math.round(pl.into)}/${pl.needed}` : 'MAX'}</span>
            </div>
            <ProgressBar value={pl.progress} className="mt-1" />
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleTimeOfDay}
          className="chamfer-sm h-10 px-3 bg-[#0f1420]/90 border border-white/10 text-[11px] font-bold uppercase tracking-wider text-white/75 hover:text-white cursor-pointer"
        >
          {timeOfDay === 'night' ? '🌙 Night' : '☀ Day'}
        </button>
      </header>

      {/* BODY */}
      <div className="flex-1 min-h-0 flex gap-4 items-stretch">
        {section === 'operator' && <OperatorSection {...props} playerLevel={pl.level} />}
        {section === 'armory' && <ArmorySection {...props} playerLevel={pl.level} />}
        {section === 'unlocks' && <UnlocksSection progression={progression} />}
      </div>

      {/* BOTTOM DOCK */}
      <footer className="pointer-events-auto flex items-center gap-2">
        {(
          [
            ['zombies', '🧟 Zombie Survival', 'text-rose-300'],
            ['deathmatch', '⚔ Team Deathmatch', 'text-sky-300'],
            ['mecha', '🛡 Mecha Defense', 'text-yellow-200'],
          ] as Array<[GameMode, string, string]>
        ).map(([m, label, color]) => (
          <button
            key={m}
            type="button"
            onClick={() => onSelectMode(m)}
            className={`chamfer-sm px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              gameMode === m ? `bg-[#1b2232] border border-amber-400 ${color}` : 'bg-[#0f1420]/90 border border-white/10 text-white/60 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="hidden md:block text-[10px] font-mono text-white/40 mr-2">DRAG MODEL TO ROTATE</div>
        <button
          type="button"
          onClick={onDeploy}
          className="chamfer h-12 px-10 bg-[#dc2626] hover:bg-[#ef4444] text-white font-display font-black text-sm tracking-[0.3em] uppercase shadow-[0_0_30px_rgba(220,38,38,0.45)] cursor-pointer transition-colors"
        >
          Deploy ››
        </button>
      </footer>
    </div>
  );
};
