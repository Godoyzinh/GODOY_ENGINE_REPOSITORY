import { ITEM_IDS, ITEM_TYPES } from '../items/itemRegistry.js';
import { TOOL_IDS } from '../tools/toolSystem.js';
import { BLOCK_IDS } from '../world/blockTypes.js';

export const RECIPE_IDS = {
  woodPlanks: 'woodPlanks',
  sticks: 'sticks',
  berrySnack: 'berrySnack',
  furnace: 'furnace',
  campfire: 'campfire',
  ironPickaxe: 'ironPickaxe',
  ironAxe: 'ironAxe',
};

export const RECIPE_REGISTRY = {
  [RECIPE_IDS.woodPlanks]: {
    id: RECIPE_IDS.woodPlanks,
    name: 'Wood Planks',
    category: 'resource',
    inputs: [
      { itemType: ITEM_TYPES.block, itemId: BLOCK_IDS.wood, count: 1 },
    ],
    output: { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.woodPlank, count: 4 },
  },
  [RECIPE_IDS.sticks]: {
    id: RECIPE_IDS.sticks,
    name: 'Sticks',
    category: 'tooling',
    inputs: [
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.woodPlank, count: 2 },
    ],
    output: { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.stick, count: 4 },
  },
  [RECIPE_IDS.berrySnack]: {
    id: RECIPE_IDS.berrySnack,
    name: 'Berry Snack',
    category: 'food',
    inputs: [
      { itemType: ITEM_TYPES.consumable, itemId: ITEM_IDS.berries, count: 2 },
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.fiber, count: 1 },
    ],
    output: { itemType: ITEM_TYPES.consumable, itemId: ITEM_IDS.apple, count: 1 },
  },
  [RECIPE_IDS.furnace]: {
    id: RECIPE_IDS.furnace,
    name: 'Furnace',
    category: 'station',
    inputs: [
      { itemType: ITEM_TYPES.block, itemId: BLOCK_IDS.stone, count: 8 },
    ],
    output: { itemType: ITEM_TYPES.block, itemId: BLOCK_IDS.furnace, count: 1 },
  },
  [RECIPE_IDS.campfire]: {
    id: RECIPE_IDS.campfire,
    name: 'Campfire',
    category: 'station',
    inputs: [
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.stick, count: 3 },
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.coal, count: 1 },
    ],
    output: { itemType: ITEM_TYPES.block, itemId: BLOCK_IDS.campfire, count: 1 },
  },
  [RECIPE_IDS.ironPickaxe]: {
    id: RECIPE_IDS.ironPickaxe,
    name: 'Iron Pickaxe',
    category: 'tooling',
    inputs: [
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.ironIngot, count: 3 },
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.stick, count: 2 },
    ],
    output: { itemType: ITEM_TYPES.tool, itemId: TOOL_IDS.ironPickaxe, count: 1 },
  },
  [RECIPE_IDS.ironAxe]: {
    id: RECIPE_IDS.ironAxe,
    name: 'Iron Axe',
    category: 'tooling',
    inputs: [
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.ironIngot, count: 3 },
      { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.stick, count: 2 },
    ],
    output: { itemType: ITEM_TYPES.tool, itemId: TOOL_IDS.ironAxe, count: 1 },
  },
};

export function getRecipes() {
  return Object.values(RECIPE_REGISTRY);
}

export function getRecipe(recipeId) {
  return RECIPE_REGISTRY[recipeId] ?? null;
}
