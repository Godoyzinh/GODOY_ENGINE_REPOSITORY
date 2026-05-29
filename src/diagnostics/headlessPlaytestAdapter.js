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
      sticks: 0,
      coal: 1,
      ironOre: 0,
      ironIngot: 0,
      furnace: 0,
      basicTools: 0,
      ironTools: 0,
      berries: 4,
      drops: 0,
    };
    this.progression = {
      shelterBlocks: 0,
      nightSurvivedSeconds: 0,
      nightSurvived: false,
      equipmentTier: 'starter',
      completedFurnaceJobs: 0,
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
      hostileDamageDone: 0,
      saveSizeKb: 2.4,
      lastSavedStateSize: 0,
    };
  }

  begin() {
    this.stats.health = 100;
    this.stats.hunger = 100;
    this.stats.stamina = 100;
    this.progression.nightSurvivedSeconds = 0;
    this.progression.nightSurvived = false;
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
    this.stats.hostileDamageDone += 8;
    this.stats.health = Math.max(0, this.stats.health - 4 + Math.round(this.noise() * 3));

    if (this.stats.health <= 0) {
      this.stats.health = 100;
      this.stats.hunger = Math.max(55, this.stats.hunger);

      return {
        ok: true,
        event: 'respawn',
        entityDamageApplied: true,
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
      entityDamageApplied: true,
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

  getPlanningState() {
    return {
      inventory: {
        dirt: this.inventory.dirt,
        stone: this.inventory.stone,
        wood: this.inventory.wood,
        planks: this.inventory.planks,
        sticks: this.inventory.sticks,
        coal: this.inventory.coal,
        fuel: this.inventory.coal,
        ironOre: this.inventory.ironOre,
        ironIngot: this.inventory.ironIngot,
        furnace: this.inventory.furnace,
        berries: this.inventory.berries,
        food: this.inventory.berries,
        basicTools: this.inventory.basicTools,
        ironTools: this.inventory.ironTools,
        buildBlocks: this.inventory.dirt + this.inventory.stone + this.inventory.wood + this.inventory.planks,
      },
      survival: {
        health: this.stats.health,
        hunger: this.stats.hunger,
        stamina: this.stats.stamina,
      },
      world: {
        activeBiome: this.stats.activeBiome,
        shelterBlocks: this.progression.shelterBlocks,
        nightSurvivedSeconds: this.progression.nightSurvivedSeconds,
        nightSurvived: this.progression.nightSurvived,
      },
      progression: {
        equipmentTier: this.progression.equipmentTier,
      },
    };
  }

  executeGoalStep({ plan, deltaTime, elapsedSeconds }) {
    this.moveTowardGoal({
      plan,
      deltaTime,
      elapsedSeconds,
    });

    const secondaryActions = [{
      action: 'navigate',
      event: plan.goalId,
    }];

    switch (plan.action) {
      case 'gatherWood':
        return this.gatherWood(secondaryActions);
      case 'craftPlanks':
        return this.craftPlanks();
      case 'craftTools':
        return this.craftTools();
      case 'gatherStone':
        return this.gatherStone(secondaryActions);
      case 'buildShelter':
        return this.buildShelter();
      case 'surviveNight':
        return this.surviveNight(deltaTime, secondaryActions);
      case 'obtainFurnace':
        return this.obtainFurnace();
      case 'gatherOre':
        return this.gatherOre(secondaryActions);
      case 'gatherFuel':
        return this.gatherFuel(secondaryActions);
      case 'smeltOre':
        return this.smeltOre();
      case 'upgradeEquipment':
        return this.upgradeEquipment();
      default:
        return {
          ok: false,
          skipped: true,
        };
    }
  }

  moveTowardGoal({ plan, deltaTime, elapsedSeconds }) {
    const goalHash = hashGoal(plan.goalId ?? 'idle');
    const angle = goalHash * 0.7 + elapsedSeconds * 0.18;
    const speed = plan.action === 'surviveNight' ? 2.5 : 8;

    this.velocity.x = Math.cos(angle) * speed;
    this.velocity.z = Math.sin(angle) * speed;
    this.position.x += this.velocity.x * deltaTime;
    this.position.z += this.velocity.z * deltaTime;
    this.position.y = 8 + Math.sin(elapsedSeconds * 0.35) * 0.15;
    this.stats.chunksLoaded = 9 + Math.floor(Math.abs(this.position.x + this.position.z) / 32) % 8;
    this.stats.chunksVisible = Math.max(4, this.stats.chunksLoaded - 3);
    this.stats.activeBiome = getBiomeName(this.position.x, this.position.z);
  }

  gatherWood(secondaryActions) {
    this.inventory.wood += 1;
    this.inventory.drops += 1;
    this.stats.droppedItems += 1;
    this.collectDrops();

    return {
      ok: true,
      event: 'wood',
      secondaryActions: [
        ...secondaryActions,
        { action: 'collect', event: 'wood drop' },
      ],
    };
  }

  craftPlanks() {
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
      craftedItem: {
        itemType: 'resource',
        itemId: 'woodPlank',
        name: 'Wood Planks',
        count: 4,
      },
    };
  }

  craftTools() {
    if (this.inventory.planks < 2) {
      return {
        ok: false,
        skipped: true,
      };
    }

    this.inventory.planks -= 2;
    this.inventory.sticks += 4;
    this.inventory.basicTools = Math.max(this.inventory.basicTools, 2);
    this.progression.equipmentTier = 'wood';

    return {
      ok: true,
      event: 'Sticks',
      craftedItem: {
        itemType: 'resource',
        itemId: 'stick',
        name: 'Sticks',
        count: 4,
      },
    };
  }

  gatherStone(secondaryActions) {
    this.inventory.stone += 2;
    this.inventory.drops += 1;
    this.stats.droppedItems += 1;
    this.collectDrops();

    return {
      ok: true,
      event: 'stone',
      count: 2,
      secondaryActions: [
        ...secondaryActions,
        { action: 'collect', event: 'stone drop' },
      ],
    };
  }

  buildShelter() {
    const blockType = this.consumeShelterBlock();

    if (!blockType) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const placedCount = blockType === 'planks' ? 2 : 3;

    this.progression.shelterBlocks += placedCount;

    return {
      ok: true,
      event: blockType,
      count: placedCount,
    };
  }

  surviveNight(deltaTime, secondaryActions) {
    this.survive();

    if (this.progression.shelterBlocks >= 8) {
      this.progression.nightSurvivedSeconds += deltaTime;
    }

    if (this.progression.nightSurvivedSeconds >= 6) {
      this.progression.nightSurvived = true;
    }

    if (Math.floor(this.progression.nightSurvivedSeconds * 2) % 3 === 0) {
      const combatResult = this.fightHostile();

      if (combatResult.entityDamageApplied) {
        secondaryActions.push({
          action: 'fightHostile',
          event: 'night guard',
          entityDamageApplied: true,
        });
      }
    }

    return {
      ok: true,
      event: 'night shelter',
      secondaryActions,
    };
  }

  obtainFurnace() {
    if (this.inventory.stone < 8) {
      return {
        ok: false,
        skipped: true,
      };
    }

    this.inventory.stone -= 8;
    this.inventory.furnace += 1;

    return {
      ok: true,
      event: 'Furnace',
      craftedItem: {
        itemType: 'block',
        itemId: 'furnace',
        name: 'Furnace',
        count: 1,
      },
    };
  }

  gatherOre(secondaryActions) {
    this.inventory.ironOre += 1;
    this.inventory.drops += 1;
    this.stats.droppedItems += 1;
    this.collectDrops();

    return {
      ok: true,
      event: 'Iron Ore',
      secondaryActions: [
        ...secondaryActions,
        { action: 'collect', event: 'ore drop' },
      ],
    };
  }

  gatherFuel(secondaryActions) {
    if (this.inventory.wood > 0) {
      this.inventory.wood -= 1;
    }

    this.inventory.coal += 1;

    return {
      ok: true,
      event: 'fuel',
      secondaryActions,
    };
  }

  smeltOre() {
    if (this.inventory.furnace < 1 || this.inventory.ironOre < 1 || this.inventory.coal < 1) {
      return {
        ok: false,
        skipped: true,
      };
    }

    this.inventory.ironOre -= 1;
    this.inventory.coal -= 1;
    this.inventory.ironIngot += 1;
    this.progression.completedFurnaceJobs += 1;

    return {
      ok: true,
      event: 'Iron Ingot',
      craftedItem: {
        itemType: 'resource',
        itemId: 'ironIngot',
        name: 'Iron Ingot',
        count: 1,
      },
    };
  }

  upgradeEquipment() {
    if (this.inventory.ironIngot < 3 || this.inventory.sticks < 2) {
      return {
        ok: false,
        skipped: true,
      };
    }

    this.inventory.ironIngot -= 3;
    this.inventory.sticks -= 2;
    this.inventory.ironTools += 1;
    this.progression.equipmentTier = 'iron';

    return {
      ok: true,
      event: 'Iron Pickaxe',
      craftedItem: {
        itemType: 'tool',
        itemId: 'ironPickaxe',
        name: 'Iron Pickaxe',
        count: 1,
      },
    };
  }

  consumeShelterBlock() {
    if (consumeFromInventory(this.inventory, 'dirt')) {
      return 'dirt';
    }

    if (consumeFromInventory(this.inventory, 'planks')) {
      return 'planks';
    }

    if (consumeFromInventory(this.inventory, 'stone')) {
      return 'stone';
    }

    if (consumeFromInventory(this.inventory, 'wood')) {
      return 'wood';
    }

    return null;
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
        equipmentTier: this.progression.equipmentTier,
        completedFurnaceJobs: this.progression.completedFurnaceJobs,
        hostileDamageDone: this.stats.hostileDamageDone,
      },
    };
  }

  noise() {
    this.randomState = Math.imul(1664525, this.randomState) + 1013904223;

    return ((this.randomState >>> 0) % 10000) / 10000;
  }
}

function hashGoal(goalId) {
  return [...String(goalId)].reduce((total, character) => total + character.charCodeAt(0), 0) % 16;
}

function consumeFromInventory(inventory, key, count = 1) {
  if (inventory[key] < count) {
    return false;
  }

  inventory[key] -= count;
  return true;
}

function getBiomeName(x, z) {
  const index = Math.abs(Math.floor((x * 13 + z * 7) / 64)) % 3;

  return ['Plains', 'Mountains', 'Desert'][index];
}
