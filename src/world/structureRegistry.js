import { LOOT_TABLE_IDS } from '../loot/lootSystem.js';
import { BIOME_IDS } from './biomeSystem.js';
import { BLOCK_IDS } from './blockTypes.js';

export const STRUCTURE_IDS = {
  village: 'village',
  ruin: 'ruin',
  camp: 'camp',
};

export const STRUCTURE_DEFINITIONS = {
  [STRUCTURE_IDS.village]: {
    id: STRUCTURE_IDS.village,
    name: 'Village Hut',
    allowedBiomes: [BIOME_IDS.plains],
    footprint: { width: 6, depth: 6 },
    chance: 0.1,
    lootTableId: LOOT_TABLE_IDS.villageChest,
    primaryBlockId: BLOCK_IDS.planks,
  },
  [STRUCTURE_IDS.ruin]: {
    id: STRUCTURE_IDS.ruin,
    name: 'Ancient Ruin',
    allowedBiomes: [BIOME_IDS.mountains, BIOME_IDS.desert],
    footprint: { width: 6, depth: 5 },
    chance: 0.13,
    lootTableId: LOOT_TABLE_IDS.ruinChest,
    primaryBlockId: BLOCK_IDS.sandstone,
  },
  [STRUCTURE_IDS.camp]: {
    id: STRUCTURE_IDS.camp,
    name: 'Survivor Camp',
    allowedBiomes: [BIOME_IDS.plains, BIOME_IDS.mountains, BIOME_IDS.desert],
    footprint: { width: 5, depth: 5 },
    chance: 0.16,
    lootTableId: LOOT_TABLE_IDS.campChest,
    primaryBlockId: BLOCK_IDS.campfire,
  },
};

export function getStructureDefinitionsForBiome(biomeId) {
  return Object.values(STRUCTURE_DEFINITIONS).filter((definition) => definition.allowedBiomes.includes(biomeId));
}
