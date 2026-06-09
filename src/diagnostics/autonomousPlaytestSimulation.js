import { resolvePlaytestMode } from './playtestSimulationModes.js';
import { SurvivalGoalPlanner } from './survivalGoalPlanner.js';
import { NeuralGenome } from '../ai/neural/neuralGenome.js';
import { NeuralActionMapper } from '../ai/neural/neuralActionMapper.js';
import { NeuralSensorSystem } from '../ai/neural/neuralSensorSystem.js';
import { AI_NEURAL_CHAMPION_STORAGE_KEY } from '../ai/neural/neuralTrainer.js';
import {
  DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  normalizeAutonomousInventoryProfileId,
} from './autonomousInventoryProfiles.js';

const DEFAULT_STEP_SECONDS = 0.25;
const POSITION_SAMPLE_SECONDS = 5;
const STUCK_WINDOW_SECONDS = 15;
const STUCK_DISTANCE_THRESHOLD = 0.8;
const VERTICAL_SNAP_THRESHOLD = 4.75;
const MINING_SPAM_PER_MINUTE_THRESHOLD = 120;
const SKY_ONLY_SECONDS_THRESHOLD = 3;
const UNGROUNDED_SECONDS_THRESHOLD = 4;
const HARD_RECOVERY_PAUSE_SECONDS = 2;
const RUNNING_MEMORY_SAVE_SECONDS = 15;
const RECOVERY_EVENT_WINDOW_SECONDS = 5;
const RECOVERY_EVENT_LOOP_THRESHOLD = 3;
const HARD_RECOVERY_LOOP_WINDOW_SECONDS = 15;
const HARD_RECOVERY_LOOP_THRESHOLD = 3;
const GOAL_RECOVERY_REPLAN_THRESHOLD = 2;
const STARTER_PROGRESS_ABORT_SECONDS = 90;
const REPORT_TRIGGER = 'autonomous-playtest';
const NEURAL_REWARDS = Object.freeze({
  moveTowardReachableTree: 10,
  mineWood: 25,
  collectFirstWood: 50,
  craftPlanks: 75,
  craftWoodenPickaxe: 100,
  gatherStone: 150,
  reachIronTier: 200,
  reduceTargetDistance: 2,
  blockedAction: -10,
  repeatedBlockedTarget: -25,
  pingPong: -50,
  hardRecovery: -100,
  death: -150,
  noWoodAfter90s: -200,
  recoveryLoop: -300,
  falseCompletion: -500,
});
const RECOVERY_STATES = Object.freeze({
  idle: 'idle',
  hardRecovering: 'hardRecovering',
  pausedAfterRecovery: 'pausedAfterRecovery',
  resumed: 'resumed',
  failed: 'failed',
});
const ACTION_COOLDOWN_SECONDS = {
  explore: 0.2,
  mine: 1,
  place: 0.65,
  collect: 0.35,
  craft: 0.8,
  combat: 1.1,
  survive: 0.5,
  saveLoad: 20,
};

export class AutonomousPlaytestSimulation {
  constructor({
    adapter,
    telemetrySystem,
    reportSystem,
    aiMemorySystem = null,
    neuralGenome = null,
    neuralAgentEnabled = false,
    neuralTrainingMode = false,
    neuralTrainingMetadata = null,
    recordFrames = true,
    advanceClock = null,
  }) {
    this.adapter = adapter;
    this.telemetrySystem = telemetrySystem;
    this.reportSystem = reportSystem;
    this.aiMemorySystem = aiMemorySystem;
    this.neuralSensorSystem = new NeuralSensorSystem();
    this.neuralActionMapper = new NeuralActionMapper();
    this.neuralGenome = neuralGenome ? NeuralGenome.deserialize(neuralGenome) : null;
    this.neuralAgentEnabled = Boolean(neuralAgentEnabled || neuralGenome);
    this.neuralTrainingMode = Boolean(neuralTrainingMode);
    this.neuralTrainingMetadata = neuralTrainingMetadata;
    this.recordFrames = recordFrames;
    this.advanceClock = advanceClock;
    this.status = 'idle';
    this.mode = resolvePlaytestMode('quick');
    this.startingInventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID;
    this.elapsedSeconds = 0;
    this.lastReport = null;
    this.lastResult = null;
    this.actionTimers = createActionTimers();
    this.actionCounts = createActionCounts();
    this.failureCounts = createFailureCounts();
    this.failures = [];
    this.positionSamples = [];
    this.lastPosition = null;
    this.nextPositionSampleAt = 0;
    this.goalPlanner = new SurvivalGoalPlanner();
    this.actionLoop = createActionLoopState();
    this.actionCooldowns = createActionCooldowns();
    this.craftedItems = [];
    this.failedCrafts = [];
    this.failedActions = [];
    this.recoveryActions = [];
    this.survivalRecoveryActions = [];
    this.foodSearchActions = [];
    this.blockedPlacementReasons = [];
    this.deathPosition = null;
    this.terrainDeathContext = null;
    this.terrainSafety = null;
    this.playerSafety = null;
    this.skyOnlySeconds = 0;
    this.ungroundedSeconds = 0;
    this.cameraVoidDetected = false;
    this.playerLostRecoveryCount = 0;
    this.lastSafePosition = null;
    this.recoveryTeleportUsed = false;
    this.recoverySuccess = false;
    this.skyOnlyFrames = 0;
    this.gatherWoodBlockedReason = null;
    this.recoveryState = RECOVERY_STATES.idle;
    this.lastRecoveryState = RECOVERY_STATES.idle;
    this.recoveryCycleId = 0;
    this.recoveryPauseStartedAt = null;
    this.recoveryPauseEndsAt = null;
    this.recoveryPauseEventEmitted = false;
    this.recoveryResumeEventEmitted = false;
    this.recoveryPauseSpamCount = 0;
    this.recoveryLoopDetected = false;
    this.recoveryEventTimes = [];
    this.hardRecoveryTimes = [];
    this.hardRecoveryCount = 0;
    this.recoveryLoopCycles = 0;
    this.recoveryGoalCounts = new Map();
    this.lastFailedGoal = null;
    this.lastFailedAction = null;
    this.failedTargetPosition = null;
    this.blacklistedTargets = [];
    this.emergencyTeleportUsed = false;
    this.forcedReplan = null;
    this.lastSimulationSnapshot = null;
    this.falseCompletionDetected = false;
    this.earlyAbortReason = null;
    this.postCompletionEventsDetected = false;
    this.postCompletionDeaths = 0;
    this.postCompletionBaseline = null;
    this.woodProgressBy90s = null;
    this.craftPlanksBlockedByMissingWood = false;
    this.hardRecoveryMisuseDetected = false;
    this.completedAtSeconds = null;
    this.nextRunningMemorySaveAt = RUNNING_MEMORY_SAVE_SECONDS;
    this.lastDeathCount = 0;
    this.inventorySnapshot = null;
    this.resourceScanResults = null;
    this.shelterValidation = null;
    this.furnaceCraftDiagnostics = createEmptyFurnaceCraftDiagnostics();
    this.obtainFurnaceBlockedAttempts = 0;
    this.miningSpamReported = false;
    this.aiMemorySnapshot = aiMemorySystem?.getSnapshot?.() ?? null;
    this.neuralFitness = 0;
    this.neuralRewardsApplied = new Set();
    this.neuralLastDecision = null;
    this.neuralLastSensorSnapshot = null;
    this.neuralPreviousTargetDistance = null;
    this.neuralLastRewardReason = null;
  }

  start({
    modeId = 'quick',
    durationSeconds = null,
    inventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
    neuralAgentEnabled = this.neuralAgentEnabled,
    neuralGenome = this.neuralGenome,
    neuralTrainingMode = this.neuralTrainingMode,
    neuralTrainingMetadata = this.neuralTrainingMetadata,
  } = {}) {
    if (this.status === 'running') {
      return {
        ok: false,
        message: 'Autonomous playtest already running.',
        snapshot: this.getSnapshot(),
      };
    }

    this.mode = resolvePlaytestMode(modeId, { durationSeconds });
    this.neuralGenome = neuralGenome ? NeuralGenome.deserialize(neuralGenome) : this.neuralGenome;
    this.neuralAgentEnabled = Boolean(neuralAgentEnabled || this.mode.id === 'neural-train' || this.neuralGenome);
    this.neuralTrainingMode = Boolean(neuralTrainingMode || this.mode.id === 'neural-train');
    this.neuralTrainingMetadata = neuralTrainingMetadata ?? this.neuralTrainingMetadata;
    if (this.neuralAgentEnabled && !this.neuralGenome) {
      this.neuralGenome = this.loadBrowserNeuralChampion() ?? NeuralGenome.random();
    }
    this.startingInventoryProfileId = normalizeAutonomousInventoryProfileId(inventoryProfileId);
    this.elapsedSeconds = 0;
    this.lastReport = null;
    this.lastResult = null;
    this.actionTimers = createActionTimers();
    this.actionCounts = createActionCounts();
    this.failureCounts = createFailureCounts();
    this.failures = [];
    this.positionSamples = [];
    this.lastPosition = null;
    this.nextPositionSampleAt = 0;
    this.goalPlanner.reset();
    this.actionLoop = createActionLoopState();
    this.actionCooldowns = createActionCooldowns();
    this.craftedItems = [];
    this.failedCrafts = [];
    this.failedActions = [];
    this.recoveryActions = [];
    this.survivalRecoveryActions = [];
    this.foodSearchActions = [];
    this.blockedPlacementReasons = [];
    this.deathPosition = null;
    this.terrainDeathContext = null;
    this.terrainSafety = null;
    this.playerSafety = null;
    this.skyOnlySeconds = 0;
    this.ungroundedSeconds = 0;
    this.cameraVoidDetected = false;
    this.playerLostRecoveryCount = 0;
    this.lastSafePosition = null;
    this.recoveryTeleportUsed = false;
    this.recoverySuccess = false;
    this.skyOnlyFrames = 0;
    this.gatherWoodBlockedReason = null;
    this.recoveryState = RECOVERY_STATES.idle;
    this.lastRecoveryState = RECOVERY_STATES.idle;
    this.recoveryCycleId = 0;
    this.recoveryPauseStartedAt = null;
    this.recoveryPauseEndsAt = null;
    this.recoveryPauseEventEmitted = false;
    this.recoveryResumeEventEmitted = false;
    this.recoveryPauseSpamCount = 0;
    this.recoveryLoopDetected = false;
    this.recoveryEventTimes = [];
    this.hardRecoveryTimes = [];
    this.hardRecoveryCount = 0;
    this.recoveryLoopCycles = 0;
    this.recoveryGoalCounts = new Map();
    this.lastFailedGoal = null;
    this.lastFailedAction = null;
    this.failedTargetPosition = null;
    this.blacklistedTargets = [];
    this.emergencyTeleportUsed = false;
    this.forcedReplan = null;
    this.lastSimulationSnapshot = null;
    this.falseCompletionDetected = false;
    this.earlyAbortReason = null;
    this.postCompletionEventsDetected = false;
    this.postCompletionDeaths = 0;
    this.postCompletionBaseline = null;
    this.woodProgressBy90s = null;
    this.craftPlanksBlockedByMissingWood = false;
    this.hardRecoveryMisuseDetected = false;
    this.completedAtSeconds = null;
    this.nextRunningMemorySaveAt = RUNNING_MEMORY_SAVE_SECONDS;
    this.lastDeathCount = 0;
    this.inventorySnapshot = null;
    this.resourceScanResults = null;
    this.shelterValidation = null;
    this.furnaceCraftDiagnostics = createEmptyFurnaceCraftDiagnostics();
    this.obtainFurnaceBlockedAttempts = 0;
    this.miningSpamReported = false;
    this.aiMemorySnapshot = this.aiMemorySystem?.getSnapshot?.() ?? this.aiMemorySnapshot;
    this.neuralFitness = 0;
    this.neuralRewardsApplied = new Set();
    this.neuralLastDecision = null;
    this.neuralLastSensorSnapshot = null;
    this.neuralPreviousTargetDistance = null;
    this.neuralLastRewardReason = null;
    this.status = 'running';
    this.telemetrySystem.recordGameplayEvent('auto-test-start', {
      mode: this.mode.id,
      duration: this.mode.durationSeconds,
      startingInventoryProfile: this.startingInventoryProfileId,
    });
    this.adapter.begin?.({
      mode: this.mode,
      inventoryProfileId: this.startingInventoryProfileId,
      aiMemorySnapshot: this.aiMemorySnapshot,
      neuralAgentEnabled: this.neuralAgentEnabled,
      neuralTrainingMode: this.neuralTrainingMode,
    });
    this.adapter.setAiMemorySnapshot?.(this.aiMemorySnapshot);
    this.goalPlanner.setAiMemorySnapshot?.(this.aiMemorySnapshot);

    return {
      ok: true,
      message: `${this.mode.label} started with ${this.startingInventoryProfileId} inventory.`,
      snapshot: this.getSnapshot(),
    };
  }

