import assert from 'node:assert/strict';
import { runHeadlessAiSimulation } from './simulateAiPlaytest.mjs';

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
assert.ok(snapshot.actionCounts.combat > 0, 'bot should test combat');
assert.ok(snapshot.actionCounts.saveLoad > 0, 'bot should test save/load');
assert.ok(report.telemetry.counts.gameplayEvents > 0, 'telemetry should receive simulated events');
assert.ok(Array.isArray(report.aiTasks), 'report should include AI task proposals');
assert.equal(JSON.stringify(report).includes(['C:', 'Users'].join('\\\\')), false, 'report should avoid local machine paths');

console.log('smoke:autonomous-playtest ok');
