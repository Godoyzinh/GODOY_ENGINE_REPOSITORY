import {
  DEFAULT_LATENCY_PLACEHOLDER_MS,
  NETWORK_MODES,
  PACKET_TYPES,
} from './networkConstants.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import {
  createBlockEditPacket,
  createAckPacket,
  createChunkInterestPacket,
  createCombatActionPacket,
  createResendRequestPacket,
  createPlayerSnapshotPacket,
  createJoinWorldPacket,
  createPublishWorldPacket,
  createStudioEditPacket,
} from './packetProtocol.js';
import { RemotePlayerSystem } from './remotePlayerSystem.js';
import { ServerTickSystem } from './serverTickSystem.js';
import { SimulationOwnership } from './simulationOwnership.js';
import {
  createChunkReplicationSnapshot,
  createEntitySnapshots,
  createPlayerSnapshot,
} from './snapshotSerializer.js';
import { WebSocketClientTransport } from './webSocketClientTransport.js';

export class NetworkSession {
  constructor({
    localPlayerId = 'local-player',
    nickname = 'Godoy Player',
    mode = resolveNetworkMode(),
    serverUrl = resolveServerUrl(),
    transport = null,
  } = {}) {
    this.localPlayerId = localPlayerId;
    this.nickname = nickname;
    this.mode = mode;
    this.ownership = new SimulationOwnership();
    this.serverTickSystem = new ServerTickSystem();
    this.remotePlayerSystem = new RemotePlayerSystem({ localPlayerId });
    this.group = this.remotePlayerSystem.group;
    this.transport = transport ?? createOptionalTransport({
      mode,
      serverUrl,
      localPlayerId,
      nickname,
    });
    this.lastPlayerSnapshot = null;
    this.lastReplicationBatch = null;
    this.latencyMs = DEFAULT_LATENCY_PLACEHOLDER_MS;
    this.connected = false;
    this.pendingBlockEdits = [];
    this.pendingCombatActions = [];
    this.pendingStudioEdits = [];
    this.pendingWorldPublishes = [];
    this.pendingRemoteBlockEdits = [];
    this.worldMetadata = null;
    this.lastChunkInterestKey = '';
    this.serverMetrics = null;
    this.sessionToken = null;
    this.worldId = null;
    this.hostedWorlds = [];
    this.lastReceivedSequence = 0;
    this.snapshot = this.createSnapshot();
    this.bindTransport();
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
      this.flushOutboundPackets({
        playerSnapshot,
        replicationBatch,
        loadedChunkKeys: terrainReplicationSnapshot.loadedChunkKeys,
      });
    }

