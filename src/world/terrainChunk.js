import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three';
import { BLOCK_DEFINITIONS, BLOCK_IDS, isSolidBlock } from './blockTypes.js';
import { getBlockKey, getWorldCoordinate } from './chunkMath.js';
import { BLOCK_SIZE, CHUNK_SIZE, MIN_GENERATED_Y } from './worldConstants.js';

const sharedGeometry = new BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

export class TerrainChunk {
  constructor({ chunkX, chunkZ, terrainNoise, savedEdits }) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.key = `${chunkX},${chunkZ}`;
    this.terrainNoise = terrainNoise;
    this.blocks = new Map();
    this.edits = new Map(savedEdits);
    this.meshes = [];
    this.needsMeshRebuild = true;
    this.isLoaded = false;

    this.generate();
  }

  generate() {
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const worldX = getWorldCoordinate(this.chunkX, localX);
        const worldZ = getWorldCoordinate(this.chunkZ, localZ);
        const surfaceY = this.terrainNoise.getHeightAt(worldX, worldZ);

        for (let y = MIN_GENERATED_Y; y <= surfaceY; y += 1) {
          const blockId = this.getGeneratedBlockId(y, surfaceY);
          this.blocks.set(getBlockKey(localX, y, localZ), blockId);
        }
      }
    }

    this.applySavedEdits();
  }

  applySavedEdits() {
    for (const [blockKey, blockId] of this.edits) {
      if (blockId === BLOCK_IDS.air) {
        this.blocks.delete(blockKey);
      } else {
        this.blocks.set(blockKey, blockId);
      }
    }
  }

  getGeneratedBlockId(y, surfaceY) {
    if (y === surfaceY) {
      return this.terrainNoise.getSurfaceBlockId(surfaceY);
    }

    if (surfaceY - y <= 3) {
      return BLOCK_IDS.dirt;
    }

    return BLOCK_IDS.stone;
  }

  getBlock(localX, y, localZ) {
    return this.blocks.get(getBlockKey(localX, y, localZ)) ?? BLOCK_IDS.air;
  }

  setBlock(localX, y, localZ, blockId) {
    const blockKey = getBlockKey(localX, y, localZ);

    if (blockId === BLOCK_IDS.air) {
      this.blocks.delete(blockKey);
    } else {
      this.blocks.set(blockKey, blockId);
    }

    this.edits.set(blockKey, blockId);
    this.needsMeshRebuild = true;
  }

  getHighestSolidY(localX, localZ) {
    let highestY = MIN_GENERATED_Y;

    for (const [blockKey, blockId] of this.blocks) {
      if (!isSolidBlock(blockId)) {
        continue;
      }

      const [blockLocalX, blockY, blockLocalZ] = blockKey.split(',').map(Number);

      if (blockLocalX === localX && blockLocalZ === localZ && blockY > highestY) {
        highestY = blockY;
      }
    }

    return highestY;
  }

  rebuildMeshes({ materials, parentGroup }) {
    this.disposeMeshes(parentGroup);

    const blockEntriesByType = this.collectVisibleBlocksByType();

    for (const [blockIdText, blockEntries] of blockEntriesByType) {
      const blockId = Number(blockIdText);
      const mesh = new InstancedMesh(sharedGeometry, materials.get(blockId), blockEntries.length);
      const matrix = new Matrix4();

      mesh.name = `Chunk ${this.key} ${BLOCK_DEFINITIONS[blockId].name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.userData.chunk = this;
      mesh.userData.blockId = blockId;
      mesh.userData.blockPositions = blockEntries;

      for (let index = 0; index < blockEntries.length; index += 1) {
        const block = blockEntries[index];
        matrix.makeTranslation(block.worldX + 0.5, block.y + 0.5, block.worldZ + 0.5);
        mesh.setMatrixAt(index, matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      this.meshes.push(mesh);
      parentGroup.add(mesh);
    }

    this.isLoaded = true;
    this.needsMeshRebuild = false;
  }

  collectVisibleBlocksByType() {
    const blockEntriesByType = new Map();

    for (const [blockKey, blockId] of this.blocks) {
      if (!isSolidBlock(blockId)) {
        continue;
      }

      const [localX, y, localZ] = blockKey.split(',').map(Number);

      if (!this.isBlockVisible(localX, y, localZ)) {
        continue;
      }

      if (!blockEntriesByType.has(blockId)) {
        blockEntriesByType.set(blockId, []);
      }

      blockEntriesByType.get(blockId).push({
        localX,
        y,
        localZ,
        worldX: getWorldCoordinate(this.chunkX, localX),
        worldZ: getWorldCoordinate(this.chunkZ, localZ),
      });
    }

    return blockEntriesByType;
  }

  isBlockVisible(localX, y, localZ) {
    const neighbors = [
      [localX + 1, y, localZ],
      [localX - 1, y, localZ],
      [localX, y + 1, localZ],
      [localX, y - 1, localZ],
      [localX, y, localZ + 1],
      [localX, y, localZ - 1],
    ];

    return neighbors.some(([neighborX, neighborY, neighborZ]) => {
      if (neighborX < 0 || neighborX >= CHUNK_SIZE || neighborZ < 0 || neighborZ >= CHUNK_SIZE) {
        return true;
      }

      return !isSolidBlock(this.getBlock(neighborX, neighborY, neighborZ));
    });
  }

  disposeMeshes(parentGroup) {
    for (const mesh of this.meshes) {
      parentGroup.remove(mesh);
      mesh.dispose();
    }

    this.meshes = [];
  }

  serializeEdits() {
    return [...this.edits.entries()].map(([blockKey, blockId]) => ({
      blockKey,
      blockId,
    }));
  }
}
