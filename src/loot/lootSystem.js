import { ITEM_IDS, ITEM_TYPES, createItemStack } from '../items/itemRegistry.js';

export const LOOT_TABLE_IDS = {
  villageChest: 'villageChest',
  ruinChest: 'ruinChest',
  campChest: 'campChest',
};

const LOOT_TABLES = {
  [LOOT_TABLE_IDS.villageChest]: {
    id: LOOT_TABLE_IDS.villageChest,
    rarity: 'common',
    rolls: 3,
    entries: [
      createEntry({ itemId: ITEM_IDS.apple, itemType: ITEM_TYPES.consumable, min: 1, max: 2, weight: 4 }),
      createEntry({ itemId: ITEM_IDS.woodPlank, itemType: ITEM_TYPES.resource, min: 3, max: 7, weight: 5 }),
      createEntry({ itemId: ITEM_IDS.stick, itemType: ITEM_TYPES.resource, min: 2, max: 6, weight: 3 }),
      createEntry({ itemId: ITEM_IDS.coal, itemType: ITEM_TYPES.resource, min: 1, max: 3, weight: 2 }),
    ],
  },
  [LOOT_TABLE_IDS.ruinChest]: {
    id: LOOT_TABLE_IDS.ruinChest,
    rarity: 'rare',
    rolls: 3,
    entries: [
      createEntry({ itemId: ITEM_IDS.ironOre, itemType: ITEM_TYPES.resource, min: 1, max: 3, weight: 4 }),
      createEntry({ itemId: ITEM_IDS.coal, itemType: ITEM_TYPES.resource, min: 2, max: 5, weight: 4 }),
      createEntry({ itemId: ITEM_IDS.wildCore, itemType: ITEM_TYPES.resource, min: 1, max: 1, weight: 1 }),
      createEntry({ itemId: ITEM_IDS.lootCache, itemType: ITEM_TYPES.resource, min: 1, max: 1, weight: 2 }),
    ],
  },
  [LOOT_TABLE_IDS.campChest]: {
    id: LOOT_TABLE_IDS.campChest,
    rarity: 'uncommon',
    rolls: 2,
    entries: [
      createEntry({ itemId: ITEM_IDS.berries, itemType: ITEM_TYPES.consumable, min: 2, max: 5, weight: 4 }),
      createEntry({ itemId: ITEM_IDS.coal, itemType: ITEM_TYPES.resource, min: 1, max: 4, weight: 4 }),
      createEntry({ itemId: ITEM_IDS.fiber, itemType: ITEM_TYPES.resource, min: 2, max: 6, weight: 3 }),
      createEntry({ itemId: ITEM_IDS.ironOre, itemType: ITEM_TYPES.resource, min: 1, max: 2, weight: 1 }),
    ],
  },
};

export class LootSystem {
  generateChestLoot({ tableId, seed }) {
    const lootTable = LOOT_TABLES[tableId] ?? LOOT_TABLES[LOOT_TABLE_IDS.campChest];
    const stacksByKey = new Map();

    for (let rollIndex = 0; rollIndex < lootTable.rolls; rollIndex += 1) {
      const entry = pickWeightedEntry(lootTable.entries, getDeterministicRandom(`${seed}:${rollIndex}`));
      const count = getDeterministicCount({
        minimum: entry.min,
        maximum: entry.max,
        seed: `${seed}:count:${rollIndex}`,
      });
      const key = `${entry.itemType}:${entry.itemId}`;
      const existingStack = stacksByKey.get(key);

      if (existingStack) {
        existingStack.count += count;
      } else {
        stacksByKey.set(key, createItemStack({
          itemType: entry.itemType,
          itemId: entry.itemId,
          count,
        }));
      }
    }

    return [...stacksByKey.values()];
  }

  getLootTable(tableId) {
    return LOOT_TABLES[tableId] ?? null;
  }
}

function createEntry({ itemType, itemId, min, max, weight }) {
  return {
    itemType,
    itemId,
    min,
    max,
    weight,
  };
}

function pickWeightedEntry(entries, roll) {
  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);
  let cursor = roll * totalWeight;

  for (const entry of entries) {
    cursor -= entry.weight;

    if (cursor <= 0) {
      return entry;
    }
  }

  return entries[entries.length - 1];
}

function getDeterministicCount({ minimum, maximum, seed }) {
  if (minimum === maximum) {
    return minimum;
  }

  return minimum + Math.floor(getDeterministicRandom(seed) * (maximum - minimum + 1));
}

function getDeterministicRandom(seed) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}
