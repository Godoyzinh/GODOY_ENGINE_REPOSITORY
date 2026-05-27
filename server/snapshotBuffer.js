import { SNAPSHOT_BUFFER_SIZE } from '../src/network/networkConstants.js';

export class SnapshotBuffer {
  constructor({ capacity = SNAPSHOT_BUFFER_SIZE } = {}) {
    this.capacity = capacity;
    this.snapshots = [];
    this.lastSequence = 0;
    this.resendRequests = 0;
    this.misses = 0;
  }

  push(snapshot) {
    const sequence = snapshot.sequence ?? this.lastSequence + 1;

    this.lastSequence = Math.max(this.lastSequence, sequence);
    const bufferedSnapshot = {
      ...snapshot,
      sequence,
      bufferedAt: now(),
    };

    this.snapshots.push(bufferedSnapshot);

    if (this.snapshots.length > this.capacity) {
      this.snapshots.shift();
    }

    return bufferedSnapshot;
  }

  get(sequence) {
    const snapshot = this.snapshots.find((candidateSnapshot) => candidateSnapshot.sequence === sequence);

    if (!snapshot) {
      this.misses += 1;
    }

    return snapshot ?? null;
  }

  getRange(fromSequence, toSequence) {
    this.resendRequests += 1;

    return this.snapshots.filter((snapshot) => (
      snapshot.sequence >= fromSequence &&
      snapshot.sequence <= toSequence
    ));
  }

  getLatest() {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  getStats() {
    return {
      bufferedSnapshots: this.snapshots.length,
      capacity: this.capacity,
      latestSequence: this.lastSequence,
      oldestSequence: this.snapshots[0]?.sequence ?? 0,
      resendRequests: this.resendRequests,
      misses: this.misses,
    };
  }
}

function now() {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }

  return Date.now();
}
