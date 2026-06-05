export const AI_MEMORY_STORAGE_KEY = 'godoy:ai-memory:v1';
export const AI_MEMORY_SCHEMA_VERSION = 2;

const MAX_STRATEGIES = 32;
const MAX_KNOWLEDGE = 24;
const MAX_RESOURCE_RECORDS = 16;
const CORE_BIOMES = ['forest', 'mountains', 'desert', 'plains'];

export class AiMemorySystem {
  constructor({
    storage = getLocalStorage(),
    storageKey = AI_MEMORY_STORAGE_KEY,
    persistenceSource = storage ? 'browser:localStorage' : 'memory:none',
    now = () => new Date().toISOString(),
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.persistenceSource = persistenceSource;
    this.now = now;
    this.memoryLoadRunCount = 0;
    this.memorySaveRunCount = 0;
    this.memoryLastLoadStatus = 'not-loaded';
    this.memoryLastSaveStatus = 'not-saved';
    this.memory = this.load();
  }

  load() {
    if (!this.storage) {
      this.memoryLastLoadStatus = 'storage-unavailable';
      return createEmptyMemory(this.now());
    }

    try {
      const parsed = JSON.parse(this.storage.getItem(this.storageKey) ?? 'null');
      const memory = normalizeMemory(parsed, this.now());

      this.memoryLoadRunCount = Number(memory.runs ?? 0);
      this.memoryLastLoadStatus = parsed ? 'loaded' : 'empty';

      return memory;
    } catch {
      this.memoryLoadRunCount = 0;
      this.memoryLastLoadStatus = 'parse-error';
      return createEmptyMemory(this.now());
    }
  }

  save() {
    if (!this.storage) {
      return false;
    }

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.memory, null, 2));
      this.memorySaveRunCount = Number(this.memory.runs ?? 0);
      this.memoryLastSaveStatus = 'saved';
      return true;
    } catch {
      this.memoryLastSaveStatus = 'save-error';
      return false;
    }
  }

  getSnapshot() {
    return {
      ...sanitizeMemorySnapshot(this.memory),
      memoryPersistenceSource: this.persistenceSource,
      memoryLoadRunCount: this.memoryLoadRunCount,
      memorySaveRunCount: this.memorySaveRunCount,
      memoryLastLoadStatus: this.memoryLastLoadStatus,
      memoryLastSaveStatus: this.memoryLastSaveStatus,
    };
  }

  getStrategyHints() {
    return createStrategyHints(this.memory);
  }

  recordSimulation({ simulationSnapshot = {}, report = null } = {}) {
    const now = this.now();
    const planner = simulationSnapshot.planner ?? {};
    const inventoryDelta = simulationSnapshot.resourceDeltas ?? simulationSnapshot.inventoryDelta ?? {};
    const resourceScanResults = simulationSnapshot.resourceScanResults ?? {};
    const biomeStats = simulationSnapshot.biomeStats ?? {};
    const activeBiome = resourceScanResults.biome ?? simulationSnapshot.world?.activeBiome ?? 'Unknown';
    const completedGoals = planner.goalsCompleted ?? [];
    const failedGoals = planner.goalsFailed ?? [];
    const bottlenecks = planner.bottlenecks ?? [];
    const actionCounts = simulationSnapshot.actionCounts ?? {};
    const failureCounts = simulationSnapshot.failureCounts ?? {};
    const failedActions = simulationSnapshot.failedActions ?? [];
    const craftedItems = simulationSnapshot.crafting?.craftedItems ?? simulationSnapshot.craftedItems ?? [];
    const failedCrafts = simulationSnapshot.crafting?.failedCrafts ?? simulationSnapshot.failedCrafts ?? [];
    const shelterValidation = simulationSnapshot.shelterValidation ?? {};
    const discoveredStructures = simulationSnapshot.discoveredStructures ?? [];
    const storageSnapshot = simulationSnapshot.storage ?? {};
    const resourceMemoryDeltas = createResourceMemoryDeltas(inventoryDelta, storageSnapshot);
    const previousSnapshot = this.getSnapshot();

    this.memory.runs += 1;
    this.memory.lastUpdatedAt = now;
    this.memory.lastRun = {
      reportId: report?.id ?? null,
      trigger: report?.trigger ?? 'autonomous-playtest',
      durationSeconds: Number(simulationSnapshot.elapsedSeconds ?? 0),
      progressionTierReached: planner.progressionTierReached ?? 'starter',
      completedGoalCount: completedGoals.length,
      failedGoalCount: failedGoals.length,
      issueCount: report?.issues?.length ?? 0,
      taskCount: report?.aiTasks?.length ?? 0,
    };

    for (const goal of completedGoals) {
      rememberSuccessfulStrategy(this.memory, {
        goalId: goal.id,
        goalName: goal.label,
        strategy: `Completed ${goal.label}`,
        timeSpentSeconds: Number(goal.timeSpentSeconds ?? 0),
        progressionTierReached: planner.progressionTierReached ?? 'starter',
        at: now,
      });
      updateProgressionTime(this.memory, goal.id, goal.label, Number(goal.timeSpentSeconds ?? 0));
    }

    for (const failedGoal of failedGoals) {
      rememberFailedStrategy(this.memory, {
        goalId: failedGoal.id,
        goalName: failedGoal.label,
        strategy: `Failed ${failedGoal.label}`,
        reason: failedGoal.reason ?? 'Goal failed without a detailed reason.',
        timeSpentSeconds: Number(failedGoal.timeSpentSeconds ?? 0),
        at: now,
      });
    }

    for (const bottleneck of bottlenecks) {
      rememberFailedStrategy(this.memory, {
        goalId: bottleneck.goalId,
        goalName: bottleneck.goalName,
        strategy: `Bottleneck in ${bottleneck.goalName}`,
        reason: bottleneck.summary,
        timeSpentSeconds: Number(bottleneck.lastAtSeconds ?? bottleneck.firstAtSeconds ?? 0),
        at: now,
      });
    }

    updateBiomeStatistics(this.memory, {
      biomeStats,
      activeBiome,
      elapsedSeconds: simulationSnapshot.elapsedSeconds,
      resourceScanResults,
      inventoryDelta: resourceMemoryDeltas,
      now,
    });
    updateResourceDiscovery(this.memory, {
      inventoryDelta: resourceMemoryDeltas,
      resourceScanResults,
      activeBiome,
      actionCounts,
      now,
    });
    updateDiscoveredStructures(this.memory, discoveredStructures, now);
    updateDeathCauses(this.memory, simulationSnapshot, report, now);
    updateBlockedActionStatistics(this.memory, failedActions, bottlenecks);
    updateCraftingStatistics(this.memory, craftedItems, failedCrafts);
    updateShelterStatistics(this.memory, shelterValidation, completedGoals, failedGoals);
    updateStorageStatistics(this.memory, storageSnapshot, inventoryDelta);
    updateBiomeRatings(this.memory);
    updateOptimizationSuggestions(this.memory, {
      bottlenecks,
      failedActions,
      failedCrafts,
      failureCounts,
      previousSnapshot,
    });
    updateStrategyChanges(this.memory, previousSnapshot);
    updateLearnedKnowledge(this.memory);
    updateMemoryAliases(this.memory);
    this.save();

    return this.getSnapshot();
  }
}

