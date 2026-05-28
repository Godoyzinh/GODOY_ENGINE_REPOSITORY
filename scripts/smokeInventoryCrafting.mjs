import assert from 'node:assert/strict';
import { CraftingSystem } from '../src/crafting/craftingSystem.js';
import { RECIPE_IDS } from '../src/crafting/recipeRegistry.js';
import { ITEM_IDS, ITEM_TYPES, createItemStack } from '../src/items/itemRegistry.js';
import { InventorySystem } from '../src/player/inventorySystem.js';
import { PlayerState } from '../src/player/playerState.js';
import { SurvivalSystem } from '../src/player/survivalSystem.js';
import { TOOL_IDS } from '../src/tools/toolSystem.js';
import { BLOCK_IDS } from '../src/world/blockTypes.js';

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
};

assertCraftingUsesFreedStorage();
assertPickupStacksIntoBackpack();
assertConsumablesUseSelectedHotbarSlot();

console.log('smoke:inventory ok');

function assertCraftingUsesFreedStorage() {
  const playerState = new PlayerState();
  const inventorySystem = new InventorySystem({
    playerState,
    initialStacks: [
      blockStack(BLOCK_IDS.wood, 1),
      blockStack(BLOCK_IDS.dirt, 64),
      blockStack(BLOCK_IDS.stone, 64),
      blockStack(BLOCK_IDS.sand, 64),
      blockStack(BLOCK_IDS.grass, 64),
      blockStack(BLOCK_IDS.rock, 64),
      toolStack(TOOL_IDS.pickaxe),
      toolStack(TOOL_IDS.axe),
      consumableStack(ITEM_IDS.berries, 16),
    ],
  });
  const craftingSystem = new CraftingSystem({ inventorySystem });

  assert.equal(craftingSystem.craft(RECIPE_IDS.woodPlanks), true);
  assert.equal(inventorySystem.getItemCount({
    itemType: ITEM_TYPES.resource,
    itemId: ITEM_IDS.woodPlank,
  }), 4);
}

function assertPickupStacksIntoBackpack() {
  const inventorySystem = new InventorySystem({
    playerState: new PlayerState(),
    backpackSize: 2,
    initialStacks: [
      blockStack(BLOCK_IDS.grass, 64),
      blockStack(BLOCK_IDS.dirt, 64),
      blockStack(BLOCK_IDS.stone, 64),
      blockStack(BLOCK_IDS.sand, 64),
      blockStack(BLOCK_IDS.wood, 64),
      blockStack(BLOCK_IDS.rock, 64),
      blockStack(BLOCK_IDS.planks, 64),
      toolStack(TOOL_IDS.pickaxe),
      toolStack(TOOL_IDS.axe),
    ],
  });

  assert.equal(inventorySystem.addItem({
    itemType: ITEM_TYPES.resource,
    itemId: ITEM_IDS.fiber,
    count: 70,
  }), true);
  assert.equal(inventorySystem.backpack.length, 2);
  assert.equal(inventorySystem.getItemCount({
    itemType: ITEM_TYPES.resource,
    itemId: ITEM_IDS.fiber,
  }), 70);

  assert.equal(inventorySystem.addItem({
    itemType: ITEM_TYPES.resource,
    itemId: ITEM_IDS.fiber,
    count: 10,
  }), true);
  assert.equal(inventorySystem.getItemCount({
    itemType: ITEM_TYPES.resource,
    itemId: ITEM_IDS.fiber,
  }), 80);
}

function assertConsumablesUseSelectedHotbarSlot() {
  const playerState = new PlayerState({
    hunger: 40,
    health: 80,
    selectedSlot: 0,
  });
  const inventorySystem = new InventorySystem({
    playerState,
    initialStacks: [
      consumableStack(ITEM_IDS.berries, 2),
      blockStack(BLOCK_IDS.dirt, 64),
    ],
  });
  const survivalSystem = new SurvivalSystem({
    playerState,
    inventorySystem,
  });

  assert.equal(survivalSystem.consumeSelectedItem(), true);
  assert.equal(inventorySystem.getSelectedStack().count, 1);
  assert.equal(playerState.hunger, 52);
  assert.equal(playerState.health, 82);
}

function blockStack(itemId, count) {
  return createItemStack({
    itemType: ITEM_TYPES.block,
    itemId,
    count,
  });
}

function toolStack(itemId) {
  return createItemStack({
    itemType: ITEM_TYPES.tool,
    itemId,
    count: 1,
  });
}

function consumableStack(itemId, count) {
  return createItemStack({
    itemType: ITEM_TYPES.consumable,
    itemId,
    count,
  });
}
