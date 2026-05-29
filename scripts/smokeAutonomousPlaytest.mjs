import assert from 'node:assert/strict';
import { runHeadlessAiSimulation } from './simulateAiPlaytest.mjs';
import { AutoQaReportSystem } from '../src/diagnostics/autoQaReportSystem.js';
import { HeadlessPlaytestAdapter } from '../src/diagnostics/headlessPlaytestAdapter.js';
import { TelemetrySystem } from '../src/diagnostics/telemetrySystem.js';

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

const { report, snapshot } = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 24,
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
assert.ok(snapshot.planner.goalsCompleted.length >= 4, 'bot should complete early survival goals');
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

console.log('smoke:autonomous-playtest ok');
