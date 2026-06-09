import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_NEURAL_CHAMPION_STORAGE_KEY,
  DEFAULT_NEURAL_TRAINING_OPTIONS,
  NeuralTrainer,
} from '../src/ai/neural/neuralTrainer.js';
import { DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID } from '../src/diagnostics/autonomousInventoryProfiles.js';
import { runHeadlessAiSimulation } from './simulateAiPlaytest.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_CHAMPION_PATH = join(PROJECT_ROOT, 'data', 'AI_NEURAL_CHAMPION.json');

const options = parseArgs(process.argv.slice(2));
const generations = toPositiveInteger(options.generations, DEFAULT_NEURAL_TRAINING_OPTIONS.generations);
const populationSize = toPositiveInteger(options.population, DEFAULT_NEURAL_TRAINING_OPTIONS.populationSize);
const durationSeconds = toPositiveInteger(options.duration, DEFAULT_NEURAL_TRAINING_OPTIONS.episodeDurationSeconds);
const seed = toPositiveInteger(options.seed, 4242);
const championPath = options.output ?? DEFAULT_CHAMPION_PATH;

const trainer = new NeuralTrainer({
  storage: createFileStorage(championPath),
  storageKey: AI_NEURAL_CHAMPION_STORAGE_KEY,
  mutationRate: Number(options.mutationRate ?? DEFAULT_NEURAL_TRAINING_OPTIONS.mutationRate),
  mutationStrength: Number(options.mutationStrength ?? DEFAULT_NEURAL_TRAINING_OPTIONS.mutationStrength),
});

const result = await trainer.train({
  generations,
  populationSize,
  durationSeconds,
  seed,
  runEpisode: ({ genome, generation }) => {
    const episodeResult = runHeadlessAiSimulation({
      mode: 'neural-train',
      durationSeconds,
      seed: seed + generation * 1000 + numericGenomeId(genome.id),
      inventoryProfileId: options.inventory ?? DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
      neuralGenome: genome.serialize(),
      neuralAgentEnabled: true,
      neuralTrainingMode: true,
      neuralTrainingMetadata: {
        generation,
        populationSize,
        mode: 'cli',
      },
    });

    return {
      fitness: Number(episodeResult.snapshot.neuralAgent?.currentFitness ?? 0),
      snapshot: episodeResult.snapshot,
      report: episodeResult.report,
    };
  },
});

console.log(JSON.stringify({
  ok: Boolean(result.enabled),
  championPath,
  generation: result.generation,
  championFitness: result.championFitness,
  mutationRate: result.mutationRate,
  bestRunSummary: result.bestRunSummary,
  trainingHistory: result.trainingHistory,
}, null, 2));

function parseArgs(args) {
  const parsed = {};

  for (const arg of args) {
    if (!arg.startsWith('--')) {
      continue;
    }

    const [key, value = 'true'] = arg.slice(2).split('=');

    parsed[key] = value;
  }

  return parsed;
}

function createFileStorage(filePath) {
  return {
    setItem(_key, value) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, String(value), 'utf8');
    },
    getItem() {
      try {
        return readFileSync(filePath, 'utf8');
      } catch {
        return null;
      }
    },
    removeItem() {
      writeFileSync(filePath, '', 'utf8');
    },
  };
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

function numericGenomeId(id) {
  const numericPart = String(id ?? '').replace(/\D+/g, '');

  return Number(numericPart || 0);
}
