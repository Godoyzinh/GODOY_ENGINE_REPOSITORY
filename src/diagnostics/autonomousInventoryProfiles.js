import { ITEM_IDS, ITEM_TYPES, createItemStack } from '../items/itemRegistry.js';
import { TOOL_IDS } from '../tools/toolSystem.js';
import { BLOCK_IDS } from '../world/blockTypes.js';

export const AUTONOMOUS_INVENTORY_PROFILE_IDS = {
  empty: 'empty',
  survivalStart: 'survival-start',
  debugRich: 'debug-rich',
};

export const DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID = AUTONOMOUS_INVENTORY_PROFILE_IDS.survivalStart;

export const AUTONOMOUS_INVENTORY_PROFILE_OPTIONS = [
  {
    id: AUTONOMOUS_INVENTORY_PROFILE_IDS.empty,
    label: 'Empty',
  },
  {
    id: AUTONOMOUS_INVENTORY_PROFILE_IDS.survivalStart,
    label: 'Survival Start',
  },
  {
    id: AUTONOMOUS_INVENTORY_PROFILE_IDS.debugRich,
    label: 'Debug Rich',
  },
];

const HEADLESS_INVENTORY_KEYS = [
  'dirt',
  'stone',
  'wood',
  'planks',
  'sticks',
  'coal',
  'ironOre',
  'ironIngot',
  'furnace',
  'basicTools',
  'ironTools',
  'berries',
  'drops',
  'grass',
  'sand',
  'leaves',
  'water',
  'campfire',
];

const PROFILE_DEFINITIONS = {
  [AUTONOMOUS_INVENTORY_PROFILE_IDS.empty]: {
    id: AUTONOMOUS_INVENTORY_PROFILE_IDS.empty,
    label: 'Empty',
    headlessInventory: {},
    engineStacks: [],
  },
  [AUTONOMOUS_INVENTORY_PROFILE_IDS.survivalStart]: {
    id: AUTONOMOUS_INVENTORY_PROFILE_IDS.survivalStart,
    label: 'Survival Start',
    headlessInventory: {
      berries: 2,
    },
    engineStacks: [
      { itemType: ITEM_TYPES.consumable, itemId: ITEM_IDS.berries, count: 2 },
    ],
  },
  [AUTONOMOUS_INVENTORY_PROFILE_IDS.debugRich]: {
    id: AUTONOMOUS_INVENTORY_PROFILE_IDS.debugRich,
    label: 'Debug Rich',
    headlessInventory: {
      grass: 32,
      dirt: 32,
      stone: 32,
      sand: 32,
      wood: 32,
      berries: 6,
      basicTools: 3,
    },
    engineStacks: [
      { itemType: ITEM_TYPES.block, itemId: BLOCK_IDS.grass, count: 32 },
      { itemType: ITEM_TYPES.block, itemId: BLOCK_IDS.dirt, count: 32 },
      { itemType: ITEM_TYPES.block, itemId: BLOCK_IDS.stone, count: 32 },
      { itemType: ITEM_TYPES.block, itemId: BLOCK_IDS.sand, count: 32 },
      { itemType: ITEM_TYPES.block, itemId: BLOCK_IDS.wood, count: 32 },
      { itemType: ITEM_TYPES.consumable, itemId: ITEM_IDS.berries, count: 6 },
      { itemType: ITEM_TYPES.tool, itemId: TOOL_IDS.pickaxe, name: 'Pickaxe', count: 1 },
      { itemType: ITEM_TYPES.tool, itemId: TOOL_IDS.axe, name: 'Axe', count: 1 },
      { itemType: ITEM_TYPES.tool, itemId: TOOL_IDS.hand, name: 'Hand', count: 1 },
    ],
  },
};

export function normalizeAutonomousInventoryProfileId(profileId) {
  return PROFILE_DEFINITIONS[profileId]?.id ?? DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID;
}

export function getAutonomousInventoryProfile(profileId) {
  return PROFILE_DEFINITIONS[normalizeAutonomousInventoryProfileId(profileId)];
}

export function createHeadlessInventoryForProfile(profileId) {
  const profile = getAutonomousInventoryProfile(profileId);
  const inventory = Object.fromEntries(HEADLESS_INVENTORY_KEYS.map((key) => [key, 0]));

  return {
    ...inventory,
    ...profile.headlessInventory,
  };
}

export function createEngineInventoryStacksForProfile(profileId) {
  return getAutonomousInventoryProfile(profileId).engineStacks.map((stack) => createItemStack(stack));
}
