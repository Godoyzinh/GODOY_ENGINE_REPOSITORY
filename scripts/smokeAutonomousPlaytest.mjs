import assert from 'node:assert/strict';
import { runHeadlessAiSimulation } from './simulateAiPlaytest.mjs';
import { AutoQaReportSystem } from '../src/diagnostics/autoQaReportSystem.js';
import { AiMemorySystem } from '../src/ai/memory/aiMemorySystem.js';
import { EnginePlaytestAdapter } from '../src/diagnostics/enginePlaytestAdapter.js';
import { HeadlessPlaytestAdapter } from '../src/diagnostics/headlessPlaytestAdapter.js';
import { ResourceScanner } from '../src/diagnostics/resourceScanner.js';
import { TelemetrySystem } from '../src/diagnostics/telemetrySystem.js';
import { CraftingSystem } from '../src/crafting/craftingSystem.js';
import { ITEM_IDS, ITEM_TYPES } from '../src/items/itemRegistry.js';
import { InventorySystem } from '../src/player/inventorySystem.js';
import { PlayerState } from '../src/player/playerState.js';
import { SaveSystem } from '../src/save/saveSystem.js';
import { BLOCK_IDS } from '../src/world/blockTypes.js';
import { getBlockKey } from '../src/world/chunkMath.js';
import { SHELTER_BLOCK_TARGET } from '../src/diagnostics/shelterValidator.js';
import { AUTONOMOUS_INVENTORY_PROFILE_IDS } from '../src/diagnostics/autonomousInventoryProfiles.js';

class StuckCraftAdapter extends HeadlessPlaytestAdapter {
  constructor(options) {
    super(options);
    this.inventory.basicTools = 2;
  }

  begin(options) {
    super.begin(options);
    this.inventory.basicTools = 2;
  }

  craftTools() {
    return {
      ok: true,
      event: 'basic tools ready',
      count: 0,
    };
  }
}

class NoDeltaWoodAdapter extends HeadlessPlaytestAdapter {
  gatherWood() {
    this.lastResourceScan = this.createResourceScanSnapshot({
      scannedWoodBlocks: 2,
      woodTargetsFound: 2,
      nearestWoodTarget: {
        blockId: BLOCK_IDS.wood,
        worldX: 2,
        y: 8,
        worldZ: 2,
        distance: 2,
        nearGround: true,
      },
    });

    return {
      ok: true,
      event: 'wood',
    };
  }
}

class BlockedWoodAdapter extends HeadlessPlaytestAdapter {
  gatherWood() {
    this.lastResourceScan = this.createResourceScanSnapshot({
      radius: 48,
      scannedWoodBlocks: 0,
      woodTargetsFound: 0,
      rejectedLeafTargets: 12,
      lastBlockedReason: 'No reachable wood target found in a tree-capable biome.',
      recovery: 'expand-wood-scan',
    });

    return {
      ok: false,
      skipped: true,
      event: 'wood target blocked',
      reason: this.lastResourceScan.lastBlockedReason,
      resourceScanResults: this.lastResourceScan,
      recoveryAction: {
        type: 'expand-wood-scan',
        reason: this.lastResourceScan.lastBlockedReason,
      },
      failures: [{
        code: 'wood-target-scan-blocked',
        summary: this.lastResourceScan.lastBlockedReason,
        severity: 'medium',
      }],
    };
  }
}

class MissingPickaxeStoneAdapter extends HeadlessPlaytestAdapter {
  constructor(options) {
    super(options);
    this.reportedPickaxe = false;
  }

  begin(options) {
    super.begin(options);
    this.reportedPickaxe = false;
  }

  craftWoodenPickaxe() {
    if (this.inventory.planks < 2 || this.inventory.sticks < 2) {
      return {
        ok: false,
        skipped: true,
      };
    }

    this.inventory.planks -= 2;
    this.inventory.sticks -= 2;
    this.reportedPickaxe = true;

    return {
      ok: true,
      event: 'Wooden Pickaxe',
      craftedItem: {
        itemType: 'tool',
        itemId: 'pickaxe',
        name: 'Wooden Pickaxe',
        count: 1,
      },
    };
  }

  getPlanningState(options) {
    const state = super.getPlanningState(options);

    if (this.reportedPickaxe) {
      state.inventory.basicTools = 1;
      state.inventory.woodenPickaxe = 1;
      state.inventory.pickaxes = 1;
      state.world.equippedTool = 'woodenPickaxe';
      state.world.hasValidMiningTool = true;
    }

    return state;
  }
}

class BlockedFurnaceAdapter extends HeadlessPlaytestAdapter {
  obtainFurnace() {
    return {
      ok: false,
      skipped: true,
      event: 'furnace craft blocked',
      reason: 'Injected furnace craft blockage.',
      furnaceCraftDiagnostics: {
        ...this.getFurnaceCraftDiagnostics(),
        furnaceCraftBlockReason: 'Injected furnace craft blockage.',
      },
    };
  }
}

