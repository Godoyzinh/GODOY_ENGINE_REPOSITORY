import { getBlockKey, getWorldCoordinate } from './chunkMath.js';
import { CHUNK_SIZE } from './worldConstants.js';
import { BLOCK_IDS } from './blockTypes.js';
import {
  STRUCTURE_DEFINITIONS,
  STRUCTURE_IDS,
  getStructureDefinitionsForBiome,
} from './structureRegistry.js';

const SPAWN_PROTECTION_RADIUS_BLOCKS = 28;
const MAX_FOOTPRINT_HEIGHT_DELTA = 3;

export class StructureGenerator {
  constructor({ worldSeed }) {
    this.worldSeed = worldSeed;
  }

  getStructureForChunk({ chunkX, chunkZ, terrainNoise }) {
    if (isSpawnProtectedChunk(chunkX, chunkZ)) {
      return null;
    }

    const spawnRoll = randomFromSeed(`${this.worldSeed}:structure:${chunkX},${chunkZ}`);
    const typeRoll = randomFromSeed(`${this.worldSeed}:structure-type:${chunkX},${chunkZ}`);
    const localX = 4 + Math.floor(randomFromSeed(`${this.worldSeed}:sx:${chunkX},${chunkZ}`) * 6);
    const localZ = 4 + Math.floor(randomFromSeed(`${this.worldSeed}:sz:${chunkX},${chunkZ}`) * 6);
    const worldX = getWorldCoordinate(chunkX, localX);
    const worldZ = getWorldCoordinate(chunkZ, localZ);

    if (Math.hypot(worldX, worldZ) < SPAWN_PROTECTION_RADIUS_BLOCKS) {
      return null;
    }

    const biome = terrainNoise.getBiomeAt(worldX, worldZ);
    const structureDefinition = chooseStructureForBiome({ biomeId: biome.id, roll: typeRoll });

    if (!structureDefinition || spawnRoll > structureDefinition.chance) {
      return null;
    }

    const footprint = this.getFootprint({
      chunkX,
      chunkZ,
      localX,
      localZ,
      definition: structureDefinition,
      terrainNoise,
    });

    if (!footprint.isSafe) {
      return null;
    }

    return {
      id: structureDefinition.id,
      name: structureDefinition.name,
      lootTableId: structureDefinition.lootTableId,
      localX,
      localZ,
      baseY: footprint.baseY,
      footprint,
    };
  }

  getFootprint({ chunkX, chunkZ, localX, localZ, definition, terrainNoise }) {
    const cells = [];
    const halfWidth = Math.floor(definition.footprint.width / 2);
    const halfDepth = Math.floor(definition.footprint.depth / 2);
    let minimumSurfaceY = Infinity;
    let maximumSurfaceY = -Infinity;

    for (let zOffset = -halfDepth; zOffset <= halfDepth; zOffset += 1) {
      for (let xOffset = -halfWidth; xOffset <= halfWidth; xOffset += 1) {
        const targetLocalX = localX + xOffset;
        const targetLocalZ = localZ + zOffset;

        if (
          targetLocalX < 1 ||
          targetLocalX >= CHUNK_SIZE - 1 ||
          targetLocalZ < 1 ||
          targetLocalZ >= CHUNK_SIZE - 1
        ) {
          return { isSafe: false, cells: [], baseY: 0 };
        }

        const worldX = getWorldCoordinate(chunkX, targetLocalX);
        const worldZ = getWorldCoordinate(chunkZ, targetLocalZ);
        const columnProfile = terrainNoise.getColumnProfile(worldX, worldZ);

        if (columnProfile.surfaceY <= columnProfile.waterLevel) {
          return { isSafe: false, cells: [], baseY: 0 };
        }

        minimumSurfaceY = Math.min(minimumSurfaceY, columnProfile.surfaceY);
        maximumSurfaceY = Math.max(maximumSurfaceY, columnProfile.surfaceY);
        cells.push({
          localX: targetLocalX,
          localZ: targetLocalZ,
          surfaceY: columnProfile.surfaceY,
        });
      }
    }

    if (maximumSurfaceY - minimumSurfaceY > MAX_FOOTPRINT_HEIGHT_DELTA) {
      return { isSafe: false, cells: [], baseY: 0 };
    }

    return {
      isSafe: true,
      cells,
      baseY: maximumSurfaceY + 1,
    };
  }

  placeStructure({ structure, setBlock, setMetadata }) {
    if (!structure) {
      return;
    }

    this.prepareFoundation({ structure, setBlock });

    if (structure.id === STRUCTURE_IDS.village) {
      this.placeVillageHut({ structure, setBlock, setMetadata });
    } else if (structure.id === STRUCTURE_IDS.ruin) {
      this.placeRuin({ structure, setBlock, setMetadata });
    } else if (structure.id === STRUCTURE_IDS.camp) {
      this.placeCamp({ structure, setBlock, setMetadata });
    }
  }

  prepareFoundation({ structure, setBlock }) {
    for (const cell of structure.footprint.cells) {
      for (let y = cell.surfaceY + 1; y <= structure.baseY; y += 1) {
        setBlock(cell.localX, y, cell.localZ, BLOCK_IDS.dirt);
      }
    }
  }