export function createLocalAiMemorySystem() {
  return new AiMemorySystem({
    storage: getLocalStorage(),
    persistenceSource: 'browser:localStorage',
  });
}

function createEmptyMemory(now) {
  return {
    schemaVersion: AI_MEMORY_SCHEMA_VERSION,
    runs: 0,
    createdAt: now,
    lastUpdatedAt: now,
    lastRun: null,
    strategies: {
      successful: [],
      failed: [],
    },
    successfulStrategies: [],
    failedStrategies: [],
    biomeStatistics: {},
    biomeRatings: createEmptyBiomeRatings(),
    progressionTimes: {},
    resourceDiscoveryMetrics: {},
    resourceEfficiency: {},
    discoveredStructures: {},
    knownStructures: [],
    dangerousBiomes: [],
    deathCauses: {},
    blockedActionStatistics: {},
    craftingStats: {
      successes: 0,
      failures: 0,
      successRate: 1,
      byAction: {},
    },
    shelterStats: {
      attempts: 0,
      successes: 0,
      failures: 0,
      successRate: 1,
    },
    storageStats: {
      placements: 0,
      stores: 0,
      retrieves: 0,
      reserves: {
        wood: 0,
        stone: 0,
        food: 0,
      },
    },
    learnedKnowledge: [],
    newKnowledge: [],
    learnedLessons: [],
    strategyChanges: [],
    optimizationSuggestions: [],
  };
}

function createResourceMemoryDeltas(inventoryDelta = {}, storageSnapshot = {}) {
  const reserves = storageSnapshot.reserves ?? {};
  const memoryDeltas = { ...inventoryDelta };

  for (const [resourceId, reserveCount] of Object.entries({
    wood: reserves.wood,
    stone: reserves.stone,
    food: reserves.food,
  })) {
    memoryDeltas[resourceId] = Math.max(
      Number(memoryDeltas[resourceId] ?? 0),
      Number(reserveCount ?? 0),
    );
  }

  return memoryDeltas;
}

function normalizeMemory(rawMemory, now) {
  if (!rawMemory || typeof rawMemory !== 'object') {
    return createEmptyMemory(now);
  }

  const empty = createEmptyMemory(now);

  return {
    schemaVersion: AI_MEMORY_SCHEMA_VERSION,
    runs: Number(rawMemory.runs ?? 0),
    createdAt: rawMemory.createdAt ?? now,
    lastUpdatedAt: rawMemory.lastUpdatedAt ?? now,
    lastRun: rawMemory.lastRun ?? null,
    bestWoodBiome: rawMemory.bestWoodBiome ?? null,
    bestStoneBiome: rawMemory.bestStoneBiome ?? null,
    averageIronTime: Number(rawMemory.averageIronTime ?? 0),
    strategies: {
      successful: Array.isArray(rawMemory.strategies?.successful)
        ? rawMemory.strategies.successful.slice(-MAX_STRATEGIES)
        : Array.isArray(rawMemory.successfulStrategies)
          ? rawMemory.successfulStrategies.slice(-MAX_STRATEGIES)
        : empty.strategies.successful,
      failed: Array.isArray(rawMemory.strategies?.failed)
        ? rawMemory.strategies.failed.slice(-MAX_STRATEGIES)
        : Array.isArray(rawMemory.failedStrategies)
          ? rawMemory.failedStrategies.slice(-MAX_STRATEGIES)
        : empty.strategies.failed,
    },
    successfulStrategies: Array.isArray(rawMemory.successfulStrategies)
      ? rawMemory.successfulStrategies.slice(-MAX_STRATEGIES)
      : [],
    failedStrategies: Array.isArray(rawMemory.failedStrategies)
      ? rawMemory.failedStrategies.slice(-MAX_STRATEGIES)
      : [],
    biomeStatistics: normalizeRecord(rawMemory.biomeStatistics),
    biomeRatings: normalizeRecord(rawMemory.biomeRatings ?? createEmptyBiomeRatings()),
    progressionTimes: normalizeRecord(rawMemory.progressionTimes),
    resourceDiscoveryMetrics: normalizeRecord(rawMemory.resourceDiscoveryMetrics),
    resourceEfficiency: normalizeRecord(rawMemory.resourceEfficiency),
    discoveredStructures: normalizeRecord(rawMemory.discoveredStructures),
    knownStructures: Array.isArray(rawMemory.knownStructures) ? rawMemory.knownStructures.slice(-MAX_KNOWLEDGE) : [],
    dangerousBiomes: Array.isArray(rawMemory.dangerousBiomes) ? rawMemory.dangerousBiomes.slice(-MAX_KNOWLEDGE) : [],
    deathCauses: normalizeRecord(rawMemory.deathCauses),
    blockedActionStatistics: normalizeRecord(rawMemory.blockedActionStatistics),
    craftingStats: normalizeCraftingStats(rawMemory.craftingStats),
    shelterStats: normalizeShelterStats(rawMemory.shelterStats),
    storageStats: normalizeStorageStats(rawMemory.storageStats),
    learnedKnowledge: Array.isArray(rawMemory.learnedKnowledge)
      ? rawMemory.learnedKnowledge.slice(-MAX_KNOWLEDGE)
      : [],
    newKnowledge: Array.isArray(rawMemory.newKnowledge) ? rawMemory.newKnowledge.slice(-MAX_KNOWLEDGE) : [],
    learnedLessons: Array.isArray(rawMemory.learnedLessons) ? rawMemory.learnedLessons.slice(-MAX_KNOWLEDGE) : [],
    strategyChanges: Array.isArray(rawMemory.strategyChanges) ? rawMemory.strategyChanges.slice(-MAX_KNOWLEDGE) : [],
    optimizationSuggestions: Array.isArray(rawMemory.optimizationSuggestions)
      ? rawMemory.optimizationSuggestions.slice(-MAX_KNOWLEDGE)
      : [],
  };
}

