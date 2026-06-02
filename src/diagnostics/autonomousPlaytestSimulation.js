import { resolvePlaytestMode } from './playtestSimulationModes.js';
import { SurvivalGoalPlanner } from './survivalGoalPlanner.js';
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
    aiMemorySystem = null,
    recordFrames = true,
    advanceClock = null,
  }) {
    this.adapter = adapter;
    this.telemetrySystem = telemetrySystem;
    this.reportSystem = reportSystem;
    this.aiMemorySystem = aiMemorySystem;
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
    this.inventorySnapshot = null;
    this.resourceScanResults = null;
    this.shelterValidation = null;
    this.furnaceCraftDiagnostics = createEmptyFurnaceCraftDiagnostics();
    this.obtainFurnaceBlockedAttempts = 0;
    this.miningSpamReported = false;
    this.aiMemorySnapshot = aiMemorySystem?.getSnapshot?.() ?? null;
  }

  start({ modeId = 'quick', durationSeconds = null, inventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID } = {}) {
    if (this.status === 'running') {
      return {
        ok: false,
        message: 'Autonomous playtest already running.',
        snapshot: this.getSnapshot(),
      };
    }

    this.mode = resolvePlaytestMode(modeId, { durationSeconds });
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
    this.inventorySnapshot = null;
    this.resourceScanResults = null;
    this.shelterValidation = null;
    this.furnaceCraftDiagnostics = createEmptyFurnaceCraftDiagnostics();
    this.obtainFurnaceBlockedAttempts = 0;
    this.miningSpamReported = false;
    this.aiMemorySnapshot = this.aiMemorySystem?.getSnapshot?.() ?? this.aiMemorySnapshot;
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

  runToCompletion({
    modeId = 'quick',
    durationSeconds = null,
    deltaTime = DEFAULT_STEP_SECONDS,
    inventoryProfileId = DEFAULT_AUTONOMOUS_INVENTORY_PROFILE_ID,
  } = {}) {
    const startResult = this.start({ modeId, durationSeconds, inventoryProfileId });

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

    const rawContext = this.adapter.getPlanningState?.({
      elapsedSeconds: this.elapsedSeconds,
      mode: this.mode,
    }) ?? {};
    const context = {
      ...rawContext,
      memory: this.aiMemorySnapshot?.strategyHints ?? null,
    };
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
    this.updateInventorySnapshot(nextContext);
    this.updateResourceScanSnapshot(result);
    this.updateShelterValidationSnapshot(result);
    this.updateFurnaceCraftDiagnostics(plan, result);
    this.updateObtainFurnaceBlockedAttempts(plan, result);
    this.recordResultFailedActions(plan, actionName, result);
    this.recordRecoveryAction(plan, result);

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
      simulationResult.newKnowledge = updatedMemorySnapshot.newKnowledge ?? [];
      simulationResult.learnedLessons = updatedMemorySnapshot.learnedLessons ?? [];
      simulationResult.strategyChanges = updatedMemorySnapshot.strategyChanges ?? [];
      simulationResult.biomeRatings = updatedMemorySnapshot.biomeRatings ?? {};
      if (report.runtimeStats?.simulation) {
        report.runtimeStats.simulation.aiMemory = updatedMemorySnapshot;
        report.runtimeStats.simulation.memorySnapshot = updatedMemorySnapshot;
        report.runtimeStats.simulation.learnedKnowledge = updatedMemorySnapshot.learnedKnowledge ?? [];
        report.runtimeStats.simulation.newKnowledge = updatedMemorySnapshot.newKnowledge ?? [];
        report.runtimeStats.simulation.learnedLessons = updatedMemorySnapshot.learnedLessons ?? [];
        report.runtimeStats.simulation.strategyChanges = updatedMemorySnapshot.strategyChanges ?? [];
        report.runtimeStats.simulation.biomeRatings = updatedMemorySnapshot.biomeRatings ?? {};
      }
    }

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
      resourceScanResults,
      biomeStats: this.adapter.getBiomeStatsSnapshot?.() ?? null,
      discoveredStructures: this.adapter.getDiscoveredStructuresSnapshot?.() ?? [],
      storage: this.adapter.getStorageSnapshot?.() ?? null,
      base: this.adapter.getBaseSnapshot?.() ?? null,
      aiMemory: this.aiMemorySnapshot,
      memorySnapshot: this.aiMemorySnapshot,
      learnedKnowledge: this.aiMemorySnapshot?.learnedKnowledge ?? [],
      newKnowledge: this.aiMemorySnapshot?.newKnowledge ?? [],
      learnedLessons: this.aiMemorySnapshot?.learnedLessons ?? [],
      strategyChanges: this.aiMemorySnapshot?.strategyChanges ?? [],
      biomeRatings: this.aiMemorySnapshot?.biomeRatings ?? {},
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
