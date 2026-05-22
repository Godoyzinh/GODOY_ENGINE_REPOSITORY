export class DebugOverlay {
  constructor({ rootElement }) {
    this.framesPerSecond = 60;
    this.element = document.createElement('div');
    this.element.className = 'debug-overlay';
    rootElement.appendChild(this.element);
  }

  update({ deltaTime, interactionStatus, playerPosition, terrainStats }) {
    const instantFramesPerSecond = 1 / Math.max(deltaTime, 0.001);
    this.framesPerSecond = Math.round(this.framesPerSecond * 0.9 + instantFramesPerSecond * 0.1);

    this.element.innerHTML = `
      <div class="debug-overlay__title">GODOY ENGINE DEBUG</div>
      ${this.createRow('FPS', this.framesPerSecond)}
      ${this.createRow('Delta', `${(deltaTime * 1000).toFixed(1)}ms`)}
      ${this.createRow('Player X', playerPosition.x.toFixed(2))}
      ${this.createRow('Player Y', playerPosition.y.toFixed(2))}
      ${this.createRow('Player Z', playerPosition.z.toFixed(2))}
      ${this.createRow('Chunks', terrainStats.chunksLoaded)}
      ${this.createRow('Visible', terrainStats.chunksVisible)}
      ${this.createRow('Queue', terrainStats.chunksQueued)}
      ${this.createRow('Biome', terrainStats.activeBiome)}
      ${this.createRow('Blocks', terrainStats.blocksVisible)}
      ${this.createRow('Pool', terrainStats.pooledChunks)}
      ${this.createRow('Saved', terrainStats.savedChunks)}
      ${this.createRow('Voxel', interactionStatus)}
    `;
  }

  createRow(label, value) {
    return `
      <div class="debug-overlay__row">
        <span class="debug-overlay__label">${label}</span>
        <span>${value}</span>
      </div>
    `;
  }
}
