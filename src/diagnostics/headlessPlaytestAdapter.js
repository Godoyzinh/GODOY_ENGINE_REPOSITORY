export class HeadlessPlaytestAdapter {
  constructor({ seed = 1337 } = {}) {
    this.seed = seed;
    this.randomState = seed;
    this.position = { x: 0, y: 8, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.inventory = {
      dirt: 16,
      stone: 0,
      wood: 0,
      planks: 0,
      berries: 4,
      drops: 0,
    };
    this.stats = {
      chunksLoaded: 9,
      chunksVisible: 5,
      chunksQueued: 0,
      activeBiome: 'Plains',
      structuresGenerated: 1,
      activeEntities: 2,
      droppedItems: 0,
      hostiles: 1,
      health: 100,
      hunger: 100,
      stamina: 100,
      saveSizeKb: 2.4,
      lastSavedStateSize: 0,
    };
  }

  begin() {
    this.stats.health = 100;
    this.stats.hunger = 100;
    this.stats.stamina = 100;
  }

  end() {
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  explore({ deltaTime, elapsedSeconds }) {
    const angle = elapsedSeconds * 0.35 + this.noise() * 0.35;
    const speed = elapsedSeconds % 8 < 4 ? 7 : 11;

    this.velocity.x = Math.cos(angle) * speed;
    this.velocity.z = Math.sin(angle) * speed;
    this.position.x += this.velocity.x * deltaTime;
    this.position.z += this.velocity.z * deltaTime;
    this.position.y = 8 + Math.sin(elapsedSeconds * 0.6) * 0.35;
    this.stats.chunksLoaded = 9 + Math.floor(Math.abs(this.position.x + this.position.z) / 32) % 8;
    this.stats.chunksVisible = Math.max(4, this.stats.chunksLoaded - 3);
    this.stats.activeBiome = getBiomeName(this.position.x, this.position.z);

    return {
      ok: true,
      event: this.stats.activeBiome,
    };
  }

  mineBlock() {
    const minedType = this.noise() > 0.42 ? 'stone' : 'wood';

    this.inventory[minedType] += 1;
    this.inventory.drops += 1;
    this.stats.droppedItems += 1;

    return {
      ok: true,
      event: minedType,
    };
  }

  placeBlock() {
    if (this.inventory.dirt <= 0 && this.inventory.stone <= 0) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const blockType = this.inventory.dirt > 0 ? 'dirt' : 'stone';

    this.inventory[blockType] -= 1;

    return {
      ok: true,
      event: blockType,
    };
  }

  collectDrops() {
    if (this.inventory.drops <= 0) {
      return {
        ok: false,
        skipped: true,
      };
    }

    this.inventory.drops -= 1;
    this.stats.droppedItems = Math.max(0, this.stats.droppedItems - 1);

    return {
      ok: true,
      event: 'drop',
    };
  }

  craftBasicItem() {
    if (this.inventory.wood <= 0) {
      return {
        ok: false,
        skipped: true,
      };
    }

    this.inventory.wood -= 1;
    this.inventory.planks += 4;

    return {
      ok: true,
      event: 'Wood Planks',
    };
  }

  fightHostile() {
    this.stats.hostiles = Math.max(1, this.stats.hostiles);
    this.stats.health = Math.max(0, this.stats.health - 4 + Math.round(this.noise() * 3));

    if (this.stats.health <= 0) {
      this.stats.health = 100;
      this.stats.hunger = Math.max(55, this.stats.hunger);

      return {
        ok: true,
        event: 'respawn',
        failures: [{
          code: 'bot-death',
          summary: 'Headless bot died during combat and respawned.',
          severity: 'low',
        }],
      };
    }

    return {
      ok: true,
      event: 'hit',
    };
  }

  survive() {
    this.stats.hunger = Math.max(0, this.stats.hunger - 0.8);
    this.stats.stamina = Math.max(0, this.stats.stamina - 0.4);

    if (this.stats.hunger < 45 && this.inventory.berries > 0) {
      this.inventory.berries -= 1;
      this.stats.hunger = Math.min(100, this.stats.hunger + 12);
      this.stats.health = Math.min(100, this.stats.health + 2);

      return {
        ok: true,
        event: 'ate berries',
      };
    }

    return {
      ok: true,
      event: 'stable',
    };
  }

  checkSaveLoad() {
    try {
      const serialized = JSON.stringify({
        position: this.position,
        inventory: this.inventory,
        stats: this.stats,
      });

      JSON.parse(serialized);
      this.stats.saveSizeKb = serialized.length / 1024;
      this.stats.lastSavedStateSize = serialized.length;

      return {
        ok: true,
        event: 'ok',
      };
    } catch (error) {
      return {
        ok: false,
        failures: [{
          code: 'save-load-error',
          summary: `Headless save/load failed: ${error.message}`,
          severity: 'high',
        }],
      };
    }
  }

  getPosition() {
    return { ...this.position };
  }

  getRuntimeSnapshot() {
    return {
      renderer: {
        width: 0,
        height: 0,
        pixelRatio: 1,
        isWebGL2: false,
        maxTextureSize: 0,
        precision: 'headless',
        shadowsEnabled: false,
      },
      settings: {
        graphicsQuality: 'headless',
        renderDistancePreset: 'headless',
        debugOverlay: false,
        controlsHelp: false,
      },
      player: {
        mode: 'survival',
        isGrounded: true,
        isFlying: false,
        isSprinting: false,
        selectedSlot: 0,
      },
      survival: {
        health: this.stats.health,
        hunger: this.stats.hunger,
        stamina: this.stats.stamina,
        isDead: false,
        lastEvent: 'Headless simulation',
      },
      terrain: {
        chunksLoaded: this.stats.chunksLoaded,
        chunksVisible: this.stats.chunksVisible,
        chunksQueued: this.stats.chunksQueued,
        activeBiome: this.stats.activeBiome,
        renderDistancePreset: 'headless',
        structuresGenerated: this.stats.structuresGenerated,
      },
      entities: {
        activeEntities: this.stats.activeEntities,
        droppedItems: this.stats.droppedItems,
        npcs: 1,
        hostiles: this.stats.hostiles,
        aggroHostiles: 1,
      },
      network: {
        mode: 'headless',
        connectionState: 'offline',
        latencyMs: 0,
        packetsPerSecond: 0,
        syncErrors: 0,
        remotePlayers: 0,
      },
      persistence: {
        saveSizeKb: this.stats.saveSizeKb,
        persistedEntities: this.stats.activeEntities,
        persistedChests: 0,
        compressedChunkCandidates: 0,
      },
      simulationAdapter: {
        type: 'headless',
        seed: this.seed,
        lastSavedStateSize: this.stats.lastSavedStateSize,
      },
    };
  }

  noise() {
    this.randomState = Math.imul(1664525, this.randomState) + 1013904223;

    return ((this.randomState >>> 0) % 10000) / 10000;
  }
}

function getBiomeName(x, z) {
  const index = Math.abs(Math.floor((x * 13 + z * 7) / 64)) % 3;

  return ['Plains', 'Mountains', 'Desert'][index];
}