function rememberSuccessfulStrategy(memory, strategy) {
  memory.strategies.successful = upsertStrategy(memory.strategies.successful, strategy).slice(-MAX_STRATEGIES);
  memory.successfulStrategies = memory.strategies.successful;
}

function rememberFailedStrategy(memory, strategy) {
  memory.strategies.failed = upsertStrategy(memory.strategies.failed, strategy).slice(-MAX_STRATEGIES);
  memory.failedStrategies = memory.strategies.failed;
}

function upsertStrategy(strategies, nextStrategy) {
  const existingIndex = strategies.findIndex((strategy) => (
    strategy.goalId === nextStrategy.goalId &&
    strategy.strategy === nextStrategy.strategy &&
    strategy.reason === nextStrategy.reason
  ));

  if (existingIndex < 0) {
    return [
      ...strategies,
      {
        ...nextStrategy,
        count: 1,
      },
    ];
  }

  const updated = [...strategies];
  const existing = updated[existingIndex];

  updated[existingIndex] = {
    ...existing,
    ...nextStrategy,
    count: Number(existing.count ?? 1) + 1,
    bestTimeSeconds: minPositive(existing.bestTimeSeconds, nextStrategy.timeSpentSeconds),
  };

  return updated;
}

function updateProgressionTime(memory, goalId, goalName, timeSpentSeconds) {
  if (!goalId || timeSpentSeconds <= 0) {
    return;
  }

  const existing = memory.progressionTimes[goalId] ?? {
    goalId,
    goalName,
    samples: 0,
    totalSeconds: 0,
    bestSeconds: null,
    averageSeconds: null,
    lastSeconds: null,
  };
  const samples = Number(existing.samples ?? 0) + 1;
  const totalSeconds = Number(existing.totalSeconds ?? 0) + timeSpentSeconds;

  memory.progressionTimes[goalId] = {
    goalId,
    goalName,
    samples,
    totalSeconds: round(totalSeconds, 2),
    bestSeconds: minPositive(existing.bestSeconds, timeSpentSeconds),
    averageSeconds: round(totalSeconds / samples, 2),
    lastSeconds: round(timeSpentSeconds, 2),
  };
}

function updateBiomeStatistics(memory, {
  biomeStats = {},
  activeBiome = 'Unknown',
  elapsedSeconds = 0,
  resourceScanResults = {},
  inventoryDelta = {},
  now,
}) {
  const mergedBiomeStats = Object.keys(biomeStats).length > 0
    ? biomeStats
    : {
      [activeBiome]: {
        visits: 1,
        seconds: Number(elapsedSeconds ?? 0),
      },
  };

  for (const [biomeName, stats] of Object.entries(mergedBiomeStats)) {
    const biomeKey = biomeName || 'Unknown';
    const statsResources = stats.resourcesFound ?? {};
    const resourcesFound = Object.keys(statsResources).length > 0
      ? statsResources
      : biomeKey === activeBiome
        ? inventoryDelta
        : {};
    const existing = memory.biomeStatistics[biomeKey] ?? {
      biome: biomeKey,
      visits: 0,
      totalSeconds: 0,
      resourcesFound: {},
      woodTargetsFound: 0,
      rejectedLeafTargets: 0,
      lastSeenAt: null,
    };

    memory.biomeStatistics[biomeKey] = {
      ...existing,
      visits: Number(existing.visits ?? 0) + Number(stats.visits ?? 1),
      totalSeconds: round(Number(existing.totalSeconds ?? 0) + Number(stats.seconds ?? stats.totalSeconds ?? 0), 2),
      resourcesFound: mergeResourceCounts(existing.resourcesFound, resourcesFound),
      woodTargetsFound: Number(existing.woodTargetsFound ?? 0) + Number(stats.woodTargetsFound ?? (
        biomeKey === activeBiome ? resourceScanResults.woodTargetsFound ?? 0 : 0
      )),
      rejectedLeafTargets: Number(existing.rejectedLeafTargets ?? 0) + Number(stats.rejectedLeafTargets ?? (
        biomeKey === activeBiome ? resourceScanResults.rejectedLeafTargets ?? 0 : 0
      )),
      lastSeenAt: now,
    };
  }
}

