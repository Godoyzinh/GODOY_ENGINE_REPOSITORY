import { Group, Vector3 } from 'three';
import { getChunkCoordinate, getChunkKey } from '../world/chunkMath.js';
import { CHUNK_SIZE } from '../world/worldConstants.js';
import { DroppedItemEntity } from './droppedItemEntity.js';
import { EntityRegistry } from './entityRegistry.js';
import { ENTITY_TYPES } from './entityTypes.js';
import { HostileEntity } from './hostileEntity.js';
import { NpcEntity } from './npcEntity.js';

const ENTITY_ACTIVATION_DISTANCE = 72;
const ENTITY_VISIBLE_DISTANCE = 96;
const NPC_SPAWN_RADIUS_CHUNKS = 1;
const MAX_ACTIVE_NPCS = 6;
const MAX_ACTIVE_HOSTILES = 4;
const MAX_DROPPED_ITEMS = 48;

export class EntitySystem {
  constructor({ terrainSampler, inventorySystem, damageSystem = null }) {
    this.terrainSampler = terrainSampler;
    this.inventorySystem = inventorySystem;
    this.damageSystem = damageSystem;
    this.group = new Group();
    this.group.name = 'EntitySystem';
    this.registry = new EntityRegistry({ group: this.group });
    this.spawnedNpcChunks = new Set();
    this.spawnedHostileChunks = new Set();
    this.lastFocusChunkKey = null;
    this.stats = createEmptyStats();
  }

  update({ deltaTime, playerPosition }) {
    this.spawnNpcsNearFocus(playerPosition);
    this.spawnHostilesNearFocus(playerPosition);
    this.registry.updateActivation({
      focusPosition: playerPosition,
      activationDistance: ENTITY_ACTIVATION_DISTANCE,
      visibleDistance: ENTITY_VISIBLE_DISTANCE,
    });

    for (const entity of this.registry.getEntities()) {
      if (entity.state.isActive) {
        entity.update(deltaTime, {
          terrainSampler: this.terrainSampler,
          inventorySystem: this.inventorySystem,
          playerPosition,
          damageSystem: this.damageSystem,
        });
      }
    }

    this.releaseRemovedEntities();
    this.updateStats();
  }

  spawnDroppedItem({ itemStack, position, impulse = null }) {
    if (!itemStack || itemStack.count <= 0) {
      return null;
    }

    this.enforceDroppedItemLimit();

    return this.registry.acquire(DroppedItemEntity, {
      type: ENTITY_TYPES.droppedItem,
      itemStack,
      position: toVector3(position),
      impulse,
    });
  }

  spawnNpc({ position, seed = Math.random() }) {
    if (this.registry.getCountByType(ENTITY_TYPES.npc) >= MAX_ACTIVE_NPCS) {
      return null;
    }

    return this.registry.acquire(NpcEntity, {
      type: ENTITY_TYPES.npc,
      position: toVector3(position),
      seed,
    });
  }

  spawnHostile({ position, seed = Math.random() }) {
    if (this.registry.getCountByType(ENTITY_TYPES.hostile) >= MAX_ACTIVE_HOSTILES) {
      return null;
    }

    return this.registry.acquire(HostileEntity, {
      type: ENTITY_TYPES.hostile,
      position: toVector3(position),
      seed,
    });
  }

  spawnNpcsNearFocus(focusPosition) {
    if (!focusPosition) {
      return;
    }

    const focusChunkX = getChunkCoordinate(focusPosition.x);
    const focusChunkZ = getChunkCoordinate(focusPosition.z);
    const focusChunkKey = getChunkKey(focusChunkX, focusChunkZ);

    if (focusChunkKey === this.lastFocusChunkKey) {
      return;
    }

    this.lastFocusChunkKey = focusChunkKey;

    for (let offsetZ = -NPC_SPAWN_RADIUS_CHUNKS; offsetZ <= NPC_SPAWN_RADIUS_CHUNKS; offsetZ += 1) {
      for (let offsetX = -NPC_SPAWN_RADIUS_CHUNKS; offsetX <= NPC_SPAWN_RADIUS_CHUNKS; offsetX += 1) {
        if (this.registry.getCountByType(ENTITY_TYPES.npc) >= MAX_ACTIVE_NPCS) {
          return;
        }

        const chunkX = focusChunkX + offsetX;
        const chunkZ = focusChunkZ + offsetZ;
        const chunkKey = getChunkKey(chunkX, chunkZ);

        if (this.spawnedNpcChunks.has(chunkKey)) {
          continue;
        }

        const shouldSpawn = chunkKey === focusChunkKey || hashString(chunkKey) % 4 === 0;

        if (!shouldSpawn) {
          continue;
        }

        this.spawnedNpcChunks.add(chunkKey);
        this.spawnNpc({
          position: this.getEntitySpawnPosition(chunkX, chunkZ),
          seed: hashString(chunkKey),
        });
      }
    }
  }

