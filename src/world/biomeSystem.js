import { BLOCK_IDS } from './blockTypes.js';

export const BIOME_IDS = {
  plains: 'plains',
  mountains: 'mountains',
  desert: 'desert',
};

export const BIOME_DEFINITIONS = {
  [BIOME_IDS.plains]: {
    id: BIOME_IDS.plains,
    name: 'Plains',
    surfaceBlockId: BLOCK_IDS.grass,
    subsurfaceBlockId: BLOCK_IDS.dirt,
    baseHeight: 5,
    heightScale: 6,
    roughness: 0.55,
    treeChance: 0.045,
    grassChance: 0.18,
    rockChance: 0.018,
  },
  [BIOME_IDS.mountains]: {
    id: BIOME_IDS.mountains,
    name: 'Mountains',
    surfaceBlockId: BLOCK_IDS.stone,
    subsurfaceBlockId: BLOCK_IDS.stone,
    baseHeight: 8,
    heightScale: 18,
    roughness: 1.2,
    treeChance: 0.018,
    grassChance: 0.035,
    rockChance: 0.08,
  },
  [BIOME_IDS.desert]: {
    id: BIOME_IDS.desert,
    name: 'Desert',
    surfaceBlockId: BLOCK_IDS.sand,
    subsurfaceBlockId: BLOCK_IDS.sandstone,
    baseHeight: 4,
    heightScale: 5,
    roughness: 0.35,
    treeChance: 0.006,
    grassChance: 0.012,
    rockChance: 0.025,
  },
};

export class BiomeSystem {
  constructor({ climateNoise }) {
    this.climateNoise = climateNoise;
  }

  getBiomeProfile(x, z) {
    const moisture = normalizeNoise(
      this.climateNoise.fractal2D(x + 900, z - 240, {
        frequency: 0.006,
        octaves: 3,
      }),
    );
    const heat = normalizeNoise(
      this.climateNoise.fractal2D(x - 420, z + 700, {
        frequency: 0.005,
        octaves: 3,
      }),
    );
    const elevationControl = normalizeNoise(
      this.climateNoise.fractal2D(x + 1200, z + 1200, {
        frequency: 0.004,
        octaves: 4,
      }),
    );

    const mountainWeight = smoothstep(0.48, 0.68, elevationControl);
    const desertWeight = (1 - mountainWeight) * smoothstep(0.5, 0.7, heat) * (1 - smoothstep(0.36, 0.64, moisture));
    const plainsWeight = Math.max(0, 1 - mountainWeight - desertWeight);
    const weights = {
      [BIOME_IDS.plains]: plainsWeight,
      [BIOME_IDS.mountains]: mountainWeight,
      [BIOME_IDS.desert]: desertWeight,
    };
    const dominantBiomeId = getDominantBiomeId(weights);
    const biome = BIOME_DEFINITIONS[dominantBiomeId] ?? BIOME_DEFINITIONS[BIOME_IDS.plains];

    return {
      biome,
      weights: normalizeWeights(weights),
      heat,
      moisture,
      elevationControl,
    };
  }

  blendBiomeValue(weights, propertyName) {
    return Object.entries(weights).reduce((total, [biomeId, weight]) => {
      return total + BIOME_DEFINITIONS[biomeId][propertyName] * weight;
    }, 0);
  }
}

function getDominantBiomeId(weights) {
  return Object.entries(weights).sort((left, right) => right[1] - left[1])[0][0];
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;

  return Object.fromEntries(Object.entries(weights).map(([biomeId, weight]) => [biomeId, weight / total]));
}

function normalizeNoise(value) {
  return value * 0.5 + 0.5;
}

function smoothstep(edge0, edge1, value) {
  const amount = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);

  return amount * amount * (3 - 2 * amount);
}
