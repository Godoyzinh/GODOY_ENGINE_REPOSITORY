import assert from 'node:assert/strict';
import { runHeadlessAiSimulation } from './simulateAiPlaytest.mjs';
import { AutoQaReportSystem } from '../src/diagnostics/autoQaReportSystem.js';
import { HeadlessPlaytestAdapter } from '../src/diagnostics/headlessPlaytestAdapter.js';
import { ResourceScanner } from '../src/diagnostics/resourceScanner.js';
import { TelemetrySystem } from '../src/diagnostics/telemetrySystem.js';
import { BLOCK_IDS } from '../src/world/blockTypes.js';
import { getBlockKey } from '../src/world/chunkMath.js';
import { SHELTER_BLOCK_TARGET } from '../src/diagnostics/shelterValidator.js';

class StuckCraftAdapter extends HeadlessPlaytestAdapter {
  constructor(options) {
    super(options);
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

const { report, snapshot } = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 60,
  deltaTime: 0.25,
  seed: 20260529,
});

assert.equal(snapshot.status, 'completed');
assert.equal(report.trigger, 'autonomous-playtest');
assert.equal(report.privacy.automaticUpload, false);
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
assert.ok(snapshot.planner.goalsCompleted.length >= 9, 'bot should complete the current survival progression route');
assert.equal(snapshot.planner.goalsFailed.length, 0, 'quick smoke should not fail progression goals');
assert.notEqual(snapshot.planner.progressionTierReached, 'starter', 'bot should reach a progression tier');
assert.ok(snapshot.planner.currentGoal, 'bot should expose current goal');
assert.ok(snapshot.planner.currentSubgoal, 'bot should expose current subgoal');
assert.ok(snapshot.planner.reason, 'bot should explain goal reasoning');
assert.ok(snapshot.planner.target, 'bot should expose the current target');
assert.ok(Object.keys(snapshot.planner.timeSpentByGoal).length >= 9, 'bot should track time spent per goal');
assert.ok(report.telemetry.counts.gameplayEvents > 0, 'telemetry should receive simulated events');
assert.ok(report.runtimeStats.simulation.inventory, 'report should include inventory snapshot');
assert.ok(report.runtimeStats.simulation.inventorySnapshot, 'report should include explicit inventorySnapshot field');
assert.ok(report.runtimeStats.simulation.inventory.delta.wood >= 0, 'inventory snapshot should include resource deltas');
assert.ok(report.runtimeStats.simulation.resourceDeltas.wood >= 0, 'report should include explicit resourceDeltas field');
assert.ok(report.runtimeStats.simulation.crafting.craftedItems.length > 0, 'report should include crafted items');
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
assert.ok(
  report.runtimeStats.simulation.invalidShelterBlocksRejected >= 1,
  'shelter builder should reject invalid selected material before placement',
);
assert.ok(
  report.runtimeStats.simulation.failedActions.some((failedAction) => failedAction.reason.includes('not valid shelter material')),
  'invalid shelter material should be preserved as failedActions evidence',
);
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
assert.ok(report.issues.length > 0, 'invalid shelter material should generate a report issue');
assert.ok(report.aiTasks.length > 0, 'invalid shelter material should generate an AI task');
const exportedReport = JSON.parse(JSON.stringify(report));
assert.ok(exportedReport.issues.length > 0, 'exported JSON should preserve issues');
assert.ok(exportedReport.aiTasks.length > 0, 'exported JSON should preserve aiTasks');
assert.equal(JSON.stringify(report).includes(['C:', 'Users'].join('\\\\')), false, 'report should avoid local machine paths');

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
invalidShelterAdapter.inventory.dirt = 0;
invalidShelterAdapter.inventory.stone = 0;
invalidShelterAdapter.inventory.wood = 0;
invalidShelterAdapter.inventory.planks = 0;
invalidShelterAdapter.begin();
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
