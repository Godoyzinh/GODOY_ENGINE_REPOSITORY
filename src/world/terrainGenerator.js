import { Group } from 'three';
import { ChunkManager } from './chunkManager.js';
import { NatureGenerator } from './natureGenerator.js';
import { PerlinNoise } from './perlinNoise.js';
import { StructureGenerator } from './structureGenerator.js';
import { TerrainNoise } from './terrainNoise.js';
import { DEFAULT_WORLD_SEED } from './worldConstants.js';

export class TerrainGenerator {
  constructor({ saveSystem, settingsSnapshot = null }) {
    this.group = new Group();
    this.group.name = 'TerrainGenerator';
    this.worldSeed = saveSystem.getWorldSeed(DEFAULT_WORLD_SEED);
    this.terrainNoise = new TerrainNoise({ seed: this.worldSeed });
    this.natureGenerator = new NatureGenerator({
      noise: new PerlinNoise(`${this.worldSeed}:nature`),
    });
    this.structureGenerator = new StructureGenerator({
      worldSeed: this.worldSeed,
    });
    this.chunkManager = new ChunkManager({
      group: this.group,
      terrainNoise: this.terrainNoise,
      natureGenerator: this.natureGenerator,
      structureGenerator: this.structureGenerator,
      saveSystem,
    });
    if (settingsSnapshot) {
      this.chunkManager.applySettings(settingsSnapshot);
    }
    this.stats = this.chunkManager.stats;
  }

  update({ focusPosition, camera, elapsedTime = 0, weatherSnapshot = null }) {
    this.chunkManager.update({
      focusPosition,
      camera,
      elapsedTime,
      weatherSnapshot,
    });
    this.stats = this.chunkManager.stats;
  }

  getHeightAt(x, z) {
    return this.chunkManager.getHeightAt(x, z);
  }

  getGroundHeightAt(x, z, options) {
    return this.chunkManager.getGroundHeightAt(x, z, options);
  }

  getBiomeAt(x, z) {
    return this.chunkManager.getBiomeAt(x, z);
  }

  getRaycastTargets() {
    return this.chunkManager.getRaycastTargets();
  }

  getBlockFromIntersection(intersection) {
    return this.chunkManager.getBlockFromIntersection(intersection);
  }

  setBlockAtWorldPosition(worldX, worldY, worldZ, blockId) {
    return this.chunkManager.setBlockAtWorldPosition(worldX, worldY, worldZ, blockId);
  }

  setBlocksAtWorldPositions(blockPlacements) {
    return this.chunkManager.setBlocksAtWorldPositions(blockPlacements);
  }

  getBlockAtWorldPosition(worldX, worldY, worldZ) {
    return this.chunkManager.getBlockAtWorldPosition(worldX, worldY, worldZ);
  }

  isWorldPositionLoaded(worldX, worldZ) {
    return this.chunkManager.isWorldPositionLoaded(worldX, worldZ);
  }

  getReplicationSnapshot() {
    return {
      stats: this.stats,
      loadedChunkKeys: this.chunkManager.getLoadedChunkKeys(),
    };
  }

  applySettings(settingsSnapshot) {
    this.chunkManager.applySettings(settingsSnapshot);
    this.stats = this.chunkManager.stats;
  }
}
