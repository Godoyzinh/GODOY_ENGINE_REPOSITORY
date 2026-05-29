import { resolvePlaytestMode } from './playtestSimulationModes.js';
import { SurvivalGoalPlanner } from './survivalGoalPlanner.js';

const DEFAULT_STEP_SECONDS = 0.25;
const POSITION_SAMPLE_SECONDS = 5;
const STUCK_WINDOW_SECONDS = 15;
const STUCK_DISTANCE_THRESHOLD = 0.8;
const VERTICAL_SNAP_THRESHOLD = 4.75;
const MINING_SPAM_PER_MINUTE_THRESHOLD = 120;
const REPORT_TRIGGER = 'autonomous-playtest';
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
    recordFrames = true,
    advanceClock = null,
  }) {
    this.adapter = adapter;
    this.telemetrySystem = telemetrySystem;
    this.reportSystem = reportSystem;
    this.recordFrames = recordFrames;
    this.advanceClock = advanceClock;
    this.status = 'idle';
    this.mode = resolvePlaytestMode('quick');
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
    this.inventorySnapshot = null;
    this.miningSpamReported = false;
  }

  start({ modeId = 'quick', durationSeconds = null } = {}) {
    if (this.status === 'running') {
      return {
        ok: false,
        message: 'Autonomous playtest already running.',
        snapshot: this.getSnapshot(),
      };
    }

    this.mode = resolvePlaytestMode(modeId, { durationSeconds });
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
    this.inventorySnapshot = null;
    this.miningSpamReported = false;
    this.status = 'running';
    this.telemetrySystem.recordGameplayEvent('auto-test-start', {
      mode: this.mode.id,
      duration: this.mode.durationSeconds,
    });
    this.adapter.begin?.({
      mode: this.mode,
    });

    return {
      ok: true,
      message: `${this.mode.label} started.`,
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
    this.updateActions(safeDeltaTime);
    this.detectFailures();

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

  runToCompletion({ modeId = 'quick', durationSeconds = null, deltaTime = DEFAULT_STEP_SECONDS } = {}) {
    const startResult = this.start({ modeId, durationSeconds });

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

    const context = this.adapter.getPlanningState?.({
      elapsedSeconds: this.elapsedSeconds,
      mode: this.mode,
    }) ?? {};
    const plan = this.goalPlanner.update({
      deltaTime,
      elapsedSeconds: this.elapsedSeconds,
      context,
    });

    if (plan.action !== 'blocked') {
      this.performPlannedAction(plan, context, deltaTime);
    }

    this.updateTimedAction('saveLoad', deltaTime, 20, () => this.adapter.checkSaveLoad?.());
  }

  performPlannedAction(plan, context, deltaTime) {
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
    }) ?? { ok: false, skipped: true };
    const nextContext = this.adapter.getPlanningState?.({
      elapsedSeconds: this.elapsedSeconds,
      mode: this.mode,
    }) ?? context;
    const result = this.validatePlannedResult({
      plan,
      actionName,
      result: rawResult,
      beforeContext: context,
      afterContext: nextContext,
    });

    this.detectActionLoop(plan);
    this.updateInventorySnapshot(nextContext);

    if (!result.ok) {
      this.recordFailedAction({
        plan,
        actionName,
        result,
      });
    }

    this.performAction(actionName, () => result);
    this.setActionCooldown(actionName);

    this.goalPlanner.recordStepResult({
      plan,
      result,
      elapsedSeconds: this.elapsedSeconds,
    });
    this.telemetrySystem.recordGameplayEvent('auto-goal-step', {
      goal: plan.goalId,
      action: plan.action,
      result: result.ok ? 'ok' : 'blocked',
    });
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

    return result;
  }

  detectActionLoop(plan) {
    const actionKey = `${plan.goalId}:${plan.action}`;

    if (plan.goalId === 'maintainSurvival') {
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

  updateInventorySnapshot(context) {
    const progressContext = this.goalPlanner.createProgressContext(context);

    this.inventorySnapshot = this.goalPlanner.getInventorySnapshot(progressContext);
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

    if (telemetrySnapshot.counts.deaths >= 2) {
      this.recordFailure('death-loop', 'Multiple deaths occurred during one autonomous playtest.', 'medium');
      this.failureCounts.deathLoops = Math.max(this.failureCounts.deathLoops, 1);
    }

    this.detectMiningSpam();
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
    this.status = reason === 'completed' ? 'completed' : 'failed';
    this.adapter.end?.({
      reason,
    });
    this.telemetrySystem.recordGameplayEvent('auto-test-complete', {
      mode: this.mode.id,
      duration: this.elapsedSeconds,
      failures: this.failures.length,
      reason,
    });

    const runtimeSnapshot = {
      ...this.adapter.getRuntimeSnapshot?.(),
      simulation: this.getSnapshot(),
    };
    const report = this.reportSystem.createReport({
      runtimeSnapshot,
      trigger: REPORT_TRIGGER,
    });

    const simulationResult = this.getSnapshot();
    this.lastReport = {
      ...report,
      issues: report.issues.map((issue) => ({ ...issue })),
      aiTasks: report.aiTasks.map((task) => ({ ...task })),
      simulationResult,
    };
    this.reportSystem.lastReport = this.lastReport;
    this.reportSystem.persistReport?.(this.lastReport);
    this.lastResult = {
      reason,
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
      actionCounts: { ...this.actionCounts },
      failureCounts: { ...this.failureCounts },
      failures: this.failures.map((failure) => ({ ...failure })),
      inventory: inventorySnapshot,
      inventorySnapshot,
      resourceDeltas: { ...(inventorySnapshot.delta ?? {}) },
      crafting: {
        craftedItems: this.craftedItems.map((craftedItem) => ({ ...craftedItem })),
        failedCrafts: this.failedCrafts.map((failedCraft) => ({ ...failedCraft })),
      },
      craftedItems: this.craftedItems.map((craftedItem) => ({ ...craftedItem })),
      failedCrafts: this.failedCrafts.map((failedCraft) => ({ ...failedCraft })),
      failedActions: this.failedActions.map((failedAction) => ({ ...failedAction })),
      goalTransitions: (plannerSnapshot.goalTransitions ?? []).map((transition) => ({ ...transition })),
      planner: plannerSnapshot,
      lastResult: this.lastResult ? { ...this.lastResult } : null,
    };
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

  if (planAction === 'craftPlanks' || planAction === 'craftTools' || planAction === 'obtainFurnace' || planAction === 'smeltOre' || planAction === 'upgradeEquipment') {
    return 'craft';
  }

  if (planAction === 'buildShelter') {
    return 'place';
  }

  if (planAction === 'surviveNight') {
    return 'survive';
  }

  if (planAction === 'fightHostile') {
    return 'combat';
  }

  if (planAction === 'navigate') {
    return 'explore';
  }

  return planAction;
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