function updateResourceDiscovery(memory, {
  inventoryDelta = {},
  resourceScanResults = {},
  activeBiome,
  actionCounts = {},
  now,
}) {
  const positiveResources = Object.entries(inventoryDelta)
    .filter(([, value]) => Number(value) > 0)
    .slice(0, MAX_RESOURCE_RECORDS);

  for (const [resourceId, count] of positiveResources) {
    const existing = memory.resourceDiscoveryMetrics[resourceId] ?? {
      resourceId,
      found: 0,
      attempts: 0,
      bestBiome: null,
      lastFoundAt: null,
    };

    memory.resourceDiscoveryMetrics[resourceId] = {
      ...existing,
      found: Number(existing.found ?? 0) + Number(count),
      attempts: Number(existing.attempts ?? 0) + 1,
      bestBiome: resolveBestResourceBiome(memory, resourceId, activeBiome),
      lastFoundAt: now,
    };
    memory.resourceEfficiency[resourceId] = updateEfficiencyRecord(memory.resourceEfficiency[resourceId], {
      resourceId,
      gained: Number(count),
      actionCount: Number(actionCounts.mine ?? actionCounts.collect ?? 1),
      biome: activeBiome,
    });
  }

  if (Number(resourceScanResults.woodTargetsFound ?? 0) > 0) {
    const wood = memory.resourceDiscoveryMetrics.wood ?? {
      resourceId: 'wood',
      found: 0,
      attempts: 0,
      bestBiome: null,
      lastFoundAt: null,
    };
    const existing = memory.resourceDiscoveryMetrics.woodTargets ?? {
      resourceId: 'woodTargets',
      found: 0,
      attempts: 0,
      bestBiome: null,
      lastFoundAt: null,
    };

    memory.resourceDiscoveryMetrics.woodTargets = {
      ...existing,
      found: Number(existing.found ?? 0) + Number(resourceScanResults.woodTargetsFound ?? 0),
      attempts: Number(existing.attempts ?? 0) + 1,
      bestBiome: activeBiome,
      lastFoundAt: now,
    };
    memory.resourceDiscoveryMetrics.wood = {
      ...wood,
      found: Number(wood.found ?? 0) + Math.max(1, Number(inventoryDelta.wood ?? 0), Number(resourceScanResults.woodTargetsFound ?? 0)),
      attempts: Number(wood.attempts ?? 0) + 1,
      bestBiome: activeBiome,
      lastFoundAt: now,
    };
    memory.resourceEfficiency.wood = updateEfficiencyRecord(memory.resourceEfficiency.wood, {
      resourceId: 'wood',
      gained: Math.max(1, Number(inventoryDelta.wood ?? 0), Number(resourceScanResults.woodTargetsFound ?? 0)),
      actionCount: Number(actionCounts.mine ?? 1),
      biome: activeBiome,
    });
  }
}

function updateDiscoveredStructures(memory, discoveredStructures = [], now) {
  for (const structure of discoveredStructures) {
    const structureId = structure.id ?? `${structure.type ?? 'structure'}:${structure.biome ?? 'unknown'}`;
    const existing = memory.discoveredStructures[structureId] ?? {
      id: structureId,
      type: structure.type ?? 'unknown',
      biome: structure.biome ?? 'Unknown',
      discoveries: 0,
      firstSeenAt: now,
      lastSeenAt: now,
    };

    memory.discoveredStructures[structureId] = {
      ...existing,
      discoveries: Number(existing.discoveries ?? 0) + 1,
      lastSeenAt: now,
      position: structure.position ?? existing.position ?? null,
    };
  }

  memory.knownStructures = Object.values(memory.discoveredStructures)
    .sort((left, right) => Number(right.discoveries ?? 0) - Number(left.discoveries ?? 0))
    .slice(0, MAX_KNOWLEDGE);
}

