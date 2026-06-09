import {
  createEmptyShelterValidation,
  isInvalidShelterResourceKey,
  isValidShelterResourceKey,
  validateShelter,
} from './shelterValidator.js';
import {
  DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  createHeadlessInventoryForProfile,
  normalizeAutonomousInventoryProfileId,
} from './autonomousInventoryProfiles.js';

const VALID_HEADLESS_SHELTER_KEYS = new Set(['wood', 'planks', 'stone', 'dirt']);
const HEADLESS_TERRAIN_HEIGHT = 8;
const HEADLESS_SAFE_DISTANCE_THRESHOLD = 220;

export class HeadlessPlaytestAdapter {
  constructor({ seed = 1337, inventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID } = {}) {
    this.seed = seed;
    this.randomState = seed;
    this.inventoryProfileId = normalizeAutonomousInventoryProfileId(inventoryProfileId);
    this.position = { x: 0, y: 8, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.inventory = createHeadlessInventoryForProfile(this.inventoryProfileId);
    this.progression = {
      shelterBlocks: 0,
      nightSurvivedSeconds: 0,
      nightSurvived: false,
      equipmentTier: 'starter',
      completedFurnaceJobs: 0,
      shelterPlacements: [],
      invalidShelterBlocksRejected: 0,
      exploredDistance: 0,
      storageCreated: 0,
      permanentBaseBlocksPlaced: 0,
      structuresDiscovered: 0,
      baseTier: 0,
    };
    this.storage = {
      placements: 0,
      stores: 0,
      retrieves: 0,
      reserves: {
        wood: 0,
        stone: 0,
        food: 0,
      },
      extraToolsStored: 0,
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
      aggroHostiles: 1,
      health: 100,
      hunger: 100,
      stamina: 100,
      hostileDamageDone: 0,
      saveSizeKb: 2.4,
      lastSavedStateSize: 0,
    };
    this.lastResourceScan = this.createResourceScanSnapshot();
    this.lastShelterValidation = createEmptyShelterValidation();
    this.selectedShelterMaterial = null;
    this.reportedInvalidShelterMaterials = new Set();
    this.discoveredBiomes = new Map();
    this.discoveredStructures = new Map();
    this.aiMemorySnapshot = null;
    this.unsafeTerrainBlacklist = [];
    this.lastTerrainSafety = this.createTerrainSafetySnapshot();
    this.blockedPlacementReasons = [];
    this.lastSafeGroundedPosition = { x: 0, y: HEADLESS_TERRAIN_HEIGHT, z: 0 };
    this.recoveryTeleportUsed = false;
    this.recoverySuccess = false;
    this.blacklistedTargetKeys = new Set();
    this.lastFailedTargetPosition = null;
  }

  begin({ inventoryProfileId = this.inventoryProfileId } = {}) {
    this.inventoryProfileId = normalizeAutonomousInventoryProfileId(inventoryProfileId);
    this.inventory = createHeadlessInventoryForProfile(this.inventoryProfileId);
    this.stats.health = 100;
    this.stats.hunger = 100;
    this.stats.stamina = 100;
    this.progression.nightSurvivedSeconds = 0;
    this.progression.nightSurvived = false;
    this.progression.shelterBlocks = 0;
    this.progression.shelterPlacements = [];
    this.progression.invalidShelterBlocksRejected = 0;
    this.progression.exploredDistance = 0;
    this.progression.storageCreated = 0;
    this.progression.permanentBaseBlocksPlaced = 0;
    this.progression.structuresDiscovered = 0;
    this.progression.baseTier = 0;
    this.storage = {
      placements: 0,
      stores: 0,
      retrieves: 0,
      reserves: {
        wood: 0,
        stone: 0,
        food: 0,
      },
      extraToolsStored: 0,
    };
    this.lastShelterValidation = createEmptyShelterValidation();
    this.reportedInvalidShelterMaterials.clear();
    this.discoveredBiomes = new Map();
    this.discoveredStructures = new Map();
    this.unsafeTerrainBlacklist = [];
    this.lastTerrainSafety = this.createTerrainSafetySnapshot();
    this.blockedPlacementReasons = [];
    this.lastSafeGroundedPosition = { x: 0, y: HEADLESS_TERRAIN_HEIGHT, z: 0 };
    this.recoveryTeleportUsed = false;
    this.recoverySuccess = false;
    this.blacklistedTargetKeys.clear();
    this.lastFailedTargetPosition = null;
    this.recordBiomeVisit(this.stats.activeBiome, 0);
  }

  setAiMemorySnapshot(aiMemorySnapshot) {
    this.aiMemorySnapshot = aiMemorySnapshot ?? null;
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
    this.progression.exploredDistance += Math.hypot(this.velocity.x * deltaTime, this.velocity.z * deltaTime);
    this.recordBiomeVisit(this.stats.activeBiome, deltaTime);

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
        stoneBlocks: this.inventory.stone,
        rockBlocks: this.inventory.rock ?? 0,
        sandstoneBlocks: this.inventory.sandstone ?? 0,
        furnaceMaterials: this.getFurnaceMaterialCount(),
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
        woodenPickaxe: this.inventory.woodenPickaxe,
        pickaxes: this.getPickaxeCount(),
        ironTools: this.inventory.ironTools,
        buildBlocks: this.inventory.dirt + this.inventory.stone + this.inventory.wood + this.inventory.planks,
        validBuildBlocks: this.getValidBuildBlockCount(),
        storageChest: this.progression.storageCreated,
        extraToolsStored: this.storage.extraToolsStored,
      },
      survival: {
        health: this.stats.health,
        hunger: this.stats.hunger,
        stamina: this.stats.stamina,
      },
      world: {
        activeBiome: this.stats.activeBiome,
        shelterBlocks: this.lastShelterValidation.validShelterBlocksPlaced,
        validShelterBlocksPlaced: this.lastShelterValidation.validShelterBlocksPlaced,
        invalidShelterBlocksRejected: this.lastShelterValidation.invalidShelterBlocksRejected,
        shelterIsValid: this.lastShelterValidation.isValid,
        shelterIsSafeForNight: this.lastShelterValidation.isSafeForNight,
        safeDistanceNoAggro: this.lastShelterValidation.safeDistanceNoAggro,
        canHandMineStone: false,
        equippedTool: this.getEquippedTool(),
        hasValidMiningTool: this.hasValidMiningTool(),
        nightSurvivedSeconds: this.progression.nightSurvivedSeconds,
        nightSurvived: this.progression.nightSurvived && this.lastShelterValidation.isSafeForNight,
        exploredDistance: this.progression.exploredDistance,
        uniqueBiomesDiscovered: this.discoveredBiomes.size,
        storageCreated: this.progression.storageCreated,
        permanentBaseBlocksPlaced: this.progression.permanentBaseBlocksPlaced,
        structuresDiscovered: this.progression.structuresDiscovered,
        baseTier: this.progression.baseTier,
        storageStores: this.storage.stores,
        storageRetrieves: this.storage.retrieves,
        storedWood: this.storage.reserves.wood,
        storedStone: this.storage.reserves.stone,
        storedFood: this.storage.reserves.food,
        storageReserveScore: this.getStorageReserveScore(),
      },
      progression: {
        equipmentTier: this.progression.equipmentTier,
      },
      memory: this.aiMemorySnapshot?.strategyHints ?? null,
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
      case 'craftWoodenPickaxe':
        return this.craftWoodenPickaxe();
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
      case 'exploreWorld':
        return this.exploreWorld(deltaTime, elapsedSeconds, secondaryActions);
      case 'discoverNewBiome':
        return this.discoverNewBiome(deltaTime, elapsedSeconds, secondaryActions);
      case 'discoverStructure':
        return this.discoverStructure(secondaryActions);
      case 'createStorage':
        return this.createStorage();
      case 'buildBaseTier1':
        return this.buildBaseTier1();
      case 'buildStorage':
        return this.buildStorage();
      case 'buildBaseTier2':
        return this.buildBaseTier2();
      case 'maintainStorageReserves':
        return this.maintainStorageReserves();
      case 'gatherFood':
        return this.gatherFood(secondaryActions);
      case 'buildPermanentBase':
        return this.buildPermanentBase();
      default:
        return {
          ok: false,
          skipped: true,
        };
    }
  }

  executeSurvivalRecovery({ intent, deltaTime, elapsedSeconds }) {
    switch (intent.type) {
      case 'eat-food':
        if (this.inventory.berries <= 0) {
          return {
            ok: false,
            skipped: true,
            event: 'no food',
            reason: 'No berries available to eat during survival recovery.',
          };
        }

        this.inventory.berries -= 1;
        this.stats.hunger = Math.min(100, this.stats.hunger + 18);
        this.stats.health = Math.min(100, this.stats.health + 4);

        return {
          ok: true,
          event: 'ate berries',
          count: 1,
        };

      case 'search-food':
        return this.gatherFood([{
          action: 'navigate',
          event: 'food search',
        }]);

      case 'return-to-base':
      {
        const recoveryResult = this.returnToSafeBase({
          reason: 'Returning to safe base because survival recovery requested it.',
        });

        if (!recoveryResult.ok) {
          return recoveryResult;
        }
        this.stats.health = Math.min(100, this.stats.health + 8);
        this.stats.stamina = Math.min(100, this.stats.stamina + 14);
        this.stats.aggroHostiles = 0;

        return {
          ...recoveryResult,
          event: 'returned to base',
          count: 1,
        };
      }

      case 'hold-low-health':
        this.velocity = { x: 0, y: 0, z: 0 };
        this.stats.health = Math.min(100, this.stats.health + 3);
        this.stats.stamina = Math.min(100, this.stats.stamina + 8);
        this.stats.hunger = Math.max(0, this.stats.hunger - 0.2);

        return {
          ok: true,
          event: 'rested',
          count: 1,
        };

      case 'avoid-risky-terrain':
        this.blacklistCurrentTerrain(intent.reason);
        this.position.x += 8;
        this.position.z += 5;
        this.position.y = HEADLESS_TERRAIN_HEIGHT;
        this.stats.activeBiome = getBiomeName(this.position.x, this.position.z);
        this.lastTerrainSafety = this.createTerrainSafetySnapshot({
          reason: 'Moved away from blacklisted terrain.',
          riskLevel: 'low',
        });

        return {
          ok: true,
          event: 'avoided terrain',
          count: 1,
        };

      default:
        return {
          ok: false,
          skipped: true,
          reason: `Unknown survival recovery intent "${intent.type}".`,
        };
    }
  }

  executeHardRecovery({
    reason = 'Autonomous playtest hard recovery requested.',
    preferBase = false,
    lastSafePosition = null,
    plan = null,
    emergency = false,
  } = {}) {
    const invalidation = this.handleHardRecoveryInvalidation({
      reason,
      plan,
    });
    const target = preferBase || emergency
      ? { x: 0, y: HEADLESS_TERRAIN_HEIGHT, z: 0 }
      : lastSafePosition ?? this.lastSafeGroundedPosition ?? { x: 0, y: HEADLESS_TERRAIN_HEIGHT, z: 0 };

    this.position = {
      x: Number(target.x ?? 0),
      y: HEADLESS_TERRAIN_HEIGHT,
      z: Number(target.z ?? 0),
    };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.lastSafeGroundedPosition = { ...this.position };
    this.recoveryTeleportUsed = true;

    const safety = this.getPlayerSafetySnapshot();
    const validation = this.validateHardRecoveryTarget(safety);

    this.recoverySuccess = validation.recoveryValid;

    return {
      ok: this.recoverySuccess,
      event: this.recoverySuccess ? 'hard recovered to ground' : 'hard recovery failed safety validation',
      reason: this.recoverySuccess ? reason : validation.reason ?? reason,
      teleportUsed: true,
      recoverySuccess: this.recoverySuccess,
      lastSafePosition: { ...this.lastSafeGroundedPosition },
      playerSafety: safety,
      ...validation,
      ...invalidation,
    };
  }

  returnToSafeBase({ reason = 'Returning to safe base.' } = {}) {
    this.position = { x: 0, y: HEADLESS_TERRAIN_HEIGHT, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.lastSafeGroundedPosition = { ...this.position };

    return {
      ok: true,
      event: 'returned to base',
      reason,
      teleportUsed: true,
      recoverySuccess: true,
      softRecovery: true,
      playerSafety: this.getPlayerSafetySnapshot(),
      lastSafePosition: { ...this.lastSafeGroundedPosition },
    };
  }

  handleHardRecoveryInvalidation({ reason, plan = null } = {}) {
    const key = `${plan?.goalId ?? 'unknown'}:${plan?.action ?? 'unknown'}:${createTerrainCellKey(this.position)}`;
    const blacklistedTarget = {
      key,
      goalId: plan?.goalId ?? null,
      action: plan?.action ?? null,
      reason,
      position: {
        x: round(this.position.x, 2),
        y: round(this.position.y, 2),
        z: round(this.position.z, 2),
      },
    };

    this.blacklistedTargetKeys.add(key);
    this.lastFailedTargetPosition = blacklistedTarget.position;

    return {
      currentTargetCleared: true,
      miningTargetCleared: true,
      goalReplanRequired: true,
      failedTargetPosition: blacklistedTarget.position,
      blacklistedTarget,
      blacklistedTargets: [blacklistedTarget],
    };
  }

  validateHardRecoveryTarget(safety) {
    const chunkLoaded = safety.visibleTerrainExists;
    const insideBlock = false;
    const cameraTargetValid = true;
    const safelyFallingTowardGround = !safety.isGrounded && !safety.isBelowTerrain && Number(this.velocity.y ?? 0) <= 0;
    const groundedOrSafeFall = safety.isGrounded || safelyFallingTowardGround;
    const ok = Boolean(
      !safety.isBelowTerrain &&
      chunkLoaded &&
      groundedOrSafeFall &&
      !insideBlock &&
      !safety.cameraSkyOnly &&
      cameraTargetValid
    );

    return {
      chunkLoaded,
      insideBlock,
      cameraTargetValid,
      safelyFallingTowardGround,
      recoveryValid: ok,
      reason: ok ? null : 'Headless hard recovery did not restore a valid grounded terrain state.',
    };
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
    this.recordBiomeVisit(this.stats.activeBiome, deltaTime);
  }

  gatherWood(secondaryActions) {
    this.lastResourceScan = this.createResourceScanSnapshot({
      scannedWoodBlocks: 3,
      woodTargetsFound: 3,
      nearestWoodTarget: {
        blockId: 6,
        worldX: Math.round(this.position.x + 2),
        y: Math.round(this.position.y),
        worldZ: Math.round(this.position.z + 2),
        distance: 2.8,
        nearGround: true,
      },
    });
    this.inventory.wood += 4;
    this.inventory.drops += 1;
    this.stats.droppedItems += 1;
    this.collectDrops();

    return {
      ok: true,
      event: 'wood',
      count: 1,
      resourceYield: 4,
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
        event: 'missing wood',
        reason: 'Craft Planks requires at least 1 wood block.',
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

  craftWoodenPickaxe() {
    if (this.inventory.planks < 2 || this.inventory.sticks < 2) {
      return {
        ok: false,
        skipped: true,
        event: 'missing pickaxe materials',
      };
    }

    this.inventory.planks -= 2;
    this.inventory.sticks -= 2;
    this.inventory.woodenPickaxe += 1;
    this.inventory.basicTools = Math.max(this.inventory.basicTools, 1);
    this.progression.equipmentTier = 'wood';

    return {
      ok: true,
      event: 'Wooden Pickaxe',
      equippedTool: this.getEquippedTool(),
      craftedItem: {
        itemType: 'tool',
        itemId: 'pickaxe',
        name: 'Wooden Pickaxe',
        count: 1,
      },
    };
  }

  gatherStone(secondaryActions) {
    if (!this.hasValidMiningTool()) {
      return {
        ok: false,
        skipped: true,
        event: 'missing pickaxe',
        reason: 'Gather Stone requires a real pickaxe before mining.',
        equippedTool: this.getEquippedTool(),
        failures: [{
          code: 'gather-stone-missing-pickaxe',
          summary: 'Gather Stone started without a valid pickaxe.',
          severity: 'medium',
        }],
      };
    }

    this.inventory.stone += 4;
    this.inventory.drops += 1;
    this.stats.droppedItems += 1;
    this.collectDrops();

    return {
      ok: true,
      event: 'stone',
      count: 1,
      resourceYield: 4,
      equippedTool: this.getEquippedTool(),
      secondaryActions: [
        ...secondaryActions,
        { action: 'collect', event: 'stone drop' },
      ],
    };
  }

  buildShelter() {
    const invalidSelectionFailure = this.consumeInvalidShelterSelectionFailure();
    const blockType = this.consumeShelterBlock();

    if (!blockType) {
      this.updateShelterValidation({
        lastBlockedReason: 'No valid shelter material available. Need wood, planks, stone, or dirt.',
      });

      return {
        ok: false,
        skipped: true,
        event: 'missing shelter material',
        reason: this.lastShelterValidation.lastBlockedReason,
        failures: invalidSelectionFailure ? [invalidSelectionFailure] : [],
        failedActions: invalidSelectionFailure ? [createInvalidShelterFailedAction(invalidSelectionFailure)] : [],
        blockedPlacementReasons: [{
          reason: this.lastShelterValidation.lastBlockedReason,
          material: this.selectedShelterMaterial ?? null,
        }],
        recoveryAction: {
          type: 'gather-valid-shelter-material',
          reason: 'Shelter placement needs wood, planks, stone, or dirt.',
        },
        shelterValidation: this.getShelterValidationSnapshot(),
      };
    }

    const pattern = createHeadlessShelterPattern(this.progression.shelterPlacements.length);

    this.progression.shelterPlacements.push({
      resourceKey: blockType,
      role: pattern.role,
      side: pattern.side,
    });
    this.updateShelterValidation();
    this.progression.shelterBlocks = this.lastShelterValidation.validShelterBlocksPlaced;

    return {
      ok: true,
      event: blockType,
      count: 1,
      failures: invalidSelectionFailure ? [invalidSelectionFailure] : [],
      failedActions: invalidSelectionFailure ? [createInvalidShelterFailedAction(invalidSelectionFailure)] : [],
      shelterValidation: this.getShelterValidationSnapshot(),
      validShelterBlocksPlaced: this.lastShelterValidation.validShelterBlocksPlaced,
      invalidShelterBlocksRejected: this.lastShelterValidation.invalidShelterBlocksRejected,
    };
  }

  surviveNight(deltaTime, secondaryActions) {
    this.survive();
    const shelterValidation = this.updateShelterValidation();

    if (!shelterValidation.isSafeForNight) {
      return {
        ok: false,
        skipped: true,
        event: 'night safety blocked',
        reason: shelterValidation.lastBlockedReason,
        recoveryAction: {
          type: 'improve-shelter',
          reason: shelterValidation.lastBlockedReason,
        },
        shelterValidation,
        failures: [{
          code: 'night-safety-not-proven',
          summary: shelterValidation.lastBlockedReason,
          severity: 'medium',
        }],
      };
    }

    if (shelterValidation.isSafeForNight) {
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
      shelterValidation: this.getShelterValidationSnapshot(),
    };
  }

  obtainFurnace() {
    const diagnostics = this.getFurnaceCraftDiagnostics();

    if (this.getFurnaceMaterialCount() < 8) {
      return {
        ok: false,
        skipped: true,
        event: 'missing furnace material',
        reason: diagnostics.furnaceCraftBlockReason,
        furnaceCraftDiagnostics: diagnostics,
      };
    }

    consumeFurnaceMaterials(this.inventory, 8);
    this.inventory.furnace += 1;

    return {
      ok: true,
      event: 'Furnace',
      furnaceCraftDiagnostics: {
        ...diagnostics,
        furnaceCraftBlockReason: null,
      },
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

  exploreWorld(deltaTime, elapsedSeconds, secondaryActions) {
    const beforeDistance = this.progression.exploredDistance;

    this.explore({ deltaTime, elapsedSeconds });

    return {
      ok: this.progression.exploredDistance > beforeDistance,
      event: this.stats.activeBiome,
      secondaryActions,
    };
  }

  discoverNewBiome(deltaTime, elapsedSeconds, secondaryActions) {
    const beforeBiomeCount = this.discoveredBiomes.size;
    const knownBiomes = this.aiMemorySnapshot?.strategyHints?.knownBiomes ?? [];
    const targetBiome = ['Plains', 'Mountains', 'Desert']
      .sort((left, right) => Number(knownBiomes.includes(left)) - Number(knownBiomes.includes(right)))
      .find((biome) => !this.discoveredBiomes.has(biome)) ?? null;

    if (targetBiome) {
      const nextPosition = findHeadlessPositionForBiome(this.position, targetBiome);
      const distance = Math.hypot(nextPosition.x - this.position.x, nextPosition.z - this.position.z);

      this.velocity.x = (nextPosition.x - this.position.x) / Math.max(deltaTime, 0.001);
      this.velocity.z = (nextPosition.z - this.position.z) / Math.max(deltaTime, 0.001);
      this.position = nextPosition;
      this.stats.activeBiome = targetBiome;
      this.progression.exploredDistance += distance;
      this.recordBiomeVisit(targetBiome, deltaTime);
    } else {
      this.explore({ deltaTime, elapsedSeconds: elapsedSeconds + 12 });
    }

    return {
      ok: this.discoveredBiomes.size > beforeBiomeCount,
      event: this.stats.activeBiome,
      secondaryActions,
      moving: this.discoveredBiomes.size <= beforeBiomeCount,
    };
  }

  createStorage() {
    if (this.inventory.planks < 4) {
      return {
        ok: false,
        skipped: true,
        event: 'missing storage planks',
        reason: 'Create Storage requires 4 planks.',
      };
    }

    this.inventory.planks -= 4;
    this.inventory.storageChest = (this.inventory.storageChest ?? 0) + 1;
    this.progression.storageCreated += 1;
    this.storage.placements += 1;

    return {
      ok: true,
      event: 'Storage Chest',
      craftedItem: {
        itemType: 'block',
        itemId: 'lootChest',
        name: 'Storage Chest',
        count: 1,
      },
    };
  }

  discoverStructure(secondaryActions) {
    const structure = this.createStructureDiscovery();

    if (this.discoveredStructures.has(structure.id)) {
      return {
        ok: false,
        skipped: true,
        event: 'known structure',
        secondaryActions,
      };
    }

    this.discoveredStructures.set(structure.id, structure);
    this.progression.structuresDiscovered += 1;
    this.stats.structuresGenerated = Math.max(this.stats.structuresGenerated, this.discoveredStructures.size);

    return {
      ok: true,
      event: structure.type,
      secondaryActions,
    };
  }

  buildBaseTier1() {
    if (this.inventory.furnace < 1 || !this.lastShelterValidation.isValid) {
      return {
        ok: false,
        skipped: true,
        event: 'missing tier 1 base requirements',
      };
    }

    this.progression.baseTier = Math.max(this.progression.baseTier, 1);

    return {
      ok: true,
      event: 'Base Tier 1',
    };
  }

  buildStorage() {
    if (this.progression.storageCreated < 1) {
      return {
        ok: false,
        skipped: true,
        event: 'missing storage chest',
      };
    }

    const stored = this.storeAnyResource();
    const retrieved = this.retrieveAnyResource();

    return {
      ok: stored || retrieved,
      event: 'storage cycle',
      skipped: !stored && !retrieved,
    };
  }

  buildBaseTier2() {
    if (this.progression.baseTier < 1 || this.progression.storageCreated < 1) {
      return {
        ok: false,
        skipped: true,
        event: 'missing tier 2 base requirements',
      };
    }

    if (this.storage.extraToolsStored < 1) {
      if (this.inventory.ironTools > 0) {
        this.inventory.ironTools -= 1;
        this.storage.extraToolsStored += 1;
      } else if (this.inventory.woodenPickaxe > 0) {
        this.inventory.woodenPickaxe -= 1;
        this.storage.extraToolsStored += 1;
      } else {
        return {
          ok: false,
          skipped: true,
          event: 'missing extra tool',
        };
      }
    }

    this.progression.baseTier = Math.max(this.progression.baseTier, 2);

    return {
      ok: true,
      event: 'Base Tier 2',
    };
  }

  maintainStorageReserves() {
    if (this.progression.storageCreated < 1) {
      return {
        ok: false,
        skipped: true,
        event: 'missing storage chest',
      };
    }

    const beforeScore = this.getStorageReserveScore();
    const reserveKey = this.getMissingReserveKey();

    if (!reserveKey) {
      return {
        ok: true,
        event: 'reserves full',
      };
    }

    const stored = this.storeReserveResource(reserveKey);

    return {
      ok: stored && this.getStorageReserveScore() >= beforeScore,
      event: `${reserveKey} reserve`,
      skipped: !stored,
      reason: stored ? null : `No ${reserveKey} available to store.`,
    };
  }

  gatherFood(secondaryActions) {
    this.inventory.berries += 4;

    return {
      ok: true,
      event: 'berries',
      count: 4,
      secondaryActions,
    };
  }

  buildPermanentBase() {
    if (this.progression.baseTier < 2) {
      return {
        ok: false,
        skipped: true,
        event: 'missing tier 2 base',
      };
    }

    const blockType = this.consumePermanentBaseBlock();

    if (!blockType && this.getStorageReserveScore() < 3) {
      return {
        ok: false,
        skipped: true,
        event: 'missing permanent base material',
        reason: 'Permanent base needs Wood, Planks, Stone, or Dirt.',
        recoveryAction: {
          type: 'gather-permanent-base-material',
          reason: 'Gather durable blocks before placing the permanent base.',
        },
      };
    }

    if (blockType) {
      this.progression.permanentBaseBlocksPlaced += 1;
    }

    if (this.progression.permanentBaseBlocksPlaced >= 24 && this.getStorageReserveScore() >= 3) {
      this.progression.baseTier = Math.max(this.progression.baseTier, 3);
    }

    return {
      ok: true,
      event: blockType ?? 'Base Tier 3',
      count: 1,
    };
  }

  getPickaxeCount() {
    return this.inventory.woodenPickaxe + this.inventory.ironTools;
  }

  getFurnaceMaterialCount() {
    return this.inventory.stone + (this.inventory.rock ?? 0) + (this.inventory.sandstone ?? 0);
  }

  getFurnaceCraftDiagnostics() {
    const materialOptions = [
      {
        itemType: 'block',
        itemId: 'stone',
        name: 'Stone',
        available: this.inventory.stone,
      },
      {
        itemType: 'block',
        itemId: 'rock',
        name: 'Rock',
        available: this.inventory.rock ?? 0,
      },
      {
        itemType: 'block',
        itemId: 'sandstone',
        name: 'Sandstone',
        available: this.inventory.sandstone ?? 0,
      },
    ];
    const available = this.getFurnaceMaterialCount();

    return {
      furnaceRecipeFound: true,
      furnaceRecipeRequirements: [{
        label: 'Stone material',
        required: 8,
        options: materialOptions.map(({ available: _available, ...option }) => option),
      }],
      furnaceCraftAttemptRequirements: [{
        label: 'Stone material',
        required: 8,
        available,
        satisfied: available >= 8,
        options: materialOptions,
      }],
      furnaceCraftBlockReason: available >= 8 ? null : 'Missing required ingredients for Furnace.',
    };
  }

  getBiomeStatsSnapshot() {
    return Object.fromEntries(
      [...this.discoveredBiomes.entries()].map(([biome, stats]) => [biome, { ...stats }]),
    );
  }

  getDiscoveredStructuresSnapshot() {
    return [...this.discoveredStructures.values()].map((structure) => ({ ...structure }));
  }

  getStorageSnapshot() {
    return {
      placements: this.storage.placements,
      stores: this.storage.stores,
      retrieves: this.storage.retrieves,
      reserves: { ...this.storage.reserves },
      extraToolsStored: this.storage.extraToolsStored,
      storageCreated: this.progression.storageCreated,
      persistedChests: this.progression.storageCreated,
    };
  }

  getBaseSnapshot() {
    return {
      tier: this.progression.baseTier,
      permanentBaseBlocksPlaced: this.progression.permanentBaseBlocksPlaced,
      reserveScore: this.getStorageReserveScore(),
    };
  }

  hasValidMiningTool() {
    return this.getPickaxeCount() > 0;
  }

  getEquippedTool() {
    if (this.inventory.ironTools > 0) {
      return 'ironPickaxe';
    }

    if (this.inventory.woodenPickaxe > 0) {
      return 'woodenPickaxe';
    }

    return 'hand';
  }

  consumeShelterBlock() {
    if (consumeFromInventory(this.inventory, 'dirt') && isValidShelterResourceKey('dirt')) {
      return 'dirt';
    }

    if (consumeFromInventory(this.inventory, 'planks') && isValidShelterResourceKey('planks')) {
      return 'planks';
    }

    if (consumeFromInventory(this.inventory, 'stone') && isValidShelterResourceKey('stone')) {
      return 'stone';
    }

    if (consumeFromInventory(this.inventory, 'wood') && isValidShelterResourceKey('wood')) {
      return 'wood';
    }

    return null;
  }

  consumePermanentBaseBlock() {
    for (const key of ['stone', 'planks', 'wood', 'dirt']) {
      if (consumeFromInventory(this.inventory, key)) {
        return key;
      }
    }

    return null;
  }

  storeAnyResource() {
    return this.storeReserveResource('wood') ||
      this.storeReserveResource('stone') ||
      this.storeReserveResource('food');
  }

  retrieveAnyResource() {
    for (const [reserveKey, inventoryKey] of [
      ['wood', 'wood'],
      ['stone', 'stone'],
      ['food', 'berries'],
    ]) {
      if (this.storage.reserves[reserveKey] <= 0) {
        continue;
      }

      this.storage.reserves[reserveKey] -= 1;
      this.inventory[inventoryKey] += 1;
      this.storage.retrieves += 1;
      return true;
    }

    return false;
  }

  storeReserveResource(reserveKey) {
    const inventoryKey = reserveKey === 'food' ? 'berries' : reserveKey;
    const count = Math.min(8, this.inventory[inventoryKey] ?? 0);

    if (count <= 0) {
      return false;
    }

    this.inventory[inventoryKey] -= count;
    this.storage.reserves[reserveKey] += count;
    this.storage.stores += 1;
    return true;
  }

  getMissingReserveKey() {
    const targets = {
      wood: 64,
      stone: 64,
      food: 32,
    };

    return Object.keys(targets).find((key) => this.storage.reserves[key] < targets[key]) ?? null;
  }

  getStorageReserveScore() {
    return Number(this.storage.reserves.wood >= 64) +
      Number(this.storage.reserves.stone >= 64) +
      Number(this.storage.reserves.food >= 32);
  }

  createStructureDiscovery() {
    const type = this.stats.activeBiome === 'Desert'
      ? 'ruin'
      : this.stats.activeBiome === 'Mountains'
        ? 'camp'
        : 'village';
    const id = `${type}:${Math.round(this.position.x / 16)}:${Math.round(this.position.z / 16)}`;

    return {
      id,
      type,
      biome: this.stats.activeBiome,
      position: {
        x: Math.round(this.position.x),
        y: Math.round(this.position.y),
        z: Math.round(this.position.z),
      },
    };
  }

  consumeInvalidShelterSelectionFailure() {
    const material = this.selectedShelterMaterial;

    if (!isInvalidShelterResourceKey(material) || this.reportedInvalidShelterMaterials.has(material)) {
      return null;
    }

    this.reportedInvalidShelterMaterials.add(material);
    this.progression.invalidShelterBlocksRejected += 1;

    return {
      code: 'invalid-shelter-material',
      summary: `${material} is not valid shelter material.`,
      severity: 'medium',
    };
  }

  updateShelterValidation({ lastBlockedReason = null } = {}) {
    const safeDistanceNoAggro = this.stats.aggroHostiles === 0 && this.stats.hostiles === 0;

    this.lastShelterValidation = validateShelter({
      placements: this.progression.shelterPlacements,
      invalidRejected: this.progression.invalidShelterBlocksRejected,
      safeDistanceNoAggro,
      lastBlockedReason,
    });

    return this.getShelterValidationSnapshot();
  }

  getValidBuildBlockCount() {
    return [...VALID_HEADLESS_SHELTER_KEYS]
      .reduce((count, key) => count + (this.inventory[key] ?? 0), 0);
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
        aggroHostiles: this.stats.aggroHostiles,
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
        persistedChests: this.progression.storageCreated,
        compressedChunkCandidates: 0,
      },
      simulationAdapter: {
        type: 'headless',
        seed: this.seed,
        startingInventoryProfile: this.inventoryProfileId,
        lastSavedStateSize: this.stats.lastSavedStateSize,
        equipmentTier: this.progression.equipmentTier,
        completedFurnaceJobs: this.progression.completedFurnaceJobs,
        hostileDamageDone: this.stats.hostileDamageDone,
      },
    };
  }

  getResourceScanSnapshot() {
    return {
      ...this.lastResourceScan,
      nearestWoodTarget: this.lastResourceScan.nearestWoodTarget
        ? { ...this.lastResourceScan.nearestWoodTarget }
        : null,
      targets: (this.lastResourceScan.targets ?? []).map((target) => ({ ...target })),
    };
  }

  getTerrainSafetySnapshot() {
    this.lastTerrainSafety = this.createTerrainSafetySnapshot();

    return { ...this.lastTerrainSafety };
  }

  getPlayerSafetySnapshot() {
    const position = this.getPosition();
    const safeBasePosition = { x: 0, y: HEADLESS_TERRAIN_HEIGHT, z: 0 };
    const lastSafePosition = this.lastSafeGroundedPosition ?? safeBasePosition;
    const isBelowTerrain = position.y < HEADLESS_TERRAIN_HEIGHT - 0.75;
    const distanceFromSafePoint = getHorizontalDistance(position, lastSafePosition);
    const distanceFromSafePointAbnormal = distanceFromSafePoint > HEADLESS_SAFE_DISTANCE_THRESHOLD;
    const visibleTerrainExists = !distanceFromSafePointAbnormal;
    const cameraSkyOnly = isBelowTerrain || !visibleTerrainExists;
    const isGrounded = !isBelowTerrain && Math.abs(position.y - HEADLESS_TERRAIN_HEIGHT) <= 0.25;
    const isUngroundedAbnormally = !isGrounded && !isBelowTerrain && Math.abs(this.velocity.y ?? 0) < 1;

    if (isGrounded && visibleTerrainExists && !cameraSkyOnly) {
      this.lastSafeGroundedPosition = { ...position };
    }

    return {
      position,
      terrainHeight: HEADLESS_TERRAIN_HEIGHT,
      isGrounded,
      isFlying: false,
      isBelowTerrain,
      isUngroundedAbnormally,
      visibleTerrainExists,
      cameraSkyOnly,
      distanceFromSafePoint: round(distanceFromSafePoint, 2),
      distanceFromSafePointAbnormal,
      lastSafePosition: this.lastSafeGroundedPosition ? { ...this.lastSafeGroundedPosition } : null,
      safeBasePosition,
      reason: isBelowTerrain
        ? 'Player Y is below terrain surface.'
        : !visibleTerrainExists
          ? 'No visible terrain exists near the headless player position.'
          : isUngroundedAbnormally
            ? 'Headless player is ungrounded without normal falling movement.'
            : null,
    };
  }

  getShelterValidationSnapshot() {
    return { ...this.lastShelterValidation };
  }

  createResourceScanSnapshot(overrides = {}) {
    const nearestWoodTarget = overrides.nearestWoodTarget ?? null;

    return {
      radius: overrides.radius ?? 24,
      scannedChunks: 9,
      scannedWoodBlocks: overrides.scannedWoodBlocks ?? 0,
      rejectedLeafTargets: overrides.rejectedLeafTargets ?? 0,
      rejectedUnreachableTargets: overrides.rejectedUnreachableTargets ?? 0,
      woodTargetsFound: overrides.woodTargetsFound ?? 0,
      woodTargetsRejected: overrides.woodTargetsRejected ?? overrides.rejectedLeafTargets ?? 0,
      nearestWoodTarget,
      woodTargetDistance: nearestWoodTarget?.distance ?? null,
      targets: nearestWoodTarget ? [{ ...nearestWoodTarget }] : [],
      vegetationTarget: null,
      biome: this.stats.activeBiome,
      biomeHasTrees: this.stats.activeBiome !== 'Desert',
      lastBlockedReason: overrides.lastBlockedReason ?? null,
      recovery: overrides.recovery ?? null,
    };
  }

  createTerrainSafetySnapshot(overrides = {}) {
    const position = overrides.position ?? this.position;
    const key = createTerrainCellKey(position);
    const biome = this.stats.activeBiome ?? 'Unknown';
    const slopeScore = Math.abs(Math.sin(position.x * 0.12) - Math.sin(position.z * 0.12)) * 4;
    const steepSlope = overrides.steepSlope ?? (biome === 'Mountains' && slopeScore > 3.35);
    const fallRisk = overrides.fallRisk ?? (steepSlope && Math.abs(Math.round(position.x + position.z)) % 29 === 0);
    const currentlyBlacklisted = this.unsafeTerrainBlacklist.some((entry) => entry.key === key);

    return {
      position: {
        x: round(position.x, 2),
        y: round(position.y, 2),
        z: round(position.z, 2),
      },
      biome,
      cellKey: key,
      fallRisk,
      steepSlope,
      currentlyBlacklisted,
      blacklistSize: this.unsafeTerrainBlacklist.length,
      riskLevel: overrides.riskLevel ?? (fallRisk ? 'high' : steepSlope || currentlyBlacklisted ? 'medium' : 'low'),
      reason: overrides.reason ?? (
        fallRisk
          ? 'Potential fall risk detected near steep simulated terrain.'
          : steepSlope
            ? 'Steep mountain slope detected near exploration path.'
            : currentlyBlacklisted
              ? 'Current terrain cell was previously blacklisted.'
              : null
      ),
    };
  }

  blacklistCurrentTerrain(reason = 'Unsafe terrain was detected.') {
    const position = this.getPosition();
    const key = createTerrainCellKey(position);

    if (this.unsafeTerrainBlacklist.some((entry) => entry.key === key)) {
      return;
    }

    this.unsafeTerrainBlacklist.push({
      key,
      reason,
      biome: this.stats.activeBiome,
      position: {
        x: round(position.x, 2),
        y: round(position.y, 2),
        z: round(position.z, 2),
      },
    });
    this.unsafeTerrainBlacklist = this.unsafeTerrainBlacklist.slice(-24);
  }

  noise() {
    this.randomState = Math.imul(1664525, this.randomState) + 1013904223;

    return ((this.randomState >>> 0) % 10000) / 10000;
  }

  recordBiomeVisit(biomeName, deltaTime = 0) {
    const biome = biomeName || 'Unknown';
    const existing = this.discoveredBiomes.get(biome) ?? {
      biome,
      visits: 0,
      seconds: 0,
      resourcesFound: {},
      woodTargetsFound: 0,
      rejectedLeafTargets: 0,
    };

    this.discoveredBiomes.set(biome, {
      ...existing,
      visits: existing.visits + 1,
      seconds: round(existing.seconds + deltaTime, 2),
      woodTargetsFound: existing.woodTargetsFound + (biome === this.lastResourceScan?.biome ? Number(this.lastResourceScan.woodTargetsFound ?? 0) : 0),
      rejectedLeafTargets: existing.rejectedLeafTargets + (biome === this.lastResourceScan?.biome ? Number(this.lastResourceScan.rejectedLeafTargets ?? 0) : 0),
    });
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

function consumeFurnaceMaterials(inventory, count) {
  let remainingCount = count;

  for (const key of ['stone', 'rock', 'sandstone']) {
    const consumedCount = Math.min(remainingCount, inventory[key] ?? 0);

    if (consumedCount <= 0) {
      continue;
    }

    inventory[key] -= consumedCount;
    remainingCount -= consumedCount;

    if (remainingCount <= 0) {
      return true;
    }
  }

  return false;
}

function createHeadlessShelterPattern(index) {
  const pattern = [
    { role: 'wall', side: 'north' },
    { role: 'wall', side: 'north' },
    { role: 'wall', side: 'north' },
    { role: 'wall', side: 'west' },
    { role: 'wall', side: 'east' },
    { role: 'wall', side: 'south' },
    { role: 'wall', side: 'south' },
    { role: 'wall', side: 'south' },
    { role: 'roof', side: 'west' },
    { role: 'roof', side: 'center' },
    { role: 'roof', side: 'east' },
    { role: 'roof', side: 'north' },
    { role: 'roof', side: 'south' },
  ];

  return pattern[index % pattern.length];
}

function createTerrainCellKey(position) {
  return `${Math.floor(position.x / 8)},${Math.floor(position.z / 8)}`;
}

function getHorizontalDistance(leftPosition, rightPosition) {
  return Math.hypot(
    Number(leftPosition.x ?? 0) - Number(rightPosition.x ?? 0),
    Number(leftPosition.z ?? 0) - Number(rightPosition.z ?? 0),
  );
}

function createInvalidShelterFailedAction(failure) {
  return {
    goalId: 'buildShelter',
    goalName: 'Build Shelter',
    action: 'buildShelter',
    actionName: 'place',
    reason: failure.summary,
  };
}

function getBiomeName(x, z) {
  const index = Math.abs(Math.floor((x * 13 + z * 7) / 64)) % 3;

  return ['Plains', 'Mountains', 'Desert'][index];
}

function findHeadlessPositionForBiome(origin, biomeName) {
  for (let attempt = 1; attempt <= 64; attempt += 1) {
    const angle = attempt * 0.73;
    const distance = 24 + attempt * 8;
    const x = origin.x + Math.cos(angle) * distance;
    const z = origin.z + Math.sin(angle) * distance;

    if (getBiomeName(x, z) === biomeName) {
      return {
        x,
        y: origin.y,
        z,
      };
    }
  }

  return {
    x: origin.x + 64,
    y: origin.y,
    z: origin.z + 32,
  };
}

function round(value, digits) {
  const scale = 10 ** digits;

  return Math.round((Number(value) || 0) * scale) / scale;
}
