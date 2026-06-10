import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiMemorySystem, AI_MEMORY_STORAGE_KEY } from '../src/ai/memory/aiMemorySystem.js';
import { AutoQaReportSystem } from '../src/diagnostics/autoQaReportSystem.js';
import { AutonomousPlaytestSimulation } from '../src/diagnostics/autonomousPlaytestSimulation.js';
import { HeadlessPlaytestAdapter } from '../src/diagnostics/headlessPlaytestAdapter.js';
import { TelemetrySystem } from '../src/diagnostics/telemetrySystem.js';
import {
  DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  normalizeAutonomousInventoryProfileId,
} from '../src/diagnostics/autonomousInventoryProfiles.js';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_AI_MEMORY_PATH = join(PROJECT_ROOT, 'data', 'AI_MEMORY.json');
const DEFAULT_NEURAL_CHAMPION_PATH = join(PROJECT_ROOT, 'data', 'AI_NEURAL_CHAMPION.json');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = normalizeSimulationOptions(parseArgs(process.argv.slice(2)));
  if (options.neuralAgentEnabled && options.useChampion !== false && !options.neuralGenome) {
    options.neuralGenome = loadChampionGenome(options.championPath ?? DEFAULT_NEURAL_CHAMPION_PATH);
  }
  if (options.neuralAgentEnabled) {
    options.neuralTrainingMetadata = {
      mode: options.mode,
      populationSize: Number(options.populationSize ?? 1),
      generationsCompleted: 0,
      generation: 0,
      useChampion: options.useChampion !== false,
      trainNeural: options.trainNeural !== false,
      headlessMode: true,
    };
  }
  const aiMemorySystem = options.useMemory === false
    ? null
    : new AiMemorySystem({
      storage: createFileStorage(options.memoryPath ?? DEFAULT_AI_MEMORY_PATH),
      storageKey: AI_MEMORY_STORAGE_KEY,
      persistenceSource: `file:${options.memoryPath ?? DEFAULT_AI_MEMORY_PATH}`,
    });
  const result = options.mode === 'evolution'
    ? runEvolutionAiSimulation({
      ...options,
      aiMemorySystem,
    })
    : runHeadlessAiSimulation({
    ...options,
    aiMemorySystem,
  });

  if (options.writeReport !== false) {
    const reportPath = await writeReport(result.report, options.outputDir ?? 'reports');

    console.log(`[simulate:ai] report ${reportPath}`);
  }

  console.log(JSON.stringify({
    ok: result.snapshot.status !== 'failed',
    reportId: result.report.id,
    mode: result.snapshot.evolution?.mode ?? result.snapshot.mode.id,
    startingInventoryProfile: result.snapshot.startingInventoryProfile,
    durationSeconds: result.snapshot.elapsedSeconds,
    actions: result.snapshot.actionCounts,
    planner: {
      currentGoal: result.snapshot.planner?.currentGoal,
      progressionTierReached: result.snapshot.planner?.progressionTierReached,
      goalsCompleted: result.snapshot.planner?.goalsCompleted?.map((goal) => goal.id) ?? [],
      goalsFailed: result.snapshot.planner?.goalsFailed?.map((goal) => goal.id) ?? [],
      bottlenecks: result.snapshot.planner?.bottlenecks?.length ?? 0,
      craftedItems: result.snapshot.crafting?.craftedItems?.length ?? 0,
      failedCrafts: result.snapshot.crafting?.failedCrafts?.length ?? 0,
    },
    aiMemory: {
      runs: result.snapshot.aiMemory?.runs ?? 0,
      persistenceSource: result.snapshot.aiMemory?.memoryPersistenceSource ?? 'unknown',
      loadRunCount: result.snapshot.aiMemory?.memoryLoadRunCount ?? 0,
      saveRunCount: result.snapshot.aiMemory?.memorySaveRunCount ?? 0,
      lastLoadStatus: result.snapshot.aiMemory?.memoryLastLoadStatus ?? null,
      lastSaveStatus: result.snapshot.aiMemory?.memoryLastSaveStatus ?? null,
      preferredWoodBiome: result.snapshot.aiMemory?.strategyHints?.preferredWoodBiome ?? null,
      learnedKnowledge: result.snapshot.aiMemory?.learnedKnowledge?.slice(-3) ?? [],
    },
    neuralAgent: result.snapshot.neuralAgent ?? null,
    neuralEvolution: result.snapshot.neuralEvolution ?? null,
    evolution: result.snapshot.evolution ?? null,
    failures: result.snapshot.failureCounts,
    issues: result.report.issues.length,
    tasks: result.report.aiTasks.length,
  }, null, 2));
}

