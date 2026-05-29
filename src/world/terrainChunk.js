import { BoxGeometry, InstancedMesh, Matrix4 } from 'three';
import { BLOCK_DEFINITIONS, BLOCK_IDS, isGroundColliderBlock, isOccludingBlock, isRenderableBlock, isSolidBlock } from './blockTypes.js';
import { getBlockKey, getWorldCoordinate } from './chunkMath.js';
import { BLOCK_SIZE, CHUNK_SIZE, MIN_GENERATED_Y } from './worldConstants.js';

const sharedGeometry = new BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const animatedBlockIds = new Set([
  BLOCK_IDS.water,
  BLOCK_IDS.grassPlant,
  BLOCK_IDS.campfire,
]);
const animatedMatrix = new Matrix4();

export class TerrainChunk {
  constructor({ chunkX, chunkZ, terrainNoise, natureGenerator, structureGenerator, savedEdits }) {
    this.blocks = new Map();
    this.edits = new Map();
    this.structureMetadata = new Map();
    this.structureRecords = [];
    this.meshes = [];
    this.initialize({ chunkX, chunkZ, terrainNoise, natureGenerator, structureGenerator, savedEdits });
  }

  initialize({ chunkX, chunkZ, terrainNoise, natureGenerator, structureGenerator, savedEdits }) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.key = `${chunkX},${chunkZ}`;
    this.terrainNoise = terrainNoise;
    this.natureGenerator = natureGenerator;
    this.structureGenerator = structureGenerator;
    this.blocks.clear();
    this.edits = new Map(savedEdits);
    this.structureMetadata.clear();
    this.structureRecords = [];
    this.needsMeshRebuild = true;
    this.isLoaded = false;

    this.generate();

