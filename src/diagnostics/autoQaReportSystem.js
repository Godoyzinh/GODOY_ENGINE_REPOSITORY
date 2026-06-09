import { AI_TASK_CATEGORIES, AiTaskGenerator } from './aiTaskGenerator.js';

const STORAGE_KEY = 'godoy:auto-qa:last-report';
const SCHEMA_VERSION = 1;
const MINING_SPAM_PER_MINUTE_THRESHOLD = 120;
const HARD_RECOVERY_LOOP_THRESHOLD = 3;

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
      lastSimulationSnapshot: sanitizeSimulationSnapshot(runtimeSnapshot.lastSimulationSnapshot ?? runtimeSnapshot.simulation),
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

  updateReportRuntime(report, runtimeSnapshot = {}) {
    if (!report) {
      return report;
    }

    report.runtimeStats = sanitizeRuntimeSnapshot(runtimeSnapshot);
    report.capabilities = collectCapabilities(runtimeSnapshot);
    report.lastSimulationSnapshot = sanitizeSimulationSnapshot(runtimeSnapshot.lastSimulationSnapshot ?? runtimeSnapshot.simulation);
    report.issues = summarizeIssues(report.telemetry, runtimeSnapshot);
    report.aiTasks = this.taskGenerator.createTasks(report);
    this.persistReport(report);
    this.lastSummary = {
      reportId: report.id,
      generatedAt: report.generatedAt,
      issueCount: report.issues.length,
      taskCount: report.aiTasks.length,
    };

    return report;
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
  const simulationSnapshot = runtimeSnapshot.simulation ?? runtimeSnapshot.lastSimulationSnapshot ?? {};
  const simulationFailures = simulationSnapshot.failures ?? [];
  const simulationFailureCounts = simulationSnapshot.failureCounts ?? {};
  const plannerSnapshot = simulationSnapshot.planner ?? null;
  const failedCrafts = simulationSnapshot.crafting?.failedCrafts ?? simulationSnapshot.failedCrafts ?? [];
  const failedActions = simulationSnapshot.failedActions ?? [];
  const resourceScanResults = simulationSnapshot.resourceScanResults ?? {};
  const shelterValidation = simulationSnapshot.shelterValidation ?? {};
  const blockedGoals = simulationSnapshot.blockedGoals ?? [];
  const blockedPlacementReasons = simulationSnapshot.blockedPlacementReasons ?? [];
  const terrainDeathContext = simulationSnapshot.terrainDeathContext ?? null;
  const isHeadlessSimulation = runtimeSnapshot.simulationAdapter?.type === 'headless';
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

  if (!isHeadlessSimulation && (telemetrySnapshot.frameCount ?? 0) > 120 && averageFps > 0 && averageFps < 30) {
    issues.push({
      code: 'low-average-fps',
      category: AI_TASK_CATEGORIES.performance,
      severity: 'medium',
      title: 'Improve average FPS',
      summary: `Average FPS was ${averageFps}, below the Alpha target of 30 FPS.`,
      evidence: `Frames: ${telemetrySnapshot.frameCount}; render distance: ${runtimeSnapshot.settings?.renderDistancePreset ?? 'unknown'}.`,
    });
  }

  if (!isHeadlessSimulation && minFps !== null && minFps < 15) {
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

  if (terrainDeathContext) {
    issues.push({
      code: 'terrain-death',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Avoid terrain deaths during autonomous exploration',
      summary: terrainDeathContext.summary ?? 'Autonomous player died from terrain damage.',
      evidence: `Biome: ${terrainDeathContext.biome ?? 'unknown'}; goal: ${terrainDeathContext.currentGoal ?? 'unknown'}; position: ${JSON.stringify(terrainDeathContext.position ?? null)}.`,
    });
  }

  if (simulationSnapshot.cameraVoidDetected || Number(simulationSnapshot.playerLostRecoveryCount ?? 0) > 0) {
    issues.push({
      code: 'camera-void-player-lost',
      category: AI_TASK_CATEGORIES.ux,
      severity: simulationSnapshot.recoverySuccess ? 'low' : 'medium',
      title: 'Recover autonomous camera/player from void state',
      summary: 'The autonomous playtest detected a sky-only or lost-player state and used hard recovery.',
      evidence: `recoveries: ${simulationSnapshot.playerLostRecoveryCount ?? 0}; success: ${Boolean(simulationSnapshot.recoverySuccess)}; last safe: ${JSON.stringify(simulationSnapshot.lastSafePosition ?? null)}.`,
    });
  }

  if (simulationSnapshot.recoveryLoopDetected || Number(simulationSnapshot.recoveryPauseSpamCount ?? 0) > 0) {
    issues.push({
      code: 'recovery-pause-spam',
      category: AI_TASK_CATEGORIES.ux,
      severity: 'medium',
      title: 'Stop autonomous recovery pause spam',
      summary: 'The autonomous recovery state machine emitted duplicate pause/resume events in one recovery window.',
      evidence: `pause spam: ${simulationSnapshot.recoveryPauseSpamCount ?? 0}; loop: ${Boolean(simulationSnapshot.recoveryLoopDetected)}; state: ${simulationSnapshot.recoveryState ?? 'unknown'}.`,
    });
  }

  if (simulationSnapshot.recoveryLoopDetected || Number(simulationSnapshot.hardRecoveryCount ?? 0) > HARD_RECOVERY_LOOP_THRESHOLD) {
    issues.push({
      code: 'hard-recovery-loop-detected',
      category: AI_TASK_CATEGORIES.ux,
      severity: 'medium',
      title: 'Break autonomous hard recovery loop',
      summary: 'Hard recovery repeated without clearing the invalid target or player state.',
      evidence: `hard recoveries: ${simulationSnapshot.hardRecoveryCount ?? 0}; cycles: ${simulationSnapshot.recoveryLoopCycles ?? 0}; goal: ${simulationSnapshot.lastFailedGoal ?? 'unknown'}; action: ${simulationSnapshot.lastFailedAction ?? 'unknown'}; target: ${JSON.stringify(simulationSnapshot.failedTargetPosition ?? null)}.`,
    });
  }

  if (simulationSnapshot.falseCompletionDetected || simulationSnapshot.earlyAbortReason) {
    issues.push({
      code: 'starter-progression-false-completion',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'high',
      title: 'Stop false autonomous starter completion',
      summary: simulationSnapshot.earlyAbortReason ?? 'Autonomous playtest did not prove starter survival progression.',
      evidence: `wood by 90s: ${JSON.stringify(simulationSnapshot.woodProgressBy90s ?? null)}; tier: ${plannerSnapshot?.progressionTierReached ?? 'unknown'}; completed goals: ${plannerSnapshot?.goalsCompleted?.length ?? 0}.`,
    });
  }

  if (simulationSnapshot.craftPlanksBlockedByMissingWood) {
    issues.push({
      code: 'craft-planks-missing-wood',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Return to wood gathering before Craft Planks',
      summary: 'Craft Planks was selected or attempted while wood inventory was zero.',
      evidence: `Current inventory: ${JSON.stringify(simulationSnapshot.currentInventory ?? {})}; current goal: ${plannerSnapshot?.currentGoal ?? 'unknown'}.`,
    });
  }

  if (simulationSnapshot.hardRecoveryMisuseDetected) {
    issues.push({
      code: 'hard-recovery-misuse-detected',
      category: AI_TASK_CATEGORIES.ux,
      severity: 'medium',
      title: 'Restrict hard recovery to physical invalid states',
      summary: 'Hard recovery was requested for a non-physical progression blocker.',
      evidence: `Goal: ${simulationSnapshot.lastFailedGoal ?? 'unknown'}; action: ${simulationSnapshot.lastFailedAction ?? 'unknown'}; reason: ${simulationSnapshot.gatherWoodBlockedReason ?? 'unknown'}.`,
    });
  }

  if (simulationSnapshot.postCompletionEventsDetected || Number(simulationSnapshot.postCompletionDeaths ?? 0) > 0) {
    issues.push({
      code: 'post-autotest-death-loop',
      category: AI_TASK_CATEGORIES.bug,
      severity: 'high',
      title: 'Stop autonomous activity after auto-test completion',
      summary: 'Gameplay events or deaths occurred after the autonomous test completed.',
      evidence: `Post-completion deaths: ${simulationSnapshot.postCompletionDeaths ?? 0}; last death: ${JSON.stringify(simulationSnapshot.terrainDeathContext ?? null)}.`,
    });
  }

  if (Number(runtimeSnapshot.survival?.health ?? 100) < 50 || Number(runtimeSnapshot.survival?.hunger ?? 100) < 25) {
    issues.push({
      code: 'survival-recovery-needed',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Improve autonomous survival recovery',
      summary: 'The autonomous player finished with low health or hunger after the stress run.',
      evidence: `Health: ${runtimeSnapshot.survival?.health ?? 'unknown'}; hunger: ${runtimeSnapshot.survival?.hunger ?? 'unknown'}.`,
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

  if (blockedPlacementReasons.length > 0) {
    const recentReason = blockedPlacementReasons.at(-1);

    issues.push({
      code: 'blocked-shelter-placement',
      category: AI_TASK_CATEGORIES.gameplay,
      severity: 'medium',
      title: 'Improve AI shelter placement recovery',
      summary: `${blockedPlacementReasons.length} shelter placement block reason(s) were recorded.`,
      evidence: `${recentReason.reason ?? 'unknown'} at ${JSON.stringify(recentReason.position ?? null)}.`,
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
    aiMemory: sanitizeAiMemorySnapshot(runtimeSnapshot.aiMemory),
    simulation: sanitizeSimulationSnapshot(runtimeSnapshot.simulation),
    lastSimulationSnapshot: sanitizeSimulationSnapshot(runtimeSnapshot.lastSimulationSnapshot ?? runtimeSnapshot.simulation),
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
  const aiMemory = sanitizeAiMemorySnapshot(simulationSnapshot.memorySnapshot ?? simulationSnapshot.aiMemory);
  const recoveryActions = (simulationSnapshot.recoveryActions ?? []).slice(0, 48).map(sanitizeRecoveryAction);
  const survivalRecoveryActions = (simulationSnapshot.survivalRecoveryActions ?? []).slice(0, 48).map(sanitizeSurvivalRecoveryAction);
  const foodSearchActions = (simulationSnapshot.foodSearchActions ?? []).slice(0, 48).map(sanitizeSurvivalRecoveryAction);
  const blockedPlacementReasons = (simulationSnapshot.blockedPlacementReasons ?? []).slice(0, 48)
    .map(sanitizeBlockedPlacementReason);
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
    biomeStats: sanitizeBiomeStats(simulationSnapshot.biomeStats),
    discoveredStructures: sanitizeDiscoveredStructures(simulationSnapshot.discoveredStructures),
    storage: sanitizeStorageSnapshot(simulationSnapshot.storage),
    base: sanitizeBaseSnapshot(simulationSnapshot.base),
    aiMemory,
    memorySnapshot: aiMemory,
    memoryPersistenceSource: simulationSnapshot.memoryPersistenceSource ?? aiMemory?.memoryPersistenceSource ?? 'unknown',
    memoryLoadRunCount: Number(simulationSnapshot.memoryLoadRunCount ?? aiMemory?.memoryLoadRunCount ?? 0),
    memorySaveRunCount: Number(simulationSnapshot.memorySaveRunCount ?? aiMemory?.memorySaveRunCount ?? 0),
    learnedKnowledge: Array.isArray(simulationSnapshot.learnedKnowledge)
      ? simulationSnapshot.learnedKnowledge.slice(-24).map((knowledge) => String(knowledge))
      : aiMemory?.learnedKnowledge ?? [],
    newKnowledge: Array.isArray(simulationSnapshot.newKnowledge)
      ? simulationSnapshot.newKnowledge.slice(-24).map((knowledge) => String(knowledge))
      : aiMemory?.newKnowledge ?? [],
    learnedLessons: Array.isArray(simulationSnapshot.learnedLessons)
      ? simulationSnapshot.learnedLessons.slice(-24).map((lesson) => String(lesson))
      : aiMemory?.learnedLessons ?? [],
    strategyChanges: Array.isArray(simulationSnapshot.strategyChanges)
      ? simulationSnapshot.strategyChanges.slice(-24).map((change) => String(change))
      : aiMemory?.strategyChanges ?? [],
    biomeRatings: sanitizeBiomeRatings(simulationSnapshot.biomeRatings ?? aiMemory?.biomeRatings),
    deathPosition: sanitizePosition(simulationSnapshot.deathPosition),
    terrainDeathContext: sanitizeTerrainDeathContext(simulationSnapshot.terrainDeathContext),
    terrainSafety: sanitizeTerrainSafetySnapshot(simulationSnapshot.terrainSafety),
    playerSafety: sanitizePlayerSafetySnapshot(simulationSnapshot.playerSafety),
    cameraVoidDetected: Boolean(simulationSnapshot.cameraVoidDetected),
    playerLostRecoveryCount: Number(simulationSnapshot.playerLostRecoveryCount ?? 0),
    lastSafePosition: sanitizePosition(simulationSnapshot.lastSafePosition),
    recoveryTeleportUsed: Boolean(simulationSnapshot.recoveryTeleportUsed),
    recoverySuccess: Boolean(simulationSnapshot.recoverySuccess),
    recoveryState: simulationSnapshot.recoveryState ?? 'idle',
    lastRecoveryState: simulationSnapshot.lastRecoveryState ?? 'idle',
    recoveryCycleId: Number(simulationSnapshot.recoveryCycleId ?? 0),
    recoveryPauseStartedAt: simulationSnapshot.recoveryPauseStartedAt === null || simulationSnapshot.recoveryPauseStartedAt === undefined
      ? null
      : Number(simulationSnapshot.recoveryPauseStartedAt),
    recoveryPauseEndsAt: simulationSnapshot.recoveryPauseEndsAt === null || simulationSnapshot.recoveryPauseEndsAt === undefined
      ? null
      : Number(simulationSnapshot.recoveryPauseEndsAt),
    recoveryPauseEventEmitted: Boolean(simulationSnapshot.recoveryPauseEventEmitted),
    recoveryResumeEventEmitted: Boolean(simulationSnapshot.recoveryResumeEventEmitted),
    recoveryPauseSpamCount: Number(simulationSnapshot.recoveryPauseSpamCount ?? 0),
    recoveryLoopDetected: Boolean(simulationSnapshot.recoveryLoopDetected),
    recoveryLoopCycles: Number(simulationSnapshot.recoveryLoopCycles ?? 0),
    hardRecoveryCount: Number(simulationSnapshot.hardRecoveryCount ?? 0),
    lastFailedGoal: simulationSnapshot.lastFailedGoal ?? null,
    lastFailedAction: simulationSnapshot.lastFailedAction ?? null,
    failedTargetPosition: sanitizePosition(simulationSnapshot.failedTargetPosition),
    blacklistedTargets: (simulationSnapshot.blacklistedTargets ?? []).slice(-32).map(sanitizeBlacklistedTarget).filter(Boolean),
    emergencyTeleportUsed: Boolean(simulationSnapshot.emergencyTeleportUsed),
    falseCompletionDetected: Boolean(simulationSnapshot.falseCompletionDetected),
    earlyAbortReason: simulationSnapshot.earlyAbortReason ?? null,
    postCompletionEventsDetected: Boolean(simulationSnapshot.postCompletionEventsDetected),
    postCompletionDeaths: Number(simulationSnapshot.postCompletionDeaths ?? 0),
    woodProgressBy90s: sanitizeWoodProgressSnapshot(simulationSnapshot.woodProgressBy90s),
    craftPlanksBlockedByMissingWood: Boolean(simulationSnapshot.craftPlanksBlockedByMissingWood),
    hardRecoveryMisuseDetected: Boolean(simulationSnapshot.hardRecoveryMisuseDetected),
    skyOnlyFrames: Number(simulationSnapshot.skyOnlyFrames ?? 0),
    gatherWoodBlockedReason: simulationSnapshot.gatherWoodBlockedReason ?? null,
    survivalRecoveryActions,
    foodSearchActions,
    blockedPlacementReasons,
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

function sanitizeAiMemorySnapshot(aiMemory = null) {
  if (!aiMemory) {
    return null;
  }

  return {
    schemaVersion: Number(aiMemory.schemaVersion ?? 0),
    runs: Number(aiMemory.runs ?? 0),
    memoryPersistenceSource: aiMemory.memoryPersistenceSource ?? 'unknown',
    memoryLoadRunCount: Number(aiMemory.memoryLoadRunCount ?? aiMemory.runs ?? 0),
    memorySaveRunCount: Number(aiMemory.memorySaveRunCount ?? aiMemory.runs ?? 0),
    memoryLastLoadStatus: aiMemory.memoryLastLoadStatus ?? null,
    memoryLastSaveStatus: aiMemory.memoryLastSaveStatus ?? null,
    createdAt: aiMemory.createdAt ?? null,
    lastUpdatedAt: aiMemory.lastUpdatedAt ?? null,
    lastRun: aiMemory.lastRun ? { ...aiMemory.lastRun } : null,
    bestWoodBiome: aiMemory.bestWoodBiome ?? null,
    bestStoneBiome: aiMemory.bestStoneBiome ?? null,
    averageIronTime: Number(aiMemory.averageIronTime ?? 0),
    strategies: {
      successful: (aiMemory.strategies?.successful ?? []).slice(-16).map((strategy) => pick(strategy, [
        'goalId',
        'goalName',
        'strategy',
        'reason',
        'timeSpentSeconds',
        'bestTimeSeconds',
        'progressionTierReached',
        'count',
        'at',
      ])),
      failed: (aiMemory.strategies?.failed ?? []).slice(-16).map((strategy) => pick(strategy, [
        'goalId',
        'goalName',
        'strategy',
        'reason',
        'timeSpentSeconds',
        'bestTimeSeconds',
        'count',
        'at',
      ])),
    },
    successfulStrategies: (aiMemory.successfulStrategies ?? []).slice(-16).map((strategy) => pick(strategy, [
      'goalId',
      'goalName',
      'strategy',
      'reason',
      'timeSpentSeconds',
      'bestTimeSeconds',
      'progressionTierReached',
      'count',
      'at',
    ])),
    failedStrategies: (aiMemory.failedStrategies ?? []).slice(-16).map((strategy) => pick(strategy, [
      'goalId',
      'goalName',
      'strategy',
      'reason',
      'timeSpentSeconds',
      'bestTimeSeconds',
      'count',
      'at',
    ])),
    biomeStatistics: sanitizeBiomeStats(aiMemory.biomeStatistics),
    biomeRatings: sanitizeBiomeRatings(aiMemory.biomeRatings),
    progressionTimes: sanitizeProgressionTimes(aiMemory.progressionTimes),
    resourceDiscoveryMetrics: sanitizeResourceDiscovery(aiMemory.resourceDiscoveryMetrics),
    resourceEfficiency: sanitizeResourceEfficiency(aiMemory.resourceEfficiency),
    discoveredStructures: sanitizeDiscoveredStructures(aiMemory.discoveredStructures),
    knownStructures: sanitizeDiscoveredStructures(aiMemory.knownStructures),
    dangerousBiomes: (aiMemory.dangerousBiomes ?? []).slice(0, 16).map((biome) => String(biome)),
    deathCauses: sanitizeCountRecord(aiMemory.deathCauses),
    blockedActionStatistics: sanitizeCountRecord(aiMemory.blockedActionStatistics),
    craftingStats: sanitizeCraftingStatsSummary(aiMemory.craftingStats),
    shelterStats: sanitizeShelterStatsSummary(aiMemory.shelterStats),
    storageStats: sanitizeStorageSnapshot(aiMemory.storageStats),
    learnedKnowledge: (aiMemory.learnedKnowledge ?? []).slice(-24).map((knowledge) => String(knowledge)),
    newKnowledge: (aiMemory.newKnowledge ?? []).slice(-24).map((knowledge) => String(knowledge)),
    learnedLessons: (aiMemory.learnedLessons ?? []).slice(-24).map((lesson) => String(lesson)),
    strategyChanges: (aiMemory.strategyChanges ?? []).slice(-24).map((change) => String(change)),
    optimizationSuggestions: (aiMemory.optimizationSuggestions ?? []).slice(-24).map((suggestion) => String(suggestion)),
    strategyHints: aiMemory.strategyHints ? {
      preferredWoodBiome: aiMemory.strategyHints.preferredWoodBiome ?? null,
      preferredStoneBiome: aiMemory.strategyHints.preferredStoneBiome ?? null,
      fastestGoal: aiMemory.strategyHints.fastestGoal ? { ...aiMemory.strategyHints.fastestGoal } : null,
      commonBottleneck: aiMemory.strategyHints.commonBottleneck ? { ...aiMemory.strategyHints.commonBottleneck } : null,
      knownBiomes: (aiMemory.strategyHints.knownBiomes ?? []).slice(0, 16),
      knownStructures: (aiMemory.strategyHints.knownStructures ?? []).slice(0, 16),
    } : null,
  };
}

function sanitizeBiomeStats(biomeStats = null) {
  if (!biomeStats) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(biomeStats).slice(0, 16).map(([biome, stats]) => [biome, {
      biome: stats.biome ?? biome,
      visits: Number(stats.visits ?? 0),
      seconds: Number(stats.seconds ?? stats.totalSeconds ?? 0),
      totalSeconds: Number(stats.totalSeconds ?? stats.seconds ?? 0),
      resourcesFound: sanitizeNumberRecord(stats.resourcesFound),
      woodTargetsFound: Number(stats.woodTargetsFound ?? 0),
      rejectedLeafTargets: Number(stats.rejectedLeafTargets ?? 0),
      lastSeenAt: stats.lastSeenAt ?? null,
    }]),
  );
}

function sanitizeBiomeRatings(biomeRatings = null) {
  if (!biomeRatings) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(biomeRatings).slice(0, 16).map(([biome, rating]) => [biome, {
      biome: rating.biome ?? biome,
      resourceYield: Number(rating.resourceYield ?? 0),
      survivalRate: Number(rating.survivalRate ?? 0),
      travelCost: Number(rating.travelCost ?? 0),
      dangerLevel: Number(rating.dangerLevel ?? 0),
      score: Number(rating.score ?? 0),
    }]),
  );
}

function sanitizeDiscoveredStructures(discoveredStructures = null) {
  if (!discoveredStructures) {
    return [];
  }

  const structures = Array.isArray(discoveredStructures)
    ? discoveredStructures
    : Object.values(discoveredStructures);

  return structures.slice(0, 32).map((structure) => ({
    id: structure.id ?? null,
    type: structure.type ?? 'unknown',
    biome: structure.biome ?? 'Unknown',
    discoveries: Number(structure.discoveries ?? 1),
    firstSeenAt: structure.firstSeenAt ?? null,
    lastSeenAt: structure.lastSeenAt ?? null,
    position: structure.position ? pick(structure.position, ['x', 'y', 'z']) : null,
  }));
}

function sanitizeStorageSnapshot(storageSnapshot = null) {
  if (!storageSnapshot) {
    return null;
  }

  return {
    placements: Number(storageSnapshot.placements ?? storageSnapshot.storageCreated ?? 0),
    stores: Number(storageSnapshot.stores ?? 0),
    retrieves: Number(storageSnapshot.retrieves ?? 0),
    reserves: {
      wood: Number(storageSnapshot.reserves?.wood ?? 0),
      stone: Number(storageSnapshot.reserves?.stone ?? 0),
      food: Number(storageSnapshot.reserves?.food ?? 0),
    },
    extraToolsStored: Number(storageSnapshot.extraToolsStored ?? 0),
    storageCreated: Number(storageSnapshot.storageCreated ?? 0),
    persistedChests: Number(storageSnapshot.persistedChests ?? 0),
    chestId: storageSnapshot.chestId ?? null,
  };
}

function sanitizeBaseSnapshot(baseSnapshot = null) {
  if (!baseSnapshot) {
    return null;
  }

  return {
    tier: Number(baseSnapshot.tier ?? 0),
    permanentBaseBlocksPlaced: Number(baseSnapshot.permanentBaseBlocksPlaced ?? 0),
    reserveScore: Number(baseSnapshot.reserveScore ?? 0),
  };
}

function sanitizeResourceEfficiency(resourceEfficiency = null) {
  if (!resourceEfficiency) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(resourceEfficiency).slice(0, 32).map(([resourceId, stats]) => [resourceId, {
      resourceId: stats.resourceId ?? resourceId,
      totalGained: Number(stats.totalGained ?? 0),
      totalActions: Number(stats.totalActions ?? 0),
      yieldPerAction: Number(stats.yieldPerAction ?? 0),
      bestBiome: stats.bestBiome ?? null,
    }]),
  );
}

function sanitizeCountRecord(record = null) {
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).slice(0, 32).map(([key, value]) => [key, {
      ...pick(value, [
        'summary',
        'severity',
        'reason',
        'goalId',
        'goalName',
        'biome',
        'currentGoal',
        'suggestedAvoidanceStrategy',
        'lastSeenAt',
      ]),
      position: sanitizePosition(value.position),
      count: Number(value.count ?? 0),
    }]),
  );
}

function sanitizeCraftingStatsSummary(craftingStats = null) {
  if (!craftingStats) {
    return null;
  }

  return {
    successes: Number(craftingStats.successes ?? 0),
    failures: Number(craftingStats.failures ?? 0),
    successRate: Number(craftingStats.successRate ?? 0),
    byAction: Object.fromEntries(
      Object.entries(craftingStats.byAction ?? {}).slice(0, 24).map(([action, stats]) => [action, {
        successes: Number(stats.successes ?? 0),
        failures: Number(stats.failures ?? 0),
        successRate: Number(stats.successRate ?? 0),
        lastFailureReason: stats.lastFailureReason ?? null,
      }]),
    ),
  };
}

function sanitizeShelterStatsSummary(shelterStats = null) {
  if (!shelterStats) {
    return null;
  }

  return {
    attempts: Number(shelterStats.attempts ?? 0),
    successes: Number(shelterStats.successes ?? 0),
    failures: Number(shelterStats.failures ?? 0),
    successRate: Number(shelterStats.successRate ?? 0),
    lastFailureReason: shelterStats.lastFailureReason ?? null,
  };
}

function sanitizeProgressionTimes(progressionTimes = null) {
  if (!progressionTimes) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(progressionTimes).slice(0, 32).map(([goalId, stats]) => [goalId, {
      goalId: stats.goalId ?? goalId,
      goalName: stats.goalName ?? goalId,
      samples: Number(stats.samples ?? 0),
      totalSeconds: Number(stats.totalSeconds ?? 0),
      bestSeconds: stats.bestSeconds === null || stats.bestSeconds === undefined ? null : Number(stats.bestSeconds),
      averageSeconds: stats.averageSeconds === null || stats.averageSeconds === undefined ? null : Number(stats.averageSeconds),
      lastSeconds: stats.lastSeconds === null || stats.lastSeconds === undefined ? null : Number(stats.lastSeconds),
    }]),
  );
}

function sanitizeResourceDiscovery(resourceDiscoveryMetrics = null) {
  if (!resourceDiscoveryMetrics) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(resourceDiscoveryMetrics).slice(0, 32).map(([resourceId, stats]) => [resourceId, {
      resourceId: stats.resourceId ?? resourceId,
      found: Number(stats.found ?? 0),
      attempts: Number(stats.attempts ?? 0),
      bestBiome: stats.bestBiome ?? null,
      lastFoundAt: stats.lastFoundAt ?? null,
    }]),
  );
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

function sanitizeSurvivalRecoveryAction(recoveryAction = {}) {
  return {
    ...pick(recoveryAction, [
      'goalId',
      'goalName',
      'action',
      'type',
      'reason',
      'ok',
      'result',
      'terrainRisk',
      'atSeconds',
    ]),
    health: Number(recoveryAction.health ?? 0),
    hunger: Number(recoveryAction.hunger ?? 0),
    inventoryDelta: sanitizeNumberRecord(recoveryAction.inventoryDelta),
  };
}

function sanitizeBlockedPlacementReason(blockedPlacementReason = {}) {
  return {
    reason: blockedPlacementReason.reason ?? 'Placement was blocked.',
    material: blockedPlacementReason.material ?? null,
    position: sanitizePosition(blockedPlacementReason.position),
    goalId: blockedPlacementReason.goalId ?? null,
    goalName: blockedPlacementReason.goalName ?? null,
    action: blockedPlacementReason.action ?? null,
    atSeconds: blockedPlacementReason.atSeconds ?? null,
  };
}

function sanitizeTerrainDeathContext(terrainDeathContext = null) {
  if (!terrainDeathContext) {
    return null;
  }

  return {
    source: terrainDeathContext.source ?? 'terrain-death',
    summary: terrainDeathContext.summary ?? null,
    biome: terrainDeathContext.biome ?? null,
    position: sanitizePosition(terrainDeathContext.position),
    velocityY: terrainDeathContext.velocityY === null || terrainDeathContext.velocityY === undefined
      ? null
      : Number(terrainDeathContext.velocityY),
    fallDistance: terrainDeathContext.fallDistance === null || terrainDeathContext.fallDistance === undefined
      ? null
      : Number(terrainDeathContext.fallDistance),
    healthBefore: terrainDeathContext.healthBefore === null || terrainDeathContext.healthBefore === undefined
      ? null
      : Number(terrainDeathContext.healthBefore),
    healthAfter: terrainDeathContext.healthAfter === null || terrainDeathContext.healthAfter === undefined
      ? null
      : Number(terrainDeathContext.healthAfter),
    currentGoal: terrainDeathContext.currentGoal ?? null,
    suggestedAvoidanceStrategy: terrainDeathContext.suggestedAvoidanceStrategy ?? null,
    atSeconds: terrainDeathContext.atSeconds ?? null,
  };
}

function sanitizeTerrainSafetySnapshot(terrainSafety = null) {
  if (!terrainSafety) {
    return null;
  }

  return {
    position: sanitizePosition(terrainSafety.position),
    biome: terrainSafety.biome ?? null,
    cellKey: terrainSafety.cellKey ?? null,
    fallRisk: Boolean(terrainSafety.fallRisk),
    steepSlope: Boolean(terrainSafety.steepSlope),
    currentlyBlacklisted: Boolean(terrainSafety.currentlyBlacklisted),
    blacklistSize: Number(terrainSafety.blacklistSize ?? 0),
    heightDelta: Number(terrainSafety.heightDelta ?? 0),
    riskLevel: terrainSafety.riskLevel ?? 'unknown',
    reason: terrainSafety.reason ?? null,
  };
}

function sanitizePlayerSafetySnapshot(playerSafety = null) {
  if (!playerSafety) {
    return null;
  }

  return {
    position: sanitizePosition(playerSafety.position),
    terrainHeight: Number(playerSafety.terrainHeight ?? 0),
    isGrounded: Boolean(playerSafety.isGrounded),
    isFlying: Boolean(playerSafety.isFlying),
    isBelowTerrain: Boolean(playerSafety.isBelowTerrain),
    isUngroundedAbnormally: Boolean(playerSafety.isUngroundedAbnormally),
    visibleTerrainExists: Boolean(playerSafety.visibleTerrainExists),
    cameraSkyOnly: Boolean(playerSafety.cameraSkyOnly),
    distanceFromSafePoint: Number(playerSafety.distanceFromSafePoint ?? 0),
    distanceFromSafePointAbnormal: Boolean(playerSafety.distanceFromSafePointAbnormal),
    lastSafePosition: sanitizePosition(playerSafety.lastSafePosition),
    safeBasePosition: sanitizePosition(playerSafety.safeBasePosition),
    reason: playerSafety.reason ?? null,
  };
}

function sanitizeBlacklistedTarget(target = null) {
  if (!target) {
    return null;
  }

  return {
    key: target.key ?? null,
    goalId: target.goalId ?? null,
    action: target.action ?? null,
    reason: target.reason ?? null,
    position: sanitizePosition(target.position ?? target),
  };
}

function sanitizeWoodProgressSnapshot(snapshot = null) {
  if (!snapshot) {
    return null;
  }

  return {
    atSeconds: Number(snapshot.atSeconds ?? 0),
    miningActions: Number(snapshot.miningActions ?? 0),
    telemetryMining: Number(snapshot.telemetryMining ?? 0),
    woodCount: Number(snapshot.woodCount ?? 0),
    woodDelta: Number(snapshot.woodDelta ?? 0),
    completedGoalCount: Number(snapshot.completedGoalCount ?? 0),
    currentGoalId: snapshot.currentGoalId ?? null,
  };
}

function sanitizePosition(position = null) {
  if (!position) {
    return null;
  }

  return {
    x: Number(position.x ?? 0),
    y: Number(position.y ?? 0),
    z: Number(position.z ?? 0),
  };
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

  if (code.includes('stuck') || code.includes('collision') || code.includes('camera-void') || code.includes('recovery-loop')) {
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