export function runEvolutionAiSimulation({
  durationSeconds = 30 * 60,
  runs = 3,
  deltaTime = 0.25,
  seed = 1337,
  inventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  aiMemorySystem = null,
  neuralGenome = null,
  neuralAgentEnabled = false,
  neuralTrainingMode = false,
  neuralTrainingMetadata = null,
} = {}) {
  const parsedRuns = Number(runs);
  const safeRunCount = Number.isFinite(parsedRuns)
    ? Math.max(1, Math.floor(parsedRuns))
    : 3;
  const segmentDuration = Math.max(60, Math.floor(Number(durationSeconds ?? 30 * 60) / safeRunCount));
  const results = [];

  for (let runIndex = 0; runIndex < safeRunCount; runIndex += 1) {
    const result = runHeadlessAiSimulation({
      mode: 'quick',
      durationSeconds: segmentDuration,
      deltaTime,
      seed: seed + runIndex,
      inventoryProfileId,
      aiMemorySystem,
      neuralGenome,
      neuralAgentEnabled,
      neuralTrainingMode,
      neuralTrainingMetadata,
    });

    results.push(result);

    if (shouldAbortEvolution(result.snapshot)) {
      break;
    }
  }

  const finalResult = results.at(-1);
  const evolution = {
    mode: 'evolution',
    runs: results.length,
    requestedRuns: safeRunCount,
    segmentDurationSeconds: segmentDuration,
    totalDurationSeconds: segmentDuration * results.length,
    abortedEarly: results.length < safeRunCount,
    abortReason: finalResult.snapshot.earlyAbortReason ?? (finalResult.snapshot.falseCompletionDetected ? 'False starter completion detected.' : null),
    reportIds: results.map((result) => result.report.id),
    progressionTiers: results.map((result) => result.snapshot.planner?.progressionTierReached ?? 'unknown'),
    goalsCompletedByRun: results.map((result) => result.snapshot.planner?.goalsCompleted?.length ?? 0),
    memoryRuns: finalResult.snapshot.aiMemory?.runs ?? 0,
  };

  finalResult.snapshot.evolution = evolution;
  finalResult.report.evolution = evolution;
  finalResult.report.runtimeStats.simulation.evolution = evolution;

  return finalResult;
}

function shouldAbortEvolution(snapshot = {}) {
  return Boolean(
    snapshot.status === 'failed' &&
    (
      snapshot.earlyAbortReason ||
      snapshot.falseCompletionDetected ||
      snapshot.planner?.progressionTierReached === 'starter'
    )
  );
}