function updateDeathCauses(memory, simulationSnapshot = {}, report = null, now = null) {
  const failures = simulationSnapshot.failures ?? [];
  const deathFailures = failures.filter((failure) => (
    String(failure.code ?? '').includes('death') ||
    String(failure.summary ?? '').toLowerCase().includes('died')
  ));
  const deathCount = Number(report?.telemetry?.counts?.deaths ?? 0);
  const telemetryDeaths = (report?.telemetry?.recentGameplayEvents ?? [])
    .filter((event) => event.type === 'death');
  const terrainDeathContext = simulationSnapshot.terrainDeathContext ?? null;
  const deathPosition = simulationSnapshot.deathPosition ?? terrainDeathContext?.position ?? null;
  const activeBiome = terrainDeathContext?.biome ?? simulationSnapshot.resourceScanResults?.biome ?? 'Unknown';

  if (deathFailures.length === 0 && deathCount <= 0 && telemetryDeaths.length === 0 && !terrainDeathContext) {
    return;
  }

  const deathRecords = deathFailures.length > 0
    ? deathFailures
    : telemetryDeaths.length > 0
      ? telemetryDeaths.map((event) => ({
code: (event.payload?.source?.toLowerCase?.() ?? '').includes('terrain') ? 'terrain-death' : 'telemetry-death',
        summary: `Telemetry death event: ${event.payload?.source ?? 'unknown source'}.`,
        severity: 'medium',
        position: event.payload?.position ?? deathPosition,
        biome: event.payload?.biome ?? activeBiome,
      }))
      : [{
        code: terrainDeathContext?.source ?? 'unknown-death',
        summary: terrainDeathContext?.summary ?? 'Death was recorded without a detailed failure record.',
        severity: 'medium',
        position: deathPosition,
        biome: activeBiome,
      }];

  for (const failure of deathRecords) {
    const cause = failure.code ?? 'unknown-death';
    const isTerrainDeath = String(cause).includes('terrain') ||
      String(failure.summary ?? '').toLowerCase().includes('terrain') ||
      String(terrainDeathContext?.source ?? '').includes('terrain');
    const suggestedAvoidanceStrategy = isTerrainDeath
      ? 'Avoid steep slopes and blacklisted terrain around the death position before resuming exploration.'
      : 'Recover survival resources before repeating the failed route.';

    memory.deathCauses[cause] = incrementCountRecord(memory.deathCauses[cause], Number(failure.count ?? 1), {
      summary: failure.summary,
      severity: failure.severity,
      biome: failure.biome ?? activeBiome,
      position: failure.position ?? deathPosition,
      currentGoal: terrainDeathContext?.currentGoal ?? simulationSnapshot.planner?.currentGoal ?? null,
      suggestedAvoidanceStrategy,
      lastSeenAt: now,
    });

    if (isTerrainDeath && activeBiome && !memory.dangerousBiomes.includes(activeBiome)) {
      memory.dangerousBiomes.push(activeBiome);
      memory.dangerousBiomes = memory.dangerousBiomes.slice(-MAX_KNOWLEDGE);
    }

    if (isTerrainDeath) {
      pushUniqueLimited(memory.learnedLessons, `Terrain death near ${activeBiome}; avoid steep slopes before continuing exploration.`);
      pushUniqueLimited(memory.optimizationSuggestions, suggestedAvoidanceStrategy);
    }
  }
}

function updateBlockedActionStatistics(memory, failedActions = [], bottlenecks = []) {
  for (const failedAction of failedActions) {
    const key = failedAction.action ?? failedAction.actionName ?? 'unknown';

    memory.blockedActionStatistics[key] = incrementCountRecord(memory.blockedActionStatistics[key], 1, {
      reason: failedAction.reason,
      goalId: failedAction.goalId,
      goalName: failedAction.goalName,
    });
  }

  for (const bottleneck of bottlenecks) {
    const key = bottleneck.code ?? `bottleneck:${bottleneck.goalId ?? 'unknown'}`;

    memory.blockedActionStatistics[key] = incrementCountRecord(memory.blockedActionStatistics[key], Number(bottleneck.count ?? 1), {
      reason: bottleneck.summary,
      goalId: bottleneck.goalId,
      goalName: bottleneck.goalName,
    });
  }
}

function updateCraftingStatistics(memory, craftedItems = [], failedCrafts = []) {
  memory.craftingStats.successes += craftedItems.length;
  memory.craftingStats.failures += failedCrafts.length;

  for (const craftedItem of craftedItems) {
    const key = craftedItem.action ?? craftedItem.itemId ?? 'unknown';
    const actionStats = memory.craftingStats.byAction[key] ?? {
      successes: 0,
      failures: 0,
      successRate: 1,
    };

    actionStats.successes += 1;
    actionStats.successRate = calculateRate(actionStats.successes, actionStats.failures);
    memory.craftingStats.byAction[key] = actionStats;
  }

  for (const failedCraft of failedCrafts) {
    const key = failedCraft.action ?? 'unknown';
    const actionStats = memory.craftingStats.byAction[key] ?? {
      successes: 0,
      failures: 0,
      successRate: 0,
    };

    actionStats.failures += 1;
    actionStats.lastFailureReason = failedCraft.reason ?? null;
    actionStats.successRate = calculateRate(actionStats.successes, actionStats.failures);
    memory.craftingStats.byAction[key] = actionStats;
  }

  memory.craftingStats.successRate = calculateRate(memory.craftingStats.successes, memory.craftingStats.failures);
}

function updateShelterStatistics(memory, shelterValidation = {}, completedGoals = [], failedGoals = []) {
  const attemptedShelter = Number(shelterValidation.validShelterBlocksPlaced ?? 0) > 0 ||
    completedGoals.some((goal) => goal.id === 'buildShelter' || goal.id === 'buildBaseTier1') ||
    failedGoals.some((goal) => goal.id === 'buildShelter' || goal.id === 'buildBaseTier1');

  if (!attemptedShelter) {
    return;
  }

  memory.shelterStats.attempts += 1;

  if (Boolean(shelterValidation.isSafeForNight) || completedGoals.some((goal) => goal.id === 'buildShelter')) {
    memory.shelterStats.successes += 1;
  } else {
    memory.shelterStats.failures += 1;
    memory.shelterStats.lastFailureReason = shelterValidation.lastBlockedReason ?? 'Shelter did not pass safety validation.';
  }

  memory.shelterStats.successRate = calculateRate(memory.shelterStats.successes, memory.shelterStats.failures);
}

