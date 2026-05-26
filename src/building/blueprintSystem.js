import {
  createBlockPlacement,
  dedupePlacements,
  getPlacementAnchor,
  getRotationLabel,
  rotateOffset,
  serializePlacementPlan,
  validatePlacementPlan,
} from './placementHelpers.js';

export const BLUEPRINT_IDS = {
  single: 'single',
  column: 'column3',
  floor: 'floor3x3',
  wall: 'wall3x2',
};

export const BLUEPRINT_DEFINITIONS = {
  [BLUEPRINT_IDS.single]: {
    id: BLUEPRINT_IDS.single,
    name: 'Single',
    offsets: [{ x: 0, y: 0, z: 0 }],
  },
  [BLUEPRINT_IDS.column]: {
    id: BLUEPRINT_IDS.column,
    name: 'Column 3',
    offsets: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 },
    ],
  },
  [BLUEPRINT_IDS.floor]: {
    id: BLUEPRINT_IDS.floor,
    name: 'Floor 3x3',
    offsets: createFloorOffsets(),
  },
  [BLUEPRINT_IDS.wall]: {
    id: BLUEPRINT_IDS.wall,
    name: 'Wall 3x2',
    offsets: createWallOffsets(),
  },
};

export class BlueprintSystem {
  constructor({ initialBlueprintId = BLUEPRINT_IDS.single } = {}) {
    this.blueprintIds = Object.keys(BLUEPRINT_DEFINITIONS);
    this.selectedBlueprintId = initialBlueprintId;
    this.rotationStep = 0;
    this.lastPlan = null;
  }

  cycleBlueprint(direction = 1) {
    const currentIndex = this.blueprintIds.indexOf(this.selectedBlueprintId);
    const nextIndex = (currentIndex + direction + this.blueprintIds.length) % this.blueprintIds.length;

    this.selectedBlueprintId = this.blueprintIds[nextIndex];
    return this.getSnapshot();
  }

  rotate(direction = 1) {
    this.rotationStep = (this.rotationStep + direction + 4) % 4;
    return this.getSnapshot();
  }

  getSelectedDefinition() {
    return BLUEPRINT_DEFINITIONS[this.selectedBlueprintId] ?? BLUEPRINT_DEFINITIONS[BLUEPRINT_IDS.single];
  }

  createPlacementPlan({
    targetBlock,
    selectedBlockId,
    canPlaceBlockAt,
    isWorldPositionLoaded = null,
  }) {
    if (!targetBlock || selectedBlockId === null || selectedBlockId === undefined) {
      this.lastPlan = null;
      return null;
    }

    const definition = this.getSelectedDefinition();
    const anchor = getPlacementAnchor(targetBlock);
    const placements = dedupePlacements(definition.offsets.map((offset) => createBlockPlacement({
      anchor,
      offset: rotateOffset(offset, this.rotationStep),
      blockId: selectedBlockId,
    })));
    const validation = validatePlacementPlan({
      placements,
      canPlaceBlockAt,
      isWorldPositionLoaded,
    });

    this.lastPlan = {
      blueprintId: definition.id,
      blueprintName: definition.name,
      rotationStep: this.rotationStep,
      rotationLabel: getRotationLabel(this.rotationStep),
      anchor,
      blocks: placements,
      canPlace: validation.canPlace,
      blockedCount: validation.blockedPlacements.length,
      unloadedCount: validation.unloadedPlacements.length,
    };

    return this.lastPlan;
  }

  createStructureRecord({ plan, source = 'player' }) {
    if (!plan || plan.blocks.length <= 1) {
      return null;
    }

    return {
      ...serializePlacementPlan({
        blueprintId: plan.blueprintId,
        rotationStep: plan.rotationStep,
        placements: plan.blocks,
      }),
      source,
      name: plan.blueprintName,
      placedAt: new Date().toISOString(),
    };
  }

  getSnapshot() {
    const definition = this.getSelectedDefinition();

    return {
      selectedBlueprintId: definition.id,
      selectedBlueprintName: definition.name,
      rotationStep: this.rotationStep,
      rotationLabel: getRotationLabel(this.rotationStep),
      plannedBlocks: this.lastPlan?.blocks.length ?? definition.offsets.length,
      canPlaceLastPlan: this.lastPlan?.canPlace ?? false,
      blockedCount: this.lastPlan?.blockedCount ?? 0,
      unloadedCount: this.lastPlan?.unloadedCount ?? 0,
    };
  }
}

function createFloorOffsets() {
  const offsets = [];

  for (let z = -1; z <= 1; z += 1) {
    for (let x = -1; x <= 1; x += 1) {
      offsets.push({ x, y: 0, z });
    }
  }

  return offsets;
}

function createWallOffsets() {
  const offsets = [];

  for (let y = 0; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      offsets.push({ x, y, z: 0 });
    }
  }

  return offsets;
}
