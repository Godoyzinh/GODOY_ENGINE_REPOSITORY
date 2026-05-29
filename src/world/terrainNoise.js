import { BLOCK_IDS } from './blockTypes.js';
import { BiomeSystem } from './biomeSystem.js';
import { PerlinNoise } from './perlinNoise.js';
import { DEFAULT_WORLD_SEED, WATER_LEVEL } from './worldConstants.js';

export class TerrainNoise {
  constructor({ seed = DEFAULT_WORLD_SEED } = {}) {
    this.seed = seed;
    this.heightNoise = new PerlinNoise(`${seed}:height`);
    this.climateNoise = new PerlinNoise(`${seed}:climate`);
    this.caveNoise = new PerlinNoise(`${seed}:caves`);
    this.biomeSystem = new BiomeSystem({ climateNoise: this.climateNoise });
  }

  getHeightAt(x, z) {
    return this.getColumnProfile(x, z).surfaceY;
  }

  getColumnProfile(x, z) {
    const biomeProfile = this.biomeSystem.getBiomeProfile(x, z);
    const weights = biomeProfile.weights;
    const baseHeight = this.biomeSystem.blendBiomeValue(weights, 'baseHeight');
    const heightScale = this.biomeSystem.blendBiomeValue(weights, 'heightScale');
    const roughness = this.biomeSystem.blendBiomeValue(weights, 'roughness');
    const continental = this.heightNoise.fractal2D(x, z, {
      frequency: 0.006,
      octaves: 4,
      persistence: 0.55,
    });
    const detail = this.heightNoise.fractal2D(x + 180, z - 220, {
      frequency: 0.03,
      octaves: 3,
      persistence: 0.42,
    });
    const ridge = 1 - Math.abs(
      this.heightNoise.fractal2D(x - 900, z + 420, {
        frequency: 0.012,
        octaves: 3,
        persistence: 0.5,
      }),
    );
    const mountainInfluence = weights.mountains ?? 0;
    const blendedHeight = baseHeight + continental * heightScale + detail * roughness * 3 + ridge * mountainInfluence * 12;

    return {
      biome: biomeProfile.biome,
      biomeWeights: weights,
      surfaceY: Math.floor(blendedHeight),
      waterLevel: WATER_LEVEL,
    };
  }

  getSurfaceBlockId(columnProfile) {
    if (columnProfile.surfaceY <= columnProfile.waterLevel) {
      return BLOCK_IDS.sand;
    }

    return columnProfile.biome.surfaceBlockId;
  }

  getSubsurfaceBlockId(columnProfile) {
    return columnProfile.biome.subsurfaceBlockId;
  }

  shouldCarveCave(x, y, z, surfaceY) {
    if (y > surfaceY - 5 || y < -1) {
      return false;
    }

    const caveValue = this.caveNoise.fractal3D(x, y, z, {
      frequency: 0.045,
      octaves: 3,
      persistence: 0.52,
    });

    return caveValue > 0.28;
  }

  getBiomeAt(x, z) {
    return this.biomeSystem.getBiomeProfile(x, z).biome;
  }
}