  placeVillageHut({ structure, setBlock, setMetadata }) {
    const { localX, localZ, baseY } = structure;

    this.fillRect({ setBlock, centerX: localX, centerZ: localZ, y: baseY, radiusX: 2, radiusZ: 2, blockId: BLOCK_IDS.planks });
    this.placeWalls({ setBlock, centerX: localX, centerZ: localZ, y: baseY + 1, radiusX: 2, radiusZ: 2, blockId: BLOCK_IDS.wood });
    this.fillRect({ setBlock, centerX: localX, centerZ: localZ, y: baseY + 3, radiusX: 2, radiusZ: 2, blockId: BLOCK_IDS.planks });
    this.placeChest({ structure, localX: localX + 1, y: baseY + 1, localZ: localZ + 1, setBlock, setMetadata });
    setBlock(localX - 1, baseY + 1, localZ + 1, BLOCK_IDS.furnace);
  }

  placeRuin({ structure, setBlock, setMetadata }) {
    const { localX, localZ, baseY } = structure;

    this.fillRect({ setBlock, centerX: localX, centerZ: localZ, y: baseY, radiusX: 2, radiusZ: 2, blockId: BLOCK_IDS.sandstone });
    this.placePartialWalls({ setBlock, centerX: localX, centerZ: localZ, y: baseY + 1, radiusX: 2, radiusZ: 2, blockId: BLOCK_IDS.sandstone });
    setBlock(localX - 2, baseY + 1, localZ - 1, BLOCK_IDS.ironOre);
    setBlock(localX + 2, baseY + 1, localZ + 1, BLOCK_IDS.ironOre);
    this.placeChest({ structure, localX, y: baseY + 1, localZ, setBlock, setMetadata });
  }

  placeCamp({ structure, setBlock, setMetadata }) {
    const { localX, localZ, baseY } = structure;

    setBlock(localX, baseY, localZ, BLOCK_IDS.campfire);
    setBlock(localX - 1, baseY, localZ, BLOCK_IDS.wood);
    setBlock(localX + 1, baseY, localZ, BLOCK_IDS.wood);
    setBlock(localX, baseY, localZ - 1, BLOCK_IDS.wood);
    this.placeChest({ structure, localX: localX + 1, y: baseY, localZ: localZ + 1, setBlock, setMetadata });
  }

  fillRect({ setBlock, centerX, centerZ, y, radiusX, radiusZ, blockId }) {
    for (let zOffset = -radiusZ; zOffset <= radiusZ; zOffset += 1) {
      for (let xOffset = -radiusX; xOffset <= radiusX; xOffset += 1) {
        setBlock(centerX + xOffset, y, centerZ + zOffset, blockId);
      }
    }
  }

  placeWalls({ setBlock, centerX, centerZ, y, radiusX, radiusZ, blockId }) {
    for (let zOffset = -radiusZ; zOffset <= radiusZ; zOffset += 1) {
      for (let xOffset = -radiusX; xOffset <= radiusX; xOffset += 1) {
        const isWall = Math.abs(xOffset) === radiusX || Math.abs(zOffset) === radiusZ;
        const isDoor = xOffset === 0 && zOffset === radiusZ;

        if (isWall && !isDoor) {
          setBlock(centerX + xOffset, y, centerZ + zOffset, blockId);
          setBlock(centerX + xOffset, y + 1, centerZ + zOffset, blockId);
        }
      }
    }
  }

  placePartialWalls({ setBlock, centerX, centerZ, y, radiusX, radiusZ, blockId }) {
    const wallCells = [
      [-radiusX, -radiusZ],
      [-radiusX + 1, -radiusZ],
      [radiusX, radiusZ],
      [radiusX - 1, radiusZ],
      [-radiusX, 0],
      [radiusX, 0],
    ];

    for (const [xOffset, zOffset] of wallCells) {
      setBlock(centerX + xOffset, y, centerZ + zOffset, blockId);
      setBlock(centerX + xOffset, y + 1, centerZ + zOffset, blockId);
    }
  }

  placeChest({ structure, localX, y, localZ, setBlock, setMetadata }) {
    setBlock(localX, y, localZ, BLOCK_IDS.lootChest);
    setMetadata(getBlockKey(localX, y, localZ), {
      structureId: structure.id,
      structureName: structure.name,
      lootTableId: structure.lootTableId,
    });
  }
}

function chooseStructureForBiome({ biomeId, roll }) {
  const definitions = getStructureDefinitionsForBiome(biomeId);

  if (definitions.length === 0) {
    return null;
  }

  const sortedDefinitions = definitions.sort((left, right) => left.chance - right.chance);
  const index = Math.min(sortedDefinitions.length - 1, Math.floor(roll * sortedDefinitions.length));

  return sortedDefinitions[index];
}

function isSpawnProtectedChunk(chunkX, chunkZ) {
  return Math.abs(chunkX) <= 1 && Math.abs(chunkZ) <= 1;
}

function randomFromSeed(seed) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}
