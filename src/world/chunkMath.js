import { CHUNK_SIZE } from './worldConstants.js';

export function getChunkKey(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

export function parseChunkKey(chunkKey) {
  const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
  return { chunkX, chunkZ };
}

export function getChunkCoordinate(worldCoordinate) {
  return Math.floor(worldCoordinate / CHUNK_SIZE);
}

export function getLocalCoordinate(worldCoordinate) {
  return positiveModulo(Math.floor(worldCoordinate), CHUNK_SIZE);
}

export function getChunkKeyFromWorldPosition(position) {
  return getChunkKey(getChunkCoordinate(position.x), getChunkCoordinate(position.z));
}

export function getWorldCoordinate(chunkCoordinate, localCoordinate) {
  return chunkCoordinate * CHUNK_SIZE + localCoordinate;
}

export function getBlockKey(localX, y, localZ) {
  return `${localX},${y},${localZ}`;
}

export function getBlockKeyFromWorldPosition(worldX, worldY, worldZ) {
  return getBlockKey(getLocalCoordinate(worldX), Math.floor(worldY), getLocalCoordinate(worldZ));
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