  spawnHostilesNearFocus(focusPosition) {
    if (!focusPosition) {
      return;
    }

    const focusChunkX = getChunkCoordinate(focusPosition.x);
    const focusChunkZ = getChunkCoordinate(focusPosition.z);
    const focusChunkKey = getChunkKey(focusChunkX, focusChunkZ);

    for (let offsetZ = -NPC_SPAWN_RADIUS_CHUNKS; offsetZ <= NPC_SPAWN_RADIUS_CHUNKS; offsetZ += 1) {
      for (let offsetX = -NPC_SPAWN_RADIUS_CHUNKS; offsetX <= NPC_SPAWN_RADIUS_CHUNKS; offsetX += 1) {
        if (this.registry.getCountByType(ENTITY_TYPES.hostile) >= MAX_ACTIVE_HOSTILES) {
          return;
        }

        const chunkX = focusChunkX + offsetX;
        const chunkZ = focusChunkZ + offsetZ;
        const chunkKey = getChunkKey(chunkX, chunkZ);

        if (this.spawnedHostileChunks.has(chunkKey)) {
          continue;
        }

        const hash = hashString(`${chunkKey}:hostile`);
        const shouldSpawn = chunkKey === focusChunkKey || hash % 5 === 0;

        if (!shouldSpawn) {
          continue;
        }

        this.spawnedHostileChunks.add(chunkKey);
        this.spawnHostile({
          position: this.getEntitySpawnPosition(chunkX, chunkZ, hash),
          seed: hash,
        });
      }
    }
  }

  getEntitySpawnPosition(chunkX, chunkZ, hash = hashString(getChunkKey(chunkX, chunkZ))) {
    const localX = 4 + (hash % 8);
    const localZ = 4 + (Math.floor(hash / 11) % 8);
    const worldX = chunkX * CHUNK_SIZE + localX;
    const worldZ = chunkZ * CHUNK_SIZE + localZ;
    const worldY = this.terrainSampler.getHeightAt(worldX, worldZ) + 0.05;

    return new Vector3(worldX, worldY, worldZ);
  }

  enforceDroppedItemLimit() {
    const droppedItems = this.registry
      .getEntities()
      .filter((entity) => entity.type === ENTITY_TYPES.droppedItem)
      .sort((left, right) => left.state.age - right.state.age);

    while (droppedItems.length >= MAX_DROPPED_ITEMS) {
      const oldestDrop = droppedItems.shift();
      this.registry.release(oldestDrop);
    }
  }

  releaseRemovedEntities() {
    for (const entity of this.registry.getEntities()) {
      if (entity.state.removeRequested) {
        this.registry.release(entity);
      }
    }
  }

  updateStats() {
    const entities = this.registry.getEntities();
    const activeEntities = entities.filter((entity) => entity.state.isActive);
    const visibleEntities = entities.filter((entity) => entity.state.isVisible);
    const droppedItems = entities.filter((entity) => entity.type === ENTITY_TYPES.droppedItem);
    const npcs = entities.filter((entity) => entity.type === ENTITY_TYPES.npc);
    const hostiles = entities.filter((entity) => entity.type === ENTITY_TYPES.hostile);

    this.stats.totalEntities = entities.length;
    this.stats.activeEntities = activeEntities.length;
    this.stats.visibleEntities = visibleEntities.length;
    this.stats.pooledEntities = this.registry.getPooledCount();
    this.stats.droppedItems = droppedItems.length;
    this.stats.npcs = npcs.length;
    this.stats.hostiles = hostiles.length;
    this.stats.spawnedNpcChunks = this.spawnedNpcChunks.size;
    this.stats.spawnedHostileChunks = this.spawnedHostileChunks.size;
  }
}

function createEmptyStats() {
  return {
    totalEntities: 0,
    activeEntities: 0,
    visibleEntities: 0,
    pooledEntities: 0,
    droppedItems: 0,
    npcs: 0,
    hostiles: 0,
    spawnedNpcChunks: 0,
    spawnedHostileChunks: 0,
  };
}

function toVector3(position) {
  if (position instanceof Vector3) {
    return position.clone();
  }

  return new Vector3(position.x, position.y, position.z);
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}
