const CROP_TICK_SECONDS = 12;
const MORNING_TIME_OF_DAY = 0.28;

export class WorldSimulationSystem {
  constructor({ savedState = null } = {}) {
    this.sleepRequests = savedState?.sleepRequests ?? 0;
    this.cropPlots = new Map(savedState?.cropPlots ?? []);
    this.elapsedSimulationSeconds = savedState?.elapsedSimulationSeconds ?? 0;
    this.cropTickTimer = savedState?.cropTickTimer ?? CROP_TICK_SECONDS;
    this.lastEvent = savedState?.lastEvent ?? 'World sim ready';
    this.lastPersistentNpcCount = savedState?.lastPersistentNpcCount ?? 0;
    this.eventHooks = [];
    this.snapshot = this.createSnapshot();
  }

  update({ deltaTime, dayNightSystem, entitySystem }) {
    this.elapsedSimulationSeconds += deltaTime;
    this.cropTickTimer -= deltaTime;

    if (this.cropTickTimer <= 0) {
      this.advanceCropGrowth();
      this.cropTickTimer = CROP_TICK_SECONDS;
    }

    this.lastPersistentNpcCount = entitySystem?.getPersistentNpcCount?.() ?? this.lastPersistentNpcCount;
    this.resolveSleepRequests(dayNightSystem);
    this.snapshot = this.createSnapshot();
  }

  requestSleep() {
    this.sleepRequests += 1;
    this.lastEvent = 'Sleep requested';
    this.emitEvent({
      type: 'sleepRequested',
      time: this.elapsedSimulationSeconds,
    });
  }

  resolveSleepRequests(dayNightSystem) {
    if (this.sleepRequests <= 0 || !dayNightSystem) {
      return;
    }

    const dayNightSnapshot = dayNightSystem.getSnapshot();

    if (!dayNightSnapshot.isNight) {
      this.sleepRequests = 0;
      this.lastEvent = 'Sleep skipped: daytime';
      return;
    }

    dayNightSystem.skipToTime(MORNING_TIME_OF_DAY);
    this.sleepRequests = 0;
    this.lastEvent = 'Slept until morning';
    this.emitEvent({
      type: 'daySkipped',
      day: dayNightSystem.getSnapshot().day,
      timeOfDay: MORNING_TIME_OF_DAY,
    });
  }

  registerCropPlot({ id, cropId, growthStage = 0, maxGrowthStage = 4 }) {
    this.cropPlots.set(id, {
      id,
      cropId,
      growthStage,
      maxGrowthStage,
      updatedAt: this.elapsedSimulationSeconds,
    });
    this.lastEvent = `Crop registered ${cropId}`;
  }

  advanceCropGrowth() {
    if (this.cropPlots.size === 0) {
      return;
    }

    for (const cropPlot of this.cropPlots.values()) {
      cropPlot.growthStage = Math.min(cropPlot.maxGrowthStage, cropPlot.growthStage + 1);
      cropPlot.updatedAt = this.elapsedSimulationSeconds;
    }

    this.lastEvent = `Crops ticked ${this.cropPlots.size}`;
    this.emitEvent({
      type: 'cropGrowthTick',
      cropPlots: this.cropPlots.size,
    });
  }

  onEvent(listener) {
    this.eventHooks.push(listener);

    return () => {
      this.eventHooks = this.eventHooks.filter((candidateListener) => candidateListener !== listener);
    };
  }

  emitEvent(event) {
    for (const listener of this.eventHooks) {
      listener(event);
    }
  }

  getPersistenceState() {
    return {
      sleepRequests: this.sleepRequests,
      cropPlots: [...this.cropPlots.entries()],
      elapsedSimulationSeconds: this.elapsedSimulationSeconds,
      cropTickTimer: this.cropTickTimer,
      lastEvent: this.lastEvent,
      lastPersistentNpcCount: this.lastPersistentNpcCount,
    };
  }

  createSnapshot() {
    const activeSimulations = [
      this.sleepRequests > 0 ? 'sleep' : null,
      this.cropPlots.size > 0 ? 'crops' : null,
      this.lastPersistentNpcCount > 0 ? 'npc-state' : null,
    ].filter(Boolean);

    return {
      activeSimulations,
      activeSimulationCount: activeSimulations.length,
      sleepRequests: this.sleepRequests,
      cropPlots: this.cropPlots.size,
      cropTickSeconds: Math.max(0, this.cropTickTimer),
      persistentNpcStates: this.lastPersistentNpcCount,
      lastEvent: this.lastEvent,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}
