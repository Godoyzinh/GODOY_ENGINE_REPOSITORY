import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoQaReportSystem } from '../src/diagnostics/autoQaReportSystem.js';
import { AutonomousPlaytestSimulation } from '../src/diagnostics/autonomousPlaytestSimulation.js';
import { HeadlessPlaytestAdapter } from '../src/diagnostics/headlessPlaytestAdapter.js';
import { TelemetrySystem } from '../src/diagnostics/telemetrySystem.js';
import {
  DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  normalizeAutonomousInventoryProfileId,
} from '../src/diagnostics/autonomousInventoryProfiles.js';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const result = runHeadlessAiSimulation(options);

  if (options.writeReport !== false) {
    const reportPath = await writeReport(result.report, options.outputDir ?? 'reports');

    console.log(`[simulate:ai] report ${reportPath}`);
  }

  console.log(JSON.stringify({
    ok: true,
    reportId: result.report.id,
    mode: result.snapshot.mode.id,
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
    failures: result.snapshot.failureCounts,
    issues: result.report.issues.length,
    tasks: result.report.aiTasks.length,
  }, null, 2));
}

export function runHeadlessAiSimulation({
  mode = 'quick',
  durationSeconds = null,
  deltaTime = 0.25,
  seed = 1337,
  inventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  adapter = null,
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
    } else if (arg.startsWith('--inventory=')) {
      options.inventoryProfileId = arg.slice('--inventory='.length);
    } else if (arg.startsWith('--output=')) {
      options.outputDir = arg.slice('--output='.length);
    } else if (arg === '--no-write') {
      options.writeReport = false;
    }
  }

  return options;
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
