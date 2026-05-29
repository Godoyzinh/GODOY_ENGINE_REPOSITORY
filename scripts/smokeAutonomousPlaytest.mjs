import assert from 'node:assert/strict';
import { runHeadlessAiSimulation } from './simulateAiPlaytest.mjs';
import { HeadlessPlaytestAdapter } from '../src/diagnostics/headlessPlaytestAdapter.js';

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
  durationSeconds: 8,
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
assert.ok(report.runtimeStats.simulation.inventory.delta.wood >= 0, 'inventory snapshot should include resource deltas');
assert.ok(report.runtimeStats.simulation.crafting.craftedItems.length > 0, 'report should include crafted items');
assert.equal(report.runtimeStats.simulation.crafting.failedCrafts.length, 0, 'healthy quick smoke should not include failed crafts');
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

console.log('smoke:autonomous-playtest ok');