  stop(reason = 'stopped') {
    if (this.status !== 'running') {
      return this.getSnapshot();
    }

    this.recordFailure('manual-stop', 'Autonomous playtest was stopped before completion.', 'low');
    return this.finish(reason);
  }

  update(deltaTime = DEFAULT_STEP_SECONDS) {
    if (this.status !== 'running') {
      this.detectPostCompletionEvents();
      return {
        completed: false,
        snapshot: this.getSnapshot(),
        report: this.lastReport,
      };
    }

    const safeDeltaTime = Math.max(0.001, deltaTime);

    this.advanceClock?.(safeDeltaTime);

    if (this.recordFrames) {
      this.telemetrySystem.updateFrame(safeDeltaTime);
    }

    this.elapsedSeconds += safeDeltaTime;
    this.saveRunningMemorySnapshotIfNeeded();
    this.updateActions(safeDeltaTime);
    this.detectFailures();

    if (this.detectStarterProgressAbort()) {
      const report = this.finish('starter-progress-aborted');

      return {
        completed: true,
        snapshot: this.getSnapshot(),
        report,
      };
    }

    if (this.elapsedSeconds >= this.mode.durationSeconds) {
      const report = this.finish('completed');

      return {
        completed: true,
        snapshot: this.getSnapshot(),
        report,
      };
    }

    return {
      completed: false,
      snapshot: this.getSnapshot(),
      report: null,
    };
  }

  runToCompletion({
    modeId = 'quick',
    durationSeconds = null,
    deltaTime = DEFAULT_STEP_SECONDS,
    inventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
    neuralAgentEnabled = this.neuralAgentEnabled,
    neuralGenome = this.neuralGenome,
    neuralTrainingMode = this.neuralTrainingMode,
    neuralTrainingMetadata = this.neuralTrainingMetadata,
  } = {}) {
    const startResult = this.start({
      modeId,
      durationSeconds,
      inventoryProfileId,
      neuralAgentEnabled,
      neuralGenome,
      neuralTrainingMode,
      neuralTrainingMetadata,
    });

    if (!startResult.ok) {
      return {
        report: this.lastReport,
        snapshot: this.getSnapshot(),
      };
    }

    const maxSteps = Math.ceil(this.mode.durationSeconds / deltaTime) + 4;

    for (let step = 0; step < maxSteps && this.status === 'running'; step += 1) {
      this.update(deltaTime);
    }

    if (this.status === 'running') {
      this.finish('max-steps-reached');
    }

    return {
      report: this.lastReport,
      snapshot: this.getSnapshot(),
    };
  }

  updateActions(deltaTime) {
    this.tickActionCooldowns(deltaTime);

    if (this.recoveryState === RECOVERY_STATES.pausedAfterRecovery) {
      this.updatePausedAfterRecovery();
      this.updateTimedAction('saveLoad', deltaTime, 20, () => this.adapter.checkSaveLoad?.());
      return;
    }

    if (this.recoveryState === RECOVERY_STATES.resumed) {
      this.transitionRecoveryState(RECOVERY_STATES.idle);
    }

    const rawContext = this.adapter.getPlanningState?.({
      elapsedSeconds: this.elapsedSeconds,
      mode: this.mode,
    }) ?? {};
    const context = {
      ...rawContext,
      memory: this.aiMemorySnapshot?.strategyHints ?? null,
    };
    let plan = this.goalPlanner.update({
      deltaTime,
      elapsedSeconds: this.elapsedSeconds,
      context,
    });
    plan = this.consumeForcedReplan(plan);
    this.terrainSafety = this.adapter.getTerrainSafetySnapshot?.({
      elapsedSeconds: this.elapsedSeconds,
      context,
      plan,
    }) ?? this.terrainSafety;
    this.playerSafety = this.adapter.getPlayerSafetySnapshot?.({
      elapsedSeconds: this.elapsedSeconds,
      context,
      plan,
    }) ?? this.playerSafety;
    const neuralDecision = this.createNeuralDecision({
      plan,
      context,
    });

    if (this.updateVoidDetection({
      deltaTime,
      plan,
      context,
      playerSafety: this.playerSafety,
    })) {
      this.updateTimedAction('saveLoad', deltaTime, 20, () => this.adapter.checkSaveLoad?.());
      return;
    }

    if (this.performSurvivalRecoveryIfNeeded({
      plan,
      context,
      deltaTime,
      elapsedSeconds: this.elapsedSeconds,
      terrainSafety: this.terrainSafety,
    })) {
      this.updateTimedAction('saveLoad', deltaTime, 20, () => this.adapter.checkSaveLoad?.());
      return;
    }

    if (plan.action === 'blocked') {
      this.handleBlockedPlannerPlan(plan, context);
    } else {
      this.performPlannedAction(plan, context, deltaTime, neuralDecision);
    }

    this.updateTimedAction('saveLoad', deltaTime, 20, () => this.adapter.checkSaveLoad?.());
  }

  consumeForcedReplan(defaultPlan) {
    if (!this.forcedReplan) {
      return defaultPlan;
    }

    const forcedPlan = {
      ...this.forcedReplan,
      progress: 0,
    };

    this.forcedReplan.remainingSteps -= 1;

    if (this.forcedReplan.remainingSteps <= 0) {
      this.forcedReplan = null;
    }

    return forcedPlan;
  }

  createNeuralDecision({ plan, context }) {
    if (!this.neuralAgentEnabled || !this.neuralGenome) {
      this.neuralLastDecision = null;
      return null;
    }

    const plannerSnapshot = this.goalPlanner.getSnapshot();
    const sensorSnapshot = this.neuralSensorSystem.collect({
      context,
      plan,
      resourceScanResults: this.resourceScanResults ?? this.adapter.getResourceScanSnapshot?.(),
      terrainSafety: this.terrainSafety,
      playerSafety: this.playerSafety,
      actionLoop: this.actionLoop,
      recoveryStats: {
        hardRecoveryCount: this.hardRecoveryCount,
        stuckSeconds: this.actionLoop.count,
      },
      plannerSnapshot,
    });
    const outputs = this.neuralGenome.network.forward(sensorSnapshot.inputs);
    const decision = this.neuralActionMapper.mapOutputs(outputs, {
      plan,
      sensorSnapshot,
    });

    this.neuralLastSensorSnapshot = {
      names: sensorSnapshot.names,
      values: { ...sensorSnapshot.values },
      nearestTarget: sensorSnapshot.nearestTarget ? { ...sensorSnapshot.nearestTarget } : null,
    };
    this.neuralLastDecision = {
      ...decision,
      sensorSnapshot: this.neuralLastSensorSnapshot,
    };

    return this.neuralLastDecision;
  }

  saveRunningMemorySnapshotIfNeeded() {
    if (!this.aiMemorySystem || this.elapsedSeconds < this.nextRunningMemorySaveAt) {
      return;
    }

    this.nextRunningMemorySaveAt = this.elapsedSeconds + RUNNING_MEMORY_SAVE_SECONDS;
    this.aiMemorySystem.save?.();
    this.aiMemorySnapshot = this.aiMemorySystem.getSnapshot?.() ?? this.aiMemorySnapshot;
    this.adapter.setAiMemorySnapshot?.(this.aiMemorySnapshot);
    this.goalPlanner.setAiMemorySnapshot?.(this.aiMemorySnapshot);
  }

  updatePausedAfterRecovery() {
    if (this.elapsedSeconds < Number(this.recoveryPauseEndsAt ?? 0)) {
      return;
    }

    this.emitRecoveryResumeOnce();
    this.transitionRecoveryState(RECOVERY_STATES.resumed);
  }

  enterRecoveryPause({ context, plan, reason }) {
    this.transitionRecoveryState(RECOVERY_STATES.pausedAfterRecovery);
    this.recoveryPauseStartedAt = this.elapsedSeconds;
    this.recoveryPauseEndsAt = this.elapsedSeconds + HARD_RECOVERY_PAUSE_SECONDS;
    this.emitRecoveryPauseOnce({
      context,
      plan,
      reason,
    });
  }

  emitRecoveryPauseOnce({ context, plan, reason }) {
    if (this.recoveryPauseEventEmitted) {
      this.recoveryPauseSpamCount += 1;
      this.detectRecoveryEventLoop('recovery-pause-duplicate');
      return;
    }

    this.recoveryPauseEventEmitted = true;
    this.recordRecoveryLifecycleEvent('recovery-pause');

    const intent = resolveRecoveryPauseIntent(context);

    if (intent) {
      this.adapter.executeSurvivalRecovery?.({
        intent,
        context,
        plan: {
          goalId: plan.goalId ?? plan.currentGoalId ?? 'recoveryPause',
          goalName: plan.goalName ?? plan.currentGoal ?? 'Recovery Pause',
          action: 'recoveryPause',
        },
        deltaTime: 0,
        elapsedSeconds: this.elapsedSeconds,
        terrainSafety: this.terrainSafety,
        terrainDeathContext: this.terrainDeathContext,
      });
    }

    this.actionCounts.survive += 1;
    this.telemetrySystem.recordGameplayEvent('auto-survival-recovery', {
      type: 'recovery-pause',
      reason: reason ?? intent?.reason ?? 'Paused progression after hard recovery.',
      result: 'pause',
      cycle: this.recoveryCycleId,
    });
  }

  emitRecoveryResumeOnce() {
    if (this.recoveryResumeEventEmitted) {
      this.detectRecoveryEventLoop('recovery-resume-duplicate');
      return;
    }

    this.recoveryResumeEventEmitted = true;
    this.recordRecoveryLifecycleEvent('recovery-resume');
    this.telemetrySystem.recordGameplayEvent('auto-recovery-resume', {
      cycle: this.recoveryCycleId,
      pausedSeconds: round(this.elapsedSeconds - Number(this.recoveryPauseStartedAt ?? this.elapsedSeconds), 2),
    });
  }

  transitionRecoveryState(nextState) {
    if (this.recoveryState === nextState) {
      return;
    }

    this.lastRecoveryState = this.recoveryState;
    this.recoveryState = nextState;
  }

  startRecoveryCycle() {
    this.recoveryCycleId += 1;
    this.recoveryPauseStartedAt = null;
    this.recoveryPauseEndsAt = null;
    this.recoveryPauseEventEmitted = false;
    this.recoveryResumeEventEmitted = false;
    this.transitionRecoveryState(RECOVERY_STATES.hardRecovering);
    this.recordRecoveryLifecycleEvent('hard-recovering');
  }

  recordRecoveryLifecycleEvent(type) {
    this.recoveryEventTimes.push(this.elapsedSeconds);
    this.recoveryEventTimes = this.recoveryEventTimes.filter((eventTime) => (
      this.elapsedSeconds - eventTime <= RECOVERY_EVENT_WINDOW_SECONDS
    ));
    this.detectRecoveryEventLoop(type);
  }

  detectRecoveryEventLoop(reason) {
    if (
      this.recoveryLoopDetected ||
      this.recoveryEventTimes.length <= RECOVERY_EVENT_LOOP_THRESHOLD
    ) {
      return;
    }

    this.recoveryLoopDetected = true;
    this.recoveryLoopCycles = Math.max(this.recoveryLoopCycles, this.recoveryEventTimes.length);
    this.recordFailure(
      'recovery-loop-detected',
      `Autonomous recovery emitted ${this.recoveryEventTimes.length} recovery events within ${RECOVERY_EVENT_WINDOW_SECONDS}s near "${reason}".`,
      'medium',
    );
  }