class LowSurvivalAdapter extends HeadlessPlaytestAdapter {
  begin(options) {
    super.begin(options);
    this.stats.health = 45;
    this.stats.hunger = 35;
    this.inventory.berries = 0;
  }
}

class VoidPlayerAdapter extends HeadlessPlaytestAdapter {
  begin(options) {
    super.begin(options);
    this.position = { x: 460, y: -18, z: 460 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.stats.health = 35;
    this.stats.hunger = 45;
    this.lastSafeGroundedPosition = { x: 4, y: 8, z: 4 };
  }
}

const { report, snapshot } = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 60,
  deltaTime: 0.25,
  seed: 20260529,
});

assert.equal(snapshot.status, 'completed');
assert.equal(report.trigger, 'autonomous-playtest');
assert.equal(report.privacy.automaticUpload, false);
assert.equal(snapshot.startingInventoryProfile, AUTONOMOUS_INVENTORY_PROFILE_IDS.survivalStart);
assert.equal(report.runtimeStats.simulation.startingInventoryProfile, AUTONOMOUS_INVENTORY_PROFILE_IDS.survivalStart);
assert.ok(report.runtimeStats.simulation, 'report should include sanitized simulation stats');
assert.ok(report.simulationResult, 'exported report should include full simulation result');
assert.ok(snapshot.actionCounts.explore > 0, 'bot should explore');
assert.ok(snapshot.actionCounts.mine > 0, 'bot should mine');
assert.ok(snapshot.actionCounts.mine <= 64, 'bot mining should be throttled during quick smoke');
assert.ok(snapshot.actionCounts.place > 0, 'bot should place blocks');
assert.ok(snapshot.actionCounts.collect > 0, 'bot should collect planned drops');
assert.ok(snapshot.actionCounts.combat > 0, 'bot should test combat');
assert.ok(snapshot.actionCounts.saveLoad > 0, 'bot should test save/load');
assert.ok(snapshot.planner, 'bot should include goal planner state');
assert.ok(snapshot.planner.goalsCompleted.length >= 10, 'bot should complete the current survival progression route');
assert.equal(snapshot.planner.goalsFailed.length, 0, 'quick smoke should not fail progression goals');
assert.notEqual(snapshot.planner.progressionTierReached, 'starter', 'bot should reach a progression tier');
assert.ok(snapshot.planner.currentGoal, 'bot should expose current goal');
assert.ok(snapshot.planner.currentSubgoal, 'bot should expose current subgoal');
assert.ok(snapshot.planner.reason, 'bot should explain goal reasoning');
assert.ok(snapshot.planner.target, 'bot should expose the current target');
assert.ok(Object.keys(snapshot.planner.timeSpentByGoal).length >= 10, 'bot should track time spent per goal');
const completedGoalIds = snapshot.planner.goalsCompleted.map((goal) => goal.id);
assert.ok(completedGoalIds.includes('craftWoodenPickaxe'), 'bot should craft a real wooden pickaxe before mining stone');
assert.ok(
  completedGoalIds.includes('craftTools') && completedGoalIds.indexOf('craftWoodenPickaxe') > completedGoalIds.indexOf('craftTools'),
  'Craft Wooden Pickaxe should happen after Craft Tools prepares sticks',
);
assert.ok(
  completedGoalIds.indexOf('gatherStone') > completedGoalIds.indexOf('craftWoodenPickaxe'),
  'Gather Stone should happen after a pickaxe exists',
);
assert.ok(report.telemetry.counts.gameplayEvents > 0, 'telemetry should receive simulated events');
assert.ok(report.runtimeStats.simulation.inventory, 'report should include inventory snapshot');
assert.ok(report.runtimeStats.simulation.inventorySnapshot, 'report should include explicit inventorySnapshot field');
assert.equal(report.runtimeStats.simulation.initialInventory.wood, 0, 'survival-start should begin with no wood');
assert.equal(report.runtimeStats.simulation.initialInventory.stone, 0, 'survival-start should begin with no stone');
assert.equal(report.runtimeStats.simulation.initialInventory.basicTools, 0, 'survival-start should begin with no tools');
assert.equal(report.runtimeStats.simulation.initialInventory.berries, 2, 'survival-start should include minimal food only');
assert.ok(report.runtimeStats.simulation.currentInventory.wood >= 0, 'report should include currentInventory');
assert.ok(report.runtimeStats.simulation.currentInventory.pickaxes >= 1, 'report should include a real pickaxe after progression');
assert.equal(report.runtimeStats.simulation.furnaceRecipeFound, true, 'report should state whether furnace recipe is registered');
assert.ok(
  report.runtimeStats.simulation.furnaceRecipeRequirements[0].options.some((option) => option.itemId === 'rock'),
  'furnace recipe diagnostics should include rock as a valid stone material',
);
assert.ok(
  report.runtimeStats.simulation.furnaceCraftAttemptRequirements[0].satisfied,
  'successful furnace craft should preserve the satisfied attempt diagnostics',
);
assert.equal(report.runtimeStats.simulation.furnaceCraftBlockReason, null, 'successful furnace craft should not report a block reason');
assert.ok(report.runtimeStats.simulation.inventoryDelta.wood >= 0, 'report should include inventoryDelta');
assert.ok(report.runtimeStats.simulation.inventoryDelta.pickaxes >= 1, 'pickaxe progress should be based on real inventory deltas');
assert.ok(report.runtimeStats.simulation.actualEquippedTool && report.runtimeStats.simulation.actualEquippedTool !== 'hand', 'report should include the actual equipped mining tool');
assert.ok(report.runtimeStats.simulation.inventory.delta.wood >= 0, 'inventory snapshot should include resource deltas');
assert.ok(report.runtimeStats.simulation.resourceDeltas.wood >= 0, 'report should include explicit resourceDeltas field');
assert.ok(report.runtimeStats.simulation.crafting.craftedItems.length > 0, 'report should include crafted items');
assert.ok(
  report.runtimeStats.simulation.crafting.craftedItems.some((craftedItem) => (
    craftedItem.action === 'craftWoodenPickaxe' &&
    craftedItem.itemId === 'pickaxe'
  )),
  'report should include the wooden pickaxe craft output',
);
assert.ok(report.runtimeStats.simulation.craftedItems.length > 0, 'report should include explicit craftedItems field');
assert.equal(report.runtimeStats.simulation.crafting.failedCrafts.length, 0, 'healthy quick smoke should not include failed crafts');
assert.equal(report.runtimeStats.simulation.failedCrafts.length, 0, 'report should include explicit failedCrafts field');
assert.ok(Array.isArray(report.runtimeStats.simulation.failedActions), 'report should include failedActions list');
assert.ok(Array.isArray(report.runtimeStats.simulation.goalTransitions), 'report should include goalTransitions list');
assert.ok(report.runtimeStats.simulation.resourceScanResults, 'report should include resource scan results');
assert.ok(report.runtimeStats.simulation.resourceScanResults.scannedWoodBlocks > 0, 'report should include scanned wood count');
assert.ok(report.runtimeStats.simulation.woodTargetsFound > 0, 'report should include wood target count');
assert.equal(report.runtimeStats.simulation.rejectedLeafTargets >= 0, true, 'report should include rejected leaf target count');
assert.ok(report.runtimeStats.simulation.shelterValidation, 'report should include shelter validation');
assert.ok(
  report.runtimeStats.simulation.validShelterBlocksPlaced >= SHELTER_BLOCK_TARGET,
  'shelter should only complete after enough valid shelter blocks are placed',
);
assert.equal(report.runtimeStats.simulation.invalidShelterBlocksRejected, 0, 'survival-start should not include invalid shelter material');
assert.ok(Array.isArray(report.runtimeStats.simulation.recoveryActions), 'report should include recoveryActions list');
assert.ok(Array.isArray(report.runtimeStats.simulation.blockedGoals), 'report should include blockedGoals list');
assert.ok(report.runtimeStats.simulation.planner, 'report should include sanitized planner stats');
assert.deepEqual(
  report.runtimeStats.simulation.planner.goalsCompleted.map((goal) => goal.id),
  snapshot.planner.goalsCompleted.map((goal) => goal.id),
  'report should preserve completed goal ids',
);
assert.equal(
  report.runtimeStats.simulation.planner.progressionTierReached,
  snapshot.planner.progressionTierReached,
  'report should preserve progression tier',
);
assert.ok(Array.isArray(report.runtimeStats.simulation.planner.bottlenecks), 'report should include bottlenecks list');
assert.ok(Array.isArray(report.runtimeStats.simulation.planner.goalTransitions), 'report should include planner goal transitions');
assert.ok(Array.isArray(report.aiTasks), 'report should include AI task proposals');
const exportedReport = JSON.parse(JSON.stringify(report));
assert.equal(exportedReport.issues.length, report.issues.length, 'exported JSON should preserve issues');
assert.equal(exportedReport.aiTasks.length, report.aiTasks.length, 'exported JSON should preserve aiTasks');
assert.equal(JSON.stringify(report).includes(['C:', 'Users'].join('\\\\')), false, 'report should avoid local machine paths');

