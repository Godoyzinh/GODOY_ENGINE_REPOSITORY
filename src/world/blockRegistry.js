import { BLOCK_DEFINITIONS, BLOCK_IDS, isRenderableBlock, isSolidBlock } from './blockTypes.js';

export const BLOCK_REGISTRY = new Map(
  Object.values(BLOCK_DEFINITIONS).map((definition) => [definition.id, Object.freeze({ ...definition })]),
);

export function getBlockDefinition(blockId) {
  return BLOCK_REGISTRY.get(blockId) ?? BLOCK_REGISTRY.get(BLOCK_IDS.air);
}

export function getBlockName(blockId) {
  return getBlockDefinition(blockId).name;
}

export function getBlockDrop(blockId) {
  return getBlockDefinition(blockId).drop;
}

export function getBlockHardness(blockId) {
  return getBlockDefinition(blockId).hardness ?? 0;
}

export function getBlockToolType(blockId) {
  return getBlockDefinition(blockId).toolType ?? 'hand';
}

export function isTransparentBlock(blockId) {
  return getBlockDefinition(blockId).transparent === true;
}

export function isPlaceableBlock(blockId) {
  return blockId !== BLOCK_IDS.air && isRenderableBlock(blockId);
}

export function canReplaceBlock(blockId) {
  return !isSolidBlock(blockId);
}

export function getPlaceableBlockIds() {
  return [...BLOCK_REGISTRY.values()]
    .filter((definition) => isPlaceableBlock(definition.id))
    .map((definition) => definition.id);
}