function updateStorageStatistics(memory, storageSnapshot = {}, inventoryDelta = {}) {
  const reserves = storageSnapshot.reserves ?? {};

  memory.storageStats.placements += Number(storageSnapshot.placements ?? storageSnapshot.storageCreated ?? 0);
  memory.storageStats.stores += Number(storageSnapshot.stores ?? 0);
  memory.storageStats.retrieves += Number(storageSnapshot.retrieves ?? 0);
  memory.storageStats.reserves = {
    wood: Math.max(Number(memory.storageStats.reserves.wood ?? 0), Number(reserves.wood ?? inventoryDelta.storedWood ?? 0)),
    stone: Math.max(Number(memory.storageStats.reserves.stone ?? 0), Number(reserves.stone ?? inventoryDelta.storedStone ?? 0)),
    food: Math.max(Number(memory.storageStats.reserves.food ?? 0), Number(reserves.food ?? inventoryDelta.storedFood ?? 0)),
  };
}

function updateBiomeRatings(memory) {
  const learnedDangerousBiomes = new Set(memory.dangerousBiomes ?? []);

  for (const biome of CORE_BIOMES) {
    const stats = resolveBiomeStats(memory, biome);
    const resourceYield = Object.values(stats.resourcesFound ?? {})
      .reduce((total, value) => total + Number(value ?? 0), 0) + Number(stats.woodTargetsFound ?? 0);
    const travelCost = Number(stats.totalSeconds ?? stats.seconds ?? 0) / Math.max(1, Number(stats.visits ?? 1));
    const dangerLevel = Number(stats.dangerLevel ?? 0);
    const survivalRate = Math.max(0, 1 - dangerLevel);
    const score = resourceYield / Math.max(1, travelCost + 1) + survivalRate * 10 - dangerLevel * 5;

    memory.biomeRatings[biome] = {
      biome,
      resourceYield: round(resourceYield, 2),
      survivalRate: round(survivalRate, 3),
      travelCost: round(travelCost, 2),
      dangerLevel: round(dangerLevel, 3),
      score: round(score, 3),
    };
  }

  const ratedDangerousBiomes = Object.values(memory.biomeRatings)
    .filter((rating) => Number(rating.dangerLevel ?? 0) >= 0.35)
    .sort((left, right) => Number(right.dangerLevel ?? 0) - Number(left.dangerLevel ?? 0))
    .map((rating) => rating.biome);

  memory.dangerousBiomes = [...new Set([
    ...ratedDangerousBiomes,
    ...learnedDangerousBiomes,
  ])].slice(0, MAX_KNOWLEDGE);
}

function updateOptimizationSuggestions(memory, {
  bottlenecks = [],
  failedActions = [],
  failedCrafts = [],
  failureCounts = {},
  previousSnapshot = null,
}) {
  const suggestions = [];

  if (bottlenecks.length > 0) {
    suggestions.push(`Resolve bottleneck: ${bottlenecks.at(-1).summary}`);
  }

  if (failedActions.length > 0) {
    suggestions.push(`Improve action recovery for ${failedActions.at(-1).action}: ${failedActions.at(-1).reason}`);
  }

  if (failedCrafts.length > 0) {
    suggestions.push(`Review crafting inputs for ${failedCrafts.at(-1).action}: ${failedCrafts.at(-1).reason}`);
  }

  if (Number(failureCounts.deathLoops ?? 0) > 0) {
    suggestions.push('Reduce dangerous night/combat routes before long exploration.');
  }

  if (previousSnapshot?.averageIronTime && memory.progressionTimes.upgradeEquipment?.averageSeconds) {
    const currentAverage = Number(memory.progressionTimes.upgradeEquipment.averageSeconds);

    if (currentAverage > previousSnapshot.averageIronTime * 1.15) {
      suggestions.push('Iron route slowed down; compare wood, stone, and smelting timings against prior memory.');
    }
  }

  memory.optimizationSuggestions = [...new Set([
    ...memory.optimizationSuggestions,
    ...suggestions,
  ])].slice(-MAX_KNOWLEDGE);
}

function updateStrategyChanges(memory, previousSnapshot) {
  const changes = [];
  const currentHints = createStrategyHints(memory);

  if (previousSnapshot?.bestWoodBiome && currentHints.preferredWoodBiome && previousSnapshot.bestWoodBiome !== currentHints.preferredWoodBiome) {
    changes.push(`Wood routing changed from ${previousSnapshot.bestWoodBiome} to ${currentHints.preferredWoodBiome}.`);
  }

  if (previousSnapshot?.bestStoneBiome && currentHints.preferredStoneBiome && previousSnapshot.bestStoneBiome !== currentHints.preferredStoneBiome) {
    changes.push(`Stone routing changed from ${previousSnapshot.bestStoneBiome} to ${currentHints.preferredStoneBiome}.`);
  }

  memory.strategyChanges = [...new Set([
    ...memory.strategyChanges,
    ...changes,
  ])].slice(-MAX_KNOWLEDGE);
}

function updateLearnedKnowledge(memory) {
  const hints = createStrategyHints(memory);
  const knowledge = [];
  const lessons = [];

  if (hints.preferredWoodBiome) {
    knowledge.push(`Prefer ${hints.preferredWoodBiome} when searching for trunks.`);
    lessons.push(`Wood search is currently strongest in ${hints.preferredWoodBiome}.`);
  }

  if (hints.preferredStoneBiome) {
    knowledge.push(`Prefer ${hints.preferredStoneBiome} for stone progression.`);
  }

  if (hints.fastestGoal) {
    knowledge.push(`Fastest reliable goal: ${hints.fastestGoal.goalName} in ${hints.fastestGoal.bestSeconds}s.`);
  }

  if (hints.commonBottleneck) {
    knowledge.push(`Watch bottleneck: ${hints.commonBottleneck.reason}`);
    lessons.push(`Repeated bottleneck: ${hints.commonBottleneck.reason}`);
  }

  for (const resource of Object.values(memory.resourceDiscoveryMetrics).slice(0, 4)) {
    if (resource.bestBiome) {
      knowledge.push(`${resource.resourceId} is most recently useful in ${resource.bestBiome}.`);
    }
  }

  const newKnowledge = knowledge.filter((entry) => !memory.learnedKnowledge.includes(entry));

  memory.newKnowledge = newKnowledge.slice(-MAX_KNOWLEDGE);
  memory.learnedLessons = [...new Set([
    ...memory.learnedLessons,
    ...lessons,
  ])].slice(-MAX_KNOWLEDGE);
  memory.learnedKnowledge = [...new Set([
    ...memory.learnedKnowledge,
    ...knowledge,
  ])].slice(-MAX_KNOWLEDGE);
}