  updateVoidDetection({ deltaTime, plan, context, playerSafety }) {
    if (!playerSafety) {
      return false;
    }

    if (playerSafety.lastSafePosition) {
      this.lastSafePosition = { ...playerSafety.lastSafePosition };
    }

    if (playerSafety.cameraSkyOnly) {
      this.skyOnlySeconds += deltaTime;
      this.skyOnlyFrames += 1;
    } else {
      this.skyOnlySeconds = 0;
    }

    if (playerSafety.isUngroundedAbnormally) {
      this.ungroundedSeconds += deltaTime;
    } else {
      this.ungroundedSeconds = 0;
    }

    const reason = resolveVoidRecoveryReason({
      playerSafety,
      skyOnlySeconds: this.skyOnlySeconds,
      ungroundedSeconds: this.ungroundedSeconds,
    });

    if (!reason) {
      return false;
    }

    if (this.recoveryState === RECOVERY_STATES.hardRecovering || this.recoveryState === RECOVERY_STATES.pausedAfterRecovery) {
      return true;
    }

    if (isPlayerSafetySafe(playerSafety)) {
      this.skyOnlySeconds = 0;
      this.ungroundedSeconds = 0;
      if (this.recoveryState === RECOVERY_STATES.resumed) {
        this.transitionRecoveryState(RECOVERY_STATES.idle);
      }
      return false;
    }

    this.startRecoveryCycle();
    this.trackHardRecoveryAttempt(plan, playerSafety);
    this.addNeuralReward(NEURAL_REWARDS.hardRecovery, 'Hard recovery was used.');
    this.cameraVoidDetected = true;
    this.playerLostRecoveryCount += 1;

    if (this.recoveryLoopDetected) {
      this.performEmergencyRecovery({
        reason: 'Hard recovery loop detected before retrying the same invalid target.',
        context,
        plan,
        playerSafety,
      });
      return true;
    }

    const recoveryResult = this.adapter.executeHardRecovery?.({
      reason,
      lastSafePosition: this.lastSafePosition,
      context,
      plan,
      elapsedSeconds: this.elapsedSeconds,
      playerSafety,
    }) ?? {
      ok: false,
      reason: 'Adapter does not implement hard recovery.',
    };
    const nextSafety = this.adapter.getPlayerSafetySnapshot?.({
      elapsedSeconds: this.elapsedSeconds,
      context,
      plan,
    }) ?? null;

    this.playerSafety = nextSafety ?? playerSafety;
    this.lastSafePosition = nextSafety?.lastSafePosition ?? recoveryResult.lastSafePosition ?? this.lastSafePosition;
    this.recoveryTeleportUsed = this.recoveryTeleportUsed || Boolean(recoveryResult.teleportUsed);
    this.recoverySuccess = this.isHardRecoveryResultValid({
      recoveryResult,
      nextSafety,
    });
    this.captureRecoveryInvalidation({
      plan,
      recoveryResult,
      playerSafety,
      nextSafety,
    });

    this.survivalRecoveryActions.push({
      type: 'hard-void-recovery',
      reason,
      goalId: plan.goalId,
      goalName: plan.goalName,
      action: plan.action,
      ok: this.recoverySuccess,
      result: recoveryResult.event ?? recoveryResult.reason ?? null,
      health: Number(this.goalPlanner.lastContext?.survival?.health ?? context.survival?.health ?? 0),
      hunger: Number(this.goalPlanner.lastContext?.survival?.hunger ?? context.survival?.hunger ?? 0),
      terrainRisk: this.terrainSafety?.riskLevel ?? 'unknown',
      atSeconds: round(this.elapsedSeconds, 2),
    });
    this.survivalRecoveryActions = this.survivalRecoveryActions.slice(-48);
    this.recordRecoveryAction(plan, {
      ok: this.recoverySuccess,
      recoveryAction: {
        type: 'hard-void-recovery',
        reason,
      },
    });

    if (this.recoverySuccess) {
      this.skyOnlySeconds = 0;
      this.ungroundedSeconds = 0;
      this.scheduleForcedReplanAfterRecovery({
        plan,
        reason,
      });
      this.enterRecoveryPause({
        context,
        plan,
        reason,
      });
    } else {
      this.transitionRecoveryState(RECOVERY_STATES.failed);
      this.recordFailure('camera-void-player-lost', reason, 'medium');
      this.recordFailedAction({
        plan,
        actionName: 'survive',
        result: {
          ok: false,
          reason: recoveryResult.reason ?? 'Hard recovery did not restore grounded visible terrain.',
        },
      });
    }

    this.telemetrySystem.recordGameplayEvent('auto-hard-recovery', {
      reason,
      ok: this.recoverySuccess,
      teleportUsed: Boolean(recoveryResult.teleportUsed),
      cycle: this.recoveryCycleId,
    });

    return true;
  }

  isHardRecoveryResultValid({ recoveryResult, nextSafety }) {
    return Boolean(
      recoveryResult.ok &&
      isPlayerSafetySafe(nextSafety) &&
      recoveryResult.chunkLoaded !== false &&
      recoveryResult.insideBlock !== true &&
      recoveryResult.cameraTargetValid !== false &&
      recoveryResult.currentTargetCleared !== false &&
      recoveryResult.miningTargetCleared !== false &&
      recoveryResult.goalReplanRequired !== false &&
      recoveryResult.recoveryValid !== false
    );
  }

  trackHardRecoveryAttempt(plan, playerSafety) {
    this.hardRecoveryCount += 1;
    this.hardRecoveryTimes.push(this.elapsedSeconds);
    this.hardRecoveryTimes = this.hardRecoveryTimes.filter((eventTime) => (
      this.elapsedSeconds - eventTime <= HARD_RECOVERY_LOOP_WINDOW_SECONDS
    ));
    this.lastFailedGoal = plan.goalId ?? null;
    this.lastFailedAction = plan.action ?? null;
    this.failedTargetPosition = playerSafety?.position ? { ...playerSafety.position } : null;
    const goalCountKey = plan.goalId ?? 'unknown-goal';

    this.recoveryGoalCounts.set(goalCountKey, (this.recoveryGoalCounts.get(goalCountKey) ?? 0) + 1);

    if (this.hardRecoveryTimes.length > HARD_RECOVERY_LOOP_THRESHOLD) {
      this.markRecoveryLoopDetected({
        reason: `${this.hardRecoveryTimes.length} hard recoveries happened within ${HARD_RECOVERY_LOOP_WINDOW_SECONDS}s.`,
        plan,
      });
    }
  }

  markRecoveryLoopDetected({ reason, plan }) {
    if (!this.recoveryLoopDetected) {
      this.recoveryLoopDetected = true;
      this.recoveryLoopCycles = this.hardRecoveryTimes.length;
      this.addNeuralReward(NEURAL_REWARDS.recoveryLoop, 'Hard recovery loop detected.');
      this.recordFailure('hard-recovery-loop-detected', reason, 'medium');
    } else {
      this.recoveryLoopCycles = Math.max(this.recoveryLoopCycles, this.hardRecoveryTimes.length);
    }

    this.goalPlanner.recordBottleneck({
      code: `hard-recovery-loop:${plan.goalId ?? 'unknown-goal'}`,
      goalId: plan.goalId,
      goalName: plan.goalName,
      summary: reason,
      atSeconds: this.elapsedSeconds,
    });
  }

  performEmergencyRecovery({ reason, context, plan, playerSafety }) {
    const recoveryResult = this.adapter.executeHardRecovery?.({
      reason,
      preferBase: true,
      lastSafePosition: this.lastSafePosition,
      context,
      plan,
      elapsedSeconds: this.elapsedSeconds,
      playerSafety,
      emergency: true,
    }) ?? {
      ok: false,
      reason: 'Adapter does not implement emergency hard recovery.',
    };
    const nextSafety = this.adapter.getPlayerSafetySnapshot?.({
      elapsedSeconds: this.elapsedSeconds,
      context,
      plan,
    }) ?? null;

    this.emergencyTeleportUsed = this.emergencyTeleportUsed || Boolean(recoveryResult.teleportUsed);
    this.recoveryTeleportUsed = this.recoveryTeleportUsed || this.emergencyTeleportUsed;
    this.playerSafety = nextSafety ?? this.playerSafety;
    this.lastSafePosition = nextSafety?.lastSafePosition ?? recoveryResult.lastSafePosition ?? this.lastSafePosition;
    this.captureRecoveryInvalidation({
      plan,
      recoveryResult,
      playerSafety,
      nextSafety,
    });
    this.forcedReplan = createForcedRecoveryPlan({
      plan,
      reason: 'Emergency recovery forced a safe survival pause after repeated hard recovery.',
      mode: 'maintainSurvival',
    });
    this.transitionRecoveryState(RECOVERY_STATES.failed);
    this.telemetrySystem.recordGameplayEvent('auto-hard-recovery', {
      reason,
      ok: Boolean(recoveryResult.ok && isPlayerSafetySafe(nextSafety)),
      teleportUsed: Boolean(recoveryResult.teleportUsed),
      emergency: true,
      cycle: this.recoveryCycleId,
    });
  }

  captureRecoveryInvalidation({ plan, recoveryResult, playerSafety, nextSafety }) {
    this.lastFailedGoal = plan.goalId ?? this.lastFailedGoal;
    this.lastFailedAction = plan.action ?? this.lastFailedAction;
    this.failedTargetPosition = recoveryResult.failedTargetPosition ??
      recoveryResult.clearedTargetPosition ??
      playerSafety?.position ??
      nextSafety?.position ??
      this.failedTargetPosition;

    const nextBlacklistedTargets = [
      ...(recoveryResult.blacklistedTargets ?? []),
      ...(recoveryResult.blacklistedTarget ? [recoveryResult.blacklistedTarget] : []),
    ];

    if (nextBlacklistedTargets.length > 0) {
      this.blacklistedTargets.push(...nextBlacklistedTargets.map((target) => ({ ...target })));
      this.blacklistedTargets = this.blacklistedTargets.slice(-32);
    }
  }

  scheduleForcedReplanAfterRecovery({ plan, reason }) {
    const recoveryCount = this.recoveryGoalCounts.get(plan.goalId ?? 'unknown-goal') ?? 0;

    if (plan.action === 'gatherStone' || recoveryCount >= GOAL_RECOVERY_REPLAN_THRESHOLD) {
      this.forcedReplan = createForcedRecoveryPlan({
        plan,
        reason,
        mode: plan.action === 'gatherStone' ? 'exploreForStone' : 'maintainSurvival',
      });
    }
  }

  performPlannedAction(plan, context, deltaTime, neuralDecision = null) {
    const actionName = mapPlanActionToAction(plan.action);

    if (!this.canPerformAction(actionName)) {
      return;
    }

    const rawResult = this.adapter.executeGoalStep?.({
      plan,
      context,
      deltaTime,
      elapsedSeconds: this.elapsedSeconds,
      mode: this.mode,
      neuralDecision,
    }) ?? { ok: false, skipped: true };
    const rawNextContext = this.adapter.getPlanningState?.({
      elapsedSeconds: this.elapsedSeconds,
      mode: this.mode,
    }) ?? context;
    const nextContext = {
      ...rawNextContext,
      memory: this.aiMemorySnapshot?.strategyHints ?? null,
    };
    const result = this.validatePlannedResult({
      plan,
      actionName,
      result: rawResult,
      beforeContext: context,
      afterContext: nextContext,
    });

    this.detectActionLoop(plan);
    this.detectCraftPlanksMissingWood(plan, context, result);
    this.updateInventorySnapshot(nextContext);
    this.updateResourceScanSnapshot(result);
    this.updateShelterValidationSnapshot(result);
    this.updateFurnaceCraftDiagnostics(plan, result);
    this.updateObtainFurnaceBlockedAttempts(plan, result);
    this.updateGatherWoodBlockedReason(plan, result);
    this.recordResultFailedActions(plan, actionName, result);
    this.recordBlockedPlacementReasons(plan, result);
    this.recordRecoveryAction(plan, result);
    this.updateNeuralFitness({
      plan,
      result,
      beforeContext: context,
      afterContext: nextContext,
      inventoryDelta: diffInventory(context.inventory, nextContext.inventory),
      neuralDecision,
    });

    if (!result.ok && !result.moving) {
      this.recordFailedAction({
        plan,
        actionName,
        result,
      });
    }

    this.performAction(actionName, () => result);
    this.setActionCooldown(actionName);

    if (!result.moving) {
      this.goalPlanner.recordStepResult({
        plan,
        result,
        elapsedSeconds: this.elapsedSeconds,
      });
    }
    this.telemetrySystem.recordGameplayEvent('auto-goal-step', {
      goal: plan.goalId,
      action: plan.action,
      result: result.ok ? 'ok' : 'blocked',
    });
  }

