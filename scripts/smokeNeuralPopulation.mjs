import assert from 'node:assert/strict';
import { NeuralPopulation } from '../src/ai/neural/neuralPopulation.js';
import { NeuralTrainer, AI_NEURAL_CHAMPION_STORAGE_KEY } from '../src/ai/neural/neuralTrainer.js';
import { AutoQaReportSystem } from '../src/diagnostics/autoQaReportSystem.js';
import { AutonomousPlaytestSimulation } from '../src/diagnostics/autonomousPlaytestSimulation.js';
import { HeadlessPlaytestAdapter } from '../src/diagnostics/headlessPlaytestAdapter.js';
import { TelemetrySystem } from '../src/diagnostics/telemetrySystem.js';
import { runHeadlessAiSimulation } from './simulateAiPlaytest.mjs';

const population = new NeuralPopulation({ populationSize: 6 });

assert.equal(population.genomes.length, 6, 'population should create multiple neural agents');
assert.ok(population.genomes.every((genome) => genome.network), 'each population agent should have a genome network');

const storage = createMemoryStorage();
const trainer = new NeuralTrainer({
  storage,
  storageKey: AI_NEURAL_CHAMPION_STORAGE_KEY,
});
const baselineResult = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 10,
});
const trainingResult = await trainer.train({
  mode: 'quick',
  generations: 2,
  populationSize: 4,
  durationSeconds: 10,
  baselineResult,
  runEpisode: ({ genome, generation, agentId, agentIndex }) => {
    const result = runHeadlessAiSimulation({
      mode: 'quick',
      durationSeconds: 10,
      seed: 9000 + generation * 100 + agentIndex,
      neuralGenome: genome.serialize(),
      neuralAgentEnabled: true,
      neuralTrainingMode: true,
      neuralTrainingMetadata: {
        agentId,
        generation,
        populationSize: 4,
        mode: 'quick',
        headlessMode: true,
      },
    });

    return {
      fitness: Number(result.snapshot.neuralAgent?.currentFitness ?? 0),
      snapshot: result.snapshot,
      report: result.report,
    };
  },
});

assert.ok(trainingResult.enabled, 'population training should produce a champion');
assert.equal(trainingResult.neuralEvolution.populationSize, 4, 'evolution snapshot should track population size');
assert.equal(trainingResult.neuralEvolution.generationsCompleted, 2, 'evolution snapshot should track generations');
assert.ok(trainingResult.neuralEvolution.agentResults.length >= 4, 'evolution snapshot should include agent episode results');
assert.ok(storage.getItem(AI_NEURAL_CHAMPION_STORAGE_KEY), 'champion should be saved after valid population training');

const reloadedTrainer = new NeuralTrainer({
  storage,
  storageKey: AI_NEURAL_CHAMPION_STORAGE_KEY,
});

assert.ok(reloadedTrainer.champion, 'saved champion should load into a new trainer');

const bestFitness = Math.max(...trainingResult.neuralEvolution.agentResults.map((agent) => Number(agent.fitness ?? 0)));

assert.equal(trainingResult.neuralEvolution.bestFitness, bestFitness, 'best agent fitness should be selected correctly');
assert.equal(trainingResult.neuralEvolution.fitnessValid, true, 'valid headless training should keep fitness valid');

const championRun = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 60,
  neuralGenome: reloadedTrainer.champion.serialize(),
  neuralAgentEnabled: true,
  neuralTrainingMode: true,
  neuralTrainingMetadata: {
    mode: 'quick',
    populationSize: 1,
    useChampion: true,
    headlessMode: true,
  },
});

assert.ok(championRun.snapshot.neuralEvolution.enabled, 'quick survival run should evaluate neural champion');
assert.equal(championRun.snapshot.neuralEvolution.mode, 'quick', 'neural quick run should stay in quick mode');
assert.equal(championRun.snapshot.hardRecoveryCount, 0, 'neural quick run should not use hard recovery');
assert.ok(
  Number(championRun.snapshot.currentInventory.wood ?? 0) > 0 ||
  championRun.snapshot.planner.goalsCompleted.some((goal) => goal.id === 'gatherWood'),
  'neural quick run should collect or validate first wood',
);

const contaminatedSimulation = createManualInputSimulation();

contaminatedSimulation.start({
  modeId: 'quick',
  durationSeconds: 10,
  neuralAgentEnabled: true,
  neuralTrainingMode: true,
});
contaminatedSimulation.recordManualInputContamination('KeyW');

const contaminatedSnapshot = contaminatedSimulation.getSnapshot();

assert.equal(contaminatedSnapshot.neuralEvolution.trainingContaminated, true, 'manual input should contaminate training');
assert.equal(contaminatedSnapshot.neuralEvolution.fitnessValid, false, 'manual input should invalidate fitness');

class BlockedWoodAdapter extends HeadlessPlaytestAdapter {
  gatherWood() {
    this.lastResourceScan = this.createResourceScanSnapshot({
      scannedWoodBlocks: 4,
      woodTargetsFound: 4,
      nearestWoodTarget: {
        blockId: 6,
        worldX: 64,
        y: 8,
        worldZ: 64,
        distance: 64,
        nearGround: true,
        blacklisted: true,
      },
    });

    return {
      ok: false,
      skipped: true,
      event: 'blocked wood target',
      reason: 'blocked wood target for neural population smoke test',
      resourceScanResults: this.getResourceScanSnapshot(),
    };
  }
}

const blockedRun = runHeadlessAiSimulation({
  mode: 'quick',
  durationSeconds: 65,
  adapter: new BlockedWoodAdapter(),
  neuralGenome: reloadedTrainer.champion.serialize(),
  neuralAgentEnabled: true,
  neuralTrainingMode: true,
  neuralTrainingMetadata: {
    mode: 'quick',
    populationSize: 1,
    headlessMode: true,
  },
});

assert.equal(blockedRun.snapshot.hardRecoveryCount, 0, 'blocked gatherWood should not trigger hard recovery');
assert.ok(blockedRun.snapshot.neuralEvolution.fitnessValid === false || blockedRun.snapshot.neuralAgent.currentFitness < 0, 'blocked gatherWood should penalize or invalidate fitness');

console.log('[smoke:neural-population] all checks passed');

function createManualInputSimulation() {
  const telemetrySystem = new TelemetrySystem();
  const reportSystem = new AutoQaReportSystem({
    telemetrySystem,
    storage: createMemoryStorage(),
  });

  return new AutonomousPlaytestSimulation({
    adapter: new HeadlessPlaytestAdapter(),
    telemetrySystem,
    reportSystem,
    recordFrames: false,
  });
}

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