    this.lastPlayerSnapshot = playerSnapshot;
    this.transport?.update?.(deltaTime);
    this.remotePlayerSystem.update(deltaTime);
    this.snapshot = this.createSnapshot({
      entitySnapshots,
      chunkSnapshot,
    });
  }

  applyServerSnapshot(serverSnapshot) {
    this.remotePlayerSystem.applyServerSnapshot(serverSnapshot);
    this.serverMetrics = serverSnapshot?.metrics ?? this.serverMetrics;
    this.worldMetadata = serverSnapshot?.world?.metadata ?? this.worldMetadata;

    const blockEdits = serverSnapshot?.world?.blockEdits ?? [];

    this.pendingRemoteBlockEdits.push(
      ...blockEdits.filter((edit) => edit.sourcePlayerId !== this.localPlayerId),
    );
    this.snapshot = this.createSnapshot();
  }

  queueBlockEdits(edits) {
    this.pendingBlockEdits.push(...edits.map((edit) => ({
      ...edit,
      sourcePlayerId: this.localPlayerId,
    })));
  }

  queueCombatAction(action) {
    this.pendingCombatActions.push({
      action,
      sourcePlayerId: this.localPlayerId,
    });
  }

  queueStudioEdits(edits) {
    this.pendingStudioEdits.push(...edits.map((edit) => ({
      ...edit,
      sourcePlayerId: this.localPlayerId,
    })));
  }

  queueWorldPublish(publishRecord) {
    this.pendingWorldPublishes.push(publishRecord);
  }

  consumeRemoteBlockEdits() {
    return this.pendingRemoteBlockEdits.splice(0);
  }

  bindTransport() {
    if (!this.transport) {
      return;
    }

    this.transport.on?.(PACKET_TYPES.welcome, (packet) => {
      this.connected = true;
      this.sessionToken = packet.payload?.sessionToken ?? this.sessionToken;
      this.worldId = packet.payload?.worldId ?? this.worldId;
      this.transport.setSessionContext?.({
        sessionToken: this.sessionToken,
        worldId: this.worldId,
      });
      this.serverMetrics = {
        ...(this.serverMetrics ?? {}),
        serverTickRate: packet.payload?.serverTickRate,
        clientCount: packet.payload?.clientCount,
      };
    });
    this.transport.on?.(PACKET_TYPES.worldList, (packet) => {
      this.hostedWorlds = packet.payload?.worlds ?? [];
    });
    this.transport.on?.(PACKET_TYPES.worldJoined, (packet) => {
      this.worldId = packet.payload?.world?.id ?? this.worldId;
      this.worldMetadata = packet.payload?.world ?? this.worldMetadata;
      this.hostedWorlds = mergeWorldMetadata(this.hostedWorlds, packet.payload?.world);
      this.transport.setSessionContext?.({
        sessionToken: this.sessionToken,
        worldId: this.worldId,
      });
    });
    this.transport.on?.(PACKET_TYPES.reconnectAccepted, (packet) => {
      this.sessionToken = packet.payload?.sessionToken ?? this.sessionToken;
      this.worldId = packet.payload?.world?.id ?? this.worldId;
      this.worldMetadata = packet.payload?.world ?? this.worldMetadata;
      this.transport.setSessionContext?.({
        sessionToken: this.sessionToken,
        worldId: this.worldId,
      });
    });
    this.transport.on?.(PACKET_TYPES.serverSnapshot, (packet) => {
      this.connected = true;
      const incomingSequence = packet.payload?.sequence ?? this.lastReceivedSequence;

      if (this.lastReceivedSequence > 0 && incomingSequence > this.lastReceivedSequence + 1) {
        this.transport.send?.(createResendRequestPacket({
          fromSequence: this.lastReceivedSequence + 1,
          toSequence: incomingSequence - 1,
          worldId: this.worldId,
        }));
      }

      this.lastReceivedSequence = incomingSequence;
      this.transport.send?.(createAckPacket({
        sequence: this.lastReceivedSequence,
        worldId: this.worldId,
      }));
      this.applyServerSnapshot(packet.payload);
    });
    this.transport.on?.(PACKET_TYPES.reconciliation, (packet) => {
      this.applyServerSnapshot({
        world: packet.payload?.authoritativeState,
        metrics: this.serverMetrics,
      });
    });
    this.transport.on?.(PACKET_TYPES.playerLeft, (packet) => {
      this.remotePlayerSystem.removeRemotePlayer?.(packet.payload?.playerId);
    });
    this.transport.on?.(PACKET_TYPES.error, () => {
      this.connected = false;
    });
  }

  flushOutboundPackets({ playerSnapshot, loadedChunkKeys }) {
    if (!this.transport) {
      this.pendingBlockEdits = [];
      this.pendingCombatActions = [];
      this.pendingStudioEdits = [];
      this.pendingWorldPublishes = [];
      return;
    }

    this.transport.send(createPlayerSnapshotPacket(playerSnapshot));
    this.sendChunkInterestIfChanged(loadedChunkKeys);

    if (this.pendingBlockEdits.length > 0) {
      this.transport.send(createBlockEditPacket({
        edits: this.pendingBlockEdits,
        sourcePlayerId: this.localPlayerId,
      }));
      this.pendingBlockEdits = [];
    }

    for (const combatAction of this.pendingCombatActions) {
      this.transport.send(createCombatActionPacket({
        action: combatAction.action,
        sourcePlayerId: this.localPlayerId,
        tick: this.serverTickSystem.getMetrics().serverTick,
      }));
    }

    this.pendingCombatActions = [];

    if (this.pendingStudioEdits.length > 0) {
      this.transport.send(createStudioEditPacket({
        worldId: this.worldId,
        playerId: this.localPlayerId,
        edits: this.pendingStudioEdits,
      }));
      this.pendingStudioEdits = [];
    }

    for (const publishRecord of this.pendingWorldPublishes) {
      this.transport.send(createPublishWorldPacket({
        worldId: this.worldId,
        playerId: this.localPlayerId,
        metadata: publishRecord,
      }));
    }

    this.pendingWorldPublishes = [];
  }

  joinWorld(worldId) {
    this.worldId = worldId;

    if (this.transport) {
      this.transport.send(createJoinWorldPacket({
        worldId,
        playerId: this.localPlayerId,
        nickname: this.nickname,
      }));
    }
  }

  sendChunkInterestIfChanged(loadedChunkKeys) {
    const chunkInterestKey = loadedChunkKeys.join('|');

    if (chunkInterestKey === this.lastChunkInterestKey) {
      return;
    }

    this.lastChunkInterestKey = chunkInterestKey;
    this.transport.send(createChunkInterestPacket({
      playerId: this.localPlayerId,
      loadedChunkKeys,
    }));
  }

  createSnapshot({ entitySnapshots = [], chunkSnapshot = null } = {}) {
    const remotePlayerStats = this.remotePlayerSystem.getStats();
    const serverTickMetrics = this.serverTickSystem.getMetrics();
    const ownershipSnapshot = this.ownership.getSnapshot();
    const transportMetrics = this.transport?.getMetrics?.() ?? createEmptyTransportMetrics();

    return {
      mode: this.mode,
      connected: this.connected || transportMetrics.connected,
      authoritativeServerReady: ownershipSnapshot.authoritativeServer,
      clientPredictionReady: ownershipSnapshot.clientPredictionReady,
      interpolationReady: ownershipSnapshot.interpolationReady,
      latencyMs: transportMetrics.latencyMs ?? this.latencyMs,
      localPlayerId: this.localPlayerId,
      nickname: this.nickname,
      sessionToken: this.sessionToken,
      worldId: this.worldId,
      hostedWorlds: this.hostedWorlds.length,
      serverUrl: transportMetrics.url,
      connectionState: transportMetrics.connectionState,
      remotePlayers: remotePlayerStats.remotePlayers,
      replicatedPlayerStates: remotePlayerStats.replicatedPlayerStates,
      replicatedEntities: entitySnapshots.length,
      syncedChunks: chunkSnapshot?.syncedChunks ?? 0,
      serverTick: this.serverMetrics?.serverTick ?? serverTickMetrics.serverTick,
      serverTickRate: this.serverMetrics?.tickRate ?? serverTickMetrics.tickRate,
      serverTickMs: this.serverMetrics?.lastTickDurationMs ?? serverTickMetrics.lastTickDurationMs,
      sentBatches: serverTickMetrics.sentBatches,
      lastBatchEntityCount: serverTickMetrics.lastBatchEntityCount,
      lastBatchChunkCount: serverTickMetrics.lastBatchChunkCount,
      packetsPerSecond: transportMetrics.packetsPerSecond,
      packetsSent: transportMetrics.packetsSent,
      packetsReceived: transportMetrics.packetsReceived,
      bytesSent: transportMetrics.bytesSent,
      bytesReceived: transportMetrics.bytesReceived,
      queuedPackets: transportMetrics.queuedPackets,
      syncErrors: transportMetrics.syncErrors,
      lastNetworkError: transportMetrics.lastError,
      pendingRemoteBlockEdits: this.pendingRemoteBlockEdits.length,
      pendingStudioEdits: this.pendingStudioEdits.length,
      pendingWorldPublishes: this.pendingWorldPublishes.length,
      lastReceivedSequence: this.lastReceivedSequence,
      deltaMode: this.lastReplicationBatch?.deltaMode ?? 'hash-delta-prep',
      lastUpdatedRemotePlayer: remotePlayerStats.lastUpdatedPlayerId,
      ownershipMode: 'server-authoritative',
      serverMetrics: this.serverMetrics,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  getWorldMetadata() {
    return this.worldMetadata;
  }
}

function mergeWorldMetadata(worlds, world) {
  if (!world) {
    return worlds;
  }

  const nextWorlds = worlds.filter((candidateWorld) => candidateWorld.id !== world.id);

  nextWorlds.push(world);
  return nextWorlds;
}

function createOptionalTransport({ mode, serverUrl, localPlayerId, nickname }) {
  if (mode !== NETWORK_MODES.client || !serverUrl) {
    return null;
  }

  return new WebSocketClientTransport({
    url: serverUrl,
    playerId: localPlayerId,
    nickname,
  });
}

function resolveNetworkMode() {
  if (typeof window === 'undefined') {
    return NETWORK_MODES.localPreview;
  }

  const url = new URL(window.location.href);

  return url.searchParams.get('multiplayer') === '1' || url.searchParams.get('network') === '1'
    ? NETWORK_MODES.client
    : NETWORK_MODES.localPreview;
}

function resolveServerUrl() {
  return getRuntimeConfig().multiplayerServerUrl;
}

function createEmptyTransportMetrics() {
  return {
    url: 'local',
    connectionState: 'localPreview',
    connected: false,
    packetsPerSecond: 0,
    packetsSent: 0,
    packetsReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    queuedPackets: 0,
    latencyMs: 0,
    syncErrors: 0,
    lastError: 'none',
  };
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
