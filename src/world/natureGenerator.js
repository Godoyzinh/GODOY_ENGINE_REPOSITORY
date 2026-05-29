import { BLOCK_IDS } from './blockTypes.js';
import { BIOME_IDS } from './biomeSystem.js';

export class NatureGenerator {
  constructor({ noise }) {
    this.noise = noise;
  }

  getDecorationAt(x, z, columnProfile) {
    if (columnProfile.surfaceY <= columnProfile.waterLevel) {
      return null;
    }

    const localRandom = this.noise.random2D(x * 17 + 3, z * 17 - 9);
    const biome = columnProfile.biome;

    if (biome.id !== BIOME_IDS.desert && localRandom < biome.treeChance) {
      return {
        type: 'tree',
        trunkHeight: 3 + Math.floor(this.noise.random2D(x + 77, z - 31) * 3),
      };
    }

    if (localRandom < biome.treeChance + biome.rockChance) {
      return {
        type: 'rock',
      };
    }

    if (localRandom < biome.treeChance + biome.rockChance + biome.grassChance) {
      return {
        type: 'grass',
      };
    }

    return null;
  }

  placeDecoration({ decoration, localX, localZ, surfaceY, setBlock }) {
    if (!decoration) {
      return;
    }

    if (decoration.type === 'tree') {
      this.placeTree({ decoration, localX, localZ, surfaceY, setBlock });
    } else if (decoration.type === 'rock') {
      setBlock(localX, surfaceY + 1, localZ, BLOCK_IDS.rock);
    } else if (decoration.type === 'grass') {
      setBlock(localX, surfaceY + 1, localZ, BLOCK_IDS.grassPlant);
    }
  }

  placeTree({ decoration, localX, localZ, surfaceY, setBlock }) {
    if (localX < 2 || localX > 13 || localZ < 2 || localZ > 13) {
      return;
    }

    for (let yOffset = 1; yOffset <= decoration.trunkHeight; yOffset += 1) {
      setBlock(localX, surfaceY + yOffset, localZ, BLOCK_IDS.wood);
    }

    const leafCenterY = surfaceY + decoration.trunkHeight + 1;

    for (let zOffset = -2; zOffset <= 2; zOffset += 1) {
      for (let xOffset = -2; xOffset <= 2; xOffset += 1) {
        const distance = Math.abs(xOffset) + Math.abs(zOffset);

        if (distance <= 3) {
          setBlock(localX + xOffset, leafCenterY, localZ + zOffset, BLOCK_IDS.leaves);
        }

        if (distance <= 2) {
          setBlock(localX + xOffset, leafCenterY + 1, localZ + zOffset, BLOCK_IDS.leaves);
        }
      }
    }
  }
}