  updateNeuralFitness({
    plan,
    result,
    beforeContext,
    afterContext,
    inventoryDelta,
    neuralDecision,
  }) {
    if (!this.neuralAgentEnabled) {
      return;
    }

    const currentTargetDistance = Number(this.neuralLastSensorSnapshot?.nearestTarget?.distance ?? NaN);

    if (
      plan.action === 'gatherWood' &&
      result.moving &&
      Number.isFinite(currentTargetDistance) &&
      (
        this.neuralPreviousTargetDistance === null ||
        currentTargetDistance < this.neuralPreviousTargetDistance
      )
    ) {
      this.addNeuralReward(NEURAL_REWARDS.moveTowardReachableTree, 'Moved toward reachable tree.');
    }

    if (
      Number.isFinite(currentTargetDistance) &&
      this.neuralPreviousTargetDistance !== null &&
      currentTargetDistance < this.neuralPreviousTargetDistance
    ) {
      this.addNeuralReward(NEURAL_REWARDS.reduceTargetDistance, 'Reduced distance to current target.');
    }

    if (Number.isFinite(currentTargetDistance)) {
      this.neuralPreviousTargetDistance = currentTargetDistance;
    }

    if (Number(inventoryDelta.wood ?? 0) > 0 && plan.action === 'gatherWood') {
      this.addNeuralReward(NEURAL_REWARDS.mineWood, 'Mined one wood block.');
      this.addNeuralRewardOnce('firstWoodCollected', NEURAL_REWARDS.collectFirstWood, 'Collected first wood.');
    }

    if (Number(inventoryDelta.planks ?? 0) > 0) {
      this.addNeuralRewardOnce('craftedPlanks', NEURAL_REWARDS.craftPlanks, 'Crafted planks.');
    }

    if (Number(inventoryDelta.pickaxes ?? 0) > 0) {
      this.addNeuralRewardOnce('craftedWoodenPickaxe', NEURAL_REWARDS.craftWoodenPickaxe, 'Crafted wooden pickaxe.');
    }

    if (Number(inventoryDelta.stone ?? 0) > 0) {
      this.addNeuralReward(NEURAL_REWARDS.gatherStone, 'Gathered stone.');
    }

    if (
      this.goalPlanner.getSnapshot().progressionTierReached === 'iron' ||
      this.goalPlanner.getSnapshot().progressionTierReached === 'settled'
    ) {
      this.addNeuralRewardOnce('reachedIronTier', NEURAL_REWARDS.reachIronTier, 'Reached iron tier.');
    }

    if (!result.ok && !result.moving) {
      this.addNeuralReward(NEURAL_REWARDS.blockedAction, result.reason ?? 'Blocked neural-assisted action.');
    }

    if (!result.ok && result.reason && String(result.reason).toLowerCase().includes('blocked')) {
      this.addNeuralReward(NEURAL_REWARDS.repeatedBlockedTarget, 'Repeated blocked target penalty.');
    }

    if (neuralDecision?.selectedAction === 'turnLeft' || neuralDecision?.selectedAction === 'turnRight') {
      const beforeDistance = Number(beforeContext.world?.distanceToBase ?? 0);
      const afterDistance = Number(afterContext.world?.distanceToBase ?? beforeDistance);

      if (Math.abs(afterDistance - beforeDistance) < 0.01 && this.actionLoop.count > 5) {
        this.addNeuralReward(NEURAL_REWARDS.pingPong, 'Movement ping-pong detected.');
      }
    }
  }

  addNeuralReward(value, reason) {
    if (!this.neuralAgentEnabled) {
      return;
    }

    this.neuralFitness += Number(value ?? 0);
    this.neuralLastRewardReason = reason;
  }

  addNeuralRewardOnce(key, value, reason) {
    if (this.neuralRewardsApplied.has(key)) {
      return;
    }

    this.neuralRewardsApplied.add(key);
    this.addNeuralReward(value, reason);
  }

  handleBlockedPlannerPlan(plan, context) {
    if (plan.goalId !== 'craftPlanks') {
      return;
    }

    const woodCount = Number(context.inventory?.wood ?? 0);

    if (woodCount > 0) {
      return;
    }

    this.craftPlanksBlockedByMissingWood = true;
    this.goalPlanner.recordBottleneck({
      code: 'craft-planks-missing-wood',
      goalId: 'craftPlanks',
      goalName: 'Craft Planks',
      summary: 'Craft Planks is blocked by missing wood and must return to Gather Wood or Explore For Wood.',
      atSeconds: this.elapsedSeconds,
    });
  }

  performSurvivalRecoveryIfNeeded({ plan, context, deltaTime, elapsedSeconds, terrainSafety = null }) {
    const intent = resolveSurvivalRecoveryIntent({
      context,
      plan,
      terrainSafety,
      terrainDeathContext: this.terrainDeathContext,
    });

    if (!intent) {
      return false;
    }

    const actionName = intent.type === 'search-food'
      ? 'collect'
      : intent.type === 'avoid-risky-terrain'
        ? 'explore'
        : 'survive';

    if (!this.canPerformAction(actionName)) {
      return true;
    }

    const beforeContext = context;
    const rawResult = this.adapter.executeSurvivalRecovery?.({
      intent,
      context,
      plan,
      deltaTime,
      elapsedSeconds,
      terrainSafety,
      terrainDeathContext: this.terrainDeathContext,
    }) ?? {
      ok: false,
      skipped: true,
      reason: `Adapter does not implement survival recovery intent "${intent.type}".`,
    };
    const afterContext = {
      ...(this.adapter.getPlanningState?.({
        elapsedSeconds,
        mode: this.mode,
      }) ?? beforeContext),
      memory: this.aiMemorySnapshot?.strategyHints ?? null,
    };
    const inventoryDelta = diffInventory(beforeContext.inventory, afterContext.inventory);
    const result = {
      ...rawResult,
      survivalRecoveryIntent: intent,
    };
    const recoveryRecord = {
      type: intent.type,
      reason: intent.reason,
      goalId: plan.goalId,
      goalName: plan.goalName,
      action: plan.action,
      ok: Boolean(result.ok),
      result: result.event ?? result.reason ?? null,
      health: Number(afterContext.survival?.health ?? beforeContext.survival?.health ?? 0),
      hunger: Number(afterContext.survival?.hunger ?? beforeContext.survival?.hunger ?? 0),
      terrainRisk: terrainSafety?.riskLevel ?? 'unknown',
      atSeconds: round(elapsedSeconds, 2),
    };

    if (result.teleportUsed) {
      this.recoveryTeleportUsed = true;
    }

    if (result.recoverySuccess !== undefined) {
      this.recoverySuccess = Boolean(result.recoverySuccess);
    }

    if (result.playerSafety) {
      this.playerSafety = { ...result.playerSafety };
      this.lastSafePosition = result.playerSafety.lastSafePosition ?? this.lastSafePosition;
    }

    this.survivalRecoveryActions.push(recoveryRecord);
    this.survivalRecoveryActions = this.survivalRecoveryActions.slice(-48);

    if (intent.type === 'search-food' || intent.type === 'eat-food') {
      this.foodSearchActions.push({
        ...recoveryRecord,
        inventoryDelta,
      });
      this.foodSearchActions = this.foodSearchActions.slice(-48);
    }

    if (!result.ok) {
      this.recordFailedAction({
        plan,
        actionName,
        result: {
          ...result,
          reason: result.reason ?? intent.reason,
        },
      });
      this.goalPlanner.recordBottleneck({
        code: `survival-recovery-blocked:${intent.type}`,
        goalId: plan.goalId,
        goalName: plan.goalName,
        summary: result.reason ?? intent.reason,
        atSeconds: elapsedSeconds,
      });
    }

    this.updateInventorySnapshot(afterContext);
    this.updateResourceScanSnapshot(result);
    this.updateShelterValidationSnapshot(result);
    this.recordRecoveryAction(plan, {
      ...result,
      recoveryAction: {
        type: intent.type,
        reason: intent.reason,
      },
    });
    this.performAction(actionName, () => result);
    this.setActionCooldown(actionName);
    this.telemetrySystem.recordGameplayEvent('auto-survival-recovery', {
      type: intent.type,
      reason: intent.reason,
      result: result.ok ? 'ok' : 'blocked',
    });

    return true;
  }

  tickActionCooldowns(deltaTime) {
    for (const actionName of Object.keys(this.actionCooldowns)) {
      this.actionCooldowns[actionName] = Math.max(0, this.actionCooldowns[actionName] - deltaTime);
    }
  }

  canPerformAction(actionName) {
    return (this.actionCooldowns[actionName] ?? 0) <= 0;
  }

  setActionCooldown(actionName) {
    this.actionCooldowns[actionName] = ACTION_COOLDOWN_SECONDS[actionName] ?? 0.5;
  }

  validatePlannedResult({ plan, actionName, result, beforeContext, afterContext }) {
    const inventoryDelta = diffInventory(beforeContext.inventory, afterContext.inventory);
    const worldDelta = diffInventory(beforeContext.world, afterContext.world);

    if (plan.action === 'gatherStone' && !hasValidMiningTool(beforeContext)) {
      const existingFailures = result.failures ?? [];
      const hasMissingPickaxeFailure = existingFailures.some(
        (f) => f.code === 'gather-stone-missing-pickaxe'
      );

      return {
        ...result,
        ok: false,
        skipped: true,
        failures: hasMissingPickaxeFailure
          ? existingFailures
          : [
              ...existingFailures,
              {
                code: 'gather-stone-missing-pickaxe',
                summary: 'Gather Stone started without a valid pickaxe.',
                severity: 'medium',
              },
            ],
        reason: 'Gather Stone requires a real pickaxe before mining.',
      };
    }

    if (actionName === 'craft') {
      if (result.ok && !hasInventoryChange(inventoryDelta)) {
        const reason = `Craft action "${plan.action}" returned success without changing inventory.`;

        this.recordFailedCraft({
          plan,
          reason,
        });

        return {
          ...result,
          ok: false,
          skipped: true,
          failures: [
            ...(result.failures ?? []),
            {
              code: 'craft-no-inventory-change',
              summary: reason,
              severity: 'medium',
            },
          ],
        };
      }

      if (result.ok) {
        this.recordCraftedItem({
          plan,
          result,
          inventoryDelta,
        });
      } else {
        this.recordFailedCraft({
          plan,
          reason: result.event ?? result.reason ?? 'Craft action was blocked.',
        });
      }
    }

    if (actionName === 'combat' && result.ok && result.entityDamageApplied !== true) {
      return {
        ...result,
        ok: false,
        skipped: true,
        failures: [
          ...(result.failures ?? []),
          {
            code: 'combat-no-entity-damage',
            summary: 'Combat action returned success without confirmed entity damage.',
            severity: 'medium',
          },
        ],
      };
    }

    if (plan.action === 'gatherWood' && result.ok && Number(inventoryDelta.wood ?? 0) <= 0) {
      const reason = 'Gather Wood returned success without increasing wood inventory.';

      return {
        ...result,
        ok: false,
        skipped: true,
        failures: [
          ...(result.failures ?? []),
          {
            code: 'gather-wood-no-inventory-delta',
            summary: reason,
            severity: 'medium',
          },
        ],
        reason,
      };
    }

    const realityFailure = this.validateGoalReality({
      plan,
      result,
      inventoryDelta,
      worldDelta,
      beforeContext,
      afterContext,
    });

    if (realityFailure) {
      return {
        ...result,
        ok: false,
        skipped: true,
        failures: [
          ...(result.failures ?? []),
          realityFailure,
        ],
        reason: realityFailure.summary,
      };
    }

    return result;
  }

