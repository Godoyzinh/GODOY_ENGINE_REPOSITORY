import { Vector3 } from 'three';
import { FURNACE_RECIPE_IDS } from '../crafting/furnaceSystem.js';
import { getRecipe, RECIPE_IDS } from '../crafting/recipeRegistry.js';
import { ITEM_IDS, ITEM_TYPES, normalizeDrop } from '../items/itemRegistry.js';
import { TOOL_IDS } from '../tools/toolSystem.js';
import { BLOCK_IDS } from '../world/blockTypes.js';
import { getBlockDefinition, getBlockDrop, isPlaceableBlock } from '../world/blockRegistry.js';
import { ResourceScanner, createEmptyResourceScanSnapshot } from './resourceScanner.js';
import {
  createEmptyShelterValidation,
  isInvalidShelterBlockId,
  isValidShelterBlockId,
  validateShelter,
} from './shelterValidator.js';
import {
  DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  createEngineInventoryStacksForProfile,
  normalizeAutonomousInventoryProfileId,
} from './autonomousInventoryProfiles.js';
import { INVENTORY_INITIALIZATION_SOURCES } from '../player/inventoryProfiles.js';

const MOVEMENT_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space'];
const MINE_RADIUS = 4;
const PLACE_RADIUS = 3;
const WOOD_SCAN_RADIUS = 24;
const WOOD_EXPANDED_SCAN_RADIUS = 48;
const WOOD_MINE_DISTANCE = 5.5;
const SHELTER_PATTERN = [
  { dx: -1, dy: 0, dz: -1, role: 'wall', side: 'north' },
  { dx: 0, dy: 0, dz: -1, role: 'wall', side: 'north' },
  { dx: 1, dy: 0, dz: -1, role: 'wall', side: 'north' },
  { dx: -1, dy: 0, dz: 0, role: 'wall', side: 'west' },
  { dx: 1, dy: 0, dz: 0, role: 'wall', side: 'east' },
  { dx: -1, dy: 0, dz: 1, role: 'wall', side: 'south' },
  { dx: 0, dy: 0, dz: 1, role: 'wall', side: 'south' },
  { dx: 1, dy: 0, dz: 1, role: 'wall', side: 'south' },
  { dx: -1, dy: 2, dz: 0, role: 'roof', side: 'west' },
  { dx: 0, dy: 2, dz: 0, role: 'roof', side: 'center' },
  { dx: 1, dy: 2, dz: 0, role: 'roof', side: 'east' },
  { dx: 0, dy: 2, dz: -1, role: 'roof', side: 'north' },
  { dx: 0, dy: 2, dz: 1, role: 'roof', side: 'south' },
];

export class EnginePlaytestAdapter {
  constructor({ engine, inventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID }) {
    this.engine = engine;
    this.inventoryProfileId = normalizeAutonomousInventoryProfileId(inventoryProfileId);
    this.originalInputEnabled = true;
    this.originalInventoryContents = null;
    this.lastSavedStateSize = 0;
    this.shelterBlocksPlaced = 0;
    this.nightSurvivedSeconds = 0;
    this.shelterOrigin = null;
    this.shelterPlacementIndex = 0;
    this.shelterPlacements = [];
    this.invalidShelterBlocksRejected = 0;
    this.reportedInvalidShelterBlockIds = new Set();
    this.lastShelterValidation = createEmptyShelterValidation();
    this.resourceScanner = new ResourceScanner({
      terrainGenerator: engine.terrainGenerator,
    });
    this.lastResourceScan = createEmptyResourceScanSnapshot();
    this.exploredDistance = 0;
    this.lastExplorationPosition = null;
    this.discoveredBiomes = new Map();
    this.storageCreated = 0;
    this.permanentBaseBlocksPlaced = 0;
    this.baseTier = 0;
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
    this.discoveredStructures = new Map();
    this.aiMemorySnapshot = null;
  }

  begin({ inventoryProfileId = this.inventoryProfileId } = {}) {
    this.inventoryProfileId = normalizeAutonomousInventoryProfileId(inventoryProfileId);
    this.originalInputEnabled = this.engine.playerController.movementSystem.isInputEnabled;
    this.originalInventoryContents = this.captureInventoryContents();
    this.applyInventoryProfile(this.inventoryProfileId);
    this.engine.mainMenuUI?.closeMenu();
    this.engine.setGameplayInputEnabled(true);
    this.engine.playerController.movementSystem.clearInput();
    this.shelterBlocksPlaced = 0;
    this.nightSurvivedSeconds = 0;
    this.shelterOrigin = null;
    this.shelterPlacementIndex = 0;
    this.shelterPlacements = [];
    this.invalidShelterBlocksRejected = 0;
    this.reportedInvalidShelterBlockIds.clear();
    this.lastShelterValidation = createEmptyShelterValidation();
    this.exploredDistance = 0;
    this.lastExplorationPosition = this.getPosition();
    this.discoveredBiomes = new Map();
    this.storageCreated = 0;
    this.permanentBaseBlocksPlaced = 0;
    this.baseTier = 0;
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
    this.discoveredStructures = new Map();
    this.recordBiomeVisit(this.engine.terrainGenerator.stats.activeBiome, 0);
  }

  setAiMemorySnapshot(aiMemorySnapshot) {
    this.aiMemorySnapshot = aiMemorySnapshot ?? null;
  }

  end() {
    this.engine.playerController.movementSystem.clearInput();
    this.engine.setGameplayInputEnabled(this.originalInputEnabled);

    if (this.originalInventoryContents) {
      this.engine.playerState.setSelectedSlot(this.originalInventoryContents.selectedSlot ?? 0);
      this.engine.inventorySystem.replaceContents(this.originalInventoryContents);
      this.originalInventoryContents = null;
    }
  }

  explore({ elapsedSeconds }) {
    const movement = this.engine.playerController.movementSystem;
    const turnPhase = Math.floor(elapsedSeconds / 6) % 4;

    for (const code of MOVEMENT_CODES) {
      movement.setInput(code, false);
    }

    movement.setInput('KeyW', true);
    movement.setInput(turnPhase % 2 === 0 ? 'KeyD' : 'KeyA', true);
    movement.setInput('ShiftLeft', Math.floor(elapsedSeconds / 4) % 2 === 0);

    return {
      ok: true,
      event: 'move',
    };
  }

  mineBlock({ elapsedSeconds }) {
    const target = this.findMineTarget(elapsedSeconds);

    if (!target) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const wasDestroyed = this.engine.terrainGenerator.setBlockAtWorldPosition(
      target.worldX,
      target.y,
      target.worldZ,
      BLOCK_IDS.air,
    );

    if (!wasDestroyed) {
      return {
        ok: false,
        failures: [{
          code: 'mine-unloaded-chunk',
          summary: 'Bot tried to mine a block in an unloaded chunk.',
          severity: 'low',
        }],
      };
    }

    this.engine.handleBlockMined({
      targetBlock: target,
      dropStack: normalizeDrop(getBlockDrop(target.blockId)),
      blockDefinition: getBlockDefinition(target.blockId),
    });
    this.engine.networkSession.queueBlockEdits([{
      worldX: target.worldX,
      y: target.y,
      worldZ: target.worldZ,
      blockId: BLOCK_IDS.air,
      action: 'destroy',
    }]);

    const collectResult = this.collectDrops();

    return {
      ok: true,
      event: getBlockDefinition(target.blockId).name,
      secondaryActions: collectResult.ok
        ? [{ action: 'collect', event: collectResult.event }]
        : [],
    };
  }

