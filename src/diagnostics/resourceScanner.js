import { BLOCK_IDS } from '../world/blockTypes.js';
import { getBlockDrop } from '../world/blockRegistry.js';
import { getWorldCoordinate } from '../world/chunkMath.js';

const DEFAULT_SCAN_RADIUS = 24;
const WOOD_VERTICAL_REACH = 8;
const MAX_TARGETS = 32;

export class ResourceScanner {
  constructor({ terrainGenerator }) {
    this.terrainGenerator = terrainGenerator;
  }

  scanWoodTargets({ origin, radius = DEFAULT_SCAN_RADIUS, maxTargetDistance = Infinity } = {}) {
    const safeOrigin = normalizeOrigin(origin);
    const loadedChunks = [...(this.terrainGenerator.chunkManager?.chunks?.values() ?? [])];
    const targetCandidates = [];
    const vegetationCandidates = [];
    let scannedWoodBlocks = 0;
    let rejectedLeafTargets = 0;
    let rejectedUnreachableTargets = 0;

    for (const chunk of loadedChunks) {
      for (const [blockKey, blockId] of chunk.blocks ?? []) {
        const [localX, y, localZ] = parseBlockKey(blockKey);
        const worldX = getWorldCoordinate(chunk.chunkX, localX);
        const worldZ = getWorldCoordinate(chunk.chunkZ, localZ);
        const distance = getHorizontalDistance(safeOrigin, { x: worldX + 0.5, z: worldZ + 0.5 });

        if (distance > radius) {
          continue;
        }

        if (blockId === BLOCK_IDS.leaves || blockId === BLOCK_IDS.grassPlant) {
          vegetationCandidates.push({
            blockId,
            worldX,
            y,
            worldZ,
            distance: round(distance, 2),
          });
        }

        if (blockId === BLOCK_IDS.leaves && !doesDropWood(blockId)) {
          rejectedLeafTargets += 1;
          continue;
        }

        if (blockId !== BLOCK_IDS.wood && !(blockId === BLOCK_IDS.leaves && doesDropWood(blockId))) {
          continue;
        }

        if (blockId === BLOCK_IDS.wood) {
          scannedWoodBlocks += 1;
        }

        const verticalDelta = Math.abs((y + 0.5) - safeOrigin.y);
        const isOutsideMiningReach = distance > maxTargetDistance;

        if (verticalDelta > WOOD_VERTICAL_REACH || isOutsideMiningReach) {
          rejectedUnreachableTargets += 1;
          continue;
        }

        const nearGround = this.isNearGroundTrunkBlock({ worldX, y, worldZ, blockId });

        targetCandidates.push({
          blockId,
          worldX,
          y,
          worldZ,
          distance: round(distance, 2),
          verticalDelta: round(verticalDelta, 2),
          nearGround,
          isLeafDropTarget: blockId === BLOCK_IDS.leaves,
          score: distance + verticalDelta * 0.35 + (nearGround ? 0 : 8) + (blockId === BLOCK_IDS.leaves ? 16 : 0),
        });
      }
    }

    targetCandidates.sort((left, right) => left.score - right.score);
    vegetationCandidates.sort((left, right) => left.distance - right.distance);

    const nearestWoodTarget = targetCandidates[0] ?? null;
    const biome = this.terrainGenerator.getBiomeAt?.(safeOrigin.x, safeOrigin.z) ?? null;

    return {
      radius,
      maxTargetDistance: Number.isFinite(maxTargetDistance) ? maxTargetDistance : null,
      scannedChunks: loadedChunks.length,
      scannedWoodBlocks,
      rejectedLeafTargets,
      rejectedUnreachableTargets,
      woodTargetsFound: targetCandidates.length,
      woodTargetsRejected: rejectedLeafTargets + rejectedUnreachableTargets,
      nearestWoodTarget: nearestWoodTarget ? sanitizeTarget(nearestWoodTarget) : null,
      woodTargetDistance: nearestWoodTarget?.distance ?? null,
      targets: targetCandidates.slice(0, MAX_TARGETS).map(sanitizeTarget),
      vegetationTarget: vegetationCandidates[0] ? sanitizeTarget(vegetationCandidates[0]) : null,
      biome: biome?.name ?? 'Unknown',
      biomeHasTrees: biome?.id !== 'desert' && Number(biome?.treeChance ?? 0) > 0,
      lastBlockedReason: null,
      recovery: null,
    };
  }

  isNearGroundTrunkBlock({ worldX, y, worldZ, blockId }) {
    if (blockId !== BLOCK_IDS.wood) {
      return false;
    }

    const belowBlockId = this.terrainGenerator.getBlockAtWorldPosition?.(worldX, y - 1, worldZ);

    return belowBlockId !== BLOCK_IDS.wood && belowBlockId !== BLOCK_IDS.leaves;
  }
}

export function createEmptyResourceScanSnapshot(reason = 'Resource scan has not run yet.') {
  return {
    radius: 0,
    maxTargetDistance: null,
    scannedChunks: 0,
    scannedWoodBlocks: 0,
    rejectedLeafTargets: 0,
    rejectedUnreachableTargets: 0,
    woodTargetsFound: 0,
    woodTargetsRejected: 0,
    nearestWoodTarget: null,
    woodTargetDistance: null,
    targets: [],
    vegetationTarget: null,
    biome: 'Unknown',
    biomeHasTrees: false,
    lastBlockedReason: reason,
    recovery: null,
  };
}

function doesDropWood(blockId) {
  const drop = getBlockDrop(blockId);

  if (drop === BLOCK_IDS.wood) {
    return true;
  }

  return drop?.itemType === 'block' && drop?.itemId === BLOCK_IDS.wood && Number(drop?.count ?? 0) > 0;
}

function normalizeOrigin(origin = {}) {
  return {
    x: Number(origin.x) || 0,
    y: Number(origin.y) || 0,
    z: Number(origin.z) || 0,
  };
}

function parseBlockKey(blockKey) {
  return String(blockKey).split(',').map(Number);
}

function sanitizeTarget(target) {
  return {
    blockId: target.blockId,
    worldX: target.worldX,
    y: target.y,
    worldZ: target.worldZ,
    distance: target.distance,
    verticalDelta: target.verticalDelta ?? 0,
    nearGround: target.nearGround ?? false,
    isLeafDropTarget: target.isLeafDropTarget ?? false,
  };
}

function getHorizontalDistance(origin, target) {
  return Math.hypot(target.x - origin.x, target.z - origin.z);
}

function round(value, digits) {
  const scale = 10 ** digits;

  return Math.round((Number(value) || 0) * scale) / scale;
}
