export class DebugOverlay {
  constructor({ rootElement }) {
    this.framesPerSecond = 60;
    this.isVisible = true;
    this.element = document.createElement('div');
    this.element.id = 'debug-overlay';
    this.element.className = 'debug-overlay';
    rootElement.appendChild(this.element);
  }

  setVisible(isVisible) {
    this.isVisible = isVisible;
    this.element.classList.toggle('debug-overlay--hidden', !isVisible);
  }

  update({
    deltaTime,
    interactionStatus,
    playerPosition,
    terrainStats,
    entityStats,
    playerState,
    survivalSnapshot,
    inventorySnapshot,
    miningSnapshot,
    craftingSnapshot,
    damageSnapshot,
    combatSnapshot,
    dayNightSnapshot,
    weatherSnapshot,
    progressionSnapshot,
    furnaceSnapshot,
    buildingSnapshot,
    studioSnapshot,
    prefabSnapshot,
    publishingSnapshot,
    permissionsSnapshot,
    persistenceSnapshot,
    worldSimulationSnapshot,
    audioSnapshot,
    networkSnapshot,
  }) {
    const instantFramesPerSecond = 1 / Math.max(deltaTime, 0.001);
    this.framesPerSecond = Math.round(this.framesPerSecond * 0.9 + instantFramesPerSecond * 0.1);

    if (!this.isVisible) {
      return;
    }

    this.element.innerHTML = `
      <div class="debug-overlay__title">GODOY ENGINE DEBUG</div>
      ${this.createRow('FPS', this.framesPerSecond)}
      ${this.createRow('Delta', `${(deltaTime * 1000).toFixed(1)}ms`)}
      ${this.createRow('Mode', playerState.mode)}
      ${this.createRow('HP', `${Math.round(survivalSnapshot.health)}/${survivalSnapshot.maxHealth}`)}
      ${this.createRow('Food', Math.round(survivalSnapshot.hunger))}
      ${this.createRow('Stamina', Math.round(survivalSnapshot.stamina))}
      ${this.createRow('Time', `${dayNightSnapshot.timeLabel} ${dayNightSnapshot.isNight ? 'Night' : 'Day'}`)}
      ${this.createRow('Pressure', dayNightSnapshot.ambientPressure.toFixed(2))}
      ${this.createRow('Weather', `${weatherSnapshot.state} ${Math.round(weatherSnapshot.intensity * 100)}%`)}
      ${this.createRow('Ambience', weatherSnapshot.ambience)}
      ${this.createRow('Audio', `${audioSnapshot.ambientLayer} ${Math.round(audioSnapshot.volume * 100)}%`)}
      ${this.createRow('Net Mode', `${networkSnapshot.mode} ${networkSnapshot.connectionState}`)}
      ${this.createRow('World', networkSnapshot.worldId ?? 'local')}
      ${this.createRow('Hosted', networkSnapshot.hostedWorlds)}
      ${this.createRow('Players', getServerMetric(networkSnapshot, 'connectedPlayers', networkSnapshot.remotePlayers))}
      ${this.createRow('Latency', `${Math.round(networkSnapshot.latencyMs)}ms`)}
      ${this.createRow('Packets/s', networkSnapshot.packetsPerSecond)}
      ${this.createRow('Net KB', `${formatKilobytes(networkSnapshot.bytesSent)}/${formatKilobytes(networkSnapshot.bytesReceived)}`)}
      ${this.createRow('Sync Errors', networkSnapshot.syncErrors)}
      ${this.createRow('Snapshot Seq', networkSnapshot.lastReceivedSequence)}
      ${this.createRow('Resends', getServerMetric(networkSnapshot, 'resendRequests', 0))}
      ${this.createRow('Reconnects', getServerMetric(networkSnapshot, 'reconnects', 0))}
      ${this.createRow('Buffer', networkSnapshot.serverMetrics?.snapshotBuffer?.bufferedSnapshots ?? 0)}
      ${this.createRow('Server Tick', `${networkSnapshot.serverTick}@${networkSnapshot.serverTickRate}`)}
      ${this.createRow('Tick Cost', `${getServerMetric(networkSnapshot, 'lastTickDurationMs', networkSnapshot.serverTickMs).toFixed(2)}ms`)}
      ${this.createRow('Tier', progressionSnapshot.currentTier)}
      ${this.createRow('Next Tier', progressionSnapshot.nextTier)}
      ${this.createRow('Blueprint', `${buildingSnapshot.selectedBlueprintName} ${buildingSnapshot.rotationLabel}`)}
      ${this.createRow('Studio', `${studioSnapshot.isActive ? 'On' : 'Off'} ${studioSnapshot.activeTool}`)}
      ${this.createRow('Selected Obj', studioSnapshot.selectedObjectLabel)}
      ${this.createRow('Prefabs', `${prefabSnapshot.prefabCount} ${prefabSnapshot.selectedPrefabName}`)}
      ${this.createRow('Editors', studioSnapshot.activeEditors)}
      ${this.createRow('Undo', `${studioSnapshot.undoStack}/${studioSnapshot.redoStack}`)}
      ${this.createRow('Published', publishingSnapshot.publishedWorlds)}
      ${this.createRow('Owner', permissionsSnapshot.ownerId)}
      ${this.createRow('Role', permissionsSnapshot.localRole)}
      ${this.createRow('Selected', inventorySnapshot.selectedItemLabel)}
      ${this.createRow('Slot', inventorySnapshot.selectedSlot + 1)}
      ${this.createRow('Player X', playerPosition.x.toFixed(2))}
      ${this.createRow('Player Y', playerPosition.y.toFixed(2))}
      ${this.createRow('Player Z', playerPosition.z.toFixed(2))}
      ${this.createRow('Grounded', playerState.isGrounded ? 'Yes' : 'No')}
      ${this.createRow('Move', getMovementLabel(playerState))}
      ${this.createRow('Chunks', terrainStats.chunksLoaded)}
      ${this.createRow('Render Dist', terrainStats.renderDistancePreset)}
      ${this.createRow('Visible', terrainStats.chunksVisible)}
      ${this.createRow('Queue', terrainStats.chunksQueued)}
      ${this.createRow('Biome', terrainStats.activeBiome)}
      ${this.createRow('Blocks', terrainStats.blocksVisible)}
      ${this.createRow('Structures', terrainStats.structuresGenerated)}
      ${this.createRow('Pool', terrainStats.pooledChunks)}
      ${this.createRow('Saved', terrainStats.savedChunks)}
      ${this.createRow('Save KB', persistenceSnapshot.saveSizeKb.toFixed(1))}
      ${this.createRow('Persist Ent', persistenceSnapshot.persistedEntities)}
      ${this.createRow('Persist Chest', persistenceSnapshot.persistedChests)}
      ${this.createRow('Prefab Saves', persistenceSnapshot.prefabPlacements)}
      ${this.createRow('Chunk Prep', persistenceSnapshot.compressedChunkCandidates)}
      ${this.createRow('Synced Chunks', networkSnapshot.syncedChunks)}
      ${this.createRow('Rep Ent', networkSnapshot.replicatedEntities)}
      ${this.createRow('Rep Players', networkSnapshot.replicatedPlayerStates)}
      ${this.createRow('Remote Edits', networkSnapshot.pendingRemoteBlockEdits)}
      ${this.createRow('Sync Batch', `${networkSnapshot.lastBatchEntityCount}/${networkSnapshot.lastBatchChunkCount}`)}
      ${this.createRow('Entities', entityStats.activeEntities)}
      ${this.createRow('Ent Pool', entityStats.pooledEntities)}
      ${this.createRow('Ent Save', entityStats.persistableEntities)}
      ${this.createRow('Drops', entityStats.droppedItems)}
      ${this.createRow('NPCs', entityStats.npcs)}
      ${this.createRow('Hostiles', entityStats.hostiles)}
      ${this.createRow('Aggro', entityStats.aggroHostiles)}
      ${this.createRow('Hurt Ent', entityStats.hurtEntities)}
      ${this.createRow('Craftable', craftingSnapshot.craftableCount)}
      ${this.createRow('Furnace', `${furnaceSnapshot.activeJobs} jobs / ${furnaceSnapshot.availableRecipes} ready`)}
      ${this.createRow('World Sim', `${worldSimulationSnapshot.activeSimulationCount} active`)}
      ${this.createRow('Sim Event', worldSimulationSnapshot.lastEvent)}
      ${this.createRow('Survival', survivalSnapshot.lastEvent)}
      ${this.createRow('Damage', formatDamageEvent(damageSnapshot))}
      ${this.createRow('Combat', formatCombatEvent(combatSnapshot))}
      ${this.createRow('Cleanup', entityStats.lastCleanup)}
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

function formatDamageEvent(damageSnapshot) {
  const damageEvent = damageSnapshot?.lastDamageEvent;

  if (!damageEvent) {
    return 'None';
  }

  return `${damageEvent.type} ${damageEvent.amount}`;
}

function formatCombatEvent(combatSnapshot) {
  const lastAttack = combatSnapshot?.lastAttack;

  if (!lastAttack) {
    return 'Ready';
  }

  if (lastAttack.state === 'hit') {
    return `${lastAttack.targetName} -${lastAttack.damage}`;
  }

  return lastAttack.state;
}

function formatKilobytes(bytes) {
  return (bytes / 1024).toFixed(1);
}

function getServerMetric(networkSnapshot, key, fallback) {
  return networkSnapshot.serverMetrics?.[key] ?? fallback;
}
