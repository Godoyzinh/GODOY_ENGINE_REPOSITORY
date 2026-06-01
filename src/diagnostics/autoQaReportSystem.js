import { AI_TASK_CATEGORIES, AiTaskGenerator } from './aiTaskGenerator.js';

const STORAGE_KEY = 'godoy:auto-qa:last-report';
const SCHEMA_VERSION = 1;
const MINING_SPAM_PER_MINUTE_THRESHOLD = 120;

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
    const wasPersisted = this.persistReport(report);
    const exportIntegrityIssue = this.createExportIntegrityIssue(report, wasPersisted);

    if (exportIntegrityIssue) {
      report.issues.push(exportIntegrityIssue);
      report.aiTasks = this.taskGenerator.createTasks(report);
      this.persistReport(report);
    }

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

  createExportIntegrityIssue(report, wasPersisted) {
    if (!this.storage || !wasPersisted || ((report.issues?.length ?? 0) === 0 && (report.aiTasks?.length ?? 0) === 0)) {
      return null;
    }

    try {
      const storedReport = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? 'null');
      const storedIssueCount = Array.isArray(storedReport?.issues) ? storedReport.issues.length : 0;
      const storedTaskCount = Array.isArray(storedReport?.aiTasks) ? storedReport.aiTasks.length : 0;
      const lostIssues = (report.issues?.length ?? 0) > 0 && storedIssueCount === 0;
      const lostTasks = (report.aiTasks?.length ?? 0) > 0 && storedTaskCount === 0;

      if (!lostIssues && !lostTasks) {
        return null;
      }

      return {
        code: 'report-export-integrity-loss',
        category: AI_TASK_CATEGORIES.bug,
        severity: 'high',
        title: 'Preserve AI report issues and tasks during export',
        summary: 'The report generator produced issues or AI tasks, but the persisted JSON did not retain them.',
        evidence: `Generated issues/tasks: ${report.issues.length}/${report.aiTasks.length}; persisted issues/tasks: ${storedIssueCount}/${storedTaskCount}.`,
      };
    } catch {
      return {
        code: 'report-export-integrity-loss',
        category: AI_TASK_CATEGORIES.bug,
        severity: 'high',
        title: 'Preserve AI report issues and tasks during export',
        summary: 'The report generator could not re-read the persisted JSON report for integrity validation.',
        evidence: 'Report storage returned malformed JSON during export integrity verification.',
      };
    }
  }
}