const memorySystem = new AiMemorySystem({
  storage: createSmokeMemoryStorage(),
  now: () => '2026-06-02T00:00:00.000Z',
});
const memoryResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 300,
  deltaTime: 0.25,
  seed: 20260602,
  aiMemorySystem: memorySystem,
});
const memoryGoalIds = memoryResult.snapshot.planner.goalsCompleted.map((goal) => goal.id);

assert.ok(memoryGoalIds.includes('exploreWorld'), 'post-iron route should explore the world');
assert.ok(memoryGoalIds.includes('discoverNewBiome'), 'post-iron route should discover a new biome');
assert.ok(memoryGoalIds.includes('discoverStructure'), 'post-iron route should discover a structure');
assert.ok(memoryGoalIds.includes('createStorage'), 'post-iron route should create storage');
assert.ok(memoryGoalIds.includes('buildBaseTier1'), 'post-iron route should build base tier 1');
assert.ok(memoryGoalIds.includes('buildStorage'), 'post-iron route should validate working storage');
assert.ok(memoryGoalIds.includes('buildBaseTier2'), 'post-iron route should build base tier 2');
assert.ok(memoryGoalIds.includes('createResourceReserve'), 'post-iron route should create resource reserves');
assert.ok(memoryGoalIds.includes('buildPermanentBase'), 'post-iron route should build a permanent base');
assert.equal(memoryResult.snapshot.aiMemory.runs, 1, 'AI memory should record completed autonomous runs');
assert.equal(memoryResult.report.runtimeStats.aiMemory.runs, 1, 'top-level report runtime stats should include updated AI memory');
assert.equal(memoryResult.report.runtimeStats.simulation.aiMemory.runs, 1, 'report should include persisted AI memory');
assert.equal(memoryResult.report.runtimeStats.simulation.memorySnapshot.runs, 1, 'report should include memorySnapshot alias');
assert.equal(memoryResult.report.runtimeStats.simulation.memoryPersistenceSource, 'browser:localStorage', 'in-memory smoke should expose memory persistence source');
assert.equal(memoryResult.report.runtimeStats.simulation.memoryLoadRunCount, 0, 'first memory smoke should expose load run count');
assert.equal(memoryResult.report.runtimeStats.simulation.memorySaveRunCount, 1, 'first memory smoke should expose save run count');
assert.equal(memoryResult.report.runtimeStats.aiMemory.memorySaveRunCount, 1, 'top-level AI memory should expose save run count');
assert.ok(memoryResult.report.runtimeStats.simulation.learnedKnowledge.length > 0, 'report should include learned knowledge');
assert.ok(Array.isArray(memoryResult.report.runtimeStats.simulation.newKnowledge), 'report should include newKnowledge');
assert.ok(Array.isArray(memoryResult.report.runtimeStats.simulation.learnedLessons), 'report should include learnedLessons');
assert.ok(Array.isArray(memoryResult.report.runtimeStats.simulation.strategyChanges), 'report should include strategyChanges');
assert.ok(Object.keys(memoryResult.report.runtimeStats.simulation.aiMemory.biomeStatistics).length > 0, 'AI memory should store biome statistics');
assert.ok(Object.keys(memoryResult.report.runtimeStats.simulation.aiMemory.biomeRatings).length > 0, 'AI memory should store biome ratings');
assert.ok(memoryResult.report.runtimeStats.simulation.aiMemory.progressionTimes.gatherWood, 'AI memory should store progression times');
assert.ok(memoryResult.report.runtimeStats.simulation.aiMemory.resourceDiscoveryMetrics.wood, 'AI memory should store resource discovery metrics');
assert.ok(memoryResult.report.runtimeStats.simulation.aiMemory.resourceEfficiency.wood, 'AI memory should store resource efficiency');
assert.ok(memoryResult.report.runtimeStats.simulation.aiMemory.knownStructures.length > 0, 'AI memory should store known structures');
assert.ok(memoryResult.report.runtimeStats.simulation.aiMemory.craftingStats.successRate >= 0, 'AI memory should store crafting rates');
assert.ok(memoryResult.report.runtimeStats.simulation.aiMemory.shelterStats.successRate >= 0, 'AI memory should store shelter rates');
assert.ok(memoryResult.report.runtimeStats.simulation.storage.reserves.wood >= 64, 'storage system should maintain wood reserves');
assert.ok(memoryResult.report.runtimeStats.simulation.storage.reserves.stone >= 64, 'storage system should maintain stone reserves');
assert.ok(memoryResult.report.runtimeStats.simulation.storage.reserves.food >= 32, 'storage system should maintain food reserves');
assert.ok(memoryResult.report.runtimeStats.simulation.storage.persistedChests >= 1, 'storage system should expose persisted chests');
assert.equal(memoryResult.report.runtimeStats.simulation.base.tier, 3, 'permanent base should reach tier 3');
assert.notEqual(memoryResult.snapshot.planner.currentGoalId, 'maintainSurvival', 'completed progression should continue exploration instead of idling in maintain survival');

