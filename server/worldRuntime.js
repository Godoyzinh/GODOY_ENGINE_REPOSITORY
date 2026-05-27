import fs from 'node:fs';
import path from 'node:path';
import { SnapshotBuffer } from './snapshotBuffer.js';

const MAX_WORLD_BLOCK_EDITS = 1024;
const MAX_COMBAT_EVENTS = 256;

export class WorldRuntime {
  constructor({ metadata, settings }) {
    this.metadata = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      maxPlayers: 16,
      tags: ['sandbox', 'survival'],
      ...metadata,
    };
    this.settings = settings;
    this.snapshotBuffer = new SnapshotBuffer();
    this.state = this.loadState();
    this.tick = this.state.tick ?? 0;
    this.accumulator = 0;
    this.metrics = createEmptyWorldMetrics();
    this.metrics.playerSnapshots = Object.keys(this.state.playerSnapshots).length;
    this.lastPersistAt = now();
  }

  update(deltaTime) {
    const startedAt = now();

    this.accumulator += deltaTime;
    this.tick += 1;
    this.state.tick = this.tick;
    this.state.updatedAt = new Date().toISOString();
    this.metadata.updatedAt = this.state.updatedAt;
    this.metrics.tickLoadMs = now() - startedAt;

    if (this.settings.persistWorlds && now() - this.lastPersistAt > 5000) {
      this.persist();
    }
  }

  applyBlockEdits(edits) {
    const normalizedEdits = edits.map((edit) => ({
      ...edit,
      worldId: this.metadata.id,
      serverTick: this.tick,
      appliedAt: now(),
    }));

    this.state.blockEdits.push(...normalizedEdits);
    this.state.blockEdits = this.state.blockEdits.slice(-MAX_WORLD_BLOCK_EDITS);
    this.metrics.blockEdits += normalizedEdits.length;

    return normalizedEdits;
  }

  applyCombatEvent(event) {
    const combatEvent = {
      ...event,
      worldId: this.metadata.id,
      serverTick: this.tick,
      appliedAt: now(),
    };

    this.state.combatEvents.push(combatEvent);
    this.state.combatEvents = this.state.combatEvents.slice(-MAX_COMBAT_EVENTS);
    this.metrics.combatEvents += 1;

    return combatEvent;
  }

  updatePlayerSnapshot(playerId, playerSnapshot) {
    this.state.playerSnapshots[playerId] = {
      snapshot: playerSnapshot,
      updatedAt: new Date().toISOString(),
      serverTick: this.tick,
    };
    this.metrics.playerSnapshots = Object.keys(this.state.playerSnapshots).length;
  }

  getPlayerSnapshot(playerId) {
    return this.state.playerSnapshots[playerId] ?? null;
  }

  updateChunkInterest(playerId, loadedChunkKeys) {
    this.state.chunkInterests[playerId] = loadedChunkKeys;
  }

  removePlayerInterest(playerId) {
    delete this.state.chunkInterests[playerId];
  }

  createWorldPayload({ playerId }) {
    const interestedChunks = new Set(this.state.chunkInterests[playerId] ?? []);
    const relevantBlockEdits = this.state.blockEdits.filter((edit) => (
      edit.sourcePlayerId !== playerId &&
      (interestedChunks.size === 0 || !edit.chunkKey || interestedChunks.has(edit.chunkKey))
    ));

    return {
      worldId: this.metadata.id,
      metadata: this.getMetadata(),
      blockEdits: relevantBlockEdits,
      combatEvents: this.state.combatEvents.filter((event) => event.sourcePlayerId !== playerId),
      entitySnapshots: this.state.entitySnapshots,
      chunkSync: {
        requestedChunks: interestedChunks.size,
        syncedChunks: interestedChunks.size,
        deltaCompression: 'hash-delta-prep',
        reconciliationReady: true,
      },
    };
  }

  bufferSnapshot(snapshot) {
    const bufferedSnapshot = this.snapshotBuffer.push({
      ...snapshot,
      worldId: this.metadata.id,
    });

    this.metrics.bufferedSnapshots = this.snapshotBuffer.getStats().bufferedSnapshots;

    return bufferedSnapshot;
  }

  getBufferedSnapshots(fromSequence, toSequence, { playerId = null } = {}) {
    return this.snapshotBuffer.getRange(fromSequence, toSequence)
      .filter((snapshot) => !playerId || snapshot.playerId === playerId);
  }

  getMetadata({ connectedPlayers = 0 } = {}) {
    return {
      ...this.metadata,
      tick: this.tick,
      connectedPlayers,
      blockEdits: this.state.blockEdits.length,
      combatEvents: this.state.combatEvents.length,
      persistedPlayers: Object.keys(this.state.playerSnapshots).length,
    };
  }

  getStateSummary() {
    return {
      worldId: this.metadata.id,
      tick: this.tick,
      blockEdits: this.state.blockEdits.length,
      combatEvents: this.state.combatEvents.length,
      persistedPlayers: Object.keys(this.state.playerSnapshots).length,
      chunkInterests: Object.keys(this.state.chunkInterests).length,
      buffer: this.snapshotBuffer.getStats(),
      metrics: this.metrics,
    };
  }

  loadState() {
    const statePath = this.getStatePath();

    if (!fs.existsSync(statePath)) {
      return createEmptyWorldState(this.metadata.id);
    }

    try {
      return {
        ...createEmptyWorldState(this.metadata.id),
        ...JSON.parse(fs.readFileSync(statePath, 'utf8')),
      };
    } catch {
      return createEmptyWorldState(this.metadata.id);
    }
  }

  persist() {
    const statePath = this.getStatePath();

    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2));
    this.lastPersistAt = now();
    this.metrics.persistenceWrites += 1;
  }

  getStatePath() {
    return path.join(this.settings.dataDirectory, 'worlds', `${this.metadata.id}.json`);
  }
}

function createEmptyWorldState(worldId) {
  return {
    version: 1,
    worldId,
    tick: 0,
    blockEdits: [],
    combatEvents: [],
    playerSnapshots: {},
    entitySnapshots: [],
    chunkInterests: {},
    updatedAt: new Date().toISOString(),
  };
}

function createEmptyWorldMetrics() {
  return {
    tickLoadMs: 0,
    blockEdits: 0,
    combatEvents: 0,
    playerSnapshots: 0,
    bufferedSnapshots: 0,
    persistenceWrites: 0,
  };
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
