import { BLOCK_IDS } from '../world/blockTypes.js';
import { rotateOffset, serializePlacementPlan } from '../building/placementHelpers.js';

export const PREFAB_IDS = {
  campKit: 'campKit',
  starterHut: 'starterHut',
  ruinArch: 'ruinArch',
};

export const PREFAB_DEFINITIONS = {
  [PREFAB_IDS.campKit]: {
    id: PREFAB_IDS.campKit,
    name: 'Camp Kit',
    category: 'structure',
    author: 'Godoy Engine',
    tags: ['survival', 'camp', 'starter'],
    thumbnailHint: 'campfire with wood seats',
    blocks: [
      { x: 0, y: 0, z: 0, blockId: BLOCK_IDS.campfire },
      { x: -1, y: 0, z: 0, blockId: BLOCK_IDS.wood },
      { x: 1, y: 0, z: 0, blockId: BLOCK_IDS.wood },
      { x: 0, y: 0, z: -1, blockId: BLOCK_IDS.wood },
      { x: 1, y: 0, z: 1, blockId: BLOCK_IDS.lootChest },
    ],
  },
  [PREFAB_IDS.starterHut]: {
    id: PREFAB_IDS.starterHut,
    name: 'Starter Hut',
    category: 'structure',
    author: 'Godoy Engine',
    tags: ['building', 'house', 'wood'],
    thumbnailHint: 'small plank shelter',
    blocks: createStarterHutBlocks(),
  },
  [PREFAB_IDS.ruinArch]: {
    id: PREFAB_IDS.ruinArch,
    name: 'Ruin Arch',
    category: 'structure',
    author: 'Godoy Engine',
    tags: ['ruin', 'stone', 'landmark'],
    thumbnailHint: 'sandstone arch',
    blocks: [
      { x: -1, y: 0, z: 0, blockId: BLOCK_IDS.sandstone },
      { x: -1, y: 1, z: 0, blockId: BLOCK_IDS.sandstone },
      { x: -1, y: 2, z: 0, blockId: BLOCK_IDS.sandstone },
      { x: 0, y: 2, z: 0, blockId: BLOCK_IDS.sandstone },
      { x: 1, y: 2, z: 0, blockId: BLOCK_IDS.sandstone },
      { x: 1, y: 1, z: 0, blockId: BLOCK_IDS.sandstone },
      { x: 1, y: 0, z: 0, blockId: BLOCK_IDS.sandstone },
    ],
  },
};

export class PrefabRegistry {
  constructor({ initialPrefabId = PREFAB_IDS.campKit } = {}) {
    this.prefabs = new Map(Object.values(PREFAB_DEFINITIONS).map((prefab) => [prefab.id, prefab]));
    this.prefabIds = [...this.prefabs.keys()];
    this.selectedPrefabId = initialPrefabId;
    this.lastSerializedPrefab = null;
  }

  registerPrefab(prefab) {
    const normalizedPrefab = normalizePrefab(prefab);

    this.prefabs.set(normalizedPrefab.id, normalizedPrefab);
    this.prefabIds = [...this.prefabs.keys()];
    this.lastSerializedPrefab = this.serializePrefab(normalizedPrefab.id);

    return normalizedPrefab;
  }

  getPrefab(prefabId = this.selectedPrefabId) {
    return this.prefabs.get(prefabId) ?? this.prefabs.get(PREFAB_IDS.campKit);
  }

  cyclePrefab(direction = 1) {
    const currentIndex = this.prefabIds.indexOf(this.selectedPrefabId);
    const nextIndex = (currentIndex + direction + this.prefabIds.length) % this.prefabIds.length;

    this.selectedPrefabId = this.prefabIds[nextIndex];
    return this.getSnapshot();
  }