const engineStorageHarness = createEngineStorageHarness();
const engineStorageAdapter = new EnginePlaytestAdapter({ engine: engineStorageHarness.engine });
const engineStorageResult = engineStorageAdapter.createStorageGoal(1);
const persistedChestStats = engineStorageHarness.saveSystem.getPersistenceStats();
const persistedChest = engineStorageHarness.saveSystem.loadChestState(engineStorageAdapter.storage.chestId);

assert.equal(engineStorageResult.ok, true, 'engine storage goal should place the crafted chest');
assert.equal(persistedChestStats.persistedChests, 1, 'engine storage goal should persist the placed chest');
assert.equal(engineStorageAdapter.getStorageSnapshot().persistedChests, 1, 'engine storage snapshot should expose persisted chest count');
assert.equal(persistedChest?.type, 'storage', 'persisted chest should be marked as storage');

const memoryFollowupResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 60,
  deltaTime: 0.25,
  seed: 20260603,
  aiMemorySystem: memorySystem,
});

assert.equal(memoryFollowupResult.snapshot.aiMemory.runs, 2, 'future runs should keep improving the same AI memory');
assert.ok(
  memoryFollowupResult.snapshot.aiMemory.strategyHints.preferredWoodBiome,
  'future runs should expose learned strategy hints from previous memory',
);
assert.equal(memoryFollowupResult.snapshot.aiMemory.memoryLoadRunCount, 0, 'same process memory should preserve original load run count');
assert.equal(memoryFollowupResult.snapshot.aiMemory.memorySaveRunCount, 2, 'same process memory should expose updated save run count');