function updateMemoryAliases(memory) {
  const hints = createStrategyHints(memory);

  memory.bestWoodBiome = hints.preferredWoodBiome;
  memory.bestStoneBiome = hints.preferredStoneBiome;
  memory.averageIronTime = Number(memory.progressionTimes?.upgradeEquipment?.averageSeconds ?? 0);
  memory.successfulStrategies = memory.strategies.successful;
  memory.failedStrategies = memory.strategies.failed;
}

function createStrategyHints(memory) {
  const biomeEntries = Object.values(memory.biomeStatistics ?? {});
  const preferredWoodBiome = biomeEntries
    .filter((biome) => Number(biome.woodTargetsFound ?? 0) > 0)
    .sort((left, right) => Number(right.woodTargetsFound ?? 0) - Number(left.woodTargetsFound ?? 0))[0]?.biome ?? null;
  const preferredStoneBiome = resolveBestResourceBiome(memory, 'stone', null);
  const fastestGoal = Object.values(memory.progressionTimes ?? {})
    .filter((goal) => Number(goal.bestSeconds ?? 0) > 0)
    .sort((left, right) => Number(left.bestSeconds ?? Infinity) - Number(right.bestSeconds ?? Infinity))[0] ?? null;
  const commonBottleneck = [...(memory.strategies?.failed ?? [])]
    .sort((left, right) => Number(right.count ?? 0) - Number(left.count ?? 0))[0] ?? null;
  const knownBiomes = biomeEntries
    .map((biome) => biome.biome)
    .filter(Boolean);
  const knownStructures = (memory.knownStructures ?? []).slice(0, 16).map((structure) => ({
    id: structure.id,
    type: structure.type,
    biome: structure.biome,
  }));

  return {
    preferredWoodBiome,
    preferredStoneBiome,
    fastestGoal: fastestGoal
      ? {
        goalId: fastestGoal.goalId,
        goalName: fastestGoal.goalName,
        bestSeconds: fastestGoal.bestSeconds,
      }
      : null,
    commonBottleneck: commonBottleneck
      ? {
        goalId: commonBottleneck.goalId,
        goalName: commonBottleneck.goalName,
        reason: commonBottleneck.reason,
        count: commonBottleneck.count,
      }
      : null,
    knownBiomes,
    knownStructures,
  };
}

function sanitizeMemorySnapshot(memory) {
  return {
    schemaVersion: memory.schemaVersion,
    runs: Number(memory.runs ?? 0),
    createdAt: memory.createdAt,
    lastUpdatedAt: memory.lastUpdatedAt,
    lastRun: memory.lastRun,
    bestWoodBiome: memory.bestWoodBiome ?? createStrategyHints(memory).preferredWoodBiome,
    bestStoneBiome: memory.bestStoneBiome ?? createStrategyHints(memory).preferredStoneBiome,
    averageIronTime: Number(memory.averageIronTime ?? memory.progressionTimes?.upgradeEquipment?.averageSeconds ?? 0),
    strategies: {
      successful: (memory.strategies?.successful ?? []).slice(-MAX_STRATEGIES).map(sanitizeStrategy),
      failed: (memory.strategies?.failed ?? []).slice(-MAX_STRATEGIES).map(sanitizeStrategy),
    },
    successfulStrategies: (memory.strategies?.successful ?? []).slice(-MAX_STRATEGIES).map(sanitizeStrategy),
    failedStrategies: (memory.strategies?.failed ?? []).slice(-MAX_STRATEGIES).map(sanitizeStrategy),
    biomeStatistics: normalizeRecord(memory.biomeStatistics),
    biomeRatings: normalizeRecord(memory.biomeRatings),
    progressionTimes: normalizeRecord(memory.progressionTimes),
    resourceDiscoveryMetrics: normalizeRecord(memory.resourceDiscoveryMetrics),
    resourceEfficiency: normalizeRecord(memory.resourceEfficiency),
    discoveredStructures: normalizeRecord(memory.discoveredStructures),
    knownStructures: (memory.knownStructures ?? []).slice(-MAX_KNOWLEDGE).map((structure) => ({ ...structure })),
    dangerousBiomes: [...(memory.dangerousBiomes ?? [])],
    deathCauses: normalizeRecord(memory.deathCauses),
    blockedActionStatistics: normalizeRecord(memory.blockedActionStatistics),
    craftingStats: normalizeCraftingStats(memory.craftingStats),
    shelterStats: normalizeShelterStats(memory.shelterStats),
    storageStats: normalizeStorageStats(memory.storageStats),
    learnedKnowledge: (memory.learnedKnowledge ?? []).slice(-MAX_KNOWLEDGE),
    newKnowledge: (memory.newKnowledge ?? []).slice(-MAX_KNOWLEDGE),
    learnedLessons: (memory.learnedLessons ?? []).slice(-MAX_KNOWLEDGE),
    strategyChanges: (memory.strategyChanges ?? []).slice(-MAX_KNOWLEDGE),
    optimizationSuggestions: (memory.optimizationSuggestions ?? []).slice(-MAX_KNOWLEDGE),
    strategyHints: createStrategyHints(memory),
  };
}

