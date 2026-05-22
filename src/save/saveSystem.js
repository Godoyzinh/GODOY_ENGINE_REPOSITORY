export class SaveSystem {
  constructor({ storage = window.localStorage, storageKey = 'godoyEngine.world.v1' } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.state = this.loadState();
  }

  loadState() {
    const serializedState = this.storage.getItem(this.storageKey);

    if (!serializedState) {
      return {
        version: 1,
        worldSeed: null,
        chunks: {},
        lastChangedBlock: null,
      };
    }

    try {
      return JSON.parse(serializedState);
    } catch {
      return {
        version: 1,
        worldSeed: null,
        chunks: {},
        lastChangedBlock: null,
      };
    }
  }

  getWorldSeed(defaultSeed) {
    if (!this.state.worldSeed) {
      this.state.worldSeed = defaultSeed;
      this.persist();
    }

    return this.state.worldSeed;
  }

  loadChunkEdits(chunkKey) {
    const savedChunk = this.state.chunks[chunkKey];

    if (!savedChunk) {
      return new Map();
    }

    return new Map(savedChunk.edits.map(({ blockKey, blockId }) => [blockKey, blockId]));
  }

  saveChunkEdits(chunkKey, edits) {
    this.state.chunks[chunkKey] = {
      chunkKey,
      edits,
      savedAt: new Date().toISOString(),
    };
    this.persist();
  }

  cacheLastChangedBlock(blockChange) {
    this.state.lastChangedBlock = blockChange;
    this.persist();
  }

  getSavedChunkCount() {
    return Object.keys(this.state.chunks).length;
  }

  serializeWorld() {
    return {
      version: 1,
      worldSeed: this.state.worldSeed,
      savedAt: new Date().toISOString(),
      chunks: this.state.chunks,
    };
  }

  persist() {
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }
}
