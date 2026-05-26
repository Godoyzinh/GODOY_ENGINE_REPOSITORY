import {
  DEFAULT_LATENCY_PLACEHOLDER_MS,
  NETWORK_MODES,
} from './networkConstants.js';
import { RemotePlayerSystem } from './remotePlayerSystem.js';
import { ServerTickSystem } from './serverTickSystem.js';
import { SimulationOwnership } from './simulationOwnership.js';
import {
  createChunkReplicationSnapshot,
  createEntitySnapshots,
  createPlayerSnapshot,
} from './snapshotSerializer.js';

export class NetworkSession {
  constructor({
    localPlayerId = 'local-player',
    nickname = 'Godoy Player',
    mode = NETWORK_MODES.localPreview,
  } = {}) {
    this.localPlayerId = localPlayerId;
    this.nickname = nickname;
    this.mode = mode;
    this.ownership = new SimulationOwnership();
    this.serverTickSystem = new ServerTickSystem();
    this.remotePlayerSystem = new RemotePlayerSystem({ localPlayerId });
    this.group = this.remotePlayerSystem.group;
    this.lastPlayerSnapshot = null;
    this.lastReplicationBatch = null;
    this.latencyMs = DEFAULT_LATENCY_PLACEHOLDER_MS;
    this.connected = mode !== NETWORK_MODES.localPreview;
    this.snapshot = this.createSnapshot();
  }

  update({
    deltaTime,
    playerController,
    playerState,
    inventorySnapshot,
    entitySystem,
    terrainReplicationSnapshot,
  }) {
    const timestamp = now();
    const serverTickMetrics = this.serverTickSystem.getMetrics();
    const playerSnapshot = createPlayerSnapshot({
      playerId: this.localPlayerId,
      nickname: this.nickname,
      playerController,
      playerState,
      inventorySnapshot,
      tick: serverTickMetrics.serverTick,
      timestamp,
    });
    const entitySnapshots = createEntitySnapshots(entitySystem);
    const chunkSnapshot = createChunkReplicationSnapshot({
      terrainStats: terrainReplicationSnapshot.stats,
      loadedChunkKeys: terrainReplicationSnapshot.loadedChunkKeys,
      tick: serverTickMetrics.serverTick,
      timestamp,
    });
    const replicationBatch = this.serverTickSystem.update({
      deltaTime,
      playerSnapshot,
      entitySnapshots,
      chunkSnapshot,
      ownershipSnapshot: this.ownership.getSnapshot(),
      timestamp,
    });

    if (replicationBatch) {
      this.lastReplicationBatch = replicationBatch;
    }

    this.lastPlayerSnapshot = playerSnapshot;
    this.remotePlayerSystem.update(deltaTime);
    this.snapshot = this.createSnapshot({
      entitySnapshots,
      chunkSnapshot,
    });
  }

  applyServerSnapshot(serverSnapshot) {
    this.remotePlayerSystem.applyServerSnapshot(serverSnapshot);
  }

  createSnapshot({ entitySnapshots = [], chunkSnapshot = null } = {}) {
    const remotePlayerStats = this.remotePlayerSystem.getStats();
    const serverTickMetrics = this.serverTickSystem.getMetrics();
    const ownershipSnapshot = this.ownership.getSnapshot();

    return {
      mode: this.mode,
      connected: this.connected,
      authoritativeServerReady: ownershipSnapshot.authoritativeServer,
      clientPredictionReady: ownershipSnapshot.clientPredictionReady,
      interpolationReady: ownershipSnapshot.interpolationReady,
      latencyMs: this.latencyMs,
      localPlayerId: this.localPlayerId,
      nickname: this.nickname,
      remotePlayers: remotePlayerStats.remotePlayers,
      replicatedPlayerStates: remotePlayerStats.replicatedPlayerStates,
      replicatedEntities: entitySnapshots.length,
      syncedChunks: chunkSnapshot?.syncedChunks ?? 0,
      serverTick: serverTickMetrics.serverTick,
      serverTickRate: serverTickMetrics.tickRate,
      serverTickMs: serverTickMetrics.lastTickDurationMs,
      sentBatches: serverTickMetrics.sentBatches,
      lastBatchEntityCount: serverTickMetrics.lastBatchEntityCount,
      lastBatchChunkCount: serverTickMetrics.lastBatchChunkCount,
      deltaMode: this.lastReplicationBatch?.deltaMode ?? 'hash-delta-prep',
      lastUpdatedRemotePlayer: remotePlayerStats.lastUpdatedPlayerId,
      ownershipMode: 'server-authoritative',
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