export function runHeadlessAiSimulation({
  mode = 'quick',
  durationSeconds = null,
  deltaTime = 0.25,
  seed = 1337,
  inventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  adapter = null,
  aiMemorySystem = null,
  neuralGenome = null,
  neuralAgentEnabled = false,
  neuralTrainingMode = false,
  neuralTrainingMetadata = null,
} = {}) {
  const normalizedInventoryProfileId = normalizeAutonomousInventoryProfileId(inventoryProfileId);
  let simulatedNow = 0;
  const telemetrySystem = new TelemetrySystem({
    now: () => simulatedNow,
  });
  const reportSystem = new AutoQaReportSystem({
    telemetrySystem,
    runtimeConfig: {
      appName: 'Godoy Engine',
      releaseVersion: 'v0.1.0-alpha',
      releaseChannel: 'Public Alpha',
      environmentName: 'headless-simulation',
    },
    storage: createMemoryStorage(),
  });
  const simulation = new AutonomousPlaytestSimulation({
    adapter: adapter ?? new HeadlessPlaytestAdapter({ seed, inventoryProfileId: normalizedInventoryProfileId }),
    telemetrySystem,
    reportSystem,
    aiMemorySystem,
    neuralGenome,
    neuralAgentEnabled,
    neuralTrainingMode,
    neuralTrainingMetadata,
    recordFrames: true,
    advanceClock: (stepSeconds) => {
      simulatedNow += stepSeconds * 1000;
    },
  });

  return simulation.runToCompletion({
    modeId: mode,
    durationSeconds,
    deltaTime,
    inventoryProfileId: normalizedInventoryProfileId,
    neuralGenome,
    neuralAgentEnabled,
    neuralTrainingMode,
    neuralTrainingMetadata,
  });
}

async function writeReport(report, outputDir) {
  const reportsDir = join(PROJECT_ROOT, outputDir);
  const safeTimestamp = report.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const reportPath = join(reportsDir, `ai-playtest-${report.app.releaseVersion}-${safeTimestamp}.json`);

  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return reportPath;
}

function parseArgs(args) {
  const options = {};

  for (const arg of args) {
    if (arg.startsWith('--mode=')) {
      options.mode = arg.slice('--mode='.length);
    } else if (arg.startsWith('--duration=')) {
      options.durationSeconds = Number(arg.slice('--duration='.length));
    } else if (arg.startsWith('--delta=')) {
      options.deltaTime = Number(arg.slice('--delta='.length));
    } else if (arg.startsWith('--seed=')) {
      options.seed = Number(arg.slice('--seed='.length));
    } else if (arg.startsWith('--runs=')) {
      options.runs = Number(arg.slice('--runs='.length));
    } else if (arg.startsWith('--population=')) {
      options.populationSize = Number(arg.slice('--population='.length));
    } else if (arg.startsWith('--generations=')) {
      options.generations = Number(arg.slice('--generations='.length));
    } else if (arg.startsWith('--episode-duration=')) {
      options.episodeDuration = Number(arg.slice('--episode-duration='.length));
    } else if (arg.startsWith('--inventory=')) {
      options.inventoryProfileId = arg.slice('--inventory='.length);
    } else if (arg.startsWith('--output=')) {
      options.outputDir = arg.slice('--output='.length);
    } else if (arg.startsWith('--memory=')) {
      options.memoryPath = arg.slice('--memory='.length);
    } else if (arg.startsWith('--champion=')) {
      options.championPath = arg.slice('--champion='.length);
    } else if (arg === '--neural') {
      options.neuralAgentEnabled = true;
      options.neuralTrainingMode = true;
    } else if (arg === '--train-neural') {
      options.neuralAgentEnabled = true;
      options.neuralTrainingMode = true;
      options.trainNeural = true;
    } else if (arg === '--no-train-neural') {
      options.trainNeural = false;
    } else if (arg === '--no-champion') {
      options.useChampion = false;
    } else if (arg === '--no-memory') {
      options.useMemory = false;
    } else if (arg === '--no-write') {
      options.writeReport = false;
    }
  }

  return options;
}

function normalizeSimulationOptions(options) {
  const durationSeconds = Number(options.durationSeconds ?? 0);
  const mode = options.mode ?? 'quick';
  const shouldUseEvolutionMode = durationSeconds >= 30 * 60 && mode === 'quick';

  return {
    ...options,
    mode: shouldUseEvolutionMode ? 'evolution' : mode,
  };
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

function loadChampionGenome(filePath) {
  try {
    const rawValue = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(rawValue);

    return parsed?.champion ?? parsed ?? null;
  } catch {
    return null;
  }
}

function createMemoryStorage() {
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
