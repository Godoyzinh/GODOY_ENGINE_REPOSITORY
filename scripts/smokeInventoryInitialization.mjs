import assert from 'node:assert/strict';
import { ITEM_IDS, ITEM_TYPES } from '../src/items/itemRegistry.js';
import { InventorySystem } from '../src/player/inventorySystem.js';
import {
  INVENTORY_INITIALIZATION_SOURCES,
  INVENTORY_PROFILE_IDS,
} from '../src/player/inventoryProfiles.js';
import { PlayerState } from '../src/player/playerState.js';
import { TOOL_IDS } from '../src/tools/toolSystem.js';
import { BLOCK_IDS } from '../src/world/blockTypes.js';

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
};

assertFreshSurvivalWorldUsesSurvivalStart();
assertDebugRichRequiresExplicitEnable();
assertSaveRestoreDoesNotInjectStarterResources();
assertMultiplayerJoinUsesSurvivalStartProfile();

console.log('smoke:inventory-init ok');

function assertFreshSurvivalWorldUsesSurvivalStart() {
  const inventorySystem = createInventorySystem();
  const snapshot = inventorySystem.getSnapshot();

  assert.equal(snapshot.startingInventoryProfile, INVENTORY_PROFILE_IDS.survivalStart);
  assert.equal(snapshot.inventoryInitializationSource, INVENTORY_INITIALIZATION_SOURCES.newSurvivalWorld);
  assert.equal(consumableCount(inventorySystem, ITEM_IDS.berries), 2);
  assertNoStarterResourcesOrTools(inventorySystem);
}

function assertDebugRichRequiresExplicitEnable() {
  const blockedDebugInventory = createInventorySystem({
    inventoryProfileId: INVENTORY_PROFILE_IDS.debugRich,
  });

  assert.equal(blockedDebugInventory.getSnapshot().startingInventoryProfile, INVENTORY_PROFILE_IDS.survivalStart);
  assert.equal(blockCount(blockedDebugInventory, BLOCK_IDS.wood), 0);

  const explicitDebugInventory = createInventorySystem({
    inventoryProfileId: INVENTORY_PROFILE_IDS.debugRich,
    initializationSource: INVENTORY_INITIALIZATION_SOURCES.debugInventory,
    debugInventoryEnabled: true,
  });

  assert.equal(explicitDebugInventory.getSnapshot().startingInventoryProfile, INVENTORY_PROFILE_IDS.debugRich);
  assert.equal(explicitDebugInventory.getSnapshot().inventoryInitializationSource, INVENTORY_INITIALIZATION_SOURCES.debugInventory);
  assert.equal(blockCount(explicitDebugInventory, BLOCK_IDS.dirt), 32);
  assert.equal(blockCount(explicitDebugInventory, BLOCK_IDS.stone), 32);
  assert.equal(blockCount(explicitDebugInventory, BLOCK_IDS.wood), 32);
  assert.equal(consumableCount(explicitDebugInventory, ITEM_IDS.berries), 6);
  assert.equal(toolCount(explicitDebugInventory, TOOL_IDS.pickaxe), 1);
  assert.equal(toolCount(explicitDebugInventory, TOOL_IDS.axe), 1);
}

function assertSaveRestoreDoesNotInjectStarterResources() {
  const inventorySystem = createInventorySystem();

  inventorySystem.replaceContents({
    hotbar: [],
    backpack: [],
    inventoryProfileId: 'restored-save',
    initializationSource: INVENTORY_INITIALIZATION_SOURCES.saveRestore,
  });

  const snapshot = inventorySystem.getSnapshot();

  assert.equal(snapshot.startingInventoryProfile, 'restored-save');
  assert.equal(snapshot.inventoryInitializationSource, INVENTORY_INITIALIZATION_SOURCES.saveRestore);
  assert.equal(consumableCount(inventorySystem, ITEM_IDS.berries), 0);
  assertNoStarterResourcesOrTools(inventorySystem);
}

function assertMultiplayerJoinUsesSurvivalStartProfile() {
  const inventorySystem = createInventorySystem({
    initializationSource: INVENTORY_INITIALIZATION_SOURCES.multiplayerJoin,
  });
  const snapshot = inventorySystem.getSnapshot();

  assert.equal(snapshot.startingInventoryProfile, INVENTORY_PROFILE_IDS.survivalStart);
  assert.equal(snapshot.inventoryInitializationSource, INVENTORY_INITIALIZATION_SOURCES.multiplayerJoin);
  assert.equal(consumableCount(inventorySystem, ITEM_IDS.berries), 2);
  assertNoStarterResourcesOrTools(inventorySystem);
}

function createInventorySystem(options = {}) {
  return new InventorySystem({
    playerState: new PlayerState(),
    ...options,
  });
}

function assertNoStarterResourcesOrTools(inventorySystem) {
  assert.equal(blockCount(inventorySystem, BLOCK_IDS.grass), 0);
  assert.equal(blockCount(inventorySystem, BLOCK_IDS.dirt), 0);
  assert.equal(blockCount(inventorySystem, BLOCK_IDS.stone), 0);
  assert.equal(blockCount(inventorySystem, BLOCK_IDS.sand), 0);
  assert.equal(blockCount(inventorySystem, BLOCK_IDS.wood), 0);
  assert.equal(toolCount(inventorySystem, TOOL_IDS.pickaxe), 0);
  assert.equal(toolCount(inventorySystem, TOOL_IDS.axe), 0);
}

function blockCount(inventorySystem, itemId) {
  return inventorySystem.getItemCount({
    itemType: ITEM_TYPES.block,
    itemId,
  });
}

function toolCount(inventorySystem, itemId) {
  return inventorySystem.getItemCount({
    itemType: ITEM_TYPES.tool,
    itemId,
  });
}

function consumableCount(inventorySystem, itemId) {
  return inventorySystem.getItemCount({
    itemType: ITEM_TYPES.consumable,
    itemId,
  });
}
