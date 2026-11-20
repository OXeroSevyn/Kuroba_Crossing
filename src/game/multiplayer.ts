import Peer, { type DataConnection } from 'peerjs';
import type { WeaponId } from './types';

export type PlayerTeam = 'red' | 'blue';

export interface RemotePlayerState {
  id: string;
  name: string;
  team: PlayerTeam;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  anim: 'idle' | 'walk' | 'run' | 'jump' | 'dash' | 'shoot';
  hp: number;
  maxHp: number;
  weapon: WeaponId;
  inVehicle: boolean;
  vehicleKind?: string;
  kills: number;
  deaths: number;
  ping: number;
  lastUpdateMs: number;
  headgear?: string;
  suitColor?: string;
  isFiring?: boolean;
  isReloading?: boolean;
}

export interface NetworkMessage {
  type:
    | 'welcome'
    | 'player_state'
    | 'shoot'
    | 'hit'
    | 'kill'
    | 'score_sync'
    | 'respawn'
    | 'chat';
  senderId: string;
  timestamp: number;
  payload: any;
}

export interface TdmScoreState {
  redScore: number;
  blueScore: number;
  targetKills: number;
  winner: PlayerTeam | null;
}

export interface KillFeedEntry {
  id: string;
  killerName: string;
  killerTeam: PlayerTeam;
  victimName: string;
  victimTeam: PlayerTeam;
  weapon: WeaponId;
  timestamp: number;
}

export type MultiplayerEventCallback = {
  onConnected?: (peerId: string, isHost: boolean) => void;
  onPlayerJoined?: (player: RemotePlayerState) => void;
  onPlayerLeft?: (playerId: string) => void;
  onRemoteShoot?: (data: {
    playerId: string;
    origin: [number, number, number];
    direction: [number, number, number];
    weapon: WeaponId;
    team: PlayerTeam;
  }) => void;
  onRemoteHit?: (data: {
    targetId: string;
    damage: number;
    attackerId: string;
  }) => void;
  onKillFeed?: (entry: KillFeedEntry) => void;
  onScoreUpdate?: (scores: TdmScoreState) => void;
  onError?: (err: string) => void;
};

export class MultiplayerManager {
  private peer: Peer | null = null;
  private connections = new Map<string, DataConnection>();
  public localId: string = '';
  public localTeam: PlayerTeam = 'red';
  public localName: string = 'Operator K-04';
  public isHost: boolean = false;
  public roomCode: string = '';
  public remotePlayers = new Map<string, RemotePlayerState>();
  public callbacks: MultiplayerEventCallback = {};

  public scores: TdmScoreState = {
    redScore: 0,
    blueScore: 0,
    targetKills: 25,
    winner: null,
  };
  public killFeed: KillFeedEntry[] = [];

  private broadcastTimer: number | null = null;

  constructor(callbacks: MultiplayerEventCallback = {}) {
    this.callbacks = callbacks;
  }

