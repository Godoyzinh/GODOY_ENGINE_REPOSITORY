import { BIOME_IDS } from '../world/biomeSystem.js';

export const HOSTILE_SPAWN_TABLES = {
  [BIOME_IDS.plains]: {
    daytimeChance: 0.08,
    nighttimeChance: 0.34,
  },
  [BIOME_IDS.mountains]: {
    daytimeChance: 0.14,
    nighttimeChance: 0.46,
  },
  [BIOME_IDS.desert]: {
    daytimeChance: 0.06,
    nighttimeChance: 0.28,
  },
};

export function getHostileSpawnChance({ biomeId, isNight }) {
  const spawnTable = HOSTILE_SPAWN_TABLES[biomeId] ?? HOSTILE_SPAWN_TABLES[BIOME_IDS.plains];

  return isNight ? spawnTable.nighttimeChance : spawnTable.daytimeChance;
}
