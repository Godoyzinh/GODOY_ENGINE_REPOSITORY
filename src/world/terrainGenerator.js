import { Group } from 'three';
import { ChunkManager } from './chunkManager.js';
import { TerrainNoise } from './terrainNoise.js';

export class TerrainGenerator {
  constructor({ saveSystem }) {
    this.group = new Group();
    this.group.name = 'TerrainGenerator';
    this.terrainNoise = new TerrainNoise();
    this.chunkManager = new ChunkManager({
      group: this.group,
      terrainNoise: this.terrainNoise,
      saveSystem,
    });
    this.stats = this.chunkManager.stats;
  }

  update({ focusPosition, camera }) {
    this.chunkManager.update({ focusPosition, camera });
    this.stats = this.chunkManager.stats;
  }

  getHeightAt(x, z) {
    return this.chunkManager.getHeightAt(x, z);
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
}