    return this;
  }

  generate() {
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
      for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
        const worldX = getWorldCoordinate(this.chunkX, localX);
        const worldZ = getWorldCoordinate(this.chunkZ, localZ);
        const columnProfile = this.terrainNoise.getColumnProfile(worldX, worldZ);
        const surfaceY = columnProfile.surfaceY;

        for (let y = MIN_GENERATED_Y; y <= surfaceY; y += 1) {
          if (!this.terrainNoise.shouldCarveCave(worldX, y, worldZ, surfaceY)) {
            const blockId = this.getGeneratedBlockId(y, surfaceY, columnProfile);
            this.blocks.set(getBlockKey(localX, y, localZ), blockId);
          }
        }

        this.addWater(localX, localZ, columnProfile);
        this.addNature(localX, localZ, worldX, worldZ, columnProfile);
      }
    }

    this.addStructure();
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

  getGeneratedBlockId(y, surfaceY, columnProfile) {
    if (y === surfaceY) {
      return this.terrainNoise.getSurfaceBlockId(columnProfile);
    }

    if (surfaceY - y <= 3) {
      return this.terrainNoise.getSubsurfaceBlockId(columnProfile);
    }

    return BLOCK_IDS.stone;
  }

  addWater(localX, localZ, columnProfile) {
    if (columnProfile.surfaceY < columnProfile.waterLevel) {
      this.blocks.set(getBlockKey(localX, columnProfile.waterLevel, localZ), BLOCK_IDS.water);
    }
  }

  addNature(localX, localZ, worldX, worldZ, columnProfile) {
    const decoration = this.natureGenerator.getDecorationAt(worldX, worldZ, columnProfile);

    this.natureGenerator.placeDecoration({
      decoration,
      localX,
      localZ,
      surfaceY: columnProfile.surfaceY,
      setBlock: (targetLocalX, targetY, targetLocalZ, blockId) => {
        if (
          targetLocalX >= 0 &&
          targetLocalX < CHUNK_SIZE &&
          targetLocalZ >= 0 &&
          targetLocalZ < CHUNK_SIZE
        ) {
          this.blocks.set(getBlockKey(targetLocalX, targetY, targetLocalZ), blockId);
        }
      },
    });
  }

  addStructure() {
    const structure = this.structureGenerator?.getStructureForChunk({
      chunkX: this.chunkX,
      chunkZ: this.chunkZ,
      terrainNoise: this.terrainNoise,
    });

    if (!structure) {
      return;
    }

    this.structureGenerator.placeStructure({
      structure,
      setBlock: (targetLocalX, targetY, targetLocalZ, blockId) => {
        if (
          targetLocalX >= 0 &&
          targetLocalX < CHUNK_SIZE &&
          targetLocalZ >= 0 &&
          targetLocalZ < CHUNK_SIZE
        ) {
          this.blocks.set(getBlockKey(targetLocalX, targetY, targetLocalZ), blockId);
        }
      },
      setMetadata: (blockKey, metadata) => {
        this.structureMetadata.set(blockKey, metadata);
      },
    });
    this.structureRecords.push({
      id: structure.id,
      name: structure.name,
      lootTableId: structure.lootTableId,
    });
  }

  getBlock(localX, y, localZ) {
    return this.blocks.get(getBlockKey(localX, y, localZ)) ?? BLOCK_IDS.air;
  }

  getBlockMetadata(localX, y, localZ) {
    return this.structureMetadata.get(getBlockKey(localX, y, localZ)) ?? null;
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

  getHighestGroundColliderYBelow(localX, localZ, maxTopY) {
    let highestY = null;

    for (const [blockKey, blockId] of this.blocks) {
      if (!isGroundColliderBlock(blockId)) {
        continue;
      }

      const [blockLocalX, blockY, blockLocalZ] = blockKey.split(',').map(Number);

      if (
        blockLocalX === localX &&
        blockLocalZ === localZ &&
        blockY + 1 <= maxTopY &&
        (highestY === null || blockY > highestY)
      ) {
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
      const blockScale = BLOCK_DEFINITIONS[blockId].scale ?? { x: 1, y: 1, z: 1 };

      mesh.name = `Chunk ${this.key} ${BLOCK_DEFINITIONS[blockId].name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.userData.chunk = this;
      mesh.userData.blockId = blockId;
      mesh.userData.blockPositions = blockEntries;
      mesh.userData.blockScale = blockScale;

      for (let index = 0; index < blockEntries.length; index += 1) {
        const block = blockEntries[index];
        matrix.makeScale(blockScale.x, blockScale.y, blockScale.z);
        matrix.setPosition(block.worldX + 0.5, block.y + blockScale.y / 2, block.worldZ + 0.5);
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
      if (!isRenderableBlock(blockId)) {
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

      return !isOccludingBlock(this.getBlock(neighborX, neighborY, neighborZ));
    });
  }

  disposeMeshes(parentGroup) {
    for (const mesh of this.meshes) {
      parentGroup.remove(mesh);
      mesh.dispose();
    }

    this.meshes = [];
  }

  prepareForReuse(parentGroup) {
    this.disposeMeshes(parentGroup);
    this.blocks.clear();
    this.edits.clear();
    this.structureMetadata.clear();
    this.structureRecords = [];
    this.needsMeshRebuild = false;
    this.isLoaded = false;
  }

  serializeEdits() {
    return [...this.edits.entries()].map(([blockKey, blockId]) => ({
      blockKey,
      blockId,
    }));
  }

  updateAnimatedBlocks({ elapsedTime, windStrength = 1 }) {
    let animatedBlocks = 0;

    for (const mesh of this.meshes) {
      const blockId = mesh.userData.blockId;

      if (!mesh.visible || !animatedBlockIds.has(blockId)) {
        continue;
      }

      const blockScale = mesh.userData.blockScale ?? BLOCK_DEFINITIONS[blockId].scale ?? { x: 1, y: 1, z: 1 };
      const blockPositions = mesh.userData.blockPositions ?? [];

      for (let index = 0; index < blockPositions.length; index += 1) {
        const block = blockPositions[index];
        const animation = getBlockAnimation({
          block,
          blockId,
          blockScale,
          elapsedTime,
          windStrength,
        });

        animatedMatrix.makeScale(animation.scale.x, animation.scale.y, animation.scale.z);
        animatedMatrix.setPosition(animation.position.x, animation.position.y, animation.position.z);
        mesh.setMatrixAt(index, animatedMatrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      animatedBlocks += blockPositions.length;
    }

    return animatedBlocks;
  }
}

function getBlockAnimation({ block, blockId, blockScale, elapsedTime, windStrength }) {
  const phase = elapsedTime + block.worldX * 0.41 + block.worldZ * 0.33;
  const position = {
    x: block.worldX + 0.5,
    y: block.y + blockScale.y / 2,
    z: block.worldZ + 0.5,
  };
  const scale = {
    x: blockScale.x,
    y: blockScale.y,
    z: blockScale.z,
  };

  if (blockId === BLOCK_IDS.grassPlant) {
    const sway = Math.sin(phase * 2.2) * 0.055 * windStrength;

    position.x += sway;
    position.z += Math.cos(phase * 1.6) * 0.025 * windStrength;
    scale.y *= 0.96 + Math.sin(phase * 1.8) * 0.035;
  } else if (blockId === BLOCK_IDS.water) {
    const wave = Math.sin(phase * 1.45) * 0.5 + 0.5;

    position.y += wave * 0.055;
    scale.y *= 0.94 + wave * 0.08;
  } else if (blockId === BLOCK_IDS.campfire) {
    const pulse = Math.sin(phase * 5.8) * 0.5 + 0.5;

    position.y += pulse * 0.035;
    scale.y *= 0.9 + pulse * 0.24;
  }

  position.y = block.y + scale.y / 2 + (position.y - (block.y + blockScale.y / 2));

  return { position, scale };
}
