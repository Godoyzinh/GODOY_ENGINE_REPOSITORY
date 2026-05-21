import { BLOCK_IDS } from './blockTypes.js';

export class TerrainNoise {
  getHeightAt(x, z) {
    const broadHills = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 2.2;
    const rollingDetail = Math.sin((x + z) * 0.22) * 0.5;
    const ridge = Math.sin(x * 0.031 + z * 0.017) * 1.4;

    return Math.floor(broadHills + rollingDetail + ridge + 4);
  }

  getSurfaceBlockId(height) {
    if (height <= 2) {
      return BLOCK_IDS.sand;
    }

    return BLOCK_IDS.grass;
  }
}
