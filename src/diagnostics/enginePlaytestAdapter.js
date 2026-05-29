import { Vector3 } from 'three';
import { ITEM_TYPES, normalizeDrop } from '../items/itemRegistry.js';
import { BLOCK_IDS } from '../world/blockTypes.js';
import { getBlockDefinition, getBlockDrop, isPlaceableBlock } from '../world/blockRegistry.js';

const MOVEMENT_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space'];
const MINE_RADIUS = 4;
const PLACE_RADIUS = 3;

export class EnginePlaytestAdapter {
  constructor({ engine }) {
    this.engine = engine;
    this.originalInputEnabled = true;
    this.lastSavedStateSize = 0;
  }

  begin() {
    this.originalInputEnabled = this.engine.playerController.movementSystem.isInputEnabled;
    this.engine.mainMenuUI?.closeMenu();
    this.engine.setGameplayInputEnabled(true);
    this.engine.playerController.movementSystem.clearInput();
  }

  end() {
    this.engine.playerController.movementSystem.clearInput();
    this.engine.setGameplayInputEnabled(this.originalInputEnabled);
  }

  explore({ elapsedSeconds }) {
    const movement = this.engine.playerController.movementSystem;
    const turnPhase = Math.floor(elapsedSeconds / 6) % 4;

    for (const code of MOVEMENT_CODES) {
      movement.setInput(code, false);
    }

    movement.setInput('KeyW', true);
    movement.setInput(turnPhase % 2 === 0 ? 'KeyD' : 'KeyA', true);
    movement.setInput('ShiftLeft', Math.floor(elapsedSeconds / 4) % 2 === 0);

    return {
      ok: true,
      event: 'move',
    };
  }

  mineBlock({ elapsedSeconds }) {
    const target = this.findMineTarget(elapsedSeconds);

    if (!target) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const wasDestroyed = this.engine.terrainGenerator.setBlockAtWorldPosition(
      target.worldX,
      target.y,
      target.worldZ,
      BLOCK_IDS.air,
    );

    if (!wasDestroyed) {
      return {
        ok: false,
        failures: [{
          code: 'mine-unloaded-chunk',
          summary: 'Bot tried to mine a block in an unloaded chunk.',
          severity: 'low',
        }],
      };
    }

    this.engine.handleBlockMined({
      targetBlock: target,
      dropStack: normalizeDrop(getBlockDrop(target.blockId)),
      blockDefinition: getBlockDefinition(target.blockId),
    });
    this.engine.networkSession.queueBlockEdits([{
      worldX: target.worldX,
      y: target.y,
      worldZ: target.worldZ,
      blockId: BLOCK_IDS.air,
      action: 'destroy',
    }]);

    return {
      ok: true,
      event: getBlockDefinition(target.blockId).name,
    };
  }

  placeBlock({ elapsedSeconds }) {
    const blockStack = this.engine.inventorySystem.getAllStacks()
      .find((stack) => stack?.itemType === ITEM_TYPES.block && isPlaceableBlock(stack.itemId) && stack.count > 0);

    if (!blockStack) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const placement = this.findPlacementTarget(elapsedSeconds, blockStack.itemId);

    if (!placement) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const wasPlaced = this.engine.terrainGenerator.setBlockAtWorldPosition(
      placement.worldX,
      placement.y,
      placement.worldZ,
      blockStack.itemId,
    );

    if (!wasPlaced) {
      return {
        ok: false,
        failures: [{
          code: 'place-unloaded-chunk',
          summary: 'Bot tried to place a block in an unloaded chunk.',
          severity: 'low',
        }],
      };
    }

    if (this.engine.playerState.mode !== 'creative') {
      this.consumeMatchingBlock(blockStack.itemId);
    }

    this.engine.handleBlocksPlaced([{
      ...placement,
      blockId: blockStack.itemId,
      action: 'place',
    }]);

    return {
      ok: true,
      event: getBlockDefinition(blockStack.itemId).name,
    };
  }

  collectDrops() {
    const droppedItem = this.engine.entitySystem.registry.getEntities()
      .find((entity) => entity.itemStack && entity.state.removeRequested !== true);

    if (!droppedItem) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const wasAdded = this.engine.inventorySystem.addItem(droppedItem.itemStack);

    if (!wasAdded) {
      return {
        ok: false,
        failures: [{
          code: 'drop-pickup-overflow',
          summary: 'Bot could not pick up a dropped item because inventory was full.',
          severity: 'low',
        }],
      };
    }

    droppedItem.requestRemoval?.('botPickedUp');

    return {
      ok: true,
      event: droppedItem.itemStack.name,
    };
  }

  craftBasicItem() {
    const wasCrafted = this.engine.craftingSystem.craftFirstAvailable();

    if (!wasCrafted) {
      return {
        ok: false,
        skipped: true,
      };
    }

    return {
      ok: true,
      event: this.engine.craftingSystem.getSnapshot().lastCraftedRecipe ?? 'crafted',
    };
  }