  validateGoalReality({ plan, result, inventoryDelta, worldDelta, beforeContext, afterContext }) {
    if (!result.ok) {
      return null;
    }

    const checks = {
      craftPlanks: () => Number(inventoryDelta.wood ?? 0) < 0 && Number(inventoryDelta.planks ?? 0) > 0,
      craftTools: () => Number(inventoryDelta.sticks ?? 0) > 0,
      craftWoodenPickaxe: () => Number(inventoryDelta.pickaxes ?? 0) > 0 && hasValidMiningTool(afterContext),
      gatherStone: () => Number(inventoryDelta.stone ?? 0) > 0 && hasValidMiningTool(beforeContext),
      buildShelter: () => Number(worldDelta.validShelterBlocksPlaced ?? worldDelta.shelterBlocks ?? 0) > 0 &&
        Boolean(afterContext.world?.shelterIsValid || result.shelterValidation?.validShelterBlocksPlaced > beforeContext.world?.validShelterBlocksPlaced),
      surviveNight: () => Number(worldDelta.nightSurvivedSeconds ?? 0) > 0 &&
        (Boolean(afterContext.world?.shelterIsSafeForNight) || Boolean(afterContext.world?.safeDistanceNoAggro)),
      obtainFurnace: () => Number(inventoryDelta.furnace ?? 0) > 0 || Number(afterContext.world?.placedFurnaces ?? 0) > Number(beforeContext.world?.placedFurnaces ?? 0),
      smeltOre: () => Number(inventoryDelta.ironIngot ?? 0) > 0,
      upgradeEquipment: () => Number(inventoryDelta.ironTools ?? 0) > 0,
      exploreWorld: () => Number(worldDelta.exploredDistance ?? 0) > 0,
      discoverNewBiome: () => Number(worldDelta.uniqueBiomesDiscovered ?? 0) > 0,
      discoverStructure: () => Number(worldDelta.structuresDiscovered ?? 0) > 0,
      createStorage: () => Number(worldDelta.storageCreated ?? 0) > 0 || Number(inventoryDelta.storageChest ?? 0) > 0,
      buildBaseTier1: () => Number(afterContext.world?.baseTier ?? 0) > Number(beforeContext.world?.baseTier ?? 0),
      buildStorage: () => Number(worldDelta.storageStores ?? 0) > 0 || Number(worldDelta.storageRetrieves ?? 0) > 0,
      buildBaseTier2: () => Number(afterContext.world?.baseTier ?? 0) > Number(beforeContext.world?.baseTier ?? 0),
      maintainStorageReserves: () => Number(worldDelta.storageReserveScore ?? 0) > 0 ||
        Number(worldDelta.storedWood ?? 0) > 0 ||
        Number(worldDelta.storedStone ?? 0) > 0 ||
        Number(worldDelta.storedFood ?? 0) > 0,
      gatherFood: () => Number(inventoryDelta.food ?? 0) + Number(inventoryDelta.berries ?? 0) > 0,
      buildPermanentBase: () => Number(worldDelta.permanentBaseBlocksPlaced ?? 0) > 0 ||
        Number(afterContext.world?.baseTier ?? 0) > Number(beforeContext.world?.baseTier ?? 0),
    };
    const check = checks[plan.action];

    if (!check || check()) {
      return null;
    }

    return {
      code: `goal-reality-validation:${plan.action}`,
      summary: `Planner action "${plan.action}" returned ok without the required real inventory/world delta.`,
      severity: 'medium',
    };
  }

  detectActionLoop(plan) {
    const actionKey = `${plan.goalId}:${plan.action}`;

    if (plan.goalId === 'maintainSurvival' || plan.goalId === 'continueExploration') {
      this.actionLoop = createActionLoopState(actionKey, plan.progress);
      return;
    }

    if (
      this.actionLoop.key === actionKey &&
      plan.progress <= this.actionLoop.progress + 0.001
    ) {
      this.actionLoop.count += 1;
    } else {
      this.actionLoop = createActionLoopState(actionKey, plan.progress);
    }

    this.actionLoop.progress = Math.max(this.actionLoop.progress, plan.progress);

    if (this.actionLoop.count <= 10 || this.actionLoop.reported) {
      return;
    }

    this.actionLoop.reported = true;
    this.failureCounts.stuckEvents += 1;
    this.recordFailure(
      `action-loop:${plan.goalId}:${plan.action}`,
      `AI repeated "${plan.action}" for ${plan.goalName} more than 10 times without progress.`,
      'medium',
    );
    this.goalPlanner.recordBottleneck({
      code: `action-loop:${plan.goalId}:${plan.action}`,
      goalId: plan.goalId,
      goalName: plan.goalName,
      summary: `AI repeated "${plan.action}" more than 10 times without measurable progress.`,
      atSeconds: this.elapsedSeconds,
    });
  }

  recordCraftedItem({ plan, result, inventoryDelta }) {
    this.craftedItems.push({
      goalId: plan.goalId,
      goalName: plan.goalName,
      action: plan.action,
      item: result.craftedItem?.name ?? result.event ?? plan.action,
      itemType: result.craftedItem?.itemType ?? null,
      itemId: result.craftedItem?.itemId ?? null,
      count: result.craftedItem?.count ?? getPositiveDeltaTotal(inventoryDelta),
      atSeconds: round(this.elapsedSeconds, 2),
    });
    this.craftedItems = this.craftedItems.slice(-32);
  }

  recordFailedCraft({ plan, reason }) {
    this.failedCrafts.push({
      goalId: plan.goalId,
      goalName: plan.goalName,
      action: plan.action,
      reason,
      atSeconds: round(this.elapsedSeconds, 2),
    });
    this.failedCrafts = this.failedCrafts.slice(-32);
  }

  recordFailedAction({ plan, actionName, result }) {
    this.failedActions.push({
      goalId: plan.goalId,
      goalName: plan.goalName,
      action: plan.action,
      actionName,
      reason: result.event ?? result.reason ?? result.failures?.[0]?.summary ?? 'Action was blocked.',
      atSeconds: round(this.elapsedSeconds, 2),
    });
    this.failedActions = this.failedActions.slice(-48);
  }

  recordResultFailedActions(plan, actionName, result) {
    for (const failedAction of result.failedActions ?? []) {
      this.failedActions.push({
        goalId: failedAction.goalId ?? plan.goalId,
        goalName: failedAction.goalName ?? plan.goalName,
        action: failedAction.action ?? plan.action,
        actionName: failedAction.actionName ?? actionName,
        reason: failedAction.reason ?? result.reason ?? 'Action reported a failed sub-step.',
        atSeconds: round(this.elapsedSeconds, 2),
      });
    }

    this.failedActions = this.failedActions.slice(-48);
  }

  recordBlockedPlacementReasons(plan, result) {
    const blockedPlacementReasons = result.blockedPlacementReasons ?? [];

    for (const blockedPlacementReason of blockedPlacementReasons) {
      this.blockedPlacementReasons.push({
        goalId: plan.goalId,
        goalName: plan.goalName,
        action: plan.action,
        reason: blockedPlacementReason.reason ?? result.reason ?? 'Placement was blocked.',
        material: blockedPlacementReason.material ?? null,
        position: blockedPlacementReason.position ? { ...blockedPlacementReason.position } : null,
        atSeconds: round(this.elapsedSeconds, 2),
      });
    }

    this.blockedPlacementReasons = this.blockedPlacementReasons.slice(-48);
  }

  recordRecoveryAction(plan, result) {
    const recoveryAction = result.recoveryAction ?? (
      result.resourceScanResults?.recovery
        ? {
          type: result.resourceScanResults.recovery,
          reason: result.resourceScanResults.lastBlockedReason,
        }
        : null
    );

    if (!recoveryAction) {
      return;
    }

    this.recoveryActions.push({
      goalId: plan.goalId,
      goalName: plan.goalName,
      action: plan.action,
      type: recoveryAction.type,
      reason: recoveryAction.reason ?? result.reason ?? 'Recovery action requested.',
      atSeconds: round(this.elapsedSeconds, 2),
    });
    this.recoveryActions = this.recoveryActions.slice(-48);
  }

  updateInventorySnapshot(context) {
    const progressContext = this.goalPlanner.createProgressContext(context);

    this.inventorySnapshot = this.goalPlanner.getInventorySnapshot(progressContext);
  }

  updateResourceScanSnapshot(result = {}) {
    const resourceScanResults = result.resourceScanResults ?? this.adapter.getResourceScanSnapshot?.();

    if (!resourceScanResults) {
      return;
    }

    this.resourceScanResults = {
      ...resourceScanResults,
      nearestWoodTarget: resourceScanResults.nearestWoodTarget
        ? { ...resourceScanResults.nearestWoodTarget }
        : null,
      vegetationTarget: resourceScanResults.vegetationTarget
        ? { ...resourceScanResults.vegetationTarget }
        : null,
      targets: (resourceScanResults.targets ?? []).map((target) => ({ ...target })),
    };
  }

  updateShelterValidationSnapshot(result = {}) {
    const shelterValidation = result.shelterValidation ?? this.adapter.getShelterValidationSnapshot?.();

    if (!shelterValidation) {
      return;
    }

    this.shelterValidation = { ...shelterValidation };
  }

  updateFurnaceCraftDiagnostics(plan, result = {}) {
    const furnaceCraftDiagnostics = result.furnaceCraftDiagnostics ?? (
      plan.action === 'obtainFurnace'
        ? this.adapter.getFurnaceCraftDiagnostics?.()
        : null
    );

    if (!furnaceCraftDiagnostics) {
      return;
    }

    this.furnaceCraftDiagnostics = { ...furnaceCraftDiagnostics };
  }

  updateObtainFurnaceBlockedAttempts(plan, result) {
    if (plan.goalId !== 'obtainFurnace') {
      this.obtainFurnaceBlockedAttempts = 0;
      return;
    }

    if (result.ok) {
      this.obtainFurnaceBlockedAttempts = 0;
      return;
    }

    this.obtainFurnaceBlockedAttempts += 1;

    if (this.obtainFurnaceBlockedAttempts <= 10) {
      return;
    }

    this.recordFailure(
      'obtain-furnace-blocked-loop',
      `Obtain Furnace stayed blocked for ${this.obtainFurnaceBlockedAttempts} consecutive attempts: ${this.furnaceCraftDiagnostics.furnaceCraftBlockReason ?? 'unknown reason'}.`,
      'medium',
    );
    this.goalPlanner.recordBottleneck({
      code: 'obtain-furnace-blocked-loop',
      goalId: plan.goalId,
      goalName: plan.goalName,
      summary: this.furnaceCraftDiagnostics.furnaceCraftBlockReason ?? 'Obtain Furnace could not craft after repeated attempts.',
      atSeconds: this.elapsedSeconds,
    });
  }

  updateTimedAction(actionName, deltaTime, intervalSeconds, callback) {
    this.actionTimers[actionName] += deltaTime;

    if (this.actionTimers[actionName] < intervalSeconds) {
      return;
    }

    this.actionTimers[actionName] = 0;
    this.performAction(actionName, callback);
  }