const terrainDeathMemorySystem = new AiMemorySystem({
  storage: createSmokeMemoryStorage(),
  now: () => '2026-06-02T00:10:00.000Z',
});
const terrainDeathMemory = terrainDeathMemorySystem.recordSimulation({
  simulationSnapshot: {
    elapsedSeconds: 42,
    terrainDeathContext: {
      source: 'terrain-death',
      summary: 'Autonomous player died from terrain damage.',
      biome: 'Mountains',
      position: { x: 12, y: 44, z: -9 },
      currentGoal: 'Explore World',
      suggestedAvoidanceStrategy: 'Avoid steep slopes before exploration resumes.',
    },
    deathPosition: { x: 12, y: 44, z: -9 },
    planner: {
      currentGoal: 'Explore World',
      goalsCompleted: [],
      goalsFailed: [],
      bottlenecks: [],
    },
    actionCounts: {},
    failureCounts: {},
    resourceDeltas: {},
  },
  report: {
    id: 'terrain-death-smoke',
    trigger: 'autonomous-playtest',
    telemetry: {
      counts: { deaths: 1 },
      recentGameplayEvents: [],
    },
    issues: [],
    aiTasks: [],
  },
});

assert.equal(terrainDeathMemory.runs, 1, 'terrain death memory smoke should increment runs');
assert.equal(terrainDeathMemory.deathCauses['terrain-death'].biome, 'Mountains', 'terrain death should store biome context');
assert.equal(terrainDeathMemory.deathCauses['terrain-death'].position.x, 12, 'terrain death should store position context');
assert.ok(terrainDeathMemory.dangerousBiomes.includes('Mountains'), 'terrain death should mark biome as dangerous');
assert.ok(
  terrainDeathMemory.learnedLessons.some((lesson) => lesson.includes('Terrain death')),
  'terrain death should create a learned lesson',
);

const emptyInventoryResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 18,
  deltaTime: 0.25,
  seed: 20260528,
  inventoryProfileId: AUTONOMOUS_INVENTORY_PROFILE_IDS.empty,
});
const emptySimulation = emptyInventoryResult.report.runtimeStats.simulation;
const firstSelectedGoal = emptySimulation.goalTransitions.find((transition) => transition.type === 'selected');

assert.equal(emptySimulation.startingInventoryProfile, AUTONOMOUS_INVENTORY_PROFILE_IDS.empty);
assert.equal(emptySimulation.initialInventory.wood, 0, 'empty profile should start with zero wood');
assert.equal(emptySimulation.initialInventory.stone, 0, 'empty profile should start with zero stone');
assert.equal(emptySimulation.initialInventory.planks, 0, 'empty profile should start with zero planks');
assert.equal(emptySimulation.initialInventory.sticks, 0, 'empty profile should start with zero sticks');
assert.equal(emptySimulation.initialInventory.basicTools, 0, 'empty profile should start with zero tools');
assert.equal(emptySimulation.initialInventory.furnace, 0, 'empty profile should start with zero furnace');
assert.equal(emptySimulation.initialInventory.food, 0, 'empty profile should start with no food');
assert.equal(firstSelectedGoal.toGoalId, 'gatherWood', 'gatherWood should be the first real empty-inventory goal');
assert.ok(
  emptySimulation.planner.goalsCompleted.some((goal) => goal.id === 'gatherWood'),
  'empty inventory should begin real progression by completing gatherWood from deltas',
);
assert.equal(
  emptySimulation.failures.some((failure) => failure.code === 'craft-no-inventory-change'),
  false,
  'empty inventory progression should not rely on simulated craft completions',
);

const debugRichResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 2,
  deltaTime: 0.25,
  seed: 20260527,
  inventoryProfileId: AUTONOMOUS_INVENTORY_PROFILE_IDS.debugRich,
});
const debugRichInitialInventory = debugRichResult.report.runtimeStats.simulation.initialInventory;

