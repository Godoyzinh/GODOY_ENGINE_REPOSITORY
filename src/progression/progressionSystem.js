import { ITEM_IDS, ITEM_TYPES } from '../items/itemRegistry.js';
import { BLOCK_IDS } from '../world/blockTypes.js';

export const PROGRESSION_TIERS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    order: 0,
    equipmentTier: 'hand',
  },
  wood: {
    id: 'wood',
    name: 'Wood',
    order: 1,
    equipmentTier: 'wood',
  },
  stone: {
    id: 'stone',
    name: 'Stone',
    order: 2,
    equipmentTier: 'stone',
  },
  iron: {
    id: 'iron',
    name: 'Iron',
    order: 3,
    equipmentTier: 'iron',
  },
};

export class ProgressionSystem {
  constructor({ inventorySystem }) {
    this.inventorySystem = inventorySystem;
    this.currentTier = PROGRESSION_TIERS.starter;
    this.unlockedTierIds = new Set([PROGRESSION_TIERS.starter.id]);
    this.snapshot = this.createSnapshot();
  }

  update() {
    this.currentTier = this.resolveCurrentTier();

    for (const tier of Object.values(PROGRESSION_TIERS)) {
      if (tier.order <= this.currentTier.order) {
        this.unlockedTierIds.add(tier.id);
      }
    }

    this.snapshot = this.createSnapshot();
  }

  resolveCurrentTier() {
    if (this.hasItem(ITEM_TYPES.resource, ITEM_IDS.ironIngot) || this.hasItem(ITEM_TYPES.resource, ITEM_IDS.ironOre)) {
      return PROGRESSION_TIERS.iron;
    }

    if (this.hasItem(ITEM_TYPES.block, BLOCK_IDS.stone) || this.hasItem(ITEM_TYPES.block, BLOCK_IDS.rock)) {
      return PROGRESSION_TIERS.stone;
    }

    if (this.hasItem(ITEM_TYPES.resource, ITEM_IDS.woodPlank) || this.hasItem(ITEM_TYPES.block, BLOCK_IDS.wood)) {
      return PROGRESSION_TIERS.wood;
    }

    return PROGRESSION_TIERS.starter;
  }

  hasItem(itemType, itemId) {
    return this.inventorySystem.getItemCount({ itemType, itemId }) > 0;
  }

  createSnapshot() {
    return {
      currentTier: this.currentTier.name,
      currentTierId: this.currentTier.id,
      equipmentTier: this.currentTier.equipmentTier,
      unlockedTiers: [...this.unlockedTierIds],
      nextTier: getNextTier(this.currentTier)?.name ?? 'Max',
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}

function getNextTier(currentTier) {
  return Object.values(PROGRESSION_TIERS)
    .sort((left, right) => left.order - right.order)
    .find((tier) => tier.order > currentTier.order) ?? null;
}
