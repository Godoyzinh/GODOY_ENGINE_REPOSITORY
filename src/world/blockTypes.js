export const BLOCK_IDS = {
  air: 0,
  grass: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
};

export const BLOCK_DEFINITIONS = {
  [BLOCK_IDS.air]: {
    id: BLOCK_IDS.air,
    name: 'Air',
    material: 'none',
    texture: null,
    hardness: 0,
    collision: false,
    transparent: true,
    color: '#000000',
  },
  [BLOCK_IDS.grass]: {
    id: BLOCK_IDS.grass,
    name: 'Grass',
    material: 'organic',
    texture: null,
    hardness: 1,
    collision: true,
    transparent: false,
    color: '#2f8f45',
  },
  [BLOCK_IDS.dirt]: {
    id: BLOCK_IDS.dirt,
    name: 'Dirt',
    material: 'soil',
    texture: null,
    hardness: 1,
    collision: true,
    transparent: false,
    color: '#8a6139',
  },
  [BLOCK_IDS.stone]: {
    id: BLOCK_IDS.stone,
    name: 'Stone',
    material: 'rock',
    texture: null,
    hardness: 3,
    collision: true,
    transparent: false,
    color: '#828985',
  },
  [BLOCK_IDS.sand]: {
    id: BLOCK_IDS.sand,
    name: 'Sand',
    material: 'granular',
    texture: null,
    hardness: 1,
    collision: true,
    transparent: false,
    color: '#d9c36d',
  },
};

export function isSolidBlock(blockId) {
  return blockId !== BLOCK_IDS.air && BLOCK_DEFINITIONS[blockId]?.collision === true;
}