  createPlacementPlan({
    anchor,
    prefabId = this.selectedPrefabId,
    rotationStep = 0,
    canPlaceBlockAt,
    isWorldPositionLoaded,
  }) {
    const prefab = this.getPrefab(prefabId);
    const blocks = prefab.blocks.map((block) => {
      const offset = rotateOffset(block, rotationStep);

      return {
        worldX: anchor.worldX + offset.x,
        y: anchor.y + offset.y,
        worldZ: anchor.worldZ + offset.z,
        blockId: block.blockId,
      };
    });
    const blockedBlocks = blocks.filter((block) => !canPlaceBlockAt(block));
    const unloadedBlocks = blocks.filter((block) => (
      isWorldPositionLoaded && !isWorldPositionLoaded(block)
    ));

    return {
      prefabId: prefab.id,
      prefabName: prefab.name,
      category: prefab.category,
      rotationStep,
      anchor,
      blocks,
      canPlace: blockedBlocks.length === 0 && unloadedBlocks.length === 0,
      blockedCount: blockedBlocks.length,
      unloadedCount: unloadedBlocks.length,
      metadata: this.getAssetMetadata(prefab.id),
    };
  }

  createPrefabRecord({ placementPlan, source = 'studio' }) {
    if (!placementPlan) {
      return null;
    }

    return {
      ...serializePlacementPlan({
        blueprintId: placementPlan.prefabId,
        rotationStep: placementPlan.rotationStep,
        placements: placementPlan.blocks,
      }),
      type: 'prefab',
      source,
      name: placementPlan.prefabName,
      assetMetadata: placementPlan.metadata,
      placedAt: new Date().toISOString(),
    };
  }

  serializePrefab(prefabId = this.selectedPrefabId) {
    const prefab = this.getPrefab(prefabId);

    return {
      version: 1,
      ...prefab,
      blockCount: prefab.blocks.length,
      serializedAt: new Date().toISOString(),
    };
  }

  getAssetMetadata(prefabId = this.selectedPrefabId) {
    const prefab = this.getPrefab(prefabId);

    return {
      id: prefab.id,
      name: prefab.name,
      category: prefab.category,
      author: prefab.author,
      tags: prefab.tags,
      thumbnailHint: prefab.thumbnailHint,
      blockCount: prefab.blocks.length,
      serialization: 'prefab-json-v1',
    };
  }

  getSnapshot() {
    const selectedPrefab = this.getPrefab();

    return {
      prefabCount: this.prefabs.size,
      selectedPrefabId: selectedPrefab.id,
      selectedPrefabName: selectedPrefab.name,
      selectedPrefabBlocks: selectedPrefab.blocks.length,
      selectedCategory: selectedPrefab.category,
      lastSerializedPrefabId: this.lastSerializedPrefab?.id ?? 'none',
    };
  }
}

function normalizePrefab(prefab) {
  return {
    category: 'structure',
    author: 'unknown',
    tags: [],
    thumbnailHint: 'generated prefab',
    ...prefab,
    blocks: prefab.blocks.map((block) => ({
      x: Math.floor(block.x),
      y: Math.floor(block.y),
      z: Math.floor(block.z),
      blockId: block.blockId,
    })),
  };
}

function createStarterHutBlocks() {
  const blocks = [];

  for (let z = -2; z <= 2; z += 1) {
    for (let x = -2; x <= 2; x += 1) {
      blocks.push({ x, y: 0, z, blockId: BLOCK_IDS.planks });

      const isWall = Math.abs(x) === 2 || Math.abs(z) === 2;
      const isDoor = x === 0 && z === 2;

      if (isWall && !isDoor) {
        blocks.push({ x, y: 1, z, blockId: BLOCK_IDS.wood });
        blocks.push({ x, y: 2, z, blockId: BLOCK_IDS.wood });
      }
    }
  }

  for (let z = -2; z <= 2; z += 1) {
    for (let x = -2; x <= 2; x += 1) {
      blocks.push({ x, y: 3, z, blockId: BLOCK_IDS.planks });
    }
  }

  blocks.push({ x: 1, y: 1, z: 1, blockId: BLOCK_IDS.furnace });
  return blocks;
}
