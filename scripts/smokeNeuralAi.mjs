import assert from 'node:assert/strict';
import { NeuralGenome } from '../src/ai/neural/neuralGenome.js';
import { NeuralNetwork } from '../src/ai/neural/neuralNetwork.js';
import { NeuralTrainer, AI_NEURAL_CHAMPION_STORAGE_KEY } from '../src/ai/neural/neuralTrainer.js';
import { HeadlessPlaytestAdapter } from '../src/diagnostics/headlessPlaytestAdapter.js';
import { runHeadlessAiSimulation } from './simulateAiPlaytest.mjs';

const inputs = Array.from({ length: 22 }, (_unused, index) => index / 22);
const network = new NeuralNetwork();
const output = network.forward(inputs);

assert.equal(output.length, 8, 'neural network output count should match action count');
assert.ok(output.every((value) => Number.isFinite(value) && value >= 0), 'ReLU outputs should be finite and non-negative');

const mutatedNetwork = network.mutate({
  mutationRate: 1,
  mutationStrength: 0.5,
  random: createDeterministicRandom(),
});

assert.notEqual(
  JSON.stringify(network.serialize().layers),
  JSON.stringify(mutatedNetwork.serialize().layers),
  'mutation should change neural weights or biases',
);

const serializedNetwork = network.serialize();
const reloadedNetwork = NeuralNetwork.deserialize(serializedNetwork);

assert.deepEqual(
  reloadedNetwork.forward(inputs),
  network.forward(inputs),
  'serialized/deserialized network should preserve forward output',
);

const genome = NeuralGenome.random();
const neuralRun = runHeadlessAiSimulation({
  mode: 'neural-train',
  durationSeconds: 60,
  neuralGenome: genome.serialize(),
  neuralAgentEnabled: true,
  neuralTrainingMode: true,
  neuralTrainingMetadata: {
    populationSize: 1,
    smoke: true,
  },
});

assert.ok(neuralRun.snapshot.neuralAgent.enabled, 'neural agent should be enabled in neural-train mode');
assert.ok(neuralRun.snapshot.neuralAgent.currentFitness > 0, 'fitness should increase when wood/progression succeeds');
assert.ok(
  Number(neuralRun.snapshot.currentInventory.wood ?? 0) > 0 ||
  Number(neuralRun.snapshot.inventoryDelta.wood ?? 0) > 0 ||
  neuralRun.snapshot.planner.goalsCompleted.some((goal) => goal.id === 'gatherWood'),
  'neural-assisted run should collect wood or complete Gather Wood',
);

class BlockedWoodAdapter extends HeadlessPlaytestAdapter {
  gatherWood() {
    this.lastResourceScan = this.createResourceScanSnapshot({
      scannedWoodBlocks: 4,
      woodTargetsFound: 4,
      nearestWoodTarget: {
        blockId: 6,
        worldX: 32,
        y: 8,
        worldZ: 32,
        distance: 42,
        nearGround: true,
        blacklisted: true,
      },
    });

    return {
      ok: false,
      skipped: true,
      event: 'blocked wood target',
      reason: 'blocked wood target for neural smoke test',
      resourceScanResults: this.getResourceScanSnapshot(),
    };
  }
}

const blockedRun = runHeadlessAiSimulation({
  mode: 'neural-train',
  durationSeconds: 95,
  adapter: new BlockedWoodAdapter(),
  neuralGenome: NeuralGenome.random().serialize(),
  neuralAgentEnabled: true,
  neuralTrainingMode: true,
});

assert.ok(blockedRun.snapshot.neuralAgent.currentFitness < 0, 'blocked/no-wood run should reduce neural fitness');
assert.equal(blockedRun.snapshot.hardRecoveryCount, 0, 'blocked gatherWood should not trigger hard recovery');

const championStorage = createMemoryStorage();
const trainer = new NeuralTrainer({
  storage: championStorage,
  storageKey: AI_NEURAL_CHAMPION_STORAGE_KEY,
});
const trainingResult = await trainer.train({
  generations: 1,
  populationSize: 4,
  durationSeconds: 10,
  runEpisode: ({ genome: candidateGenome }) => {
    const result = runHeadlessAiSimulation({
      mode: 'neural-train',
      durationSeconds: 10,
      neuralGenome: candidateGenome.serialize(),
      neuralAgentEnabled: true,
      neuralTrainingMode: true,
      neuralTrainingMetadata: {
        populationSize: 4,
        smoke: true,
      },
    });

    return {
      fitness: Number(result.snapshot.neuralAgent.currentFitness ?? 0),
      snapshot: result.snapshot,
    };
  },
});

assert.ok(trainingResult.enabled, 'training should produce a champion');
assert.ok(championStorage.getItem(AI_NEURAL_CHAMPION_STORAGE_KEY), 'training should persist champion brain');

console.log('[smoke:neural-ai] all checks passed');

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

function createDeterministicRandom() {
  let value = 0.13;

  return () => {
    value = (value * 7.1 + 0.19) % 1;
    return value;
  };
}
