import { BLOCK_IDS } from '../world/blockTypes.js';

export const SHELTER_BLOCK_TARGET = 12;
export const VALID_SHELTER_BLOCK_IDS = new Set([
  BLOCK_IDS.wood,
  BLOCK_IDS.planks,
  BLOCK_IDS.stone,
  BLOCK_IDS.dirt,
]);
export const INVALID_SHELTER_BLOCK_IDS = new Set([
  BLOCK_IDS.grass,
  BLOCK_IDS.leaves,
  BLOCK_IDS.water,
  BLOCK_IDS.campfire,
  BLOCK_IDS.grassPlant,
]);
export const VALID_SHELTER_RESOURCE_KEYS = new Set(['wood', 'planks', 'stone', 'dirt']);
export const INVALID_SHELTER_RESOURCE_KEYS = new Set(['grass', 'leaves', 'water', 'campfire', 'grassPlant']);

export function isValidShelterBlockId(blockId) {
  return VALID_SHELTER_BLOCK_IDS.has(blockId);
}

export function isInvalidShelterBlockId(blockId) {
  return INVALID_SHELTER_BLOCK_IDS.has(blockId);
}

export function isValidShelterResourceKey(resourceKey) {
  return VALID_SHELTER_RESOURCE_KEYS.has(resourceKey);
}

export function isInvalidShelterResourceKey(resourceKey) {
  return INVALID_SHELTER_RESOURCE_KEYS.has(resourceKey);
}

export function createEmptyShelterValidation(reason = 'Shelter validation has not run yet.') {
  return {
    validShelterBlocksPlaced: 0,
    invalidShelterBlocksRejected: 0,
    minValidBlocks: SHELTER_BLOCK_TARGET,
    hasPartialWall: false,
    hasRoof: false,
    safetyScore: 0,
    isValid: false,
    isSafeForNight: false,
    safeDistanceNoAggro: false,
    lastBlockedReason: reason,
  };
}

export function validateShelter({
  placements = [],
  invalidRejected = 0,
  safeDistanceNoAggro = false,
  lastBlockedReason = null,
} = {}) {
  const validPlacements = placements.filter((placement) => isPlacementShelterValid(placement));
  const wallPlacements = validPlacements.filter((placement) => placement.role === 'wall');
  const roofPlacements = validPlacements.filter((placement) => placement.role === 'roof');
  const sides = new Set(wallPlacements.map((placement) => placement.side).filter(Boolean));
  const validShelterBlocksPlaced = validPlacements.length;
  const hasPartialWall = wallPlacements.length >= 8 || sides.size >= 3;
  const hasRoof = roofPlacements.length >= 3;
  const safetyScore = calculateSafetyScore({
    validShelterBlocksPlaced,
    wallCount: wallPlacements.length,
    roofCount: roofPlacements.length,
    sideCount: sides.size,
    safeDistanceNoAggro,
  });
  const isValid = validShelterBlocksPlaced >= SHELTER_BLOCK_TARGET && (hasPartialWall || hasRoof) && safetyScore >= 0.65;
  const isSafeForNight = isValid || safeDistanceNoAggro;

  return {
    validShelterBlocksPlaced,
    invalidShelterBlocksRejected: invalidRejected,
    minValidBlocks: SHELTER_BLOCK_TARGET,
    hasPartialWall,
    hasRoof,
    safetyScore,
    isValid,
    isSafeForNight,
    safeDistanceNoAggro,
    lastBlockedReason: isSafeForNight
      ? null
      : lastBlockedReason ?? createShelterBlockedReason({ validShelterBlocksPlaced, hasPartialWall, hasRoof }),
  };
}

function isPlacementShelterValid(placement) {
  if (placement.blockId !== undefined) {
    return isValidShelterBlockId(placement.blockId);
  }

  return isValidShelterResourceKey(placement.resourceKey);
}

function calculateSafetyScore({
  validShelterBlocksPlaced,
  wallCount,
  roofCount,
  sideCount,
  safeDistanceNoAggro,
}) {
  const blockScore = Math.min(0.4, validShelterBlocksPlaced / SHELTER_BLOCK_TARGET * 0.4);
  const wallScore = Math.min(0.25, wallCount / 8 * 0.25);
  const sideScore = Math.min(0.15, sideCount / 4 * 0.15);
  const roofScore = Math.min(0.2, roofCount / 3 * 0.2);
  const distanceScore = safeDistanceNoAggro ? 0.75 : 0;

  return round(Math.max(distanceScore, blockScore + wallScore + sideScore + roofScore), 2);
}

function createShelterBlockedReason({ validShelterBlocksPlaced, hasPartialWall, hasRoof }) {
  if (validShelterBlocksPlaced < SHELTER_BLOCK_TARGET) {
    return `Shelter has ${validShelterBlocksPlaced}/${SHELTER_BLOCK_TARGET} valid placed blocks.`;
  }

  if (!hasPartialWall && !hasRoof) {
    return 'Shelter lacks a partial wall or roof footprint.';
  }

  return 'Shelter safety score is below the night survival threshold.';
}

function round(value, digits) {
  const scale = 10 ** digits;

  return Math.round((Number(value) || 0) * scale) / scale;
}
