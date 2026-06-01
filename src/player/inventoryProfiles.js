import { ITEM_IDS, ITEM_TYPES, createItemStack } from '../items/itemRegistry.js';
import { TOOL_IDS } from '../tools/toolSystem.js';
import { BLOCK_IDS } from '../world/blockTypes.js';

export const INVENTORY_PROFILE_IDS = {
  empty: 'empty',
  survivalStart: 'survival-start',
  debugRich: 'debug-rich',
};

export const INVENTORY_INITIALIZATION_SOURCES = {
  newSurvivalWorld: 'new-survival-world',
  playSolo: 'play-solo',
  multiplayerJoin: 'multiplayer-join',
  saveRestore: 'save-restore',
  debugInventory: 'debug-inventory',
  autonomousPlaytest: 'autonomous-playtest',
  customStacks: 'custom-stacks',
};

export const DEFAULT_INVENTORY_PROFILE_ID = INVENTORY_PROFILE_IDS.survivalStart;

export const INVENTORY_PROFILE_OPTIONS = [
  {
    id: INVENTORY_PROFILE_IDS.empty,
    label: 'Empty',
  },
  {
    id: INVENTORY_PROFILE_IDS.survivalStart,
    label: 'Survival Start',
  },
  {
    id: INVENTORY_PROFILE_IDS.debugRich,
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
  [INVENTORY_PROFILE_IDS.empty]: {
    id: INVENTORY_PROFILE_IDS.empty,
    label: 'Empty',
    headlessInventory: {},
    engineStacks: [],
  },
  [INVENTORY_PROFILE_IDS.survivalStart]: {
    id: INVENTORY_PROFILE_IDS.survivalStart,
    label: 'Survival Start',
    headlessInventory: {
      berries: 2,
    },
    engineStacks: [
      { itemType: ITEM_TYPES.consumable, itemId: ITEM_IDS.berries, count: 2 },
    ],
  },
  [INVENTORY_PROFILE_IDS.debugRich]: {
    id: INVENTORY_PROFILE_IDS.debugRich,
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
      { itemType: ITEM_TYPES.tool, itemId: TOOL_IDS.pickaxe, count: 1 },
      { itemType: ITEM_TYPES.tool, itemId: TOOL_IDS.axe, count: 1 },
      { itemType: ITEM_TYPES.tool, itemId: TOOL_IDS.hand, count: 1 },
    ],
  },
};

export function normalizeInventoryProfileId(profileId) {
  return PROFILE_DEFINITIONS[profileId]?.id ?? DEFAULT_INVENTORY_PROFILE_ID;
}

export function resolveInventoryProfileId(profileId, { allowDebugProfile = false } = {}) {
  const normalizedProfileId = normalizeInventoryProfileId(profileId);

  if (normalizedProfileId === INVENTORY_PROFILE_IDS.debugRich && !allowDebugProfile) {
    return DEFAULT_INVENTORY_PROFILE_ID;
  }

  return normalizedProfileId;
}

export function getInventoryProfile(profileId) {
  return PROFILE_DEFINITIONS[normalizeInventoryProfileId(profileId)];
}

export function createHeadlessInventoryForProfile(profileId) {
  const profile = getInventoryProfile(profileId);
  const inventory = Object.fromEntries(HEADLESS_INVENTORY_KEYS.map((key) => [key, 0]));

  return {
    ...inventory,
    ...profile.headlessInventory,
  };
}

export function createInventoryStacksForProfile(profileId) {
  return getInventoryProfile(profileId).engineStacks.map((stack) => createItemStack(stack));
}