assert.equal(debugRichResult.snapshot.startingInventoryProfile, AUTONOMOUS_INVENTORY_PROFILE_IDS.debugRich);
assert.equal(debugRichInitialInventory.dirt, 32, 'debug-rich should preserve old dirt count');
assert.equal(debugRichInitialInventory.stone, 32, 'debug-rich should preserve old stone count');
assert.equal(debugRichInitialInventory.wood, 32, 'debug-rich should preserve old wood count');
assert.equal(debugRichInitialInventory.berries, 6, 'debug-rich should preserve old berry count');
assert.equal(debugRichInitialInventory.basicTools, 3, 'debug-rich should preserve old tool count');
assert.equal(debugRichInitialInventory.woodenPickaxe, 1, 'debug-rich should include an explicit wooden pickaxe');
assert.equal(debugRichInitialInventory.pickaxes, 1, 'debug-rich should expose real pickaxe count');

const stuckResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 36,
  deltaTime: 0.25,
  seed: 20260530,
  adapter: new StuckCraftAdapter({ seed: 20260530 }),
});
const stuckSimulation = stuckResult.report.runtimeStats.simulation;
const stuckBottleneckCodes = stuckSimulation.planner.bottlenecks.map((bottleneck) => bottleneck.code);

assert.ok(stuckSimulation.crafting.failedCrafts.length > 0, 'stuck craft loop should record failed crafts');
assert.ok(stuckBottleneckCodes.includes('missing-sticks'), 'stuck craft loop should report missing sticks');
assert.ok(
  stuckSimulation.failures.some((failure) => failure.code.startsWith('action-loop:craftTools')),
  'stuck craft loop should record repeated action failure',
);
assert.ok(
  stuckResult.report.aiTasks.some((task) => task.category === 'gameplay'),
  'stuck craft loop should produce gameplay AI tasks',
);
assert.ok(stuckResult.report.issues.length > 0, 'stuck craft loop should export issues');

const missingPickaxeStoneResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 18,
  deltaTime: 0.25,
  seed: 20260535,
  adapter: new MissingPickaxeStoneAdapter({ seed: 20260535 }),
});

assert.ok(
  missingPickaxeStoneResult.snapshot.failures.some((failure) => failure.code === 'gather-stone-missing-pickaxe'),
  'Gather Stone should create a failure when it starts without a real pickaxe',
);
assert.ok(
  missingPickaxeStoneResult.report.issues.some((issue) => issue.code === 'gather-stone-missing-pickaxe'),
  'Gather Stone missing-pickaxe failure should become a report issue',
);
assert.ok(
  missingPickaxeStoneResult.report.aiTasks.some((task) => task.category === 'gameplay'),
  'Gather Stone missing-pickaxe issue should create a gameplay AI task',
);

const rockOnlyFurnaceAdapter = new HeadlessPlaytestAdapter({ seed: 20260536 });
rockOnlyFurnaceAdapter.begin({ inventoryProfileId: AUTONOMOUS_INVENTORY_PROFILE_IDS.empty });
rockOnlyFurnaceAdapter.inventory.stone = 0;
rockOnlyFurnaceAdapter.inventory.rock = 8;
const rockOnlyFurnaceResult = rockOnlyFurnaceAdapter.obtainFurnace();

assert.equal(rockOnlyFurnaceResult.ok, true, 'furnace crafting should accept rock as stone material');
assert.equal(rockOnlyFurnaceAdapter.inventory.rock, 0, 'furnace crafting should consume rock material');
assert.equal(rockOnlyFurnaceAdapter.inventory.furnace, 1, 'furnace crafting should produce one furnace');

const blockedFurnaceResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 60,
  deltaTime: 0.25,
  seed: 20260537,
  adapter: new BlockedFurnaceAdapter({ seed: 20260537 }),
});

assert.ok(
  blockedFurnaceResult.snapshot.failures.some((failure) => failure.code === 'obtain-furnace-blocked-loop'),
  'Obtain Furnace should report a blocked loop after more than 10 consecutive failed attempts',
);
assert.ok(
  blockedFurnaceResult.report.issues.some((issue) => issue.code === 'obtain-furnace-craft-blocked' || issue.code === 'obtain-furnace-blocked-loop'),
  'blocked furnace craft should become a report issue',
);
assert.ok(
  blockedFurnaceResult.report.aiTasks.some((task) => task.category === 'gameplay'),
  'blocked furnace craft should create a gameplay AI task',
);

const noDeltaWoodResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 14,
  deltaTime: 0.25,
  seed: 20260531,
  adapter: new NoDeltaWoodAdapter({ seed: 20260531 }),
});

assert.ok(
  noDeltaWoodResult.snapshot.failures.some((failure) => failure.code === 'gather-wood-no-inventory-delta'),
  'gatherWood should fail validation when wood inventory does not increase',
);
assert.equal(
  noDeltaWoodResult.snapshot.planner.goalsCompleted.some((goal) => goal.id === 'gatherWood'),
  false,
  'gatherWood should not complete from assumed readiness',
);

