import {
  DEFAULT_SERVER_TICK_RATE,
  MAX_REPLICATION_BATCH_SIZE,
} from './networkConstants.js';
import { createSnapshotHash, createWorldSnapshot } from './snapshotSerializer.js';

export class ServerTickSystem {
  constructor({
    tickRate = DEFAULT_SERVER_TICK_RATE,
    maxBatchSize = MAX_REPLICATION_BATCH_SIZE,
  } = {}) {
    this.tickRate = tickRate;
    this.tickInterval = 1 / tickRate;
    this.maxBatchSize = maxBatchSize;
    this.accumulator = 0;
    this.tick = 0;
    this.sentBatches = 0;
    this.previousEntityHashes = new Map();
    this.previousChunkHash = null;
    this.lastBatch = null;
    this.metrics = this.createMetrics();
  }

  update({
    deltaTime,
    playerSnapshot,
    entitySnapshots,
    chunkSnapshot,
    ownershipSnapshot,
    timestamp,
  }) {
    this.accumulator += deltaTime;

    if (this.accumulator < this.tickInterval) {
      this.metrics = this.createMetrics();
      return null;
    }

    const startedAt = now();

    while (this.accumulator >= this.tickInterval) {
      this.accumulator -= this.tickInterval;
      this.tick += 1;
    }

    const entityDelta = this.createEntityDelta(entitySnapshots);
    const chunkDelta = this.createChunkDelta(chunkSnapshot);
    const replicationBatch = {
      id: `batch-${this.tick}`,
      tick: this.tick,
      timestamp,
      mode: 'authoritative-server-prep',
      deltaMode: 'hash-delta-prep',
      worldSnapshot: createWorldSnapshot({
        playerSnapshot,
        entitySnapshots: entityDelta,
        chunkSnapshot: chunkDelta,
        ownershipSnapshot,
        tick: this.tick,
        timestamp,
      }),
      playerSnapshot,
      entityDelta,
      chunkDelta,
    };

    this.sentBatches += 1;
    this.lastBatch = replicationBatch;
    this.metrics = this.createMetrics({
      tickDurationMs: now() - startedAt,
      lastBatchEntityCount: entityDelta.length,
      lastBatchChunkCount: chunkDelta.syncedChunks ?? 0,
    });

    return replicationBatch;
  }

  createEntityDelta(entitySnapshots) {
    const changedEntities = [];
    const currentHashes = new Map();

    for (const entitySnapshot of entitySnapshots.slice(0, this.maxBatchSize)) {
      const hash = createSnapshotHash(entitySnapshot);

      currentHashes.set(entitySnapshot.id, hash);

      if (this.previousEntityHashes.get(entitySnapshot.id) !== hash) {
        changedEntities.push({
          ...entitySnapshot,
          hash,
        });
      }
    }

    this.previousEntityHashes = currentHashes;
    return changedEntities;
  }

  createChunkDelta(chunkSnapshot) {
    const chunkHash = createSnapshotHash(chunkSnapshot);
    const didChange = this.previousChunkHash !== chunkHash;

    this.previousChunkHash = chunkHash;

    return {
      ...chunkSnapshot,
      changed: didChange,
      hash: chunkHash,
    };
  }

  createMetrics({
    tickDurationMs = 0,
    lastBatchEntityCount = this.metrics?.lastBatchEntityCount ?? 0,
    lastBatchChunkCount = this.metrics?.lastBatchChunkCount ?? 0,
  } = {}) {
    return {
      serverTick: this.tick,
      tickRate: this.tickRate,
      tickIntervalMs: this.tickInterval * 1000,
      accumulatorMs: this.accumulator * 1000,
      sentBatches: this.sentBatches,
      lastBatchEntityCount,
      lastBatchChunkCount,
      lastTickDurationMs: tickDurationMs,
      maxBatchSize: this.maxBatchSize,
    };
  }

  getMetrics() {
    return this.metrics;
  }
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
