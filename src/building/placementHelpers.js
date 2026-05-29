export const ROTATION_STEPS = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

export function rotateOffset(offset, rotationStep) {
  const normalizedStep = ((rotationStep % 4) + 4) % 4;

  if (normalizedStep === ROTATION_STEPS.east) {
    return { x: -offset.z, y: offset.y, z: offset.x };
  }

  if (normalizedStep === ROTATION_STEPS.south) {
    return { x: -offset.x, y: offset.y, z: -offset.z };
  }

  if (normalizedStep === ROTATION_STEPS.west) {
    return { x: offset.z, y: offset.y, z: -offset.x };
  }

  return { ...offset };
}

export function getRotationLabel(rotationStep) {
  const labels = ['North', 'East', 'South', 'West'];

  return labels[((rotationStep % 4) + 4) % 4];
}

export function getPlacementAnchor(targetBlock) {
  return {
    worldX: targetBlock.worldX + targetBlock.normal.x,
    y: targetBlock.y + targetBlock.normal.y,
    worldZ: targetBlock.worldZ + targetBlock.normal.z,
  };
}

export function createBlockPlacement({ anchor, offset, blockId }) {
  return {
    worldX: anchor.worldX + offset.x,
    y: anchor.y + offset.y,
    worldZ: anchor.worldZ + offset.z,
    blockId,
  };
}

export function dedupePlacements(placements) {
  const seenKeys = new Set();
  const dedupedPlacements = [];

  for (const placement of placements) {
    const placementKey = `${placement.worldX},${placement.y},${placement.worldZ}`;

    if (seenKeys.has(placementKey)) {
      continue;
    }

    seenKeys.add(placementKey);
    dedupedPlacements.push(placement);
  }

  return dedupedPlacements;
}

export function validatePlacementPlan({ placements, canPlaceBlockAt, isWorldPositionLoaded }) {
  const blockedPlacements = [];
  const unloadedPlacements = [];

  for (const placement of placements) {
    if (isWorldPositionLoaded && !isWorldPositionLoaded(placement)) {
      unloadedPlacements.push(placement);
      continue;
    }

    if (!canPlaceBlockAt(placement)) {
      blockedPlacements.push(placement);
    }
  }

  return {
    canPlace: blockedPlacements.length === 0 && unloadedPlacements.length === 0,
    blockedPlacements,
    unloadedPlacements,
  };
}

export function serializePlacementPlan({ blueprintId, rotationStep, placements }) {
  return {
    blueprintId,
    rotationStep,
    blocks: placements.map((placement) => ({
      worldX: placement.worldX,
      y: placement.y,
      worldZ: placement.worldZ,
      blockId: placement.blockId,
    })),
  };
}