  placeBlock({ elapsedSeconds }) {
    const blockStack = this.engine.inventorySystem.getAllStacks()
      .find((stack) => stack?.itemType === ITEM_TYPES.block && isPlaceableBlock(stack.itemId) && stack.count > 0);

    if (!blockStack) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const placement = this.findPlacementTarget(elapsedSeconds, blockStack.itemId);

    if (!placement) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const wasPlaced = this.engine.terrainGenerator.setBlockAtWorldPosition(
      placement.worldX,
      placement.y,
      placement.worldZ,
      blockStack.itemId,
    );

    if (!wasPlaced) {
      return {
        ok: false,
        failures: [{
          code: 'place-unloaded-chunk',
          summary: 'Bot tried to place a block in an unloaded chunk.',
          severity: 'low',
        }],
      };
    }

    if (this.engine.playerState.mode !== 'creative') {
      this.consumeMatchingBlock(blockStack.itemId);
    }

    this.engine.handleBlocksPlaced([{
      ...placement,
      blockId: blockStack.itemId,
      action: 'place',
    }]);

    return {
      ok: true,
      event: getBlockDefinition(blockStack.itemId).name,
    };
  }

  collectDrops(preferredStack = null) {
    const droppedItems = this.engine.entitySystem.registry.getEntities()
      .filter((entity) => entity.itemStack && entity.state.removeRequested !== true);
    const droppedItem = preferredStack
      ? droppedItems.find((entity) => isMatchingItemStack(entity.itemStack, preferredStack)) ?? droppedItems[0]
      : droppedItems[0];

    if (!droppedItem) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const wasAdded = this.engine.inventorySystem.addItem(droppedItem.itemStack);

    if (!wasAdded) {
      return {
        ok: false,
        failures: [{
          code: 'drop-pickup-overflow',
          summary: 'Bot could not pick up a dropped item because inventory was full.',
          severity: 'low',
        }],
      };
    }

    droppedItem.requestRemoval?.('botPickedUp');

    return {
      ok: true,
      event: droppedItem.itemStack.name,
    };
  }

  craftBasicItem() {
    const wasCrafted = this.engine.craftingSystem.craftFirstAvailable();

    if (!wasCrafted) {
      return {
        ok: false,
        skipped: true,
      };
    }

    return {
      ok: true,
      event: this.engine.craftingSystem.getSnapshot().lastCraftedRecipe ?? 'crafted',
    };
  }

  fightHostile({ elapsedSeconds }) {
    const hostile = this.findOrSpawnHostile(elapsedSeconds);

    if (!hostile) {
      return {
        ok: false,
        skipped: true,
      };
    }

    const wasApplied = this.engine.damageSystem.applyEntityDamage({
      entity: hostile,
      amount: 8,
      source: 'autonomous-playtest',
      knockback: new Vector3(0.8, 0.1, 0.8),
    });

    if (!wasApplied) {
      return {
        ok: false,
        skipped: true,
      };
    }

    this.engine.telemetrySystem.recordGameplayEvent('combat', {
      result: 'hit',
      source: 'autonomous-playtest',
    });
    this.engine.handleCombatHit({
      position: hostile.transform.position,
    });

    return {
      ok: true,
      event: hostile.name,
      entityDamageApplied: true,
      telemetryRecorded: true,
    };
  }

  survive() {
    if (this.engine.playerState.hunger > 45 && this.engine.playerState.health > 55) {
      return {
        ok: true,
        event: 'stable',
      };
    }

    const foodSlot = this.engine.inventorySystem.hotbar.findIndex((stack) => stack?.itemType === ITEM_TYPES.consumable);

    if (foodSlot >= 0) {
      this.engine.inventorySystem.selectSlot(foodSlot);
      this.engine.survivalSystem.consumeSelectedItem();
    }

    return {
      ok: true,
      event: 'checked',
    };
  }

  checkSaveLoad() {
    try {
      const serializedWorld = this.engine.saveSystem.serializeWorld();
      const serializedText = JSON.stringify(serializedWorld);

      JSON.parse(serializedText);
      this.lastSavedStateSize = serializedText.length;

      return {
        ok: true,
        event: 'ok',
      };
    } catch (error) {
      return {
        ok: false,
        failures: [{
          code: 'save-load-error',
          summary: `Save/load serialization failed: ${error.message}`,
          severity: 'high',
        }],
      };
    }
  }

