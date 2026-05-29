import { AI_TASK_CATEGORIES, AiTaskGenerator } from './aiTaskGenerator.js';

const STORAGE_KEY = 'godoy:auto-qa:last-report';
const SCHEMA_VERSION = 1;

export class AutoQaReportSystem {
  constructor({
    telemetrySystem,
    runtimeConfig = null,
    taskGenerator = new AiTaskGenerator(),
    storage = getLocalStorage(),
  }) {
    this.telemetrySystem = telemetrySystem;
    this.runtimeConfig = runtimeConfig;
    this.taskGenerator = taskGenerator;
    this.storage = storage;
    this.lastReport = null;
    this.lastSummary = {
      reportId: 'none',
      generatedAt: null,
      issueCount: 0,
      taskCount: 0,
    };
  }

  createReport({ runtimeSnapshot = {}, trigger = 'manual-feedback' } = {}) {
    const telemetrySnapshot = this.telemetrySystem.getSnapshot();
    const report = {
      schemaVersion: SCHEMA_VERSION,
      id: createReportId(),
      generatedAt: new Date().toISOString(),
      trigger,
      app: {
        name: this.runtimeConfig?.appName ?? 'Godoy Engine',
        releaseVersion: this.runtimeConfig?.releaseVersion ?? 'local',
        releaseChannel: this.runtimeConfig?.releaseChannel ?? 'Local',
        environmentName: this.runtimeConfig?.environmentName ?? 'development',
      },
      privacy: {
        transport: 'local-only',
        automaticUpload: false,
        excludes: [
          'player identity',
          'full page URL',
          'auth tokens',
          'free-form chat',
          'stack traces',
        ],
      },
      telemetry: telemetrySnapshot,
      runtimeStats: sanitizeRuntimeSnapshot(runtimeSnapshot),
      capabilities: collectCapabilities(runtimeSnapshot),
      issues: summarizeIssues(telemetrySnapshot, runtimeSnapshot),
      aiTasks: [],
    };

    report.aiTasks = this.taskGenerator.createTasks(report);
    this.persistReport(report);
    this.telemetrySystem.recordGameplayEvent('feedback-report', {
      issues: report.issues.length,
      tasks: report.aiTasks.length,
    });
    this.lastReport = report;
    this.lastSummary = {
      reportId: report.id,
      generatedAt: report.generatedAt,
      issueCount: report.issues.length,
      taskCount: report.aiTasks.length,
    };

    return report;
  }

  getLastReport() {
    return this.lastReport;
  }

  getSnapshot() {
    return { ...this.lastSummary };
  }

  persistReport(report) {
    if (!this.storage) {
      return false;
    }

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(report));
      return true;
    } catch {
      return false;
    }
  }
}