export function summarizeIssues(telemetrySnapshot, runtimeSnapshot = {}) {
  const issues = [];
  const consoleErrorCount = telemetrySnapshot.consoleErrors ?? 0;
  const averageFps = telemetrySnapshot.fps?.average ?? 0;
  const minFps = telemetrySnapshot.fps?.min ?? null;
  const deaths = telemetrySnapshot.counts?.deaths ?? 0;
  const simulationSnapshot = runtimeSnapshot.simulation ?? {};
  const simulationFailures = simulationSnapshot.failures ?? [];
  const simulationFailureCounts = simulationSnapshot.failureCounts ?? {};
  const plannerSnapshot = simulationSnapshot.planner ?? null;
  const failedCrafts = simulationSnapshot.crafting?.failedCrafts ?? simulationSnapshot.failedCrafts ?? [];
  const failedActions = simulationSnapshot.failedActions ?? [];
  const resourceScanResults = simulationSnapshot.resourceScanResults ?? {};
  const shelterValidation = simulationSnapshot.shelterValidation ?? {};
  const blockedGoals = simulationSnapshot.blockedGoals ?? [];
  const miningRatePerMinute = calculateActionRatePerMinute({
    count: simulationSnapshot.actionCounts?.mine,
    elapsedSeconds: simulationSnapshot.elapsedSeconds,
  });

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

  if (
    !issues.some((issue) => issue.code === 'mining-spam-threshold') &&
    ((simulationFailureCounts.miningSpam ?? 0) > 0 || miningRatePerMinute > MINING_SPAM_PER_MINUTE_THRESHOLD)
  ) {
    issues.push({
      code: 'mining-spam-threshold',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Throttle autonomous mining spam',
      summary: `AI mining rate reached ${Math.round(miningRatePerMinute)} actions/min, above the ${MINING_SPAM_PER_MINUTE_THRESHOLD}/min threshold.`,
      evidence: `Mining actions: ${simulationSnapshot.actionCounts?.mine ?? 0}; elapsed: ${simulationSnapshot.elapsedSeconds ?? 'unknown'}s.`,
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

  if (failedCrafts.length > 0) {
    const recentFailedCraft = failedCrafts.at(-1);

    issues.push({
      code: 'failed-ai-crafts',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Review failed AI crafting actions',
      summary: `${failedCrafts.length} AI craft action(s) failed or produced no inventory delta.`,
      evidence: `${recentFailedCraft.goalName}: ${recentFailedCraft.reason}`,
    });
  }

  if (failedActions.length > 0) {
    const recentFailedAction = failedActions.at(-1);

    issues.push({
      code: 'failed-ai-actions',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'low',
      title: 'Review blocked AI action execution',
      summary: `${failedActions.length} AI action(s) failed during autonomous progression.`,
      evidence: `${recentFailedAction.goalName}: ${recentFailedAction.reason}`,
    });
  }

  if (
    simulationSnapshot.furnaceCraftBlockReason &&
    (
      plannerSnapshot?.currentGoalId === 'obtainFurnace' ||
      blockedGoals.some((blockedGoal) => blockedGoal.goalId === 'obtainFurnace') ||
      simulationFailures.some((failure) => String(failure.code ?? '').includes('obtain-furnace'))
    )
  ) {
    issues.push({
      code: 'obtain-furnace-craft-blocked',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Review blocked AI furnace crafting',
      summary: simulationSnapshot.furnaceCraftBlockReason,
      evidence: `Recipe found: ${Boolean(simulationSnapshot.furnaceRecipeFound)}; requirements: ${JSON.stringify(simulationSnapshot.furnaceCraftAttemptRequirements ?? []).slice(0, 180)}.`,
    });
  }

  if (
    Number(shelterValidation.invalidShelterBlocksRejected ?? simulationSnapshot.invalidShelterBlocksRejected ?? 0) > 0 ||
    failedActions.some((failedAction) => String(failedAction.reason ?? '').toLowerCase().includes('not valid shelter material'))
  ) {
    issues.push({
      code: 'invalid-shelter-material',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Reject invalid AI shelter materials',
      summary: 'The autonomous player attempted to use invalid shelter material during buildShelter.',
      evidence: `Rejected invalid shelter blocks: ${shelterValidation.invalidShelterBlocksRejected ?? simulationSnapshot.invalidShelterBlocksRejected ?? 0}.`,
    });
  }

  if (
    shelterValidation.lastBlockedReason &&
    plannerSnapshot?.currentGoalId === 'surviveNight'
  ) {
    issues.push({
      code: 'night-safety-not-proven',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Require real shelter safety before surviveNight',
      summary: shelterValidation.lastBlockedReason,
      evidence: `Shelter blocks: ${shelterValidation.validShelterBlocksPlaced ?? 0}; score: ${shelterValidation.safetyScore ?? 0}; safe distance: ${Boolean(shelterValidation.safeDistanceNoAggro)}.`,
    });
  }

  if (
    resourceScanResults.lastBlockedReason &&
    plannerSnapshot?.currentGoalId === 'gatherWood'
  ) {
    issues.push({
      code: 'wood-target-scan-blocked',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Review AI wood target scanning',
      summary: resourceScanResults.lastBlockedReason,
      evidence: `Wood targets found: ${resourceScanResults.woodTargetsFound ?? 0}; rejected: ${resourceScanResults.woodTargetsRejected ?? 0}; biome: ${resourceScanResults.biome ?? 'unknown'}.`,
    });
  }

  if (
    !issues.some((issue) => issue.code === 'wood-target-scan-blocked') &&
    resourceScanResults.biomeHasTrees &&
    Number(resourceScanResults.woodTargetsFound ?? 0) === 0 &&
    resourceScanResults.lastBlockedReason
  ) {
    issues.push({
      code: 'wood-target-scan-blocked',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Review AI wood target scanning',
      summary: resourceScanResults.lastBlockedReason,
      evidence: `No reachable trunks found in ${resourceScanResults.biome ?? 'unknown'}; rejected leaves: ${resourceScanResults.rejectedLeafTargets ?? 0}.`,
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

  for (const blockedGoal of blockedGoals.slice(0, 6)) {
    issues.push({
      code: blockedGoal.code,
      category: AI_TASK_CATEGORIES.gameplay,
      severity: getBottleneckSeverity(blockedGoal.code),
      title: `Review blocked AI goal: ${blockedGoal.goalName}`,
      summary: blockedGoal.reason,
      evidence: `Count: ${blockedGoal.count ?? 1}; last seen at ${blockedGoal.lastAtSeconds ?? 'unknown'}s.`,
    });
  }

  for (const bottleneck of (plannerSnapshot?.bottlenecks ?? []).slice(0, 6)) {
    issues.push({
      code: bottleneck.code,
      category: AI_TASK_CATEGORIES.gameplay,
      severity: getBottleneckSeverity(bottleneck.code),
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
    inventory: sanitizeRuntimeInventorySnapshot(runtimeSnapshot.inventory),
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
      'startingInventoryProfile',
      'lastSavedStateSize',
    ]),
  };
}

function sanitizeRuntimeInventorySnapshot(inventorySnapshot = null) {
  if (!inventorySnapshot) {
    return null;
  }

  return pick(inventorySnapshot, [
    'selectedSlot',
    'selectedItemLabel',
    'selectedBlockId',
    'startingInventoryProfile',
    'inventoryInitializationSource',
  ]);
}

function sanitizeSimulationSnapshot(simulationSnapshot = null) {
  if (!simulationSnapshot) {
    return null;
  }

  const inventorySnapshot = sanitizeInventorySnapshot(simulationSnapshot.inventorySnapshot ?? simulationSnapshot.inventory);
  const craftingSnapshot = sanitizeCraftingSnapshot(simulationSnapshot.crafting ?? {
    craftedItems: simulationSnapshot.craftedItems,
    failedCrafts: simulationSnapshot.failedCrafts,
  });
  const failedActions = (simulationSnapshot.failedActions ?? []).slice(0, 48).map((failedAction) => pick(failedAction, [
    'goalId',
    'goalName',
    'action',
    'actionName',
    'reason',
    'atSeconds',
  ]));
  const goalTransitions = (simulationSnapshot.goalTransitions ?? []).slice(0, 64).map((transition) => pick(transition, [
    'type',
    'fromGoalId',
    'toGoalId',
    'toGoalName',
    'goalId',
    'goalName',
    'reason',
    'atSeconds',
  ]));
  const resourceScanResults = sanitizeResourceScanSnapshot(simulationSnapshot.resourceScanResults);
  const shelterValidation = sanitizeShelterValidationSnapshot(simulationSnapshot.shelterValidation);
  const recoveryActions = (simulationSnapshot.recoveryActions ?? []).slice(0, 48).map(sanitizeRecoveryAction);
  const blockedGoals = (simulationSnapshot.blockedGoals ?? []).slice(0, 24).map((blockedGoal) => pick(blockedGoal, [
    'goalId',
    'goalName',
    'code',
    'reason',
    'count',
    'lastAtSeconds',
  ]));

  return {
    status: simulationSnapshot.status,
    mode: pick(simulationSnapshot.mode, ['id', 'label', 'durationSeconds']),
    elapsedSeconds: simulationSnapshot.elapsedSeconds,
    progress: simulationSnapshot.progress,
    startingInventoryProfile: simulationSnapshot.startingInventoryProfile ?? 'unknown',
    actualEquippedTool: simulationSnapshot.actualEquippedTool ?? 'hand',
    furnaceRecipeFound: Boolean(simulationSnapshot.furnaceRecipeFound),
    furnaceRecipeRequirements: sanitizeRecipeRequirementList(simulationSnapshot.furnaceRecipeRequirements),
    furnaceCraftAttemptRequirements: sanitizeRecipeAttemptRequirementList(simulationSnapshot.furnaceCraftAttemptRequirements),
    furnaceCraftBlockReason: simulationSnapshot.furnaceCraftBlockReason ?? null,
    actionCounts: { ...(simulationSnapshot.actionCounts ?? {}) },
    failureCounts: { ...(simulationSnapshot.failureCounts ?? {}) },
    inventory: inventorySnapshot,
    inventorySnapshot,
    initialInventory: sanitizeNumberRecord(simulationSnapshot.initialInventory ?? inventorySnapshot?.initial),
    currentInventory: sanitizeNumberRecord(simulationSnapshot.currentInventory ?? inventorySnapshot?.current),
    inventoryDelta: sanitizeNumberRecord(simulationSnapshot.inventoryDelta ?? inventorySnapshot?.delta),
    resourceDeltas: sanitizeNumberRecord(simulationSnapshot.resourceDeltas ?? inventorySnapshot?.delta),
    crafting: craftingSnapshot,
    craftedItems: craftingSnapshot.craftedItems,
    failedCrafts: craftingSnapshot.failedCrafts,
    failedActions,
    recoveryActions,
    resourceScanResults,
    woodTargetsFound: Number(simulationSnapshot.woodTargetsFound ?? resourceScanResults?.woodTargetsFound ?? 0),
    woodTargetsRejected: Number(simulationSnapshot.woodTargetsRejected ?? resourceScanResults?.woodTargetsRejected ?? 0),
    rejectedLeafTargets: Number(simulationSnapshot.rejectedLeafTargets ?? resourceScanResults?.rejectedLeafTargets ?? 0),
    shelterValidation,
    validShelterBlocksPlaced: Number(simulationSnapshot.validShelterBlocksPlaced ?? shelterValidation?.validShelterBlocksPlaced ?? 0),
    invalidShelterBlocksRejected: Number(simulationSnapshot.invalidShelterBlocksRejected ?? shelterValidation?.invalidShelterBlocksRejected ?? 0),
    blockedGoals,
    goalTransitions,
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

function sanitizeResourceScanSnapshot(resourceScanSnapshot = null) {
  if (!resourceScanSnapshot) {
    return null;
  }

  return {
    radius: Number(resourceScanSnapshot.radius ?? 0),
    scannedChunks: Number(resourceScanSnapshot.scannedChunks ?? 0),
    scannedWoodBlocks: Number(resourceScanSnapshot.scannedWoodBlocks ?? 0),
    rejectedLeafTargets: Number(resourceScanSnapshot.rejectedLeafTargets ?? 0),
    rejectedUnreachableTargets: Number(resourceScanSnapshot.rejectedUnreachableTargets ?? 0),
    woodTargetsFound: Number(resourceScanSnapshot.woodTargetsFound ?? 0),
    woodTargetsRejected: Number(resourceScanSnapshot.woodTargetsRejected ?? 0),
    nearestWoodTarget: sanitizeResourceTarget(resourceScanSnapshot.nearestWoodTarget),
    woodTargetDistance: resourceScanSnapshot.woodTargetDistance === null || resourceScanSnapshot.woodTargetDistance === undefined
      ? null
      : Number(resourceScanSnapshot.woodTargetDistance),
    targets: (resourceScanSnapshot.targets ?? []).slice(0, 16).map(sanitizeResourceTarget).filter(Boolean),
    vegetationTarget: sanitizeResourceTarget(resourceScanSnapshot.vegetationTarget),
    biome: resourceScanSnapshot.biome ?? 'Unknown',
    biomeHasTrees: Boolean(resourceScanSnapshot.biomeHasTrees),
    lastBlockedReason: resourceScanSnapshot.lastBlockedReason ?? null,
    recovery: resourceScanSnapshot.recovery ?? null,
  };
}

function sanitizeResourceTarget(target = null) {
  if (!target) {
    return null;
  }

  return pick(target, [
    'blockId',
    'worldX',
    'y',
    'worldZ',
    'distance',
    'verticalDelta',
    'nearGround',
    'isLeafDropTarget',
  ]);
}

function sanitizeShelterValidationSnapshot(shelterValidation = null) {
  if (!shelterValidation) {
    return null;
  }

  return {
    validShelterBlocksPlaced: Number(shelterValidation.validShelterBlocksPlaced ?? 0),
    invalidShelterBlocksRejected: Number(shelterValidation.invalidShelterBlocksRejected ?? 0),
    minValidBlocks: Number(shelterValidation.minValidBlocks ?? 0),
    hasPartialWall: Boolean(shelterValidation.hasPartialWall),
    hasRoof: Boolean(shelterValidation.hasRoof),
    safetyScore: Number(shelterValidation.safetyScore ?? 0),
    isValid: Boolean(shelterValidation.isValid),
    isSafeForNight: Boolean(shelterValidation.isSafeForNight),
    safeDistanceNoAggro: Boolean(shelterValidation.safeDistanceNoAggro),
    lastBlockedReason: shelterValidation.lastBlockedReason ?? null,
  };
}

function sanitizeRecoveryAction(recoveryAction = {}) {
  return pick(recoveryAction, [
    'goalId',
    'goalName',
    'action',
    'type',
    'reason',
    'atSeconds',
  ]);
}

function sanitizeInventorySnapshot(inventorySnapshot = null) {
  if (!inventorySnapshot) {
    return null;
  }

  return {
    initial: sanitizeNumberRecord(inventorySnapshot.initial),
    current: sanitizeNumberRecord(inventorySnapshot.current),
    delta: sanitizeNumberRecord(inventorySnapshot.delta),
  };
}

function sanitizeRecipeRequirementList(requirements = []) {
  return requirements.slice(0, 8).map((requirement) => ({
    label: requirement.label ?? 'Requirement',
    required: Number(requirement.required ?? 0),
    options: (requirement.options ?? []).slice(0, 8).map((option) => pick(option, [
      'itemType',
      'itemId',
      'name',
    ])),
  }));
}

function sanitizeRecipeAttemptRequirementList(requirements = []) {
  return requirements.slice(0, 8).map((requirement) => ({
    label: requirement.label ?? 'Requirement',
    required: Number(requirement.required ?? 0),
    available: Number(requirement.available ?? 0),
    satisfied: Boolean(requirement.satisfied),
    options: (requirement.options ?? []).slice(0, 8).map((option) => ({
      ...pick(option, [
        'itemType',
        'itemId',
        'name',
      ]),
      available: Number(option.available ?? 0),
    })),
  }));
}

function sanitizeCraftingSnapshot(craftingSnapshot = null) {
  if (!craftingSnapshot) {
    return {
      craftedItems: [],
      failedCrafts: [],
    };
  }

  return {
    craftedItems: (craftingSnapshot.craftedItems ?? []).slice(0, 32).map((craftedItem) => pick(craftedItem, [
      'goalId',
      'goalName',
      'action',
      'item',
      'itemType',
      'itemId',
      'count',
      'atSeconds',
    ])),
    failedCrafts: (craftingSnapshot.failedCrafts ?? []).slice(0, 32).map((failedCraft) => pick(failedCraft, [
      'goalId',
      'goalName',
      'action',
      'reason',
      'atSeconds',
    ])),
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
    noProgressSecondsByGoal: { ...(plannerSnapshot.noProgressSecondsByGoal ?? {}) },
    bottlenecks: (plannerSnapshot.bottlenecks ?? []).slice(0, 16).map((bottleneck) => pick(bottleneck, [
      'code',
      'goalId',
      'goalName',
      'summary',
      'firstAtSeconds',
      'lastAtSeconds',
      'count',
    ])),
    goalTransitions: (plannerSnapshot.goalTransitions ?? []).slice(0, 64).map((transition) => pick(transition, [
      'type',
      'fromGoalId',
      'toGoalId',
      'toGoalName',
      'goalId',
      'goalName',
      'reason',
      'atSeconds',
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

  if (
    code.includes('action-loop') ||
    code.includes('craft-no-inventory-change') ||
    code.includes('mining-spam') ||
    code.includes('wood-target') ||
    code.includes('gather-stone') ||
    code.includes('missing-pickaxe') ||
    code.includes('obtain-furnace') ||
    code.includes('invalid-shelter') ||
    code.includes('night-safety') ||
    code.includes('goal-reality-validation')
  ) {
    return AI_TASK_CATEGORIES.gameplay;
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

function getBottleneckSeverity(code) {
  if (
    code.includes('missing-sticks') ||
    code.includes('goal-no-progress') ||
    code.includes('action-loop') ||
    code.includes('mining-spam') ||
    code.includes('gather-stone') ||
    code.includes('missing-pickaxe') ||
    code.includes('obtain-furnace') ||
    code.includes('invalid-shelter') ||
    code.includes('night-safety') ||
    code.includes('goal-reality-validation')
  ) {
    return 'medium';
  }

  return 'low';
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

function sanitizeNumberRecord(record = {}) {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [key, Number(value) || 0]),
  );
}

function calculateActionRatePerMinute({ count = 0, elapsedSeconds = 0 } = {}) {
  const safeElapsedSeconds = Math.max(1, Number(elapsedSeconds) || 0);

  return (Number(count) || 0) / safeElapsedSeconds * 60;
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