  public getShareableUrl(): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}?room=${this.roomCode}`;
  }

  public async hostGame(customCode?: string): Promise<string> {
    this.disconnect();
    this.isHost = true;
    this.localTeam = 'red';
    const code =
      customCode?.trim().toLowerCase() ||
      'tdm-' + Math.random().toString(36).substring(2, 6);
    this.roomCode = code;
    const peerId = `kuroba-${code}`;

    return new Promise((resolve, reject) => {
      try {
        const peer = new Peer(peerId, {
          debug: 1,
        });

        peer.on('open', (id) => {
          this.peer = peer;
          this.localId = id;
          this.callbacks.onConnected?.(id, true);
          resolve(code);
        });

        peer.on('connection', (conn) => {
          this.setupHostConnection(conn);
        });

        peer.on('error', (err) => {
          console.warn('[P2P Multiplayer] Peer error:', err);
          this.callbacks.onError?.(err.message || 'P2P Connection Error');
          reject(err);
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  public async joinGame(code: string): Promise<string> {
    this.disconnect();
    this.isHost = false;
    const cleanCode = code.trim().toLowerCase().replace(/^kuroba-/, '');
    this.roomCode = cleanCode;
    const hostPeerId = `kuroba-${cleanCode}`;

    return new Promise((resolve, reject) => {
      try {
        const guestId = `guest-${Math.random().toString(36).substring(2, 8)}`;
        const peer = new Peer(guestId, {
          debug: 1,
        });

        peer.on('open', (id) => {
          this.peer = peer;
          this.localId = id;

          const conn = peer.connect(hostPeerId, {
            reliable: false,
          });

          conn.on('open', () => {
            this.connections.set(hostPeerId, conn);
            this.callbacks.onConnected?.(id, false);
            this.setupGuestConnection(conn);
            resolve(cleanCode);
          });

          conn.on('error', (err) => {
            console.warn('[P2P Guest] Connection error:', err);
            this.callbacks.onError?.('Could not reach host room.');
            reject(err);
          });
        });

        peer.on('error', (err) => {
          console.warn('[P2P Guest] Peer error:', err);
          this.callbacks.onError?.(err.message || 'Failed to connect to room.');
          reject(err);
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  private setupHostConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);

      // Balance teams: assign guest to team with fewer players
      let redCount = this.localTeam === 'red' ? 1 : 0;
      let blueCount = this.localTeam === 'blue' ? 1 : 0;
      this.remotePlayers.forEach((p) => {
        if (p.team === 'red') redCount++;
        else blueCount++;
      });
      const assignedTeam: PlayerTeam = redCount <= blueCount ? 'red' : 'blue';

      // Send welcome packet with assigned team and current match score
      const welcome: NetworkMessage = {
        type: 'welcome',
        senderId: this.localId,
        timestamp: Date.now(),
        payload: {
          assignedTeam,
          scores: this.scores,
          players: Array.from(this.remotePlayers.values()),
        },
      };
      conn.send(welcome);
    });

    conn.on('data', (data) => {
      this.handleIncomingMessage(data as NetworkMessage, conn.peer);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.remotePlayers.delete(conn.peer);
      this.callbacks.onPlayerLeft?.(conn.peer);
      this.broadcastMessage({
        type: 'player_state',
        senderId: conn.peer,
        timestamp: Date.now(),
        payload: { left: true, id: conn.peer },
      });
    });
  }

  private setupGuestConnection(conn: DataConnection): void {
    conn.on('data', (data) => {
      this.handleIncomingMessage(data as NetworkMessage, conn.peer);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.callbacks.onError?.('Disconnected from host match.');
    });
  }

  private handleIncomingMessage(msg: NetworkMessage, senderPeer: string): void {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'welcome': {
        if (msg.payload?.assignedTeam) {
          this.localTeam = msg.payload.assignedTeam;
        }
        if (msg.payload?.scores) {
          this.scores = msg.payload.scores;
          this.callbacks.onScoreUpdate?.(this.scores);
        }
        if (Array.isArray(msg.payload?.players)) {
          msg.payload.players.forEach((p: RemotePlayerState) => {
            this.remotePlayers.set(p.id, p);
            this.callbacks.onPlayerJoined?.(p);
          });
        }
        break;
      }

      case 'player_state': {
        const p = msg.payload;
        if (p.left) {
          this.remotePlayers.delete(p.id);
          this.callbacks.onPlayerLeft?.(p.id);
        } else {
          const existing = this.remotePlayers.get(p.id);
          const updated: RemotePlayerState = {
            ...(existing || {}),
            ...p,
            lastUpdateMs: Date.now(),
          };
          this.remotePlayers.set(p.id, updated);
          if (!existing) {
            this.callbacks.onPlayerJoined?.(updated);
          }
        }
        // If host, forward to other peers
        if (this.isHost) {
          this.broadcastMessage(msg, senderPeer);
        }
        break;
      }

      case 'shoot': {
        this.callbacks.onRemoteShoot?.(msg.payload);
        if (this.isHost) {
          this.broadcastMessage(msg, senderPeer);
        }
        break;
      }

      case 'hit': {
        this.callbacks.onRemoteHit?.(msg.payload);
        if (this.isHost) {
          // Verify kill
          const { targetId, damage, attackerId, weapon, attackerTeam } = msg.payload;
          if (targetId === this.localId) {
            // Local host was hit
          }
          this.broadcastMessage(msg, senderPeer);
        }
        break;
      }

      case 'kill': {
        const feed = msg.payload as KillFeedEntry;
        this.killFeed = [feed, ...this.killFeed.filter((f) => f.id !== feed.id).slice(0, 7)];
        this.callbacks.onKillFeed?.(feed);

        // Update score
        if (feed.killerTeam === 'red') {
          this.scores.redScore++;
        } else {
          this.scores.blueScore++;
        }
        if (this.scores.redScore >= this.scores.targetKills) {
          this.scores.winner = 'red';
        } else if (this.scores.blueScore >= this.scores.targetKills) {
          this.scores.winner = 'blue';
        }

        this.callbacks.onScoreUpdate?.(this.scores);

        if (this.isHost) {
          this.broadcastMessage(msg, senderPeer);
          this.broadcastMessage({
            type: 'score_sync',
            senderId: this.localId,
            timestamp: Date.now(),
            payload: this.scores,
          });
        }
        break;
      }

      case 'score_sync': {
        this.scores = msg.payload;
        this.callbacks.onScoreUpdate?.(this.scores);
        break;
      }
    }
  }

  public broadcastMessage(msg: NetworkMessage, excludePeer?: string): void {
    const raw = msg;
    this.connections.forEach((conn, peerId) => {
      if (peerId !== excludePeer && conn.open) {
        try {
          conn.send(raw);
        } catch (e) {
          // ignore transient send errors
        }
      }
    });
  }

  public sendLocalState(state: Partial<RemotePlayerState>): void {
    const payload: RemotePlayerState = {
      id: this.localId,
      name: this.localName,
      team: this.localTeam,
      x: state.x ?? 0,
      y: state.y ?? 0,
      z: state.z ?? 0,
      yaw: state.yaw ?? 0,
      pitch: state.pitch ?? 0,
      anim: state.anim ?? 'idle',
      hp: state.hp ?? 100,
      maxHp: state.maxHp ?? 100,
      weapon: state.weapon ?? 'pulse',
      inVehicle: state.inVehicle ?? false,
      vehicleKind: state.vehicleKind,
      kills: state.kills ?? 0,
      deaths: state.deaths ?? 0,
      ping: 0,
      lastUpdateMs: Date.now(),
      headgear: state.headgear,
      suitColor: state.suitColor,
    };

    const msg: NetworkMessage = {
      type: 'player_state',
      senderId: this.localId,
      timestamp: Date.now(),
      payload,
    };

    this.broadcastMessage(msg);
  }

  public sendShoot(
    origin: [number, number, number],
    direction: [number, number, number],
    weapon: WeaponId,
  ): void {
    const msg: NetworkMessage = {
      type: 'shoot',
      senderId: this.localId,
      timestamp: Date.now(),
      payload: {
        playerId: this.localId,
        origin,
        direction,
        weapon,
        team: this.localTeam,
      },
    };
    this.broadcastMessage(msg);
  }

  public sendHit(targetId: string, damage: number, weapon: WeaponId): void {
    const msg: NetworkMessage = {
      type: 'hit',
      senderId: this.localId,
      timestamp: Date.now(),
      payload: {
        targetId,
        damage,
        attackerId: this.localId,
        weapon,
        attackerTeam: this.localTeam,
      },
    };
    this.broadcastMessage(msg);
  }

  public sendKill(victimId: string, victimName: string, victimTeam: PlayerTeam, weapon: WeaponId): void {
    const entry: KillFeedEntry = {
      id: `${Date.now()}-${Math.random()}`,
      killerName: this.localName,
      killerTeam: this.localTeam,
      victimName,
      victimTeam,
      weapon,
      timestamp: Date.now(),
    };

    const msg: NetworkMessage = {
      type: 'kill',
      senderId: this.localId,
      timestamp: Date.now(),
      payload: entry,
    };
    this.handleIncomingMessage(msg, this.localId);
    this.broadcastMessage(msg);
  }

  public getConnectedCount(): number {
    return this.connections.size + (this.localId ? 1 : 0);
  }

  public recordKill(
    killerName: string,
    killerTeam: PlayerTeam,
    victimName: string,
    victimTeam: PlayerTeam,
    weapon: WeaponId,
  ): void {
    const entry: KillFeedEntry = {
      id: `${Date.now()}-${Math.random()}`,
      killerName,
      killerTeam,
      victimName,
      victimTeam,
      weapon,
      timestamp: Date.now(),
    };
    this.killFeed = [entry, ...this.killFeed.filter((f) => f.id !== entry.id).slice(0, 7)];
    if (killerTeam === 'red') {
      this.scores.redScore++;
    } else {
      this.scores.blueScore++;
    }
    if (this.scores.redScore >= this.scores.targetKills) {
      this.scores.winner = 'red';
    } else if (this.scores.blueScore >= this.scores.targetKills) {
      this.scores.winner = 'blue';
    }
    this.callbacks.onKillFeed?.(entry);
    this.callbacks.onScoreUpdate?.(this.scores);

    const msg: NetworkMessage = {
      type: 'kill',
      senderId: this.localId,
      timestamp: Date.now(),
      payload: entry,
    };
    this.broadcastMessage(msg);
  }

  public disconnect(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.remotePlayers.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.localId = '';
    this.roomCode = '';
    this.isHost = false;
  }
}

export const multiplayer = new MultiplayerManager();