export function summarizeIssues(telemetrySnapshot, runtimeSnapshot = {}) {
  const issues = [];
  const consoleErrorCount = telemetrySnapshot.consoleErrors ?? 0;
  const averageFps = telemetrySnapshot.fps?.average ?? 0;
  const minFps = telemetrySnapshot.fps?.min ?? null;
  const deaths = telemetrySnapshot.counts?.deaths ?? 0;
  const simulationFailures = runtimeSnapshot.simulation?.failures ?? [];
  const simulationFailureCounts = runtimeSnapshot.simulation?.failureCounts ?? {};
  const plannerSnapshot = runtimeSnapshot.simulation?.planner ?? null;

  if (consoleErrorCount > 0) {
    issues.push({
      code: 'console-errors',
      category: AI_TASK_CATEGORIES.bug,
      severity: 'high',
      title: 'Investigate runtime console errors',
      summary: `${consoleErrorCount} console error event(s) were captured during the session.`,
      evidence: telemetrySnapshot.consoleEvents
        .filter((event) => event.level === 'error')
        .slice(-3)
        .map((event) => `${event.source}: ${event.message}`)
        .join(' | '),
    });
  }

  if ((telemetrySnapshot.frameCount ?? 0) > 120 && averageFps > 0 && averageFps < 30) {
    issues.push({
      code: 'low-average-fps',
      category: AI_TASK_CATEGORIES.performance,
      severity: 'medium',
      title: 'Improve average FPS',
      summary: `Average FPS was ${averageFps}, below the Alpha target of 30 FPS.`,
      evidence: `Frames: ${telemetrySnapshot.frameCount}; render distance: ${runtimeSnapshot.settings?.renderDistancePreset ?? 'unknown'}.`,
    });
  }

  if (minFps !== null && minFps < 15) {
    issues.push({
      code: 'low-min-fps',
      category: AI_TASK_CATEGORIES.performance,
      severity: 'low',
      title: 'Review frame-time spikes',
      summary: `Minimum observed FPS was ${minFps}.`,
      evidence: `Active chunks: ${runtimeSnapshot.terrain?.chunksLoaded ?? 'unknown'}; entities: ${runtimeSnapshot.entities?.activeEntities ?? 'unknown'}.`,
    });
  }

  if (deaths > 0) {
    issues.push({
      code: 'player-deaths',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: deaths >= 3 ? 'medium' : 'low',
      title: 'Review early survival pressure',
      summary: `${deaths} player death event(s) occurred during the session.`,
      evidence: `Last survival event: ${runtimeSnapshot.survival?.lastEvent ?? 'unknown'}.`,
    });
  }

  for (const failure of simulationFailures) {
    issues.push({
      code: failure.code,
      category: classifySimulationFailure(failure.code),
      severity: failure.severity ?? 'low',
      title: formatFailureTitle(failure.code),
      summary: failure.summary,
      evidence: `Count: ${failure.count}; first seen at ${failure.firstAtSeconds}s; last seen at ${failure.lastAtSeconds}s.`,
    });
  }

  if ((simulationFailureCounts.consoleErrors ?? 0) > 0 && consoleErrorCount === 0) {
    issues.push({
      code: 'simulation-console-errors',
      category: AI_TASK_CATEGORIES.bug,
      severity: 'high',
      title: 'Investigate simulation console errors',
      summary: `${simulationFailureCounts.consoleErrors} console error event(s) were observed by the autonomous playtest.`,
      evidence: 'Autonomous playtest failure detector reported console errors.',
    });
  }

  for (const failedGoal of plannerSnapshot?.goalsFailed ?? []) {
    issues.push({
      code: `goal-failed-${failedGoal.id}`,
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: `Review failed AI goal: ${failedGoal.label}`,
      summary: failedGoal.reason ?? `${failedGoal.label} did not complete during the autonomous playtest.`,
      evidence: `Time spent: ${failedGoal.timeSpentSeconds}s; failed at ${failedGoal.failedAtSeconds}s.`,
    });
  }

  for (const bottleneck of (plannerSnapshot?.bottlenecks ?? []).slice(0, 6)) {
    issues.push({
      code: bottleneck.code,
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'low',
      title: `Review AI progression bottleneck: ${bottleneck.goalName}`,
      summary: bottleneck.summary,
      evidence: `Count: ${bottleneck.count}; first seen at ${bottleneck.firstAtSeconds}s; last seen at ${bottleneck.lastAtSeconds}s.`,
    });
  }

  return issues;
}

export function collectCapabilities(runtimeSnapshot = {}) {
  const navigatorSnapshot = getNavigatorSnapshot();
  const viewportSnapshot = getViewportSnapshot();

  return {
    browser: navigatorSnapshot,
    viewport: viewportSnapshot,
    renderer: sanitizeRendererSnapshot(runtimeSnapshot.renderer),
    storage: {
      localStorageAvailable: Boolean(getLocalStorage()),
    },
  };
}

function sanitizeRuntimeSnapshot(runtimeSnapshot) {
  return {
    renderer: sanitizeRendererSnapshot(runtimeSnapshot.renderer),
    settings: pick(runtimeSnapshot.settings, [
      'graphicsQuality',
      'renderDistancePreset',
      'debugOverlay',
      'controlsHelp',
    ]),
    player: pick(runtimeSnapshot.player, [
      'mode',
      'isGrounded',
      'isFlying',
      'isSprinting',
      'selectedSlot',
    ]),
    survival: pick(runtimeSnapshot.survival, [
      'health',
      'hunger',
      'stamina',
      'isDead',
      'lastEvent',
    ]),
    terrain: pick(runtimeSnapshot.terrain, [
      'chunksLoaded',
      'chunksVisible',
      'chunksQueued',
      'activeBiome',
      'renderDistancePreset',
      'structuresGenerated',
    ]),
    entities: pick(runtimeSnapshot.entities, [
      'activeEntities',
      'droppedItems',
      'npcs',
      'hostiles',
      'aggroHostiles',
    ]),
    network: pick(runtimeSnapshot.network, [
      'mode',
      'connectionState',
      'latencyMs',
      'packetsPerSecond',
      'syncErrors',
      'remotePlayers',
    ]),
    persistence: pick(runtimeSnapshot.persistence, [
      'saveSizeKb',
      'persistedEntities',
      'persistedChests',
      'compressedChunkCandidates',
    ]),
    simulation: sanitizeSimulationSnapshot(runtimeSnapshot.simulation),
    simulationAdapter: pick(runtimeSnapshot.simulationAdapter, [
      'type',
      'seed',
      'lastSavedStateSize',
    ]),
  };
}