  performAction(actionName, callback) {
    const result = callback?.() ?? { ok: false, skipped: true };

    if (result.ok) {
      this.incrementActionCount(actionName, result.count ?? 1);
      this.telemetrySystem.recordGameplayEvent(`auto-${actionName}`, {
        result: result.event ?? 'ok',
        count: result.count ?? 1,
      });
      this.recordGameplayVerb(actionName, result);

      for (const secondaryAction of result.secondaryActions ?? []) {
        const secondaryActionName = mapPlanActionToAction(secondaryAction.action ?? secondaryAction.name);

        if (secondaryActionName === 'combat' && secondaryAction.entityDamageApplied !== true) {
          continue;
        }

        this.incrementActionCount(secondaryActionName, secondaryAction.count ?? 1);
        this.telemetrySystem.recordGameplayEvent(`auto-${secondaryActionName}`, {
          result: secondaryAction.event ?? 'planned-support',
          count: secondaryAction.count ?? 1,
        });
        this.recordGameplayVerb(secondaryActionName, secondaryAction);
      }
    }

    for (const failure of result.failures ?? []) {
      this.recordFailure(failure.code, failure.summary, failure.severity);
    }

    return result;
  }

  incrementActionCount(actionName, count = 1) {
    if (!Object.prototype.hasOwnProperty.call(this.actionCounts, actionName)) {
      return;
    }

    this.actionCounts[actionName] += Number(count ?? 1);
  }

  recordGameplayVerb(actionName, result) {
    if (result.telemetryRecorded) {
      return;
    }

    if (actionName === 'mine') {
      this.telemetrySystem.recordGameplayEvent('mining', {
        block: result.event ?? 'planned resource',
      });
    } else if (actionName === 'place') {
      this.telemetrySystem.recordGameplayEvent('building', {
        count: result.count ?? 1,
        block: result.event ?? 'planned block',
      });
    } else if (actionName === 'combat' && result.entityDamageApplied === true) {
      this.telemetrySystem.recordGameplayEvent('combat', {
        result: result.event ?? 'hit',
      });
    }
  }

  detectFailures() {
    const currentPosition = this.adapter.getPosition?.() ?? null;

    if (currentPosition) {
      this.detectVerticalSnap(currentPosition);
      this.detectStuckState(currentPosition);
      this.lastPosition = { ...currentPosition };
    }

    const telemetrySnapshot = this.telemetrySystem.getSnapshot();

    if (telemetrySnapshot.consoleErrors > 0) {
      this.failureCounts.consoleErrors = telemetrySnapshot.consoleErrors;
    }

    this.detectDeathEvents(telemetrySnapshot, currentPosition);

    if (telemetrySnapshot.counts.deaths >= 2) {
      this.recordFailure('death-loop', 'Multiple deaths occurred during one autonomous playtest.', 'medium');
      this.failureCounts.deathLoops = Math.max(this.failureCounts.deathLoops, 1);
    }

    this.detectMiningSpam();
  }

  detectStarterProgressAbort() {
    if (this.earlyAbortReason || this.elapsedSeconds < STARTER_PROGRESS_ABORT_SECONDS) {
      return false;
    }

    const progress = this.createStarterProgressSnapshot();

    this.woodProgressBy90s = progress;

    if (progress.miningActions > 0 || progress.woodCount > 0 || progress.woodDelta > 0) {
      return false;
    }

    this.falseCompletionDetected = true;
    this.earlyAbortReason = 'No mining actions and no wood collected after 90 seconds of starter survival progression.';
    this.recordFailure('starter-no-wood-progress-90s', this.earlyAbortReason, 'high');
    this.addNeuralReward(NEURAL_REWARDS.noWoodAfter90s, this.earlyAbortReason);
    this.goalPlanner.recordBottleneck({
      code: 'starter-no-wood-progress-90s',
      goalId: 'gatherWood',
      goalName: 'Gather Wood',
      summary: this.earlyAbortReason,
      atSeconds: this.elapsedSeconds,
    });

    return true;
  }

  createStarterProgressSnapshot() {
    const inventorySnapshot = this.inventorySnapshot ?? this.goalPlanner.getInventorySnapshot();
    const currentInventory = inventorySnapshot.current ?? {};
    const deltaInventory = inventorySnapshot.delta ?? {};
    const telemetrySnapshot = this.telemetrySystem.getSnapshot();

    return {
      atSeconds: round(this.elapsedSeconds, 2),
      miningActions: Number(this.actionCounts.mine ?? telemetrySnapshot.counts?.mining ?? 0),
      telemetryMining: Number(telemetrySnapshot.counts?.mining ?? 0),
      woodCount: Number(currentInventory.wood ?? 0),
      woodDelta: Number(deltaInventory.wood ?? 0),
      completedGoalCount: this.goalPlanner.getSnapshot().goalsCompleted.length,
      currentGoalId: this.goalPlanner.getSnapshot().currentGoalId,
    };
  }

  detectFalseCompletionBeforeFinish(reason) {
    if (reason !== 'completed') {
      return false;
    }

    const progress = this.createStarterProgressSnapshot();
    const plannerSnapshot = this.goalPlanner.getSnapshot();
    const starterStillFailed = plannerSnapshot.progressionTierReached === 'starter' &&
      plannerSnapshot.goalsCompleted.length === 0;
    const noStarterResourceProgress = progress.miningActions === 0 &&
      progress.woodCount <= 0 &&
      progress.woodDelta <= 0;

    if (!starterStillFailed && !noStarterResourceProgress) {
      return false;
    }

    this.falseCompletionDetected = true;
    this.woodProgressBy90s = this.woodProgressBy90s ?? progress;
    this.earlyAbortReason = this.earlyAbortReason ??
      'Simulation reached its duration without proving starter survival progression.';
    this.recordFailure('false-starter-completion', this.earlyAbortReason, 'high');
    this.addNeuralReward(NEURAL_REWARDS.falseCompletion, this.earlyAbortReason);

    return true;
  }

  detectPostCompletionEvents() {
    if (!this.postCompletionBaseline || this.status === 'running') {
      return;
    }

    const telemetrySnapshot = this.telemetrySystem.getSnapshot();
    const postCompletionDeaths = Math.max(
      0,
      Number(telemetrySnapshot.counts?.deaths ?? 0) - Number(this.postCompletionBaseline.deaths ?? 0),
    );
    const postCompletionAutoEvents = (telemetrySnapshot.recentGameplayEvents ?? [])
      .filter((event) => (
        Number(event.atSeconds ?? 0) > Number(this.completedAtSeconds ?? 0) &&
        String(event.type ?? '').startsWith('auto-') &&
        event.type !== 'auto-test-complete'
      ));

    this.postCompletionDeaths = postCompletionDeaths;
    this.postCompletionEventsDetected = postCompletionDeaths > 0 || postCompletionAutoEvents.length > 0;

    if (!this.postCompletionEventsDetected) {
      return;
    }

    this.lastSimulationSnapshot = this.getSnapshot();
  }

  updateGatherWoodBlockedReason(plan, result = {}) {
    if (plan.action !== 'gatherWood' || result.ok) {
      return;
    }

    this.gatherWoodBlockedReason = result.reason ??
      result.resourceScanResults?.lastBlockedReason ??
      result.failures?.[0]?.summary ??
      'Gather Wood was blocked without a detailed reason.';
  }

  detectCraftPlanksMissingWood(plan, context, result = {}) {
    if (plan.action !== 'craftPlanks') {
      return;
    }

    const woodCount = Number(context.inventory?.wood ?? 0);

    if (woodCount > 0 || result.ok) {
      return;
    }

    this.craftPlanksBlockedByMissingWood = true;
    this.recordFailure(
      'craft-planks-missing-wood',
      'Craft Planks was attempted or selected while wood inventory was still zero.',
      'medium',
    );
    this.goalPlanner.recordBottleneck({
      code: 'craft-planks-missing-wood',
      goalId: plan.goalId,
      goalName: plan.goalName,
      summary: 'Craft Planks is missing wood; the planner should return to Gather Wood or Explore For Wood.',
      atSeconds: this.elapsedSeconds,
    });
  }

  detectDeathEvents(telemetrySnapshot, currentPosition) {
    const deathCount = telemetrySnapshot.counts?.deaths ?? 0;

    if (deathCount <= this.lastDeathCount) {
      return;
    }

    this.lastDeathCount = deathCount;
    this.addNeuralReward(NEURAL_REWARDS.death, 'Autonomous player death detected.');

    const latestDeathEvent = [...(telemetrySnapshot.recentGameplayEvents ?? [])]
      .reverse()
      .find((event) => event.type === 'death');
    const position = latestDeathEvent?.payload?.position ?? currentPosition ?? this.adapter.getPosition?.() ?? null;
    const biome = latestDeathEvent?.payload?.biome ??
      this.goalPlanner.lastContext?.world?.activeBiome ??
      this.resourceScanResults?.biome ??
      'Unknown';
    const source = latestDeathEvent?.payload?.source ?? 'unknown';

    this.deathPosition = position ? { ...position } : null;

    if (String(source).toLowerCase().includes('terrain')) {
      this.terrainDeathContext = {
        source: 'terrain-death',
        summary: 'Autonomous player died from terrain damage.',
        biome,
        position: this.deathPosition,
        velocityY: latestDeathEvent?.payload?.velocityY ?? null,
        fallDistance: latestDeathEvent?.payload?.fallDistance ?? latestDeathEvent?.payload?.landingImpact ?? null,
        healthBefore: latestDeathEvent?.payload?.healthBefore ?? null,
        healthAfter: latestDeathEvent?.payload?.healthAfter ?? null,
        currentGoal: this.goalPlanner.getSnapshot().currentGoal,
        suggestedAvoidanceStrategy: 'Avoid steep slopes and blacklisted terrain around the death position before resuming exploration.',
        atSeconds: round(this.elapsedSeconds, 2),
      };
      this.recordFailure('terrain-death', 'Autonomous player died from terrain damage.', 'medium');
    }
  }

  detectMiningSpam() {
    if (this.miningSpamReported || this.elapsedSeconds < 10) {
      return;
    }

    const mineRatePerMinute = (this.actionCounts.mine / Math.max(this.elapsedSeconds, 1)) * 60;

    if (mineRatePerMinute <= MINING_SPAM_PER_MINUTE_THRESHOLD) {
      return;
    }

    this.miningSpamReported = true;
    this.failureCounts.miningSpam += 1;
    this.recordFailure(
      'mining-spam-threshold',
      `AI mining rate reached ${Math.round(mineRatePerMinute)} actions/min, above the ${MINING_SPAM_PER_MINUTE_THRESHOLD}/min threshold.`,
      'medium',
    );
  }

  detectVerticalSnap(currentPosition) {
    if (!this.lastPosition) {
      return;
    }

    const verticalDelta = currentPosition.y - this.lastPosition.y;

    if (verticalDelta <= VERTICAL_SNAP_THRESHOLD) {
      return;
    }

    this.failureCounts.collisionIssues += 1;
    this.recordFailure('collision-vertical-snap', `Unexpected upward snap of ${verticalDelta.toFixed(2)} blocks.`, 'medium');
  }

  detectStuckState(currentPosition) {
    if (this.elapsedSeconds < this.nextPositionSampleAt) {
      return;
    }

    this.nextPositionSampleAt = this.elapsedSeconds + POSITION_SAMPLE_SECONDS;
    this.positionSamples.push({
      atSeconds: this.elapsedSeconds,
      position: { ...currentPosition },
    });
    this.positionSamples = this.positionSamples.filter((sample) => (
      this.elapsedSeconds - sample.atSeconds <= STUCK_WINDOW_SECONDS
    ));

    const oldestSample = this.positionSamples[0];

    if (!oldestSample || this.elapsedSeconds - oldestSample.atSeconds < STUCK_WINDOW_SECONDS - 0.5) {
      return;
    }

    const distance = getHorizontalDistance(oldestSample.position, currentPosition);

    if (distance >= STUCK_DISTANCE_THRESHOLD) {
      return;
    }

    this.failureCounts.stuckEvents += 1;
    this.recordFailure('stuck-detection', `Bot moved only ${distance.toFixed(2)} blocks over ${STUCK_WINDOW_SECONDS}s.`, 'medium');
  }

  recordFailure(code, summary, severity = 'low') {
    if (code.includes('save')) {
      this.failureCounts.saveLoadErrors += 1;
    }

    const existingFailure = this.failures.find((failure) => failure.code === code);

    if (existingFailure) {
      existingFailure.count += 1;
      existingFailure.lastAtSeconds = round(this.elapsedSeconds, 2);
      return;
    }

    this.failures.push({
      code,
      summary,
      severity,
      firstAtSeconds: round(this.elapsedSeconds, 2),
      lastAtSeconds: round(this.elapsedSeconds, 2),
      count: 1,
    });
  }