function sanitizeStrategy(strategy) {
  return {
    goalId: strategy.goalId ?? null,
    goalName: strategy.goalName ?? null,
    strategy: strategy.strategy ?? null,
    reason: strategy.reason ?? null,
    timeSpentSeconds: Number(strategy.timeSpentSeconds ?? 0),
    bestTimeSeconds: strategy.bestTimeSeconds === null || strategy.bestTimeSeconds === undefined
      ? null
      : Number(strategy.bestTimeSeconds),
    progressionTierReached: strategy.progressionTierReached ?? null,
    count: Number(strategy.count ?? 1),
    at: strategy.at ?? null,
  };
}

function normalizeRecord(record = {}) {
  return Object.fromEntries(Object.entries(record ?? {}).map(([key, value]) => [key, { ...value }]));
}

function createEmptyBiomeRatings() {
  return Object.fromEntries(CORE_BIOMES.map((biome) => [biome, {
    biome,
    resourceYield: 0,
    survivalRate: 1,
    travelCost: 0,
    dangerLevel: 0,
    score: 0,
  }]));
}

function normalizeCraftingStats(craftingStats = {}) {
  const successes = Number(craftingStats.successes ?? 0);
  const failures = Number(craftingStats.failures ?? 0);

  return {
    successes,
    failures,
    successRate: Number(craftingStats.successRate ?? calculateRate(successes, failures)),
    byAction: normalizeRecord(craftingStats.byAction),
  };
}

function normalizeShelterStats(shelterStats = {}) {
  const successes = Number(shelterStats.successes ?? 0);
  const failures = Number(shelterStats.failures ?? 0);

  return {
    attempts: Number(shelterStats.attempts ?? successes + failures),
    successes,
    failures,
    successRate: Number(shelterStats.successRate ?? calculateRate(successes, failures)),
    lastFailureReason: shelterStats.lastFailureReason ?? null,
  };
}

function normalizeStorageStats(storageStats = {}) {
  return {
    placements: Number(storageStats.placements ?? 0),
    stores: Number(storageStats.stores ?? 0),
    retrieves: Number(storageStats.retrieves ?? 0),
    reserves: {
      wood: Number(storageStats.reserves?.wood ?? 0),
      stone: Number(storageStats.reserves?.stone ?? 0),
      food: Number(storageStats.reserves?.food ?? 0),
    },
  };
}

function updateEfficiencyRecord(existing = {}, {
  resourceId,
  gained,
  actionCount,
  biome,
}) {
  const totalGained = Number(existing.totalGained ?? 0) + Number(gained ?? 0);
  const totalActions = Number(existing.totalActions ?? 0) + Math.max(1, Number(actionCount ?? 1));

  return {
    resourceId,
    totalGained: round(totalGained, 2),
    totalActions: round(totalActions, 2),
    yieldPerAction: round(totalGained / totalActions, 3),
    bestBiome: biome ?? existing.bestBiome ?? null,
  };
}

function incrementCountRecord(existing = {}, count = 1, metadata = {}) {
  return {
    ...existing,
    ...metadata,
    count: Number(existing.count ?? 0) + Number(count ?? 1),
  };
}

function pushUniqueLimited(collection, value, limit = MAX_KNOWLEDGE) {
  if (!value || collection.includes(value)) {
    return;
  }

  collection.push(value);

  while (collection.length > limit) {
    collection.shift();
  }
}

function calculateRate(successes, failures) {
  const total = Number(successes ?? 0) + Number(failures ?? 0);

  if (total <= 0) {
    return 1;
  }

  return round(Number(successes ?? 0) / total, 3);
}

function resolveBiomeStats(memory, biomeName) {
  const normalizedName = String(biomeName).toLowerCase();
  const match = Object.values(memory.biomeStatistics ?? {})
    .find((stats) => String(stats.biome ?? '').toLowerCase().includes(normalizedName));

  return match ?? {
    biome: biomeName,
    visits: 0,
    totalSeconds: 0,
    resourcesFound: {},
    woodTargetsFound: 0,
    dangerLevel: 0,
  };
}

function mergeResourceCounts(left = {}, right = {}) {
  const merged = { ...left };

  for (const [key, value] of Object.entries(right ?? {})) {
    const numericValue = Number(value ?? 0);

    if (numericValue <= 0) {
      continue;
    }

    merged[key] = Number(merged[key] ?? 0) + numericValue;
  }

  return merged;
}

function resolveBestResourceBiome(memory, resourceId, fallbackBiome) {
  const biome = Object.values(memory.biomeStatistics ?? {})
    .filter((stats) => Number(stats.resourcesFound?.[resourceId] ?? 0) > 0)
    .sort((left, right) => Number(right.resourcesFound?.[resourceId] ?? 0) - Number(left.resourcesFound?.[resourceId] ?? 0))[0]?.biome;

  return biome ?? fallbackBiome ?? null;
}

function minPositive(left, right) {
  const leftNumber = Number(left ?? 0);
  const rightNumber = Number(right ?? 0);

  if (leftNumber <= 0) {
    return round(rightNumber, 2);
  }

  if (rightNumber <= 0) {
    return round(leftNumber, 2);
  }

  return round(Math.min(leftNumber, rightNumber), 2);
}

function getLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const testKey = 'godoy:ai-memory:test';

    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);

    return window.localStorage;
  } catch {
    return null;
  }
}

function round(value, digits = 2) {
  const scale = 10 ** digits;

  return Math.round((Number(value) || 0) * scale) / scale;
}