const invalidShelterAdapter = new HeadlessPlaytestAdapter({ seed: 20260532 });
invalidShelterAdapter.begin({ inventoryProfileId: AUTONOMOUS_INVENTORY_PROFILE_IDS.empty });
invalidShelterAdapter.inventory.dirt = 0;
invalidShelterAdapter.inventory.stone = 0;
invalidShelterAdapter.inventory.wood = 0;
invalidShelterAdapter.inventory.planks = 0;
invalidShelterAdapter.selectedShelterMaterial = 'grass';
const invalidShelterResult = invalidShelterAdapter.buildShelter();

assert.equal(invalidShelterResult.ok, false, 'shelter placement should fail without valid materials');
assert.ok(
  invalidShelterResult.failedActions.some((failedAction) => failedAction.reason.includes('not valid shelter material')),
  'shelter should reject Grass before placement',
);
assert.equal(
  invalidShelterResult.shelterValidation.validShelterBlocksPlaced,
  0,
  'invalid shelter material should not count as placed shelter',
);
assert.ok(
  invalidShelterResult.blockedPlacementReasons.some((blockedReason) => blockedReason.reason.includes('No valid shelter material')),
  'shelter should report exact blocked placement reason',
);

const unsafeNightAdapter = new HeadlessPlaytestAdapter({ seed: 20260533 });
unsafeNightAdapter.begin();
const unsafeNightResult = unsafeNightAdapter.surviveNight(1, []);

assert.equal(unsafeNightResult.ok, false, 'surviveNight should require shelter or safe no-aggro validation');
assert.equal(unsafeNightResult.failures[0].code, 'night-safety-not-proven');

const blockedWoodResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 36,
  deltaTime: 0.25,
  seed: 20260534,
  adapter: new BlockedWoodAdapter({ seed: 20260534 }),
});
const blockedWoodSimulation = blockedWoodResult.report.runtimeStats.simulation;

assert.ok(blockedWoodSimulation.recoveryActions.length > 0, 'blocked gatherWood should record recovery actions');
assert.ok(blockedWoodSimulation.resourceScanResults.biomeHasTrees, 'blocked wood scan should report tree-capable biome evidence');
assert.equal(blockedWoodSimulation.woodTargetsFound, 0, 'blocked wood scan should preserve no-target evidence');
assert.ok(
  blockedWoodResult.report.aiTasks.some((task) => task.id.includes('wood-target-scan-blocked')),
  'blocked wood scan should generate an AI task',
);
assert.equal(
  blockedWoodSimulation.gatherWoodBlockedReason,
  'No reachable wood target found in a tree-capable biome.',
  'blocked gatherWood should export the exact blocked reason',
);

const lowSurvivalResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 12,
  deltaTime: 0.25,
  seed: 20260538,
  adapter: new LowSurvivalAdapter({ seed: 20260538 }),
});
const lowSurvivalSimulation = lowSurvivalResult.report.runtimeStats.simulation;
const recoveryTypes = lowSurvivalSimulation.survivalRecoveryActions.map((action) => action.type);

assert.ok(recoveryTypes.includes('search-food'), 'low hunger should trigger food search recovery');
assert.ok(recoveryTypes.includes('eat-food'), 'available food under 50 hunger should trigger eating recovery');
assert.ok(lowSurvivalSimulation.foodSearchActions.length >= 2, 'food recovery actions should be exported');

const voidRecoveryResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 12,
  deltaTime: 0.25,
  seed: 20260539,
  adapter: new VoidPlayerAdapter({ seed: 20260539 }),
});
const voidSimulation = voidRecoveryResult.report.runtimeStats.simulation;

assert.equal(voidSimulation.cameraVoidDetected, true, 'void state should be detected');
assert.ok(voidSimulation.playerLostRecoveryCount >= 1, 'void state should trigger hard recovery');
assert.equal(voidSimulation.recoveryTeleportUsed, true, 'void recovery should use teleport');
assert.equal(voidSimulation.recoverySuccess, true, 'void recovery should restore valid ground');
assert.ok(voidSimulation.skyOnlyFrames >= 1, 'void report should include sky-only frame evidence');
assert.ok(voidSimulation.lastSafePosition, 'void recovery should preserve last safe position');
assert.equal(voidSimulation.playerSafety.isGrounded, true, 'player should be grounded after void recovery');
assert.equal(voidSimulation.playerSafety.visibleTerrainExists, true, 'terrain should be visible after void recovery');
assert.equal(voidSimulation.playerSafety.cameraSkyOnly, false, 'camera should no longer be sky-only after recovery');
assert.ok(
  voidSimulation.planner.goalsCompleted.some((goal) => goal.id === 'gatherWood'),
  'AI should resume survival progression after void recovery pause',
);