  finish(reason) {
    const falseCompletion = this.detectFalseCompletionBeforeFinish(reason);
    const finalReason = falseCompletion ? 'false-starter-completion' : reason;

    this.status = finalReason === 'completed' ? 'completed' : 'failed';
    this.adapter.end?.({
      reason: finalReason,
    });
    this.completedAtSeconds = this.elapsedSeconds;
    this.telemetrySystem.recordGameplayEvent('auto-test-complete', {
      mode: this.mode.id,
      duration: this.elapsedSeconds,
      failures: this.failures.length,
      reason: finalReason,
    });
    const telemetryAfterComplete = this.telemetrySystem.getSnapshot();

    this.postCompletionBaseline = {
      deaths: Number(telemetryAfterComplete.counts?.deaths ?? 0),
      gameplayEvents: Number(telemetryAfterComplete.counts?.gameplayEvents ?? 0),
    };

    const runtimeSnapshot = {
      ...this.adapter.getRuntimeSnapshot?.(),
      simulation: this.getSnapshot(),
    };
    const report = this.reportSystem.createReport({
      runtimeSnapshot,
      trigger: REPORT_TRIGGER,
    });

    let simulationResult = this.getSnapshot();
    const updatedMemorySnapshot = this.aiMemorySystem?.recordSimulation?.({
      simulationSnapshot: simulationResult,
      report,
    }) ?? this.aiMemorySnapshot;

    if (updatedMemorySnapshot) {
      this.aiMemorySnapshot = updatedMemorySnapshot;
      this.adapter.setAiMemorySnapshot?.(updatedMemorySnapshot);
      this.goalPlanner.setAiMemorySnapshot?.(updatedMemorySnapshot);
      simulationResult.aiMemory = updatedMemorySnapshot;
      simulationResult.memorySnapshot = updatedMemorySnapshot;
      simulationResult.learnedKnowledge = updatedMemorySnapshot.learnedKnowledge ?? [];
      simulationResult.newKnowledge = updatedMemorySnapshot.newKnowledge ?? [];
      simulationResult.learnedLessons = updatedMemorySnapshot.learnedLessons ?? [];
      simulationResult.strategyChanges = updatedMemorySnapshot.strategyChanges ?? [];
      simulationResult.biomeRatings = updatedMemorySnapshot.biomeRatings ?? {};
      simulationResult.memoryPersistenceSource = updatedMemorySnapshot.memoryPersistenceSource ?? 'unknown';
      simulationResult.memoryLoadRunCount = Number(updatedMemorySnapshot.memoryLoadRunCount ?? updatedMemorySnapshot.runs ?? 0);
      simulationResult.memorySaveRunCount = Number(updatedMemorySnapshot.memorySaveRunCount ?? updatedMemorySnapshot.runs ?? 0);
    }

    simulationResult = this.getSnapshot();
    this.persistBrowserNeuralChampionIfNeeded(simulationResult);
    const finalRuntimeSnapshot = {
      ...this.adapter.getRuntimeSnapshot?.(),
      aiMemory: simulationResult.aiMemory,
      simulation: simulationResult,
    };

    this.reportSystem.updateReportRuntime?.(report, finalRuntimeSnapshot);
    this.lastSimulationSnapshot = simulationResult;

    this.lastReport = {
      ...report,
      issues: report.issues.map((issue) => ({ ...issue })),
      aiTasks: report.aiTasks.map((task) => ({ ...task })),
      simulationResult,
      lastSimulationSnapshot: simulationResult,
    };
    this.reportSystem.lastReport = this.lastReport;
    this.reportSystem.persistReport?.(this.lastReport);
    this.lastResult = {
      reason: finalReason,
      reportId: report.id,
      finishedAt: new Date().toISOString(),
    };

    return this.lastReport;
  }

  getSnapshot() {
    const progress = this.mode.durationSeconds > 0
      ? Math.min(1, this.elapsedSeconds / this.mode.durationSeconds)
      : 0;

    const plannerSnapshot = this.goalPlanner.getSnapshot();
    const inventorySnapshot = this.inventorySnapshot ?? this.goalPlanner.getInventorySnapshot();
    const resourceScanResults = this.resourceScanResults ?? this.adapter.getResourceScanSnapshot?.() ?? null;
    const shelterValidation = this.shelterValidation ?? this.adapter.getShelterValidationSnapshot?.() ?? null;
    const blockedGoals = createBlockedGoalsSnapshot(plannerSnapshot);

    return {
      status: this.status,
      mode: {
        id: this.mode.id,
        label: this.mode.label,
        durationSeconds: this.mode.durationSeconds,
      },
      elapsedSeconds: round(this.elapsedSeconds, 2),
      remainingSeconds: round(Math.max(0, this.mode.durationSeconds - this.elapsedSeconds), 2),
      progress,
      startingInventoryProfile: this.startingInventoryProfileId,
      actualEquippedTool: this.goalPlanner.lastContext?.world?.equippedTool ?? 'hand',
      furnaceRecipeFound: Boolean(this.furnaceCraftDiagnostics.furnaceRecipeFound),
      furnaceRecipeRequirements: this.furnaceCraftDiagnostics.furnaceRecipeRequirements ?? [],
      furnaceCraftAttemptRequirements: this.furnaceCraftDiagnostics.furnaceCraftAttemptRequirements ?? [],
      furnaceCraftBlockReason: this.furnaceCraftDiagnostics.furnaceCraftBlockReason ?? null,
      actionCounts: { ...this.actionCounts },
      failureCounts: { ...this.failureCounts },
      failures: this.failures.map((failure) => ({ ...failure })),
      inventory: inventorySnapshot,
      inventorySnapshot,
      initialInventory: { ...(inventorySnapshot.initial ?? {}) },
      currentInventory: { ...(inventorySnapshot.current ?? {}) },
      inventoryDelta: { ...(inventorySnapshot.delta ?? {}) },
      resourceDeltas: { ...(inventorySnapshot.delta ?? {}) },
      crafting: {
        craftedItems: this.craftedItems.map((craftedItem) => ({ ...craftedItem })),
        failedCrafts: this.failedCrafts.map((failedCraft) => ({ ...failedCraft })),
      },
      craftedItems: this.craftedItems.map((craftedItem) => ({ ...craftedItem })),
      failedCrafts: this.failedCrafts.map((failedCraft) => ({ ...failedCraft })),
      failedActions: this.failedActions.map((failedAction) => ({ ...failedAction })),
      recoveryActions: this.recoveryActions.map((recoveryAction) => ({ ...recoveryAction })),
      neuralAgent: this.getNeuralSnapshot(),
      resourceScanResults,
      biomeStats: this.adapter.getBiomeStatsSnapshot?.() ?? null,
      discoveredStructures: this.adapter.getDiscoveredStructuresSnapshot?.() ?? [],
      storage: this.adapter.getStorageSnapshot?.() ?? null,
      base: this.adapter.getBaseSnapshot?.() ?? null,
      aiMemory: this.aiMemorySnapshot,
      memorySnapshot: this.aiMemorySnapshot,
      memoryPersistenceSource: this.aiMemorySnapshot?.memoryPersistenceSource ?? 'unknown',
      memoryLoadRunCount: Number(this.aiMemorySnapshot?.memoryLoadRunCount ?? this.aiMemorySnapshot?.runs ?? 0),
      memorySaveRunCount: Number(this.aiMemorySnapshot?.memorySaveRunCount ?? this.aiMemorySnapshot?.runs ?? 0),
      learnedKnowledge: this.aiMemorySnapshot?.learnedKnowledge ?? [],
      newKnowledge: this.aiMemorySnapshot?.newKnowledge ?? [],
      learnedLessons: this.aiMemorySnapshot?.learnedLessons ?? [],
      strategyChanges: this.aiMemorySnapshot?.strategyChanges ?? [],
      biomeRatings: this.aiMemorySnapshot?.biomeRatings ?? {},
      deathPosition: this.deathPosition ? { ...this.deathPosition } : null,
      terrainDeathContext: this.terrainDeathContext ? { ...this.terrainDeathContext } : null,
      terrainSafety: this.terrainSafety ? { ...this.terrainSafety } : null,
      playerSafety: this.playerSafety ? { ...this.playerSafety } : null,
      cameraVoidDetected: this.cameraVoidDetected,
      playerLostRecoveryCount: this.playerLostRecoveryCount,
      lastSafePosition: this.lastSafePosition ? { ...this.lastSafePosition } : null,
      recoveryTeleportUsed: this.recoveryTeleportUsed,
      recoverySuccess: this.recoverySuccess,
      recoveryState: this.recoveryState,
      lastRecoveryState: this.lastRecoveryState,
      recoveryCycleId: this.recoveryCycleId,
      recoveryPauseStartedAt: this.recoveryPauseStartedAt === null ? null : round(this.recoveryPauseStartedAt, 2),
      recoveryPauseEndsAt: this.recoveryPauseEndsAt === null ? null : round(this.recoveryPauseEndsAt, 2),
      recoveryPauseEventEmitted: this.recoveryPauseEventEmitted,
      recoveryResumeEventEmitted: this.recoveryResumeEventEmitted,
      recoveryPauseSpamCount: this.recoveryPauseSpamCount,
      recoveryLoopDetected: this.recoveryLoopDetected,
      recoveryLoopCycles: this.recoveryLoopCycles,
      hardRecoveryCount: this.hardRecoveryCount,
      lastFailedGoal: this.lastFailedGoal,
      lastFailedAction: this.lastFailedAction,
      failedTargetPosition: this.failedTargetPosition ? { ...this.failedTargetPosition } : null,
      blacklistedTargets: this.blacklistedTargets.map((target) => ({ ...target })),
      emergencyTeleportUsed: this.emergencyTeleportUsed,
      falseCompletionDetected: this.falseCompletionDetected,
      earlyAbortReason: this.earlyAbortReason,
      postCompletionEventsDetected: this.postCompletionEventsDetected,
      postCompletionDeaths: this.postCompletionDeaths,
      woodProgressBy90s: this.woodProgressBy90s ? { ...this.woodProgressBy90s } : null,
      craftPlanksBlockedByMissingWood: this.craftPlanksBlockedByMissingWood,
      hardRecoveryMisuseDetected: this.hardRecoveryMisuseDetected,
      skyOnlyFrames: this.skyOnlyFrames,
      gatherWoodBlockedReason: this.gatherWoodBlockedReason,
      survivalRecoveryActions: this.survivalRecoveryActions.map((action) => ({ ...action })),
      foodSearchActions: this.foodSearchActions.map((action) => ({ ...action })),
      blockedPlacementReasons: this.blockedPlacementReasons.map((reason) => ({ ...reason })),
      woodTargetsFound: resourceScanResults?.woodTargetsFound ?? 0,
      woodTargetsRejected: resourceScanResults?.woodTargetsRejected ?? 0,
      rejectedLeafTargets: resourceScanResults?.rejectedLeafTargets ?? 0,
      shelterValidation,
      validShelterBlocksPlaced: shelterValidation?.validShelterBlocksPlaced ?? 0,
      invalidShelterBlocksRejected: shelterValidation?.invalidShelterBlocksRejected ?? 0,
      blockedGoals,
      goalTransitions: (plannerSnapshot.goalTransitions ?? []).map((transition) => ({ ...transition })),
      planner: plannerSnapshot,
      lastResult: this.lastResult ? { ...this.lastResult } : null,
    };
  }

