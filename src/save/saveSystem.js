export class SaveSystem {
  constructor({ storage = window.localStorage, storageKey = 'godoyEngine.world.v1' } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.state = this.normalizeState(this.loadState());
  }

  loadState() {
    const serializedState = this.storage.getItem(this.storageKey);

    if (!serializedState) {
      return createEmptyState();
    }

    try {
      return JSON.parse(serializedState);
    } catch {
      return createEmptyState();
    }
  }

  normalizeState(state) {
    const sourceState = state ?? createEmptyState();

    return {
      ...createEmptyState(),
      ...sourceState,
      version: 2,
      chunks: sourceState.chunks ?? {},
      entities: sourceState.entities ?? {},
      chests: sourceState.chests ?? {},
      furnaces: sourceState.furnaces ?? {},
      weather: sourceState.weather ?? null,
      worldSimulation: sourceState.worldSimulation ?? null,
      structurePlacements: sourceState.structurePlacements ?? [],
      saveMetrics: sourceState.saveMetrics ?? createEmptySaveMetrics(),
    };
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
      compression: prepareCompressedChunkEdits(edits),
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

  getChestId({ worldX, y, worldZ }) {
    return `${Math.floor(worldX)},${Math.floor(y)},${Math.floor(worldZ)}`;
  }

  loadChestState(chestId) {
    return this.state.chests[chestId] ?? null;
  }

  saveChestState(chestId, chestState) {
    this.state.chests[chestId] = {
      id: chestId,
      ...chestState,
      savedAt: new Date().toISOString(),
    };
    this.persist();
  }

  markChestLooted({ chestId, lootStacks }) {
    this.saveChestState(chestId, {
      generatedLoot: lootStacks,
      isLooted: true,
    });
  }

  loadFurnaceState() {
    return this.state.furnaces.global ?? null;
  }

  saveFurnaceState(furnaceState) {
    this.state.furnaces.global = {
      ...furnaceState,
      savedAt: new Date().toISOString(),
    };
  }

  loadWeatherState() {
    return this.state.weather;
  }

  saveWeatherState(weatherState) {
    this.state.weather = {
      ...weatherState,
      savedAt: new Date().toISOString(),
    };
  }

  loadEntityStates() {
    return Object.values(this.state.entities);
  }

  saveEntityStates(entityStates) {
    this.state.entities = Object.fromEntries(entityStates.map((entityState) => [entityState.id, entityState]));
  }

  loadWorldSimulationState() {
    return this.state.worldSimulation;
  }

  saveWorldSimulationState(worldSimulationState) {
    this.state.worldSimulation = {
      ...worldSimulationState,
      savedAt: new Date().toISOString(),
    };
  }

  recordStructurePlacement(structurePlacement) {
    if (!structurePlacement) {
      return;
    }

    this.state.structurePlacements.push({
      ...structurePlacement,
      id: `structure-${this.state.structurePlacements.length + 1}`,
    });
    this.persist();
  }

  loadStructurePlacements() {
    return [...this.state.structurePlacements];
  }

  flushSimulationState({
    entityStates,
    furnaceState,
    weatherState,
    worldSimulationState,
  }) {
    this.saveEntityStates(entityStates);
    this.saveFurnaceState(furnaceState);
    this.saveWeatherState(weatherState);
    this.saveWorldSimulationState(worldSimulationState);
    this.persist();
  }

  getPersistenceStats() {
    const serializedState = JSON.stringify(this.state);
    const compressedChunkCandidates = Object.values(this.state.chunks)
      .filter((chunk) => chunk.compression?.ready === true).length;

    return {
      savedChunks: this.getSavedChunkCount(),
      persistedEntities: Object.keys(this.state.entities).length,
      persistedChests: Object.keys(this.state.chests).length,
      persistedFurnaces: Object.keys(this.state.furnaces).length,
      structurePlacements: this.state.structurePlacements.length,
      saveSizeBytes: serializedState.length,
      saveSizeKb: serializedState.length / 1024,
      compressedChunkCandidates,
      weatherState: this.state.weather?.state ?? 'none',
      worldSimulationSaved: this.state.worldSimulation !== null,
    };
  }

  serializeWorld() {
    return {
      version: this.state.version,
      worldSeed: this.state.worldSeed,
      savedAt: new Date().toISOString(),
      chunks: this.state.chunks,
      entities: this.state.entities,
      chests: this.state.chests,
      furnaces: this.state.furnaces,
      weather: this.state.weather,
      worldSimulation: this.state.worldSimulation,
      structurePlacements: this.state.structurePlacements,
    };
  }

  persist() {
    this.state.saveMetrics = this.getPersistenceStats();
    this.storage.setItem(this.storageKey, JSON.stringify(this.state));
  }
}

function createEmptyState() {
  return {
    version: 2,
    worldSeed: null,
    chunks: {},
    entities: {},
    chests: {},
    furnaces: {},
    weather: null,
    worldSimulation: null,
    structurePlacements: [],
    lastChangedBlock: null,
    saveMetrics: createEmptySaveMetrics(),
  };
}

function createEmptySaveMetrics() {
  return {
    savedChunks: 0,
    persistedEntities: 0,
    persistedChests: 0,
    persistedFurnaces: 0,
    structurePlacements: 0,
    saveSizeBytes: 0,
    saveSizeKb: 0,
    compressedChunkCandidates: 0,
    weatherState: 'none',
    worldSimulationSaved: false,
  };
}

function prepareCompressedChunkEdits(edits) {
  const palette = [...new Set(edits.map((edit) => edit.blockId))];

  return {
    ready: edits.length > 0,
    format: 'palette-index-prep',
    palette,
    editCount: edits.length,
  };
}