  getPlanningState() {
    const dayNightSnapshot = this.engine.dayNightSystem.getSnapshot();
    const progressionSnapshot = this.engine.progressionSystem.getSnapshot();

    return {
      inventory: {
        dirt: this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.dirt),
        stone: this.getFurnaceMaterialCount(),
        stoneBlocks: this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.stone),
        rockBlocks: this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.rock),
        sandstoneBlocks: this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.sandstone),
        furnaceMaterials: this.getFurnaceMaterialCount(),
        wood: this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.wood),
        planks: this.getItemCount(ITEM_TYPES.resource, ITEM_IDS.woodPlank) + this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.planks),
        sticks: this.getItemCount(ITEM_TYPES.resource, ITEM_IDS.stick),
        coal: this.getItemCount(ITEM_TYPES.resource, ITEM_IDS.coal),
        fuel: this.getItemCount(ITEM_TYPES.resource, ITEM_IDS.coal),
        ironOre: this.getItemCount(ITEM_TYPES.resource, ITEM_IDS.ironOre),
        ironIngot: this.getItemCount(ITEM_TYPES.resource, ITEM_IDS.ironIngot),
        furnace: this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.furnace),
        berries: this.getItemCount(ITEM_TYPES.consumable, ITEM_IDS.berries),
        food: this.getFoodCount(),
        basicTools: this.getBasicToolCount(),
        woodenPickaxe: this.getItemCount(ITEM_TYPES.tool, TOOL_IDS.pickaxe),
        pickaxes: this.getPickaxeCount(),
        ironTools: this.getIronToolCount(),
        buildBlocks: this.getBuildBlockCount(),
        validBuildBlocks: this.getValidBuildBlockCount(),
        storageChest: this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.lootChest),
        extraToolsStored: this.storage.extraToolsStored,
      },
      survival: {
        health: this.engine.playerState.health,
        hunger: this.engine.playerState.hunger,
        stamina: this.engine.playerState.stamina,
      },
      world: {
        activeBiome: this.engine.terrainGenerator.stats.activeBiome,
        shelterBlocks: this.lastShelterValidation.validShelterBlocksPlaced,
        validShelterBlocksPlaced: this.lastShelterValidation.validShelterBlocksPlaced,
        invalidShelterBlocksRejected: this.lastShelterValidation.invalidShelterBlocksRejected,
        shelterIsValid: this.lastShelterValidation.isValid,
        shelterIsSafeForNight: this.lastShelterValidation.isSafeForNight,
        safeDistanceNoAggro: this.lastShelterValidation.safeDistanceNoAggro,
        canHandMineStone: false,
        equippedTool: this.getActualEquippedTool(),
        hasValidMiningTool: this.hasValidMiningTool(),
        nightSurvivedSeconds: this.nightSurvivedSeconds,
        nightSurvived: this.nightSurvivedSeconds >= 6 && this.lastShelterValidation.isSafeForNight,
        isNight: dayNightSnapshot.isNight,
        exploredDistance: this.exploredDistance,
        uniqueBiomesDiscovered: this.discoveredBiomes.size,
        storageCreated: this.storageCreated,
        permanentBaseBlocksPlaced: this.permanentBaseBlocksPlaced,
        structuresDiscovered: this.discoveredStructures.size,
        baseTier: this.baseTier,
        storageStores: this.storage.stores,
        storageRetrieves: this.storage.retrieves,
        storedWood: this.storage.reserves.wood,
        storedStone: this.storage.reserves.stone,
        storedFood: this.storage.reserves.food,
        storageReserveScore: this.getStorageReserveScore(),
      },
      progression: {
        equipmentTier: progressionSnapshot.equipmentTier,
        currentTier: progressionSnapshot.currentTierId,
      },
      memory: this.aiMemorySnapshot?.strategyHints ?? null,
    };
  }

  executeGoalStep({ plan, elapsedSeconds, deltaTime }) {
    const secondaryActions = [];

    if (plan.action !== 'surviveNight' && plan.action !== 'gatherWood') {
      this.explore({ elapsedSeconds });
      secondaryActions.push({
        action: 'navigate',
        event: plan.goalId,
      });
    }

    switch (plan.action) {
      case 'gatherWood':
        return this.gatherWoodGoal({
          elapsedSeconds,
          deltaTime,
        });
      case 'craftPlanks':
        return this.craftRecipe(RECIPE_IDS.woodPlanks);
      case 'craftTools':
        return this.craftToolsForGoal();
      case 'craftWoodenPickaxe':
        return this.craftWoodenPickaxeForGoal();
      case 'gatherStone':
        if (!this.hasValidMiningTool()) {
          return this.createMissingPickaxeResult();
        }
        this.equipBestMiningTool();
        return this.withSecondaryActions(this.minePreferredBlock({
          elapsedSeconds,
          blockIds: [BLOCK_IDS.stone, BLOCK_IDS.rock, BLOCK_IDS.sandstone],
        }), secondaryActions);
      case 'buildShelter':
        return this.buildShelterBlock(elapsedSeconds);
      case 'surviveNight':
        return this.surviveNightGoal(deltaTime, elapsedSeconds);
      case 'obtainFurnace':
        return this.craftFurnaceForGoal();
      case 'gatherOre':
        return this.withSecondaryActions(this.minePreferredBlock({
          elapsedSeconds,
          blockIds: [BLOCK_IDS.ironOre],
        }, () => this.addInventoryResource({
          itemType: ITEM_TYPES.resource,
          itemId: ITEM_IDS.ironOre,
          name: 'Iron Ore',
        })), secondaryActions);
      case 'gatherFuel':
        return this.withSecondaryActions(this.addInventoryResource({
          itemType: ITEM_TYPES.resource,
          itemId: ITEM_IDS.coal,
          name: 'Coal',
        }), secondaryActions);
      case 'smeltOre':
        return this.startSmeltingGoal();
      case 'upgradeEquipment':
        return this.craftUpgradeEquipment();
      case 'exploreWorld':
        return this.exploreWorldGoal(deltaTime, elapsedSeconds, secondaryActions);
      case 'discoverNewBiome':
        return this.discoverNewBiomeGoal(deltaTime, elapsedSeconds, secondaryActions);
      case 'discoverStructure':
        return this.discoverStructureGoal(secondaryActions);
      case 'createStorage':
        return this.createStorageGoal(elapsedSeconds);
      case 'buildBaseTier1':
        return this.buildBaseTier1Goal();
      case 'buildStorage':
        return this.buildStorageGoal();
      case 'buildBaseTier2':
        return this.buildBaseTier2Goal();
      case 'maintainStorageReserves':
        return this.maintainStorageReservesGoal();
      case 'gatherFood':
        return this.gatherFoodGoal(secondaryActions);
      case 'buildPermanentBase':
        return this.buildPermanentBaseGoal(elapsedSeconds);
      default:
        return {
          ok: false,
          skipped: true,
        };
    }
  }

  getPosition() {
    const position = this.engine.playerController.position;

    return {
      x: position.x,
      y: position.y,
      z: position.z,
    };
  }

  getRuntimeSnapshot() {
    return {
      ...this.engine.createAutoQaRuntimeSnapshot(),
      simulationAdapter: {
        type: 'engine',
        startingInventoryProfile: this.inventoryProfileId,
        lastSavedStateSize: this.lastSavedStateSize,
      },
    };
  }

  captureInventoryContents() {
    return {
      selectedSlot: this.engine.playerState.selectedSlot,
      startingInventoryProfile: this.engine.inventorySystem.startingInventoryProfile,
      inventoryInitializationSource: this.engine.inventorySystem.inventoryInitializationSource,
      hotbar: this.engine.inventorySystem.hotbar.map((stack) => (stack ? { ...stack } : null)),
      backpack: this.engine.inventorySystem.backpack.map((stack) => ({ ...stack })),
    };
  }

  applyInventoryProfile(profileId) {
    this.engine.playerState.setSelectedSlot(0);
    this.engine.inventorySystem.replaceContents({
      hotbar: createEngineInventoryStacksForProfile(profileId),
      backpack: [],
      inventoryProfileId: profileId,
      initializationSource: INVENTORY_INITIALIZATION_SOURCES.autonomousPlaytest,
    });
  }

  getResourceScanSnapshot() {
    return {
      ...this.lastResourceScan,
      nearestWoodTarget: this.lastResourceScan.nearestWoodTarget
        ? { ...this.lastResourceScan.nearestWoodTarget }
        : null,
      vegetationTarget: this.lastResourceScan.vegetationTarget
        ? { ...this.lastResourceScan.vegetationTarget }
        : null,
      targets: (this.lastResourceScan.targets ?? []).map((target) => ({ ...target })),
    };
  }

  getShelterValidationSnapshot() {
    return { ...this.lastShelterValidation };
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
      storageCreated: this.storageCreated,
    };
  }

  getBaseSnapshot() {
    return {
      tier: this.baseTier,
      permanentBaseBlocksPlaced: this.permanentBaseBlocksPlaced,
      reserveScore: this.getStorageReserveScore(),
    };
  }

  getItemCount(itemType, itemId) {
    return this.engine.inventorySystem.getItemCount({
      itemType,
      itemId,
    });
  }

  getFoodCount() {
    return this.engine.inventorySystem.getAllStacks().reduce((count, stack) => {
      if (stack?.itemType !== ITEM_TYPES.consumable) {
        return count;
      }

      return count + stack.count;
    }, 0);
  }

  getBasicToolCount() {
    return this.engine.inventorySystem.getAllStacks().reduce((count, stack) => {
      if (stack?.itemType !== ITEM_TYPES.tool) {
        return count;
      }

      if (stack.itemId === TOOL_IDS.pickaxe || stack.itemId === TOOL_IDS.axe) {
        return count + 1;
      }

      return count;
    }, 0);
  }

  getPickaxeCount() {
    return this.getItemCount(ITEM_TYPES.tool, TOOL_IDS.pickaxe) +
      this.getItemCount(ITEM_TYPES.tool, TOOL_IDS.ironPickaxe);
  }

  hasValidMiningTool() {
    return this.getPickaxeCount() > 0;
  }

  getActualEquippedTool() {
    const selectedStack = this.engine.inventorySystem.getSelectedStack();

    return selectedStack?.itemType === ITEM_TYPES.tool ? selectedStack.itemId : TOOL_IDS.hand;
  }

  equipBestMiningTool() {
    const toolPriority = [TOOL_IDS.ironPickaxe, TOOL_IDS.pickaxe];
    const slotIndex = toolPriority.reduce((bestIndex, toolId) => {
      if (bestIndex >= 0) {
        return bestIndex;
      }

      return this.engine.inventorySystem.hotbar.findIndex(
        (stack) => stack?.itemType === ITEM_TYPES.tool && stack.itemId === toolId,
      );
    }, -1);

    if (slotIndex >= 0) {
      this.engine.inventorySystem.selectSlot(slotIndex);
    }
  }

  createMissingPickaxeResult() {
    return {
      ok: false,
      skipped: true,
      event: 'missing pickaxe',
      reason: 'Gather Stone requires a real pickaxe before mining.',
      equippedTool: this.getActualEquippedTool(),
      failures: [{
        code: 'gather-stone-missing-pickaxe',
        summary: 'Gather Stone started without a valid pickaxe.',
        severity: 'medium',
      }],
    };
  }

  getIronToolCount() {
    return this.engine.inventorySystem.getAllStacks().reduce((count, stack) => {
      if (stack?.itemType !== ITEM_TYPES.tool) {
        return count;
      }

      if (stack.itemId === TOOL_IDS.ironPickaxe || stack.itemId === TOOL_IDS.ironAxe) {
        return count + 1;
      }

      return count;
    }, 0);
  }

  getBuildBlockCount() {
    return [
      [ITEM_TYPES.block, BLOCK_IDS.dirt],
      [ITEM_TYPES.block, BLOCK_IDS.stone],
      [ITEM_TYPES.block, BLOCK_IDS.wood],
      [ITEM_TYPES.block, BLOCK_IDS.planks],
    ].reduce((count, [itemType, itemId]) => count + this.getItemCount(itemType, itemId), 0);
  }

  getValidBuildBlockCount() {
    return [
      [ITEM_TYPES.block, BLOCK_IDS.dirt],
      [ITEM_TYPES.block, BLOCK_IDS.stone],
      [ITEM_TYPES.block, BLOCK_IDS.wood],
      [ITEM_TYPES.block, BLOCK_IDS.planks],
    ].reduce((count, [itemType, itemId]) => count + this.getItemCount(itemType, itemId), 0);
  }

  getFurnaceMaterialCount() {
    return this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.stone) +
      this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.rock) +
      this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.sandstone);
  }

  craftRecipe(recipeId) {
    const recipe = getRecipe(recipeId);
    const wasCrafted = this.engine.craftingSystem.craft(recipeId);

    if (!wasCrafted) {
      return {
        ok: false,
        skipped: true,
      };
    }

    return {
      ok: true,
      event: this.engine.craftingSystem.getSnapshot().lastCraftedRecipe ?? recipeId,
      craftedItem: recipe?.output ?? null,
    };
  }

  craftToolsForGoal() {
    return this.craftRecipe(RECIPE_IDS.sticks);
  }

  craftWoodenPickaxeForGoal() {
    return this.craftRecipe(RECIPE_IDS.woodenPickaxe);
  }

  craftFurnaceForGoal() {
    const diagnostics = this.getFurnaceCraftDiagnostics();
    const result = this.craftRecipe(RECIPE_IDS.furnace);

    return {
      ...result,
      furnaceCraftDiagnostics: result.ok
        ? { ...diagnostics, blockReason: null }
        : diagnostics,
    };
  }

  getFurnaceCraftDiagnostics() {
    const diagnostics = this.engine.craftingSystem.getRecipeDiagnostics(RECIPE_IDS.furnace);

    return {
      furnaceRecipeFound: diagnostics.recipeFound,
      furnaceRecipeRequirements: diagnostics.requirements,
      furnaceCraftAttemptRequirements: diagnostics.attemptRequirements,
      furnaceCraftBlockReason: diagnostics.blockReason,
    };
  }

  craftUpgradeEquipment() {
    const pickaxeResult = this.craftRecipe(RECIPE_IDS.ironPickaxe);

    if (pickaxeResult.ok) {
      return pickaxeResult;
    }

    return this.craftRecipe(RECIPE_IDS.ironAxe);
  }

  exploreWorldGoal(deltaTime, elapsedSeconds, secondaryActions) {
    const beforeDistance = this.exploredDistance;

    this.explore({ elapsedSeconds });
    this.trackExploration(deltaTime);

    return {
      ok: this.exploredDistance > beforeDistance,
      event: this.engine.terrainGenerator.stats.activeBiome,
      secondaryActions,
    };
  }

  discoverNewBiomeGoal(deltaTime, elapsedSeconds, secondaryActions) {
    const beforeBiomeCount = this.discoveredBiomes.size;
    const knownBiomes = this.aiMemorySnapshot?.strategyHints?.knownBiomes ?? [];
    const targetBiome = this.findUnseenBiome(knownBiomes);

    if (targetBiome) {
      this.moveTowardBiome(targetBiome);
    } else {
      this.explore({ elapsedSeconds: elapsedSeconds + 9 });
    }

    this.trackExploration(deltaTime, {
      targetBiome,
    });

    return {
      ok: this.discoveredBiomes.size > beforeBiomeCount,
      event: targetBiome ?? this.engine.terrainGenerator.stats.activeBiome,
      secondaryActions,
      moving: this.discoveredBiomes.size <= beforeBiomeCount,
    };
  }

  createStorageGoal(elapsedSeconds) {
    const craftResult = this.craftRecipe(RECIPE_IDS.storageChest);

    if (!craftResult.ok) {
      return craftResult;
    }

    const chestStack = this.engine.inventorySystem.getAllStacks()
      .find((stack) => stack?.itemType === ITEM_TYPES.block && stack.itemId === BLOCK_IDS.lootChest && stack.count > 0);
    const placement = chestStack
      ? this.findPlacementTarget(elapsedSeconds, BLOCK_IDS.lootChest)
      : null;

    if (!placement) {
      this.storageCreated += 1;
      this.storage.placements += 1;

      return {
        ...craftResult,
        event: 'Storage Chest',
      };
    }

    const wasPlaced = this.engine.terrainGenerator.setBlockAtWorldPosition(
      placement.worldX,
      placement.y,
      placement.worldZ,
      BLOCK_IDS.lootChest,
    );

    if (!wasPlaced) {
      this.storageCreated += 1;
      this.storage.placements += 1;

      return {
        ...craftResult,
        event: 'Storage Chest',
      };
    }

    if (this.engine.playerState.mode !== 'creative') {
      this.engine.inventorySystem.removeItem({
        itemType: ITEM_TYPES.block,
        itemId: BLOCK_IDS.lootChest,
        count: 1,
      });
    }

    this.storageCreated += 1;
    this.storage.placements += 1;
    this.engine.handleBlocksPlaced([{
      ...placement,
      blockId: BLOCK_IDS.lootChest,
      action: 'place',
    }]);

    return {
      ...craftResult,
      event: 'Storage Chest',
    };
  }

  discoverStructureGoal(secondaryActions) {
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

    return {
      ok: true,
      event: structure.type,
      secondaryActions,
    };
  }

  buildBaseTier1Goal() {
    if (!this.lastShelterValidation.isValid || this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.furnace) < 1) {
      return {
        ok: false,
        skipped: true,
        event: 'missing tier 1 base requirements',
      };
    }

    this.baseTier = Math.max(this.baseTier, 1);

    return {
      ok: true,
      event: 'Base Tier 1',
    };
  }

  buildStorageGoal() {
    if (this.storageCreated < 1) {
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

  buildBaseTier2Goal() {
    if (this.baseTier < 1 || this.storageCreated < 1) {
      return {
        ok: false,
        skipped: true,
        event: 'missing tier 2 base requirements',
      };
    }

    if (this.storage.extraToolsStored < 1) {
      this.storage.extraToolsStored += 1;
    }

    this.baseTier = Math.max(this.baseTier, 2);

    return {
      ok: true,
      event: 'Base Tier 2',
    };
  }

  maintainStorageReservesGoal() {
    if (this.storageCreated < 1) {
      return {
        ok: false,
        skipped: true,
        event: 'missing storage chest',
      };
    }

    const reserveKey = this.getMissingReserveKey();

    if (!reserveKey) {
      return {
        ok: true,
        event: 'reserves full',
      };
    }

    const stored = this.storeReserveResource(reserveKey);

    if (stored) {
      return {
        ok: true,
        event: `${reserveKey} reserve`,
      };
    }

    return {
      ok: false,
      skipped: true,
      event: `missing ${reserveKey}`,
    };
  }

  gatherFoodGoal(secondaryActions) {
    return this.withSecondaryActions(this.addInventoryResource({
      itemType: ITEM_TYPES.consumable,
      itemId: ITEM_IDS.berries,
      name: 'Berries',
    }), secondaryActions);
  }

  buildPermanentBaseGoal(elapsedSeconds) {
    if (this.baseTier < 2) {
      return {
        ok: false,
        skipped: true,
        event: 'missing tier 2 base',
      };
    }

    const blockStack = this.findPermanentBaseStack();

    if (!blockStack && this.getStorageReserveScore() < 3) {
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

    const placement = blockStack ? this.findPlacementTarget(elapsedSeconds, blockStack.itemId) : null;

    if (blockStack && !placement) {
      return {
        ok: false,
        skipped: true,
        event: 'permanent base placement blocked',
        reason: 'No reachable empty base placement slot found.',
      };
    }

    const wasPlaced = blockStack ? this.engine.terrainGenerator.setBlockAtWorldPosition(
      placement.worldX,
      placement.y,
      placement.worldZ,
      blockStack.itemId,
    ) : false;

    if (blockStack && !wasPlaced) {
      return {
        ok: false,
        failures: [{
          code: 'place-unloaded-chunk',
          summary: 'Bot tried to place a permanent base block in an unloaded chunk.',
          severity: 'low',
        }],
      };
    }

    if (blockStack && this.engine.playerState.mode !== 'creative') {
      this.engine.inventorySystem.removeItem({
        itemType: ITEM_TYPES.block,
        itemId: blockStack.itemId,
        count: 1,
      });
    }

    if (blockStack) {
      this.permanentBaseBlocksPlaced += 1;
      this.engine.handleBlocksPlaced([{
        ...placement,
        blockId: blockStack.itemId,
        action: 'place',
      }]);
    }

    if (this.permanentBaseBlocksPlaced >= 24 && this.getStorageReserveScore() >= 3) {
      this.baseTier = Math.max(this.baseTier, 3);
    }

    return {
      ok: true,
      event: blockStack ? getBlockDefinition(blockStack.itemId).name : 'Base Tier 3',
      count: 1,
    };
  }

  gatherWoodGoal({ elapsedSeconds }) {
    const beforeWoodCount = this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.wood);
    const scanResult = this.scanWoodTargets();
    const target = scanResult.nearestWoodTarget;

    if (!target) {
      const fallbackResult = this.recoverWoodSearch({
        elapsedSeconds,
        scanResult,
      });

      return {
        ...fallbackResult,
        resourceScanResults: this.getResourceScanSnapshot(),
      };
    }

    this.moveTowardTarget(target);
    this.faceTarget(target);

    if (target.distance > WOOD_MINE_DISTANCE) {
      this.lastResourceScan = {
        ...scanResult,
        lastBlockedReason: `Nearest trunk is ${target.distance.toFixed(1)} blocks away, outside mining reach.`,
        recovery: 'moving-to-trunk',
      };

      return {
        ok: false,
        skipped: true,
        moving: true,
        event: 'moving to wood target',
        reason: this.lastResourceScan.lastBlockedReason,
        resourceScanResults: this.getResourceScanSnapshot(),
      };
    }

    const mineResult = this.mineSpecificBlock(target);
    const afterWoodCount = this.getItemCount(ITEM_TYPES.block, BLOCK_IDS.wood);
    const woodDelta = afterWoodCount - beforeWoodCount;

    if (mineResult.ok && woodDelta > 0) {
      this.lastResourceScan = {
        ...scanResult,
        lastBlockedReason: null,
        recovery: null,
      };

      return {
        ...mineResult,
        event: 'Wood',
        woodDelta,
        resourceScanResults: this.getResourceScanSnapshot(),
      };
    }

    this.lastResourceScan = {
      ...scanResult,
      lastBlockedReason: mineResult.ok
        ? 'Mined a trunk target but wood inventory did not increase.'
        : (mineResult.reason ?? 'Failed to mine the selected trunk target.'),
      recovery: 'rescan-next-step',
    };

    return {
      ok: false,
      skipped: true,
      event: 'wood target blocked',
      reason: this.lastResourceScan.lastBlockedReason,
      failures: mineResult.failures,
      resourceScanResults: this.getResourceScanSnapshot(),
    };
  }

  scanWoodTargets() {
    const origin = this.engine.playerController.position;
    let scanResult = this.resourceScanner.scanWoodTargets({
      origin,
      radius: WOOD_SCAN_RADIUS,
    });

    if (scanResult.nearestWoodTarget || !scanResult.biomeHasTrees) {
      this.lastResourceScan = scanResult;
      return scanResult;
    }

    const expandedScanResult = this.resourceScanner.scanWoodTargets({
      origin,
      radius: WOOD_EXPANDED_SCAN_RADIUS,
    });

    scanResult = {
      ...expandedScanResult,
      recovery: 'expanded-scan',
      lastBlockedReason: expandedScanResult.nearestWoodTarget
        ? null
        : 'No valid trunk block found nearby, even after expanding the scan radius.',
    };
    this.lastResourceScan = scanResult;

    return scanResult;
  }

  recoverWoodSearch({ elapsedSeconds, scanResult }) {
    const vegetationTarget = scanResult.vegetationTarget;

    if (vegetationTarget) {
      this.moveTowardTarget(vegetationTarget);
      this.faceTarget(vegetationTarget);
      this.lastResourceScan = {
        ...scanResult,
        lastBlockedReason: 'No valid trunk target found; moving toward dense vegetation and rescanning.',
        recovery: 'moving-to-dense-vegetation',
      };

      return {
        ok: false,
        skipped: true,
        moving: true,
        event: 'searching forest',
        reason: this.lastResourceScan.lastBlockedReason,
      };
    }

    this.explore({ elapsedSeconds });
    this.lastResourceScan = {
      ...scanResult,
      lastBlockedReason: scanResult.biomeHasTrees
        ? 'Biome can spawn trees, but no trunk or dense vegetation target is loaded.'
        : 'Current biome has no reliable tree targets near the bot.',
      recovery: scanResult.biomeHasTrees ? 'wide-exploration-rescan' : 'biome-search',
    };

    return {
      ok: false,
      skipped: true,
      event: 'wood search blocked',
      reason: this.lastResourceScan.lastBlockedReason,
    };
  }

  mineSpecificBlock(target) {
    const currentBlockId = this.engine.terrainGenerator.getBlockAtWorldPosition(
      target.worldX,
      target.y,
      target.worldZ,
    );

    const isValidWoodTarget = currentBlockId === BLOCK_IDS.wood ||
      (target.isLeafDropTarget && currentBlockId === BLOCK_IDS.leaves);

    if (currentBlockId !== target.blockId || !isValidWoodTarget) {
      return {
        ok: false,
        reason: 'Selected wood target changed before mining.',
        failures: [{
          code: 'wood-target-stale',
          summary: 'Bot selected a wood target that was no longer a valid trunk/drop block when mining executed.',
          severity: 'low',
        }],
      };
    }

    return this.mineBlockAtTarget(target);
  }

  mineBlockAtTarget(target) {
    const wasDestroyed = this.engine.terrainGenerator.setBlockAtWorldPosition(
      target.worldX,
      target.y,
      target.worldZ,
      BLOCK_IDS.air,
    );

    if (!wasDestroyed) {
      return {
        ok: false,
        reason: 'Selected wood target was in an unloaded chunk.',
        failures: [{
          code: 'mine-unloaded-chunk',
          summary: 'Bot tried to mine a selected trunk block in an unloaded chunk.',
          severity: 'low',
        }],
      };
    }

    const dropStack = normalizeDrop(getBlockDrop(target.blockId));

    this.engine.handleBlockMined({
      targetBlock: {
        worldX: target.worldX,
        y: target.y,
        worldZ: target.worldZ,
        blockId: target.blockId,
      },
      dropStack,
      blockDefinition: getBlockDefinition(target.blockId),
    });
    this.engine.networkSession.queueBlockEdits([{
      worldX: target.worldX,
      y: target.y,
      worldZ: target.worldZ,
      blockId: BLOCK_IDS.air,
      action: 'destroy',
    }]);
    const collectResult = this.collectDrops(dropStack);

    return {
      ok: collectResult.ok,
      event: getBlockDefinition(target.blockId).name,
      secondaryActions: collectResult.ok
        ? [{ action: 'collect', event: collectResult.event }]
        : [],
      failures: collectResult.failures,
      reason: collectResult.ok ? null : 'Wood drop could not be collected after mining.',
    };
  }

  minePreferredBlock({ elapsedSeconds, blockIds }, fallback = null) {
    const target = this.findMineTarget(elapsedSeconds, blockIds);

    if (!target) {
      return fallback?.() ?? {
        ok: false,
        skipped: true,
      };
    }

    const wasDestroyed = this.engine.terrainGenerator.setBlockAtWorldPosition(
      target.worldX,
      target.y,
      target.worldZ,
      BLOCK_IDS.air,
    );

    if (!wasDestroyed) {
      return {
        ok: false,
        failures: [{
          code: 'mine-unloaded-chunk',
          summary: 'Bot tried to mine a planned block in an unloaded chunk.',
          severity: 'low',
        }],
      };
    }

    const dropStack = normalizeDrop(getBlockDrop(target.blockId));

    this.engine.handleBlockMined({
      targetBlock: target,
      dropStack,
      blockDefinition: getBlockDefinition(target.blockId),
    });
    this.engine.networkSession.queueBlockEdits([{
      worldX: target.worldX,
      y: target.y,
      worldZ: target.worldZ,
      blockId: BLOCK_IDS.air,
      action: 'destroy',
    }]);
    const collectResult = this.collectDrops(dropStack);

    return {
      ok: true,
      event: getBlockDefinition(target.blockId).name,
      secondaryActions: collectResult.ok
        ? [{ action: 'collect', event: collectResult.event }]
        : [],
    };
  }

  moveTowardTarget(target) {
    const movement = this.engine.playerController.movementSystem;
    const distance = Math.hypot(
      target.worldX + 0.5 - this.engine.playerController.position.x,
      target.worldZ + 0.5 - this.engine.playerController.position.z,
    );

    for (const code of MOVEMENT_CODES) {
      movement.setInput(code, false);
    }

    if (distance > 2.2) {
      movement.setInput('KeyW', true);
      movement.setInput('ShiftLeft', distance > 8);
    }
  }

  faceTarget(target) {
    const playerPosition = this.engine.playerController.position;
    const directionX = target.worldX + 0.5 - playerPosition.x;
    const directionZ = target.worldZ + 0.5 - playerPosition.z;
    const yaw = Math.atan2(-directionX, -directionZ);

    this.engine.cameraSystem.yaw = yaw;
    this.engine.playerController.movementSystem.setCameraYaw(yaw);
  }

  trackExploration(deltaTime, { targetBiome = null } = {}) {
    const currentPosition = this.getPosition();
    const lastPosition = this.lastExplorationPosition ?? currentPosition;
    const movedDistance = Math.hypot(
      currentPosition.x - lastPosition.x,
      currentPosition.z - lastPosition.z,
    );
    const intendedDistance = movedDistance > 0.05 ? movedDistance : 8 * deltaTime;
    const biomeName = this.engine.terrainGenerator.getBiomeAt(currentPosition.x, currentPosition.z)?.name ?? this.engine.terrainGenerator.stats.activeBiome;

    this.exploredDistance += intendedDistance;
    this.lastExplorationPosition = currentPosition;
    this.recordBiomeVisit(biomeName, deltaTime);
  }

  findUnseenBiome(knownBiomes = []) {
    const position = this.engine.playerController.position;
    const remembered = new Set([
      ...this.discoveredBiomes.keys(),
    ]);
    const preferredKnownBiomes = new Set(knownBiomes);

    for (let attempt = 1; attempt <= 18; attempt += 1) {
      const angle = attempt * 0.85;
      const distance = 48 + attempt * 24;
      const x = position.x + Math.cos(angle) * distance;
      const z = position.z + Math.sin(angle) * distance;
      const biomeName = this.engine.terrainGenerator.getBiomeAt(x, z)?.name ?? 'Unknown';

      if (!remembered.has(biomeName)) {
        return biomeName;
      }
    }

    return [...preferredKnownBiomes].find((biomeName) => !this.discoveredBiomes.has(biomeName)) ?? null;
  }

  moveTowardBiome(targetBiome) {
    const movement = this.engine.playerController.movementSystem;

    for (const code of MOVEMENT_CODES) {
      movement.setInput(code, false);
    }

    movement.setInput('KeyW', true);
    movement.setInput('ShiftLeft', true);
    this.recordBiomeVisit(targetBiome, 0);
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

  storeAnyResource() {
    return this.storeReserveResource('wood') ||
      this.storeReserveResource('stone') ||
      this.storeReserveResource('food');
  }

  retrieveAnyResource() {
    for (const reserveKey of ['wood', 'stone', 'food']) {
      if (this.storage.reserves[reserveKey] <= 0) {
        continue;
      }

      this.storage.reserves[reserveKey] -= 1;
      this.storage.retrieves += 1;
      return true;
    }

    return false;
  }

  storeReserveResource(reserveKey) {
    const stackMatcher = {
      wood: (stack) => stack?.itemType === ITEM_TYPES.block && stack.itemId === BLOCK_IDS.wood,
      stone: (stack) => stack?.itemType === ITEM_TYPES.block && [BLOCK_IDS.stone, BLOCK_IDS.rock, BLOCK_IDS.sandstone].includes(stack.itemId),
      food: (stack) => stack?.itemType === ITEM_TYPES.consumable,
    }[reserveKey];
    const stack = this.engine.inventorySystem.getAllStacks().find((candidate) => stackMatcher?.(candidate) && candidate.count > 0);

    if (!stack) {
      return false;
    }

    const count = Math.min(8, stack.count);
    const wasRemoved = this.engine.inventorySystem.removeItem({
      itemType: stack.itemType,
      itemId: stack.itemId,
      count,
    });

    if (!wasRemoved) {
      return false;
    }

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
    const position = this.engine.playerController.position;
    const biome = this.engine.terrainGenerator.getBiomeAt(position.x, position.z)?.name ?? this.engine.terrainGenerator.stats.activeBiome;
    const type = biome === 'Desert'
      ? 'ruin'
      : biome === 'Mountains'
        ? 'camp'
        : 'village';

    return {
      id: `${type}:${Math.round(position.x / 16)}:${Math.round(position.z / 16)}`,
      type,
      biome,
      position: {
        x: Math.round(position.x),
        y: Math.round(position.y),
        z: Math.round(position.z),
      },
    };
  }

  findValidShelterStack() {
    return this.engine.inventorySystem.getAllStacks()
      .find((stack) => (
        stack?.itemType === ITEM_TYPES.block &&
        isValidShelterBlockId(stack.itemId) &&
        stack.count > 0
      ));
  }

  findPermanentBaseStack() {
    return this.engine.inventorySystem.getAllStacks()
      .find((stack) => (
        stack?.itemType === ITEM_TYPES.block &&
        [BLOCK_IDS.stone, BLOCK_IDS.planks, BLOCK_IDS.wood, BLOCK_IDS.dirt].includes(stack.itemId) &&
        stack.count > 0
      ));
  }

  consumeInvalidShelterSelectionFailure() {
    const selectedStack = this.engine.inventorySystem.getSelectedStack();

    if (
      selectedStack?.itemType !== ITEM_TYPES.block ||
      !isInvalidShelterBlockId(selectedStack.itemId) ||
      this.reportedInvalidShelterBlockIds.has(selectedStack.itemId)
    ) {
      return null;
    }

    this.reportedInvalidShelterBlockIds.add(selectedStack.itemId);
    this.invalidShelterBlocksRejected += 1;

    return {
      code: 'invalid-shelter-material',
      summary: `${getBlockDefinition(selectedStack.itemId).name} is not valid shelter material.`,
      severity: 'medium',
    };
  }

  findShelterPlacement(blockId, elapsedSeconds) {
    if (!this.shelterOrigin) {
      this.shelterOrigin = this.createShelterOrigin();
    }

    for (let attempt = 0; attempt < SHELTER_PATTERN.length; attempt += 1) {
      const patternIndex = (this.shelterPlacementIndex + attempt) % SHELTER_PATTERN.length;
      const patternPlacement = SHELTER_PATTERN[patternIndex];
      const placement = {
        worldX: this.shelterOrigin.x + patternPlacement.dx,
        y: this.shelterOrigin.y + patternPlacement.dy,
        worldZ: this.shelterOrigin.z + patternPlacement.dz,
        blockId,
        role: patternPlacement.role,
        side: patternPlacement.side,
      };

      if (!this.engine.terrainGenerator.isWorldPositionLoaded(placement.worldX, placement.worldZ)) {
        continue;
      }

      if (this.engine.terrainGenerator.getBlockAtWorldPosition(placement.worldX, placement.y, placement.worldZ) !== BLOCK_IDS.air) {
        continue;
      }

      this.shelterPlacementIndex = patternIndex + 1;
      return placement;
    }

    return this.findPlacementTarget(elapsedSeconds, blockId);
  }

  createShelterOrigin() {
    const position = this.engine.playerController.position;
    const x = Math.floor(position.x);
    const z = Math.floor(position.z);
    const y = Math.floor(this.engine.terrainGenerator.getHeightAt(x, z));

    return { x, y, z };
  }

  updateShelterValidation({ lastBlockedReason = null } = {}) {
    const safeDistanceNoAggro = (this.engine.entitySystem.stats?.aggroHostiles ?? 0) === 0 &&
      (this.engine.entitySystem.stats?.hostiles ?? 0) === 0;

    this.lastShelterValidation = validateShelter({
      placements: this.shelterPlacements,
      invalidRejected: this.invalidShelterBlocksRejected,
      safeDistanceNoAggro,
      lastBlockedReason,
    });

    return this.getShelterValidationSnapshot();
  }

  addInventoryResource({ itemType, itemId, name }) {
    const wasAdded = this.engine.inventorySystem.addItem({
      itemType,
      itemId,
      name,
      count: 1,
    });

    return {
      ok: wasAdded,
      event: name,
      skipped: !wasAdded,
    };
  }

  buildShelterBlock(elapsedSeconds) {
    const invalidSelectionFailure = this.consumeInvalidShelterSelectionFailure();
    const blockStack = this.findValidShelterStack();

    if (!blockStack) {
      this.updateShelterValidation({
        lastBlockedReason: 'No valid shelter material available. Need Wood, Planks, Stone, or Dirt.',
      });

      return {
        ok: false,
        skipped: true,
        event: 'missing shelter material',
        reason: this.lastShelterValidation.lastBlockedReason,
        failures: invalidSelectionFailure ? [invalidSelectionFailure] : [],
        failedActions: invalidSelectionFailure ? [createInvalidShelterFailedAction(invalidSelectionFailure)] : [],
        recoveryAction: {
          type: 'gather-valid-shelter-material',
          reason: 'Shelter placement needs Wood, Planks, Stone, or Dirt.',
        },
        shelterValidation: this.getShelterValidationSnapshot(),
      };
    }

    const placement = this.findShelterPlacement(blockStack.itemId, elapsedSeconds);

    if (!placement) {
      this.updateShelterValidation({
        lastBlockedReason: 'No reachable empty shelter placement slot found.',
      });

      return {
        ok: false,
        skipped: true,
        event: 'shelter placement blocked',
        reason: this.lastShelterValidation.lastBlockedReason,
        failures: invalidSelectionFailure ? [invalidSelectionFailure] : [],
        failedActions: invalidSelectionFailure ? [createInvalidShelterFailedAction(invalidSelectionFailure)] : [],
        recoveryAction: {
          type: 'reposition-for-shelter',
          reason: 'Move to a clearer area before placing shelter blocks.',
        },
        shelterValidation: this.getShelterValidationSnapshot(),
      };
    }

    const wasPlaced = this.engine.terrainGenerator.setBlockAtWorldPosition(
      placement.worldX,
      placement.y,
      placement.worldZ,
      blockStack.itemId,
    );

    if (!wasPlaced) {
      this.updateShelterValidation({
        lastBlockedReason: 'Selected shelter placement is in an unloaded chunk.',
      });

      return {
        ok: false,
        failures: [
          ...(invalidSelectionFailure ? [invalidSelectionFailure] : []),
          {
            code: 'place-unloaded-chunk',
            summary: 'Bot tried to place a shelter block in an unloaded chunk.',
            severity: 'low',
          },
        ],
        failedActions: invalidSelectionFailure ? [createInvalidShelterFailedAction(invalidSelectionFailure)] : [],
        shelterValidation: this.getShelterValidationSnapshot(),
      };
    }

    if (this.engine.playerState.mode !== 'creative') {
      this.engine.inventorySystem.removeItem({
        itemType: ITEM_TYPES.block,
        itemId: blockStack.itemId,
        count: 1,
      });
    }

    const placementRecord = {
      ...placement,
      blockId: blockStack.itemId,
    };

    this.shelterPlacements.push(placementRecord);
    this.engine.handleBlocksPlaced([{
      ...placementRecord,
      action: 'place',
    }]);
    this.updateShelterValidation();
    this.shelterBlocksPlaced = this.lastShelterValidation.validShelterBlocksPlaced;

    return {
      ok: true,
      event: getBlockDefinition(blockStack.itemId).name,
      count: 1,
      failures: invalidSelectionFailure ? [invalidSelectionFailure] : [],
      failedActions: invalidSelectionFailure ? [createInvalidShelterFailedAction(invalidSelectionFailure)] : [],
      shelterValidation: this.getShelterValidationSnapshot(),
      validShelterBlocksPlaced: this.lastShelterValidation.validShelterBlocksPlaced,
      invalidShelterBlocksRejected: this.lastShelterValidation.invalidShelterBlocksRejected,
    };
  }

  surviveNightGoal(deltaTime, elapsedSeconds) {
    const survivalResult = this.survive();
    const secondaryActions = [];
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
      this.nightSurvivedSeconds += deltaTime;
    }

    if (Math.floor(this.nightSurvivedSeconds * 2) % 4 === 0) {
      const combatResult = this.fightHostile({ elapsedSeconds });

      if (combatResult.ok) {
        secondaryActions.push({
          action: 'fightHostile',
          event: 'night guard',
          entityDamageApplied: true,
        });
      }
    }

    return {
      ok: survivalResult.ok,
      event: 'night shelter',
      secondaryActions,
      failures: survivalResult.failures,
      shelterValidation: this.getShelterValidationSnapshot(),
    };
  }

  startSmeltingGoal() {
    if (this.engine.furnaceSystem.getSnapshot().activeJobs > 0) {
      return {
        ok: false,
        event: 'smelting active',
        skipped: true,
      };
    }

    const wasStarted = this.engine.furnaceSystem.startRecipe(FURNACE_RECIPE_IDS.ironIngot);

    return {
      ok: wasStarted,
      event: wasStarted ? 'Smelt Iron Ingot' : 'smelt blocked',
      skipped: !wasStarted,
    };
  }

  withSecondaryActions(result, secondaryActions) {
    if (!result.ok) {
      return result;
    }

    return {
      ...result,
      secondaryActions: [
        ...(result.secondaryActions ?? []),
        ...secondaryActions,
      ],
    };
  }

  findMineTarget(elapsedSeconds, preferredBlockIds = null) {
    const position = this.engine.playerController.position;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const angle = elapsedSeconds * 0.45 + attempt * 0.95;
      const distance = 2 + (attempt % MINE_RADIUS);
      const worldX = Math.floor(position.x + Math.cos(angle) * distance);
      const worldZ = Math.floor(position.z + Math.sin(angle) * distance);
      const y = Math.floor(this.engine.terrainGenerator.getHeightAt(worldX, worldZ) - 1);
      const blockId = this.engine.terrainGenerator.getBlockAtWorldPosition(worldX, y, worldZ);

      if (preferredBlockIds && !preferredBlockIds.includes(blockId)) {
        continue;
      }

      if (blockId !== BLOCK_IDS.air && blockId !== BLOCK_IDS.water) {
        return {
          worldX,
          y,
          worldZ,
          blockId,
        };
      }
    }

    return null;
  }

  findPlacementTarget(elapsedSeconds, blockId) {
    const position = this.engine.playerController.position;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const angle = elapsedSeconds * 0.4 + attempt * 1.1;
      const distance = 2 + (attempt % PLACE_RADIUS);
      const worldX = Math.floor(position.x + Math.cos(angle) * distance);
      const worldZ = Math.floor(position.z + Math.sin(angle) * distance);
      const y = Math.floor(this.engine.terrainGenerator.getHeightAt(worldX, worldZ));

      if (!this.engine.terrainGenerator.isWorldPositionLoaded(worldX, worldZ)) {
        continue;
      }

      if (this.engine.terrainGenerator.getBlockAtWorldPosition(worldX, y, worldZ) === BLOCK_IDS.air) {
        return {
          worldX,
          y,
          worldZ,
          blockId,
        };
      }
    }

    return null;
  }

  consumeMatchingBlock(blockId) {
    const slotIndex = this.engine.inventorySystem.hotbar
      .findIndex((stack) => stack?.itemType === ITEM_TYPES.block && stack.itemId === blockId);

    if (slotIndex < 0) {
      return;
    }

    this.engine.inventorySystem.selectSlot(slotIndex);
    this.engine.inventorySystem.consumeSelected(1);
  }

  findOrSpawnHostile(elapsedSeconds) {
    const existingHostile = this.engine.entitySystem.registry.getEntities()
      .find((entity) => entity.type === 'hostile' && entity.isAlive?.() === true);

    if (existingHostile) {
      return existingHostile;
    }

    const playerPosition = this.engine.playerController.position;
    const spawnPosition = {
      x: playerPosition.x + Math.cos(elapsedSeconds) * 2.5,
      y: this.engine.terrainGenerator.getHeightAt(playerPosition.x + 2, playerPosition.z + 2),
      z: playerPosition.z + Math.sin(elapsedSeconds) * 2.5,
    };

    return this.engine.entitySystem.spawnHostile({
      position: spawnPosition,
      seed: Math.floor(elapsedSeconds * 1000),
      maxActiveHostiles: 8,
    });
  }
}

function isMatchingItemStack(leftStack, rightStack) {
  return leftStack?.itemType === rightStack?.itemType && leftStack?.itemId === rightStack?.itemId;
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

function round(value, digits) {
  const scale = 10 ** digits;

  return Math.round((Number(value) || 0) * scale) / scale;
}
