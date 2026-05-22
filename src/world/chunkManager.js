import { Frustum, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { BLOCK_DEFINITIONS, BLOCK_IDS } from './blockTypes.js';
import {
  getBlockKeyFromWorldPosition,
  getChunkCoordinate,
  getChunkKey,
  getChunkKeyFromWorldPosition,
  getLocalCoordinate,
  parseChunkKey,
} from './chunkMath.js';
import { TerrainChunk } from './terrainChunk.js';
import {
  CHUNK_LOAD_RADIUS,
  CHUNK_SIZE,
  CHUNK_UNLOAD_RADIUS,
  MAX_CHUNK_LOADS_PER_FRAME,
  MAX_CHUNK_UNLOADS_PER_FRAME,
} from './worldConstants.js';

const reusableVector = new Vector3();

export class ChunkManager {
  constructor({ group, terrainNoise, natureGenerator, saveSystem }) {
    this.group = group;
    this.terrainNoise = terrainNoise;
    this.natureGenerator = natureGenerator;
    this.saveSystem = saveSystem;
    this.chunks = new Map();
    this.chunkPool = [];
    this.loadQueue = [];
    this.generationQueue = [];
    this.unloadQueue = [];
    this.materials = this.createMaterials();
    this.lastFocusChunkKey = null;
    this.frustum = new Frustum();
    this.projectionMatrix = new Matrix4();
    this.stats = {
      chunksLoaded: 0,
      chunksQueued: 0,
      chunksVisible: 0,
      chunkRegistrySize: 0,
      blocksVisible: 0,
      savedChunks: 0,
      pooledChunks: 0,
      worldSeed: terrainNoise.seed,
      activeBiome: 'Plains',
    };
  }

  update({ focusPosition, camera }) {
    this.updateChunkQueues(focusPosition);
    this.processQueues();
    this.rebuildDirtyChunks();
    this.updateVisibility(camera);
    this.updateActiveBiome(focusPosition);
    this.updateStats();
  }

  updateChunkQueues(focusPosition) {
    const focusChunkX = getChunkCoordinate(focusPosition.x);
    const focusChunkZ = getChunkCoordinate(focusPosition.z);
    const focusChunkKey = getChunkKey(focusChunkX, focusChunkZ);

    if (focusChunkKey === this.lastFocusChunkKey) {
      return;
    }

    this.lastFocusChunkKey = focusChunkKey;
    for (let offsetZ = -CHUNK_LOAD_RADIUS; offsetZ <= CHUNK_LOAD_RADIUS; offsetZ += 1) {
      for (let offsetX = -CHUNK_LOAD_RADIUS; offsetX <= CHUNK_LOAD_RADIUS; offsetX += 1) {
        const chunkX = focusChunkX + offsetX;
        const chunkZ = focusChunkZ + offsetZ;
        const chunkKey = getChunkKey(chunkX, chunkZ);

        if (!this.chunks.has(chunkKey) && !this.loadQueue.includes(chunkKey)) {
          this.loadQueue.push(chunkKey);
        }
      }
    }

    for (const chunkKey of this.chunks.keys()) {
      const { chunkX, chunkZ } = parseChunkKey(chunkKey);
      const distanceX = Math.abs(chunkX - focusChunkX);
      const distanceZ = Math.abs(chunkZ - focusChunkZ);

      if (
        (distanceX > CHUNK_UNLOAD_RADIUS || distanceZ > CHUNK_UNLOAD_RADIUS) &&
        !this.unloadQueue.includes(chunkKey)
      ) {
        this.unloadQueue.push(chunkKey);
      }
    }

    this.loadQueue.sort((leftKey, rightKey) => {
      const left = parseChunkKey(leftKey);
      const right = parseChunkKey(rightKey);
      const leftDistance = Math.hypot(left.chunkX - focusChunkX, left.chunkZ - focusChunkZ);
      const rightDistance = Math.hypot(right.chunkX - focusChunkX, right.chunkZ - focusChunkZ);

      return leftDistance - rightDistance;
    });
  }

  processQueues() {
    for (let count = 0; count < MAX_CHUNK_LOADS_PER_FRAME && this.loadQueue.length > 0; count += 1) {
      const chunkKey = this.loadQueue.shift();

      if (!this.chunks.has(chunkKey) && !this.generationQueue.includes(chunkKey)) {
        this.generationQueue.push(chunkKey);
      }
    }

    for (let count = 0; count < MAX_CHUNK_LOADS_PER_FRAME && this.generationQueue.length > 0; count += 1) {
      const chunkKey = this.generationQueue.shift();

      if (!this.chunks.has(chunkKey)) {
        this.loadChunk(chunkKey);
      }
    }

    for (let count = 0; count < MAX_CHUNK_UNLOADS_PER_FRAME && this.unloadQueue.length > 0; count += 1) {
      const chunkKey = this.unloadQueue.shift();
      this.unloadChunk(chunkKey);
    }
  }

  loadChunk(chunkKey) {
    const { chunkX, chunkZ } = parseChunkKey(chunkKey);
    const savedEdits = this.saveSystem.loadChunkEdits(chunkKey);
    const chunk = this.acquireChunk({
      chunkX,
      chunkZ,
      terrainNoise: this.terrainNoise,
      natureGenerator: this.natureGenerator,
      savedEdits,
    });

    this.chunks.set(chunkKey, chunk);
  }

  unloadChunk(chunkKey) {
    const chunk = this.chunks.get(chunkKey);

    if (!chunk) {
      return;
    }

    chunk.prepareForReuse(this.group);
    this.chunks.delete(chunkKey);
    this.chunkPool.push(chunk);
  }

  acquireChunk(chunkOptions) {
    const pooledChunk = this.chunkPool.pop();

    if (pooledChunk) {
      return pooledChunk.initialize(chunkOptions);
    }

    return new TerrainChunk(chunkOptions);
  }

  rebuildDirtyChunks() {
    for (const chunk of this.chunks.values()) {
      if (chunk.needsMeshRebuild) {
        chunk.rebuildMeshes({
          materials: this.materials,
          parentGroup: this.group,
        });
      }
    }
  }

  updateVisibility(camera) {
    camera.updateMatrixWorld();
    this.projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionMatrix);

    let chunksVisible = 0;

    for (const chunk of this.chunks.values()) {
      let chunkVisible = false;

      for (const mesh of chunk.meshes) {
        mesh.visible = this.frustum.intersectsObject(mesh);
        chunkVisible = chunkVisible || mesh.visible;
      }

      if (chunkVisible) {
        chunksVisible += 1;
      }
    }

    this.stats.chunksVisible = chunksVisible;
  }

  getHeightAt(worldX, worldZ) {
    const chunkKey = getChunkKey(getChunkCoordinate(worldX), getChunkCoordinate(worldZ));
    const chunk = this.chunks.get(chunkKey);

    if (!chunk) {
      return this.terrainNoise.getHeightAt(worldX, worldZ) + 1;
    }

    return chunk.getHighestSolidY(getLocalCoordinate(worldX), getLocalCoordinate(worldZ)) + 1;
  }

  getRaycastTargets() {
    return [...this.chunks.values()].flatMap((chunk) => chunk.meshes);
  }

  getBlockFromIntersection(intersection) {
    const mesh = intersection.object;
    const block = mesh.userData.blockPositions?.[intersection.instanceId];

    if (!block) {
      return null;
    }

    return {
      ...block,
      chunk: mesh.userData.chunk,
      blockId: mesh.userData.blockId,
    };
  }

  setBlockAtWorldPosition(worldX, worldY, worldZ, blockId) {
    const chunkKey = getChunkKeyFromWorldPosition({ x: worldX, z: worldZ });
    const chunk = this.chunks.get(chunkKey);

    if (!chunk) {
      return false;
    }

    const localX = getLocalCoordinate(worldX);
    const localZ = getLocalCoordinate(worldZ);
    const blockKey = getBlockKeyFromWorldPosition(worldX, worldY, worldZ);

    chunk.setBlock(localX, Math.floor(worldY), localZ, blockId);
    this.saveSystem.saveChunkEdits(chunk.key, chunk.serializeEdits());
    this.markNeighborChunksDirty(localX, localZ, chunk);
    this.saveSystem.cacheLastChangedBlock({
      chunkKey: chunk.key,
      blockKey,
      blockId,
    });

    return true;
  }

  markNeighborChunksDirty(localX, localZ, chunk) {
    const neighborOffsets = [];

    if (localX === 0) {
      neighborOffsets.push([-1, 0]);
    } else if (localX === CHUNK_SIZE - 1) {
      neighborOffsets.push([1, 0]);
    }

    if (localZ === 0) {
      neighborOffsets.push([0, -1]);
    } else if (localZ === CHUNK_SIZE - 1) {
      neighborOffsets.push([0, 1]);
    }

    for (const [offsetX, offsetZ] of neighborOffsets) {
      const neighborKey = getChunkKey(chunk.chunkX + offsetX, chunk.chunkZ + offsetZ);
      const neighbor = this.chunks.get(neighborKey);

      if (neighbor) {
        neighbor.needsMeshRebuild = true;
      }
    }
  }

  createMaterials() {
    const materials = new Map();

    for (const blockDefinition of Object.values(BLOCK_DEFINITIONS)) {
      if (blockDefinition.id === BLOCK_IDS.air) {
        continue;
      }

      materials.set(
        blockDefinition.id,
        new MeshStandardMaterial({
          color: blockDefinition.color,
          opacity: blockDefinition.opacity ?? 1,
          transparent: blockDefinition.transparent,
          depthWrite: !blockDefinition.transparent,
          roughness: 0.88,
          metalness: 0,
        }),
      );
    }

    return materials;
  }

  updateStats() {
    let blocksVisible = 0;

    for (const chunk of this.chunks.values()) {
      for (const mesh of chunk.meshes) {
        if (mesh.visible) {
          blocksVisible += mesh.count;
        }
      }
    }

    this.stats.chunksLoaded = this.chunks.size;
    this.stats.chunksQueued = this.loadQueue.length + this.generationQueue.length + this.unloadQueue.length;
    this.stats.chunkRegistrySize = this.chunks.size;
    this.stats.blocksVisible = blocksVisible;
    this.stats.savedChunks = this.saveSystem.getSavedChunkCount();
    this.stats.pooledChunks = this.chunkPool.length;
  }

  getFocusChunk(position) {
    reusableVector.copy(position);

    return getChunkKeyFromWorldPosition(reusableVector);
  }

  updateActiveBiome(position) {
    this.stats.activeBiome = this.terrainNoise.getBiomeAt(position.x, position.z).name;
  }
}