  fightHostile({ elapsedSeconds }) {
    const hostile = this.findOrSpawnHostile(elapsedSeconds);

    if (!hostile) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const wasApplied = this.engine.damageSystem.applyEntityDamage({
      entity: hostile,
      amount: 8,
      source: 'autonomous-playtest',
      knockback: new Vector3(0.8, 0.1, 0.8),
    });

    if (!wasApplied) {
      return {
        ok: false,
        skipped: true,
      };
    }

    this.engine.handleCombatHit({
      position: hostile.transform.position,
    });

    return {
      ok: true,
      event: hostile.name,
    };
  }

  survive() {
    if (this.engine.playerState.hunger > 45 && this.engine.playerState.health > 55) {
      return {
        ok: true,
        event: 'stable',
      };
    }

    const foodSlot = this.engine.inventorySystem.hotbar.findIndex((stack) => stack?.itemType === ITEM_TYPES.consumable);

    if (foodSlot >= 0) {
      this.engine.inventorySystem.selectSlot(foodSlot);
      this.engine.survivalSystem.consumeSelectedItem();
    }

    return {
      ok: true,
      event: 'checked',
    };
  }

  checkSaveLoad() {
    try {
      const serializedWorld = this.engine.saveSystem.serializeWorld();
      const serializedText = JSON.stringify(serializedWorld);

      JSON.parse(serializedText);
      this.lastSavedStateSize = serializedText.length;

      return {
        ok: true,
        event: 'ok',
      };
    } catch (error) {
      return {
        ok: false,
        failures: [{
          code: 'save-load-error',
          summary: `Save/load serialization failed: ${error.message}`,
          severity: 'high',
        }],
      };
    }
  }

  getPosition() {
    const position = this.engine.playerController.position;

    return {
      x: position.x,
      y: position.y,
      z: position.z,
    };
  }

  getRuntimeSnapshot() {
    return {
      ...this.engine.createAutoQaRuntimeSnapshot(),
      simulationAdapter: {
        type: 'engine',
        lastSavedStateSize: this.lastSavedStateSize,
      },
    };
  }

  findMineTarget(elapsedSeconds) {
    const position = this.engine.playerController.position;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const angle = elapsedSeconds * 0.45 + attempt * 0.95;
      const distance = 2 + (attempt % MINE_RADIUS);
      const worldX = Math.floor(position.x + Math.cos(angle) * distance);
      const worldZ = Math.floor(position.z + Math.sin(angle) * distance);
      const y = Math.floor(this.engine.terrainGenerator.getHeightAt(worldX, worldZ) - 1);
      const blockId = this.engine.terrainGenerator.getBlockAtWorldPosition(worldX, y, worldZ);

      if (blockId !== BLOCK_IDS.air && blockId !== BLOCK_IDS.water) {
        return {
          worldX,
          y,
          worldZ,
          blockId,
        };
      }
    }

    return null;
  }

  findPlacementTarget(elapsedSeconds, blockId) {
    const position = this.engine.playerController.position;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const angle = elapsedSeconds * 0.4 + attempt * 1.1;
      const distance = 2 + (attempt % PLACE_RADIUS);
      const worldX = Math.floor(position.x + Math.cos(angle) * distance);
      const worldZ = Math.floor(position.z + Math.sin(angle) * distance);
      const y = Math.floor(this.engine.terrainGenerator.getHeightAt(worldX, worldZ));

      if (!this.engine.terrainGenerator.isWorldPositionLoaded(worldX, worldZ)) {
        continue;
      }

      if (this.engine.terrainGenerator.getBlockAtWorldPosition(worldX, y, worldZ) === BLOCK_IDS.air) {
        return {
          worldX,
          y,
          worldZ,
          blockId,
        };
      }
    }

    return null;
  }

  consumeMatchingBlock(blockId) {
    const slotIndex = this.engine.inventorySystem.hotbar
      .findIndex((stack) => stack?.itemType === ITEM_TYPES.block && stack.itemId === blockId);

    if (slotIndex < 0) {
      return;
    }

    this.engine.inventorySystem.selectSlot(slotIndex);
    this.engine.inventorySystem.consumeSelected(1);
  }

  findOrSpawnHostile(elapsedSeconds) {
    const existingHostile = this.engine.entitySystem.registry.getEntities()
      .find((entity) => entity.type === 'hostile' && entity.isAlive?.() === true);

    if (existingHostile) {
      return existingHostile;
    }

    const playerPosition = this.engine.playerController.position;
    const spawnPosition = {
      x: playerPosition.x + Math.cos(elapsedSeconds) * 2.5,
      y: this.engine.terrainGenerator.getHeightAt(playerPosition.x + 2, playerPosition.z + 2),
      z: playerPosition.z + Math.sin(elapsedSeconds) * 2.5,
    };

    return this.engine.entitySystem.spawnHostile({
      position: spawnPosition,
      seed: Math.floor(elapsedSeconds * 1000),
      maxActiveHostiles: 8,
    });
  }
}
