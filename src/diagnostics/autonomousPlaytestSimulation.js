import { resolvePlaytestMode } from './playtestSimulationModes.js';

const DEFAULT_STEP_SECONDS = 0.25;
const POSITION_SAMPLE_SECONDS = 5;
const STUCK_WINDOW_SECONDS = 15;
const STUCK_DISTANCE_THRESHOLD = 0.8;
const VERTICAL_SNAP_THRESHOLD = 4.75;
const REPORT_TRIGGER = 'autonomous-playtest';

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
    this.performAction('explore', () => this.adapter.explore?.({
      deltaTime,
      elapsedSeconds: this.elapsedSeconds,
      mode: this.mode,
    }));

    this.updateTimedAction('mine', deltaTime, 4, () => this.adapter.mineBlock?.({
      elapsedSeconds: this.elapsedSeconds,
    }));
    this.updateTimedAction('place', deltaTime, 7, () => this.adapter.placeBlock?.({
      elapsedSeconds: this.elapsedSeconds,
    }));
    this.updateTimedAction('collect', deltaTime, 5, () => this.adapter.collectDrops?.());
    this.updateTimedAction('craft', deltaTime, 11, () => this.adapter.craftBasicItem?.());
    this.updateTimedAction('combat', deltaTime, 9, () => this.adapter.fightHostile?.({
      elapsedSeconds: this.elapsedSeconds,
    }));
    this.updateTimedAction('survive', deltaTime, 6, () => this.adapter.survive?.());
    this.updateTimedAction('saveLoad', deltaTime, 20, () => this.adapter.checkSaveLoad?.());
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
      this.actionCounts[actionName] += Number(result.count ?? 1);
      this.telemetrySystem.recordGameplayEvent(`auto-${actionName}`, {
        result: result.event ?? 'ok',
        count: result.count ?? 1,
      });
    }

    for (const failure of result.failures ?? []) {
      this.recordFailure(failure.code, failure.summary, failure.severity);
    }

    return result;
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

    this.lastReport = {
      ...report,
      simulationResult: this.getSnapshot(),
    };
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
      lastResult: this.lastResult ? { ...this.lastResult } : null,
    };
  }
}

function createActionTimers() {
  return {
    mine: 3.2,
    place: 5.8,
    collect: 2.5,
    craft: 8,
    combat: 6,
    survive: 0,
    saveLoad: 12,
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

function createFailureCounts() {
  return {
    stuckEvents: 0,
    collisionIssues: 0,
    deathLoops: 0,
    consoleErrors: 0,
    saveLoadErrors: 0,
  };
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
