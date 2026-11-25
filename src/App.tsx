import { useCallback, useEffect, useRef, useState } from 'react';
import { LoadoutStudio } from './components/LoadoutStudio';
import { GameHud } from './components/GameHud';
import { StatusModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import { loadGunBuilds } from './game/armory';
import { loadProfile, type OperatorProfile, saveProfile } from './game/character';
import { DEFAULT_LOADOUT, loadSavedLoadout } from './game/customization';
import { loadProgression, type ProgressionState } from './game/progression';
import { PLAYER_MAX_HP, WEAPONS } from './game/rules';
import type { FirearmId, GameMode, GunBuild, GunBuilds, HudSnapshot, LoadoutConfig, RunSummary, WeaponId } from './game/types';
import { VoxelGameEngine } from './game/VoxelGameEngine';
import { gameAudio } from './game/audio';

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  gameMode: 'zombies',
  timeOfDay: 'night',
  zone: 'kuroba',
  zoneName: 'KUROBA CROSSING',
  zoneBannerTimer: 0,
  hp: PLAYER_MAX_HP,
  maxHp: PLAYER_MAX_HP,
  ghostHp: PLAYER_MAX_HP,
  dashCharges: 2,
  maxDashCharges: 2,
  dashRechargeProgress: 1,
  score: 0,
  bestScore: 0,
  combo: 0,
  comboTimer: 0,
  wave: 1,
  totalWaves: null,
  waveTitle: 'HORDE 1 · OUTBREAK SURGE',
  waveBannerTimer: 0,
  enemiesRemaining: 0,
  weapon: 'pulse',
  ammo: {
    pulse: WEAPONS.pulse.magSize,
    scatter: WEAPONS.scatter.magSize,
    rail: WEAPONS.rail.magSize,
    rpg: WEAPONS.rpg.magSize,
    katana: 999,
  },
  magSizes: {
    pulse: WEAPONS.pulse.magSize,
    scatter: WEAPONS.scatter.magSize,
    rail: WEAPONS.rail.magSize,
    rpg: WEAPONS.rpg.magSize,
    katana: 999,
  },
  reloading: false,
  reloadProgress: 0,
  aiming: false,
  scope: {
    blend: 0,
    fullscreen: false,
    reticle: 'holo',
    zoom: 1,
    reticleColor: '#3bf58a',
    opticName: '',
    rangeM: null,
    variableZoom: false,
  },
  unlockToasts: [],
  playerLevel: 1,
  playerLevelProgress: 0,
  weaponLevel: 1,
  weaponLevelProgress: 0,
  pointerLocked: false,
  hitmarkerTimer: 0,
  hitmarkerCrit: false,
  hurtFlash: 0,
  muted: false,
  kills: 0,
  elapsedSec: 0,
  bossHp: 0,
  bossMaxHp: 0,
  bossName: '',
  crosshairSpread: 0,
  grenades: { frag: 3, smoke: 2, active: 'frag' },
  inHelicopter: false,
  helicopterName: '',
  helicopterAltitude: 0,
  helicopterBombs: 6,
  helicopterHp: 200,
  helicopterMaxHp: 200,
  nearbyHelicopterName: null,
  inVehicle: false,
  vehicleName: '',
  vehicleSpeedKmh: 0,
  vehicleNitro: 100,
  vehicleHp: 120,
  vehicleMaxHp: 120,
  nearbyVehicleName: null,
  inTank: false,
  tankName: '',
  tankHp: 500,
  tankMaxHp: 500,
  tankCannonReady: true,
  nearbyTankName: null,
  c4Count: 3,
  sentriesAvailable: 1,
  katanaReady: true,
  overhealth: 0,
  interactionPrompt: null,
  minimapPlayer: { x: 0, z: 6.4, yaw: 0 },
  minimapEnemies: [],
  minimapVehicles: [],
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VoxelGameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [loadout, setLoadout] = useState<LoadoutConfig>(() => loadSavedLoadout());
  const [gunBuilds, setGunBuilds] = useState<GunBuilds>(() => loadGunBuilds());
  const [progression, setProgression] = useState<ProgressionState>(() => loadProgression());
  const [profile, setProfile] = useState<OperatorProfile>(() => loadProfile());
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [musicVolume, setMusicVolume] = useState(() => gameAudio.getMusicVolume());

  const handleMusicVolumeChange = (vol: number) => {
    gameAudio.setMusicVolume(vol);
    setMusicVolume(vol);
  };

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new VoxelGameEngine(mount, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onRunEnd: (summary) => {
        setRunSummary(summary);
      },
    });
    engineRef.current = engine;
    setLoadout(engine.getLoadout());
    setGunBuilds(engine.getGunBuilds());
    setProgression(engine.getProgression());

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room') || params.get('join');
    if (roomParam) {
      engine.setGameMode('deathmatch');
      engine.joinTdm(roomParam).then(() => {
        engine.startNewRun();
      }).catch((e) => {
        console.warn('Failed to join room from URL parameter:', e);
      });
    } else if (params.get('mode') === 'mecha') {
      engine.setGameMode('mecha');
    } else if (params.get('mode') === 'deathmatch') {
      engine.setGameMode('deathmatch');
    }
    if (params.get('time') === 'day') {
      engine.setTimeOfDay('day');
    }
    if (params.get('autostart') === '1' && !roomParam) {
      engine.startNewRun();
      const zoneParam = params.get('zone');
      if (zoneParam === 'aurora' || zoneParam === 'fungi' || zoneParam === 'snowpeak') {
        engine.teleportToZone(zoneParam);
      }
    } else if (params.get('customize') === '1') {
      engine.openCustomize();
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (hud.phase === 'customize' && engine) {
      setGunBuilds(engine.getGunBuilds());
      setProgression(engine.getProgression());
    }
  }, [hud.phase]);

  const handleOpenCustomize = () => {
    setRunSummary(null);
    engineRef.current?.openCustomize();
  };

  const handleDeploy = () => {
    setRunSummary(null);
    gameAudio.stopLobbyMusic();
    engineRef.current?.startNewRun();
  };

  const handleSelectLoadoutOption = (key: keyof LoadoutConfig, value: string) => {
    const updated = engineRef.current?.setLoadoutOption(key, value);
    if (updated) setLoadout(updated);
  };

  const handleApplyGenerated = (next: LoadoutConfig, nextProfile: OperatorProfile) => {
    const updated = engineRef.current?.setFullLoadout(next);
    if (updated) setLoadout(updated);
    setProfile(nextProfile);
    saveProfile(nextProfile);
  };

  const handleProfileChange = (next: OperatorProfile) => {
    setProfile(next);
    saveProfile(next);
  };

  const handleResetLoadout = () => {
    const updated = engineRef.current?.setFullLoadout({ ...DEFAULT_LOADOUT });
    if (updated) setLoadout(updated);
  };

  const handleSetGunBuild = (firearm: FirearmId, build: GunBuild) => {
    const updated = engineRef.current?.setGunBuild(firearm, build);
    if (updated) setGunBuilds(updated);
  };

  // Stable: the studio calls this from effects
  const handleStudioView = useCallback((view: 'character' | 'face' | 'gun', weapon?: WeaponId) => {
    engineRef.current?.setCustomizeView(view, weapon);
  }, []);

  const handleResume = () => {
    engineRef.current?.resumeGame();
  };

  const handlePause = () => {
    engineRef.current?.pauseGame();
  };

  const handleTitle = () => {
    setRunSummary(null);
    engineRef.current?.returnToTitle();
    gameAudio.playLobbyMusic();
  };

  const handleToggleMute = () => {
    engineRef.current?.toggleMute();
  };

  const handleSelectMode = (mode: GameMode) => {
    engineRef.current?.setGameMode(mode);
  };

  const handleToggleTimeOfDay = () => {
    engineRef.current?.toggleTimeOfDay();
  };

  const handleSelectWeapon = (id: WeaponId) => {
    engineRef.current?.selectWeapon(id);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b1220]">
      {/* Isolated WebGL canvas mount — React HUD state updates never recreate this DOM node */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Kuroba Crossing 3D Voxel Open World"
      />

      {hud.phase === 'title' && (
        <TitleOverlay
          bestScore={hud.bestScore}
          muted={hud.muted}
          musicVolume={musicVolume}
          onMusicVolumeChange={handleMusicVolumeChange}
          gameMode={hud.gameMode}
          timeOfDay={hud.timeOfDay}
          onSelectMode={handleSelectMode}
          onToggleTimeOfDay={handleToggleTimeOfDay}
          onStart={handleDeploy}
          onOpenCustomize={handleOpenCustomize}
          onToggleMute={handleToggleMute}
          onHostTdm={(code) => engineRef.current?.hostTdm(code) ?? Promise.resolve('')}
          onJoinTdm={(code) => engineRef.current?.joinTdm(code) ?? Promise.resolve('')}
        />
      )}

      {hud.phase === 'customize' && (
        <LoadoutStudio
          loadout={loadout}
          builds={gunBuilds}
          progression={progression}
          profile={profile}
          activeWeapon={hud.weapon}
          timeOfDay={hud.timeOfDay}
          gameMode={hud.gameMode}
          onSelectOption={handleSelectLoadoutOption}
          onApplyGenerated={handleApplyGenerated}
          onProfileChange={handleProfileChange}
          onResetOperator={handleResetLoadout}
          onSetGunBuild={handleSetGunBuild}
          onView={handleStudioView}
          onToggleTimeOfDay={handleToggleTimeOfDay}
          onSelectMode={handleSelectMode}
          onBackToTitle={handleTitle}
          onDeploy={handleDeploy}
        />
      )}

      {hud.phase === 'playing' && (
        <GameHud
          hud={hud}
          onSelectWeapon={handleSelectWeapon}
          onToggleTimeOfDay={handleToggleTimeOfDay}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
          onRestart={handleDeploy}
          onFireStart={() => engineRef.current?.triggerFire(true)}
          onFireEnd={() => engineRef.current?.triggerFire(false)}
          onAimToggle={() => engineRef.current?.toggleAim()}
          onJump={() => engineRef.current?.triggerJump()}
          onDash={() => engineRef.current?.triggerDash()}
          onReload={() => engineRef.current?.triggerReload()}
          onVehicleToggle={() => engineRef.current?.triggerVehicleToggle()}
          onC4={() => engineRef.current?.triggerC4()}
          onSentry={() => engineRef.current?.triggerSentry()}
          onInteract={() => engineRef.current?.triggerInteract()}
          onTouchMove={(x, y) => engineRef.current?.applyTouchMovement(x, y)}
          onTouchLook={(dx, dy) => engineRef.current?.applyTouchLook(dx, dy)}
        />
      )}

      {(hud.phase === 'paused' || hud.phase === 'victory' || hud.phase === 'gameover') && (
        <StatusModal
          phase={hud.phase}
          gameMode={hud.gameMode}
          summary={runSummary}
          score={hud.score}
          wave={hud.wave}
          totalWaves={hud.totalWaves}
          kills={hud.kills}
          onResume={handleResume}
          onRestart={handleDeploy}
          onCustomize={handleOpenCustomize}
          onTitle={handleTitle}
        />
      )}
    </main>
  );
}