function sanitizeSimulationSnapshot(simulationSnapshot = null) {
  if (!simulationSnapshot) {
    return null;
  }

  return {
    status: simulationSnapshot.status,
    mode: pick(simulationSnapshot.mode, ['id', 'label', 'durationSeconds']),
    elapsedSeconds: simulationSnapshot.elapsedSeconds,
    progress: simulationSnapshot.progress,
    actionCounts: { ...(simulationSnapshot.actionCounts ?? {}) },
    failureCounts: { ...(simulationSnapshot.failureCounts ?? {}) },
    failures: (simulationSnapshot.failures ?? []).slice(0, 24).map((failure) => pick(failure, [
      'code',
      'summary',
      'severity',
      'firstAtSeconds',
      'lastAtSeconds',
      'count',
    ])),
    planner: sanitizeGoalPlannerSnapshot(simulationSnapshot.planner),
  };
}

function sanitizeGoalPlannerSnapshot(plannerSnapshot = null) {
  if (!plannerSnapshot) {
    return null;
  }

  return {
    currentGoal: plannerSnapshot.currentGoal,
    currentGoalId: plannerSnapshot.currentGoalId,
    currentSubgoal: plannerSnapshot.currentSubgoal,
    reason: plannerSnapshot.reason,
    progress: plannerSnapshot.progress,
    target: plannerSnapshot.target,
    progressionTierReached: plannerSnapshot.progressionTierReached,
    goalsCompleted: (plannerSnapshot.goalsCompleted ?? []).slice(0, 24).map((goal) => pick(goal, [
      'id',
      'label',
      'priority',
      'completedAtSeconds',
      'timeSpentSeconds',
    ])),
    goalsFailed: (plannerSnapshot.goalsFailed ?? []).slice(0, 24).map((goal) => pick(goal, [
      'id',
      'label',
      'priority',
      'failedAtSeconds',
      'timeSpentSeconds',
      'reason',
    ])),
    timeSpentByGoal: { ...(plannerSnapshot.timeSpentByGoal ?? {}) },
    bottlenecks: (plannerSnapshot.bottlenecks ?? []).slice(0, 16).map((bottleneck) => pick(bottleneck, [
      'code',
      'goalId',
      'goalName',
      'summary',
      'firstAtSeconds',
      'lastAtSeconds',
      'count',
    ])),
    allGoals: (plannerSnapshot.allGoals ?? []).map((goal) => pick(goal, [
      'id',
      'label',
      'priority',
      'status',
      'progress',
      'requirements',
      'successCriteria',
      'failureCriteria',
    ])),
  };
}

function classifySimulationFailure(code) {
  if (code.includes('fps')) {
    return AI_TASK_CATEGORIES.performance;
  }

  if (code.includes('stuck') || code.includes('collision')) {
    return AI_TASK_CATEGORIES.ux;
  }

  if (code.includes('death') || code.includes('combat')) {
    return AI_TASK_CATEGORIES.gameplay;
  }

  if (code.includes('save') || code.includes('console')) {
    return AI_TASK_CATEGORIES.bug;
  }

  return AI_TASK_CATEGORIES.polish;
}

function formatFailureTitle(code) {
  return code
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function pick(source, keys) {
  const picked = {};

  for (const key of keys) {
    if (source?.[key] !== undefined) {
      picked[key] = source[key];
    }
  }

  return picked;
}

function sanitizeRendererSnapshot(renderer) {
  return pick(renderer, [
    'width',
    'height',
    'pixelRatio',
    'isWebGL2',
    'maxTextureSize',
    'precision',
    'shadowsEnabled',
  ]);
}

function getNavigatorSnapshot() {
  if (typeof navigator === 'undefined') {
    return {
      available: false,
    };
  }

  return {
    available: true,
    brands: navigator.userAgentData?.brands?.map((brand) => brand.brand).slice(0, 4) ?? [],
    platform: navigator.userAgentData?.platform ?? navigator.platform ?? 'unknown',
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb: navigator.deviceMemory ?? null,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    language: navigator.language ?? 'unknown',
  };
}

function getViewportSnapshot() {
  if (typeof window === 'undefined') {
    return {
      available: false,
    };
  }

  return {
    available: true,
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
    devicePixelRatio: round(window.devicePixelRatio ?? 1, 2),
  };
}

function getLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const testKey = 'godoy:auto-qa:test';

    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);

    return window.localStorage;
  } catch {
    return null;
  }
}

function createReportId() {
  return `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function round(value, digits) {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}