const spamReportSystem = new AutoQaReportSystem({
  telemetrySystem: new TelemetrySystem({ now: () => 0 }),
  storage: null,
});
const spamReport = spamReportSystem.createReport({
  trigger: 'autonomous-playtest',
  runtimeSnapshot: {
    simulation: {
      status: 'completed',
      elapsedSeconds: 60,
      actionCounts: {
        mine: 2088,
      },
      failureCounts: {
        miningSpam: 1,
      },
      inventorySnapshot: {
        initial: {},
        current: {},
        delta: {},
      },
      resourceDeltas: {},
      crafting: {
        craftedItems: [],
        failedCrafts: [],
      },
      failedActions: [],
      goalTransitions: [],
      failures: [],
      planner: {
        goalsCompleted: [],
        goalsFailed: [],
        bottlenecks: [],
        goalTransitions: [],
        allGoals: [],
      },
    },
  },
});

assert.ok(
  spamReport.issues.some((issue) => issue.code === 'mining-spam-threshold'),
  'mining spam should export an issue',
);
assert.ok(
  spamReport.aiTasks.some((task) => task.id.includes('mining-spam-threshold')),
  'mining spam should generate an AI task',
);

const scannerResult = createScannerSmokeResult();

assert.equal(scannerResult.scannedWoodBlocks, 2, 'resource scanner should count trunk blocks separately from leaves');
assert.equal(scannerResult.rejectedLeafTargets, 2, 'resource scanner should reject leaves that do not drop wood');
assert.equal(scannerResult.woodTargetsFound, 2, 'resource scanner should find valid trunk targets');
assert.equal(scannerResult.nearestWoodTarget.blockId, BLOCK_IDS.wood, 'nearest wood target should be the real trunk block id');
assert.equal(scannerResult.nearestWoodTarget.nearGround, true, 'scanner should prefer near-ground trunk targets');

console.log('smoke:autonomous-playtest ok');

function createEngineStorageHarness() {
  const playerState = new PlayerState();
  const inventorySystem = new InventorySystem({ playerState });
  const saveSystem = new SaveSystem({ storage: createSmokeMemoryStorage() });
  const placedBlocks = [];

  playerState.mode = 'survival';
  inventorySystem.replaceContents({
    hotbar: [
      {
        itemType: ITEM_TYPES.resource,
        itemId: ITEM_IDS.woodPlank,
        count: 4,
        maxStack: 64,
        name: 'Wood Plank',
      },
    ],
    backpack: [],
    inventoryProfileId: 'smoke-storage',
    initializationSource: 'smoke-storage',
  });

  const engine = {
    playerState,
    inventorySystem,
    craftingSystem: new CraftingSystem({ inventorySystem }),
    saveSystem,
    persistenceSnapshot: saveSystem.getPersistenceStats(),
    playerController: {
      position: { x: 0, y: 2, z: 0 },
    },
    terrainGenerator: {
      getHeightAt: () => 1,
      isWorldPositionLoaded: () => true,
      getBlockAtWorldPosition: () => BLOCK_IDS.air,
      setBlockAtWorldPosition(worldX, y, worldZ, blockId) {
        placedBlocks.push({ worldX, y, worldZ, blockId });
        return true;
      },
    },
    handleBlocksPlaced(blocks) {
      placedBlocks.push(...blocks);
    },
  };

  return {
    engine,
    saveSystem,
    placedBlocks,
  };
}

function createScannerSmokeResult() {
  const fakeChunk = {
    chunkX: 0,
    chunkZ: 0,
    blocks: new Map([
      [getBlockKey(4, 6, 4), BLOCK_IDS.wood],
      [getBlockKey(4, 7, 4), BLOCK_IDS.wood],
      [getBlockKey(3, 9, 4), BLOCK_IDS.leaves],
      [getBlockKey(4, 9, 4), BLOCK_IDS.leaves],
      [getBlockKey(4, 5, 4), BLOCK_IDS.grass],
    ]),
  };
  const terrainGenerator = {
    chunkManager: {
      chunks: new Map([['0,0', fakeChunk]]),
    },
    getBiomeAt: () => ({
      name: 'Plains',
      treeChance: 0.045,
    }),
    getBlockAtWorldPosition: (worldX, y, worldZ) => {
      if (worldX === 4 && worldZ === 4 && y === 5) {
        return BLOCK_IDS.grass;
      }

      if (worldX === 4 && worldZ === 4 && y === 6) {
        return BLOCK_IDS.wood;
      }

      return BLOCK_IDS.air;
    },
  };
  const scanner = new ResourceScanner({ terrainGenerator });

  return scanner.scanWoodTargets({
    origin: {
      x: 4.5,
      y: 6.1,
      z: 2.5,
    },
    radius: 16,
  });
}

function createSmokeMemoryStorage() {
  const entries = new Map();

  return {
    setItem(key, value) {
      entries.set(key, String(value));
    },
    getItem(key) {
      return entries.get(key) ?? null;
    },
    removeItem(key) {
      entries.delete(key);
    },
  };
}
