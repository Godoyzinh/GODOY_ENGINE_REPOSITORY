import { ITEM_IDS, ITEM_TYPES } from '../items/itemRegistry.js';
import { BLOCK_IDS } from '../world/blockTypes.js';

export const RECIPE_IDS = {
  woodPlanks: 'woodPlanks',
  sticks: 'sticks',
  berrySnack: 'berrySnack',
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
};

export function getRecipes() {
  return Object.values(RECIPE_REGISTRY);
}

export function getRecipe(recipeId) {
  return RECIPE_REGISTRY[recipeId] ?? null;
}
