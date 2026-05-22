export class DebugOverlay {
  constructor({ rootElement }) {
    this.framesPerSecond = 60;
    this.element = document.createElement('div');
    this.element.id = 'debug-overlay';
    this.element.className = 'debug-overlay';
    rootElement.appendChild(this.element);
  }

  update({
    deltaTime,
    interactionStatus,
    playerPosition,
    terrainStats,
    playerState,
    inventorySnapshot,
    miningSnapshot,
  }) {
    const instantFramesPerSecond = 1 / Math.max(deltaTime, 0.001);
    this.framesPerSecond = Math.round(this.framesPerSecond * 0.9 + instantFramesPerSecond * 0.1);

    this.element.innerHTML = `
      <div class="debug-overlay__title">GODOY ENGINE DEBUG</div>
      ${this.createRow('FPS', this.framesPerSecond)}
      ${this.createRow('Delta', `${(deltaTime * 1000).toFixed(1)}ms`)}
      ${this.createRow('Mode', playerState.mode)}
      ${this.createRow('Selected', inventorySnapshot.selectedItemLabel)}
      ${this.createRow('Slot', inventorySnapshot.selectedSlot + 1)}
      ${this.createRow('Player X', playerPosition.x.toFixed(2))}
      ${this.createRow('Player Y', playerPosition.y.toFixed(2))}
      ${this.createRow('Player Z', playerPosition.z.toFixed(2))}
      ${this.createRow('Grounded', playerState.isGrounded ? 'Yes' : 'No')}
      ${this.createRow('Move', getMovementLabel(playerState))}
      ${this.createRow('Chunks', terrainStats.chunksLoaded)}
      ${this.createRow('Visible', terrainStats.chunksVisible)}
      ${this.createRow('Queue', terrainStats.chunksQueued)}
      ${this.createRow('Biome', terrainStats.activeBiome)}
      ${this.createRow('Blocks', terrainStats.blocksVisible)}
      ${this.createRow('Pool', terrainStats.pooledChunks)}
      ${this.createRow('Saved', terrainStats.savedChunks)}
      ${this.createRow('Mining', formatMiningProgress(miningSnapshot))}
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

function getMovementLabel(playerState) {
  if (playerState.isFlying) {
    return playerState.isSprinting ? 'Fly Fast' : 'Fly';
  }

  if (playerState.isCrouching) {
    return 'Crouch';
  }

  return playerState.isSprinting ? 'Sprint' : 'Walk';
}

function formatMiningProgress(miningSnapshot) {
  if (!miningSnapshot || miningSnapshot.progress <= 0) {
    return miningSnapshot?.targetName ?? 'None';
  }

  return `${miningSnapshot.targetName} ${Math.round(miningSnapshot.progress * 100)}%`;
}
