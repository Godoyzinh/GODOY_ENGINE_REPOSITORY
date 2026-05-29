import { SNAPSHOT_TYPES } from './networkConstants.js';

export function createPlayerSnapshot({
  playerId,
  nickname,
  playerController,
  playerState,
  inventorySnapshot,
  tick,
  timestamp,
}) {
  const stateSnapshot = playerState.getSnapshot();

  return {
    type: SNAPSHOT_TYPES.player,
    version: 1,
    playerId,
    nickname,
    tick,
    timestamp,
    transform: {
      position: serializeVector3(playerController.position),
      rotation: serializeEulerLike(playerController.object.rotation),
    },
    movement: {
      velocity: serializeVector3(playerController.movementSystem.velocity),
      grounded: stateSnapshot.isGrounded,
      flying: stateSnapshot.isFlying,
      sprinting: stateSnapshot.isSprinting,
      crouching: stateSnapshot.isCrouching,
    },
    state: {
      mode: stateSnapshot.mode,
      health: stateSnapshot.health,
      hunger: stateSnapshot.hunger,
      stamina: stateSnapshot.stamina,
      isDead: stateSnapshot.isDead,
      selectedSlot: stateSnapshot.selectedSlot,
    },
    selectedItem: {
      label: inventorySnapshot.selectedItemLabel,
      blockId: inventorySnapshot.selectedBlockId,
      slot: inventorySnapshot.selectedSlot,
    },
  };
}

export function createEntitySnapshots(entitySystem) {
  return entitySystem.getNetworkSnapshots().map((entitySnapshot) => ({
    type: SNAPSHOT_TYPES.entity,
    version: 1,
    ...entitySnapshot,
  }));
}

export function createChunkReplicationSnapshot({ terrainStats, loadedChunkKeys = [], tick, timestamp }) {
  return {
    type: SNAPSHOT_TYPES.chunk,
    version: 1,
    tick,
    timestamp,
    worldSeed: terrainStats.worldSeed,
    activeBiome: terrainStats.activeBiome,
    loadedChunkKeys,
    loadedChunks: terrainStats.chunksLoaded,
    visibleChunks: terrainStats.chunksVisible,
    queuedChunks: terrainStats.chunksQueued,
    savedChunks: terrainStats.savedChunks,
    syncedChunks: loadedChunkKeys.length,
    deltaReady: true,
    compressionReady: true,
  };
}

export function createWorldSnapshot({
  playerSnapshot,
  entitySnapshots,
  chunkSnapshot,
  ownershipSnapshot,
  tick,
  timestamp,
}) {
  return {
    type: SNAPSHOT_TYPES.world,
    version: 1,
    tick,
    timestamp,
    player: playerSnapshot,
    entities: entitySnapshots,
    chunks: chunkSnapshot,
    ownership: ownershipSnapshot,
  };
}

export function createSnapshotHash(snapshot) {
  const serializedSnapshot = JSON.stringify(snapshot);
  let hash = 2166136261;

  for (let index = 0; index < serializedSnapshot.length; index += 1) {
    hash ^= serializedSnapshot.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function serializeVector3(vector) {
  return {
    x: roundNetworkNumber(vector.x),
    y: roundNetworkNumber(vector.y),
    z: roundNetworkNumber(vector.z),
  };
}

function serializeEulerLike(rotation) {
  return {
    x: roundNetworkNumber(rotation.x ?? 0),
    y: roundNetworkNumber(rotation.y ?? 0),
    z: roundNetworkNumber(rotation.z ?? 0),
  };
}

function roundNetworkNumber(value) {
  return Math.round(value * 1000) / 1000;
}