  getNeuralSnapshot() {
    const actionScores = this.neuralLastDecision?.actionScores ?? {};

    return {
      enabled: this.neuralAgentEnabled,
      generation: this.neuralGenome?.generation ?? 0,
      championFitness: Number(this.neuralGenome?.fitness ?? 0),
      currentFitness: round(this.neuralFitness, 2),
      populationSize: Number(this.neuralTrainingMetadata?.populationSize ?? 0),
      mutationRate: Number(this.neuralGenome?.mutationRate ?? 0.08),
      selectedAction: this.neuralLastDecision?.selectedAction ?? null,
      actionScores: { ...actionScores },
      sensorSnapshot: this.neuralLastSensorSnapshot
        ? {
          names: [...this.neuralLastSensorSnapshot.names],
          values: { ...this.neuralLastSensorSnapshot.values },
          nearestTarget: this.neuralLastSensorSnapshot.nearestTarget ? { ...this.neuralLastSensorSnapshot.nearestTarget } : null,
        }
        : null,
      neuralDecisionReason: this.neuralLastDecision?.neuralDecisionReason ?? null,
      neuralTrainingMode: this.neuralTrainingMode,
      lastRewardReason: this.neuralLastRewardReason ?? null,
    };
  }

  loadBrowserNeuralChampion() {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const rawValue = localStorage.getItem(AI_NEURAL_CHAMPION_STORAGE_KEY);
      const parsed = rawValue ? JSON.parse(rawValue) : null;
      const champion = parsed?.champion ?? parsed;

      return champion ? NeuralGenome.deserialize(champion) : null;
    } catch {
      return null;
    }
  }

  persistBrowserNeuralChampionIfNeeded(simulationSnapshot) {
    if (!this.neuralAgentEnabled || !this.neuralGenome || typeof localStorage === 'undefined') {
      return false;
    }

    const currentFitness = Number(simulationSnapshot.neuralAgent?.currentFitness ?? this.neuralFitness ?? 0);

    try {
      const rawValue = localStorage.getItem(AI_NEURAL_CHAMPION_STORAGE_KEY);
      const existing = rawValue ? JSON.parse(rawValue) : null;
      const existingFitness = Number(existing?.fitness ?? existing?.champion?.fitness ?? Number.NEGATIVE_INFINITY);

      if (currentFitness < existingFitness) {
        return false;
      }

      const champion = this.neuralGenome.clone({
        id: this.neuralGenome.id,
        generation: Number(simulationSnapshot.neuralAgent?.generation ?? this.neuralGenome.generation ?? 0),
      }).withFitness(currentFitness, {
        status: simulationSnapshot.status,
        elapsedSeconds: simulationSnapshot.elapsedSeconds,
        progressionTierReached: simulationSnapshot.planner?.progressionTierReached ?? 'starter',
        bestGoalReached: simulationSnapshot.planner?.goalsCompleted?.at(-1)?.id ?? 'none',
        completedGoalCount: simulationSnapshot.planner?.goalsCompleted?.length ?? 0,
        woodCollected: Number(simulationSnapshot.currentInventory?.wood ?? 0),
        recoveryCount: Number(simulationSnapshot.hardRecoveryCount ?? 0),
      });

      localStorage.setItem(AI_NEURAL_CHAMPION_STORAGE_KEY, JSON.stringify({
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        generation: champion.generation,
        fitness: champion.fitness,
        mutationRate: champion.mutationRate,
        source: 'browser-autonomous-playtest',
        bestRunSummary: champion.summary,
        champion: champion.serialize(),
      }));

      return true;
    } catch {
      return false;
    }
  }
}

function createActionTimers() {
  return {
    saveLoad: 12,
  };
}

function createActionLoopState(key = null, progress = 0) {
  return {
    key,
    count: 1,
    progress,
    reported: false,
  };
}

function createActionCooldowns() {
  return Object.fromEntries(Object.keys(ACTION_COOLDOWN_SECONDS).map((actionName) => [actionName, 0]));
}

function createEmptyFurnaceCraftDiagnostics() {
  return {
    furnaceRecipeFound: false,
    furnaceRecipeRequirements: [],
    furnaceCraftAttemptRequirements: [],
    furnaceCraftBlockReason: null,
  };
}

function createActionCounts() {
  return {
    explore: 0,
    mine: 0,
    place: 0,
    collect: 0,
    craft: 0,
    combat: 0,
    survive: 0,
    saveLoad: 0,
  };
}

function mapPlanActionToAction(planAction) {
  if (planAction === 'gatherWood' || planAction === 'gatherStone' || planAction === 'gatherOre' || planAction === 'gatherFuel') {
    return 'mine';
  }

  if (
    planAction === 'craftPlanks' ||
    planAction === 'craftTools' ||
    planAction === 'craftWoodenPickaxe' ||
    planAction === 'obtainFurnace' ||
    planAction === 'smeltOre' ||
    planAction === 'upgradeEquipment' ||
    planAction === 'createStorage'
  ) {
    return 'craft';
  }

  if (
    planAction === 'buildShelter' ||
    planAction === 'buildBaseTier1' ||
    planAction === 'buildBaseTier2' ||
    planAction === 'buildPermanentBase'
  ) {
    return 'place';
  }

  if (planAction === 'gatherFood' || planAction === 'buildStorage' || planAction === 'maintainStorageReserves') {
    return 'collect';
  }

  if (planAction === 'surviveNight') {
    return 'survive';
  }

  if (planAction === 'fightHostile') {
    return 'combat';
  }

  if (
    planAction === 'navigate' ||
    planAction === 'exploreWorld' ||
    planAction === 'discoverNewBiome' ||
    planAction === 'discoverStructure'
  ) {
    return 'explore';
  }

  return planAction;
}

function resolveSurvivalRecoveryIntent({
  context,
  plan,
  terrainSafety = null,
  terrainDeathContext = null,
}) {
  const health = Number(context.survival?.health ?? 100);
  const hunger = Number(context.survival?.hunger ?? 100);
  const food = Number(context.inventory?.food ?? 0) + Number(context.inventory?.berries ?? 0);
  const isExploration = isExplorationPlan(plan);

  if (
    isExploration &&
    (
      terrainSafety?.fallRisk ||
      terrainSafety?.steepSlope ||
      terrainSafety?.currentlyBlacklisted ||
      terrainDeathContext
    )
  ) {
    return {
      type: 'avoid-risky-terrain',
      reason: terrainSafety?.reason ?? terrainDeathContext?.summary ?? 'Exploration path is near risky terrain.',
    };
  }

  if (health < 40) {
    return {
      type: 'return-to-base',
      reason: `Health is ${Math.round(health)}, below the return-to-base threshold.`,
    };
  }

  if (health < 50 && isExploration) {
    return {
      type: 'hold-low-health',
      reason: `Health is ${Math.round(health)}, so exploration should pause until recovery.`,
    };
  }

  if (hunger < 50 && food > 0) {
    return {
      type: 'eat-food',
      reason: `Hunger is ${Math.round(hunger)} and food is available.`,
    };
  }

  if (hunger < 40) {
    return {
      type: 'search-food',
      reason: `Hunger is ${Math.round(hunger)}, below the food search threshold.`,
    };
  }

  return null;
}

function resolveRecoveryPauseIntent(context = {}) {
  const health = Number(context.survival?.health ?? 100);
  const hunger = Number(context.survival?.hunger ?? 100);
  const food = Number(context.inventory?.food ?? 0) + Number(context.inventory?.berries ?? 0);

  if (hunger < 50 && food > 0) {
    return {
      type: 'eat-food',
      reason: `Recovery pause eating because hunger is ${Math.round(hunger)}.`,
    };
  }

  if (hunger < 40) {
    return {
      type: 'search-food',
      reason: `Recovery pause food search because hunger is ${Math.round(hunger)}.`,
    };
  }

  if (health < 55) {
    return {
      type: 'hold-low-health',
      reason: `Recovery pause resting because health is ${Math.round(health)}.`,
    };
  }

  return null;
}

function resolveVoidRecoveryReason({ playerSafety, skyOnlySeconds, ungroundedSeconds }) {
  if (playerSafety.isBelowTerrain) {
    return playerSafety.reason ?? 'Player Y is below terrain surface.';
  }

  if (skyOnlySeconds > SKY_ONLY_SECONDS_THRESHOLD) {
    return `Camera saw only sky/void for ${skyOnlySeconds.toFixed(1)} seconds.`;
  }

  if (ungroundedSeconds > UNGROUNDED_SECONDS_THRESHOLD) {
    return `Player stayed ungrounded for ${ungroundedSeconds.toFixed(1)} seconds outside normal jump/fall movement.`;
  }

  if (playerSafety.distanceFromSafePointAbnormal) {
    return playerSafety.reason ?? 'Player is abnormally far from valid terrain or base.';
  }

  return null;
}

function createForcedRecoveryPlan({ plan = {}, reason, mode }) {
  if (mode === 'exploreForStone') {
    return {
      goalId: 'exploreForStone',
      goalName: 'Explore For Stone',
      priority: plan.priority ?? 70,
      action: 'exploreWorld',
      subgoal: 'Move away from the failed stone target and search for a safer stone route.',
      reason: `Hard recovery invalidated ${plan.goalName ?? 'the current goal'}: ${reason}`,
      target: 'Find a safe stone approach',
      remainingSteps: 4,
    };
  }

  return {
    goalId: 'safeMaintainSurvival',
    goalName: 'Safe Maintain Survival',
    priority: 1,
    action: 'surviveNight',
    subgoal: 'Pause progression and validate safe survival state before resuming goals.',
    reason: `Recovery loop protection paused progression: ${reason}`,
    target: 'Stable grounded safety',
    remainingSteps: 2,
  };
}

function isPlayerSafetySafe(playerSafety = null) {
  return Boolean(
    playerSafety &&
    playerSafety.isGrounded &&
    playerSafety.visibleTerrainExists &&
    !playerSafety.cameraSkyOnly &&
    !playerSafety.isBelowTerrain &&
    !playerSafety.distanceFromSafePointAbnormal
  );
}

function isExplorationPlan(plan = {}) {
  return [
    'navigate',
    'exploreWorld',
    'discoverNewBiome',
    'discoverStructure',
  ].includes(plan.action) || [
    'continueExploration',
    'exploreWorld',
    'discoverNewBiome',
    'discoverStructure',
  ].includes(plan.goalId);
}

function hasValidMiningTool(context) {
  return Number(context.inventory?.pickaxes ?? 0) > 0;
}

function createFailureCounts() {
  return {
    stuckEvents: 0,
    collisionIssues: 0,
    deathLoops: 0,
    consoleErrors: 0,
    saveLoadErrors: 0,
    miningSpam: 0,
  };
}

function diffInventory(beforeInventory = {}, afterInventory = {}) {
  return Object.fromEntries(
    Object.keys({
      ...beforeInventory,
      ...afterInventory,
    }).map((key) => [
      key,
      Number(afterInventory?.[key] ?? 0) - Number(beforeInventory?.[key] ?? 0),
    ]),
  );
}

function hasInventoryChange(inventoryDelta) {
  return Object.values(inventoryDelta).some((value) => Number(value) !== 0);
}

function getPositiveDeltaTotal(inventoryDelta) {
  return Object.values(inventoryDelta).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
}

function createBlockedGoalsSnapshot(plannerSnapshot = {}) {
  const blockedGoals = [];

  for (const bottleneck of plannerSnapshot.bottlenecks ?? []) {
    blockedGoals.push({
      goalId: bottleneck.goalId,
      goalName: bottleneck.goalName,
      code: bottleneck.code,
      reason: bottleneck.summary,
      count: bottleneck.count,
      lastAtSeconds: bottleneck.lastAtSeconds,
    });
  }

  for (const failedGoal of plannerSnapshot.goalsFailed ?? []) {
    blockedGoals.push({
      goalId: failedGoal.id,
      goalName: failedGoal.label,
      code: `goal-failed:${failedGoal.id}`,
      reason: failedGoal.reason,
      count: 1,
      lastAtSeconds: failedGoal.failedAtSeconds,
    });
  }

  return dedupeBlockedGoals(blockedGoals).slice(0, 24);
}

function dedupeBlockedGoals(blockedGoals) {
  const seen = new Set();
  const deduped = [];

  for (const blockedGoal of blockedGoals) {
    const key = `${blockedGoal.code}:${blockedGoal.goalId}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(blockedGoal);
  }

  return deduped;
}

function getHorizontalDistance(leftPosition, rightPosition) {
  return Math.hypot(
    leftPosition.x - rightPosition.x,
    leftPosition.z - rightPosition.z,
  );
}

function round(value, digits) {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}
