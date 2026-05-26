import { TOOL_DEFINITIONS } from '../tools/toolSystem.js';
import { BLOCK_DEFINITIONS, BLOCK_IDS } from '../world/blockTypes.js';

export const ITEM_TYPES = {
  block: 'block',
  tool: 'tool',
  consumable: 'consumable',
  resource: 'resource',
};

export const ITEM_IDS = {
  berries: 'berries',
  apple: 'apple',
  stick: 'stick',
  fiber: 'fiber',
  woodPlank: 'woodPlank',
  wildCore: 'wildCore',
};

export const ITEM_DEFINITIONS = {
  [ITEM_IDS.berries]: {
    itemType: ITEM_TYPES.consumable,
    itemId: ITEM_IDS.berries,
    name: 'Berries',
    shortName: 'Berry',
    category: 'food',
    maxStack: 16,
    color: '#ca3d6f',
    consumable: {
      hungerRestore: 12,
      healthRestore: 2,
      staminaRestore: 8,
    },
  },
  [ITEM_IDS.apple]: {
    itemType: ITEM_TYPES.consumable,
    itemId: ITEM_IDS.apple,
    name: 'Apple',
    shortName: 'Apple',
    category: 'food',
    maxStack: 16,
    color: '#d8483f',
    consumable: {
      hungerRestore: 18,
      healthRestore: 4,
      staminaRestore: 12,
    },
  },
  [ITEM_IDS.stick]: {
    itemType: ITEM_TYPES.resource,
    itemId: ITEM_IDS.stick,
    name: 'Stick',
    shortName: 'Stick',
    category: 'crafting',
    maxStack: 64,
    color: '#9b6a39',
  },
  [ITEM_IDS.fiber]: {
    itemType: ITEM_TYPES.resource,
    itemId: ITEM_IDS.fiber,
    name: 'Fiber',
    shortName: 'Fiber',
    category: 'crafting',
    maxStack: 64,
    color: '#6fbd59',
  },
  [ITEM_IDS.woodPlank]: {
    itemType: ITEM_TYPES.resource,
    itemId: ITEM_IDS.woodPlank,
    name: 'Wood Plank',
    shortName: 'Plank',
    category: 'crafting',
    maxStack: 64,
    color: '#b47a3c',
  },
  [ITEM_IDS.wildCore]: {
    itemType: ITEM_TYPES.resource,
    itemId: ITEM_IDS.wildCore,
    name: 'Wild Core',
    shortName: 'Core',
    category: 'combat',
    maxStack: 32,
    color: '#a94f75',
  },
};

export function createItemStack({ itemType, itemId, count = 1, maxStack = null, name = null }) {
  const itemDefinition = getItemDefinition({ itemType, itemId });

  return {
    itemType,
    itemId,
    count,
    maxStack: maxStack ?? itemDefinition.maxStack,
    name: name ?? itemDefinition.name,
  };
}

export function normalizeItemStack(itemStack) {
  if (!itemStack) {
    return null;
  }

  return createItemStack(itemStack);
}

export function normalizeDrop(drop) {
  if (drop === null || drop === undefined) {
    return null;
  }

  if (typeof drop === 'number') {
    return createItemStack({
      itemType: ITEM_TYPES.block,
      itemId: drop,
      count: 1,
    });
  }

  return createItemStack({
    itemType: drop.itemType,
    itemId: drop.itemId,
    count: drop.count ?? 1,
  });
}

export function getItemDefinition({ itemType, itemId }) {
  if (itemType === ITEM_TYPES.block) {
    const blockDefinition = BLOCK_DEFINITIONS[itemId] ?? BLOCK_DEFINITIONS[BLOCK_IDS.air];

    return {
      itemType,
      itemId,
      name: blockDefinition.name,
      shortName: blockDefinition.name,
      category: 'block',
      maxStack: 64,
      color: blockDefinition.color,
      placeableBlockId: itemId,
    };
  }

  if (itemType === ITEM_TYPES.tool) {
    const toolDefinition = TOOL_DEFINITIONS[itemId];

    return {
      itemType,
      itemId,
      name: toolDefinition?.name ?? String(itemId),
      shortName: toolDefinition?.name ?? String(itemId),
      category: 'tool',
      maxStack: 1,
      color: '#d9dee7',
      toolId: itemId,
    };
  }

  return ITEM_DEFINITIONS[itemId] ?? {
    itemType,
    itemId,
    name: String(itemId),
    shortName: String(itemId),
    category: 'unknown',
    maxStack: 64,
    color: '#ffffff',
  };
}

export function getItemDisplay(itemStack) {
  const itemDefinition = getItemDefinition(itemStack);

  return {
    color: itemDefinition.color,
    name: itemDefinition.name,
    shortName: itemDefinition.shortName,
    category: itemDefinition.category,
  };
}

export function getConsumableEffect(itemStack) {
  return getItemDefinition(itemStack).consumable ?? null;
}
