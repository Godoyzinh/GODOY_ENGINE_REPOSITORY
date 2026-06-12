import { DEFAULT_NEURAL_ARCHITECTURE, createSeededRandom } from './neuralNetwork.js';
import { NeuralGenome } from './neuralGenome.js';
import { NeuralPopulation } from './neuralPopulation.js';

export const AI_NEURAL_CHAMPION_STORAGE_KEY = 'godoy:ai-neural-champion';
export const NO_VALID_CHAMPION_STATUS = 'no-valid-champion-yet';
export const DEFAULT_NEURAL_TRAINING_OPTIONS = Object.freeze({
  mode: 'quick',
  neuralEnabled: true,
  trainNeural: true,
  useChampion: true,
  populationSize: 32,
  cliPopulationSize: 128,
  episodeDurationSeconds: 60,
  generations: 1,
  mutationRate: 0.08,
  mutationStrength: 0.35,
});

export class NeuralTrainer {
  constructor({
    storage = null,
    storageKey = AI_NEURAL_CHAMPION_STORAGE_KEY,
    architecture = DEFAULT_NEURAL_ARCHITECTURE,
    mutationRate = DEFAULT_NEURAL_TRAINING_OPTIONS.mutationRate,
    mutationStrength = DEFAULT_NEURAL_TRAINING_OPTIONS.mutationStrength,
    now = () => new Date().toISOString(),
  } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.architecture = architecture;
    this.mutationRate = mutationRate;
    this.mutationStrength = mutationStrength;
    this.now = now;
    this.trainingHistory = [];
    this.lastAgentResults = [];
    this.bestCandidate = null;
    this.championStatus = NO_VALID_CHAMPION_STATUS;
    this.lastEvolutionSnapshot = createNeuralEvolutionSnapshot({
      mode: DEFAULT_NEURAL_TRAINING_OPTIONS.mode,
      mutationRate: this.mutationRate,
      championStatus: this.championStatus,
    });
    this.championCreatedAt = null;
    this.champion = this.loadChampion();
  }

  async train({
    mode = DEFAULT_NEURAL_TRAINING_OPTIONS.mode,
    neuralEnabled = DEFAULT_NEURAL_TRAINING_OPTIONS.neuralEnabled,
    trainNeural = DEFAULT_NEURAL_TRAINING_OPTIONS.trainNeural,
    useChampion = DEFAULT_NEURAL_TRAINING_OPTIONS.useChampion,
    generations = DEFAULT_NEURAL_TRAINING_OPTIONS.generations,
    populationSize = DEFAULT_NEURAL_TRAINING_OPTIONS.populationSize,
    durationSeconds = DEFAULT_NEURAL_TRAINING_OPTIONS.episodeDurationSeconds,
    seed = 1337,
    baselineResult = null,
    championResult = null,
    runEpisode,
  } = {}) {
    if (typeof runEpisode !== 'function') {
      throw new Error('NeuralTrainer requires a runEpisode callback.');
    }

    const previousChampionFitness = Number(this.champion?.fitness ?? Number.NEGATIVE_INFINITY);
    const generationStarted = 0;
    let generationCompleted = -1;
    let championSaved = false;
    let validChampionFound = false;
    const random = createSeededRandom(seed);
    const population = new NeuralPopulation({
      populationSize,
      mutationRate: this.mutationRate,
      mutationStrength: this.mutationStrength,
      architecture: this.architecture,
      random,
    });
    const agentResults = [];

    if (useChampion && this.champion) {
      population.genomes[0] = this.champion.clone({
        generation: population.generation,
      });
    }

    for (let generationIndex = 0; generationIndex < generations; generationIndex += 1) {
      for (let genomeIndex = 0; genomeIndex < population.genomes.length; genomeIndex += 1) {
        const genome = population.genomes[genomeIndex];
        const agentId = `agent-${population.generation}-${genomeIndex + 1}`;
        const episodeResult = await runEpisode({
          genome,
          generation: population.generation,
          agentId,
          agentIndex: genomeIndex,
          mode,
          durationSeconds,
        });
        const summary = createRunSummary(episodeResult.snapshot);
        const fitness = Number(episodeResult.fitness ?? summary.fitness ?? 0);

        genome.withFitness(fitness, summary);
        agentResults.push(createAgentEpisodeResult({
          agentId,
          agentLabel: `Agent ${genomeIndex + 1}`,
          generation: population.generation,
          genome,
          episodeResult,
          summary,
          fitness,
        }));
      }

      const champion = population.getChampion();
      const championValidation = validateNeuralChampionCandidate(champion);
      const candidateRecord = createBestCandidateRecord({
        genome: champion,
        validation: championValidation,
        generation: population.generation,
      });
      this.bestCandidate = candidateRecord ?? this.bestCandidate;
      generationCompleted = population.generation;
      const generationSummary = {
        generation: population.generation,
        bestFitness: round(champion?.fitness ?? 0),
        averageFitness: round(population.getAverageFitness()),
        championProgress: champion?.summary?.progressionTierReached ?? 'starter',
        bestGoalReached: champion?.summary?.bestGoalReached ?? 'none',
        woodCollected: champion?.summary?.woodCollected ?? 0,
        deaths: champion?.summary?.deaths ?? 0,
        recoveryCount: champion?.summary?.recoveryCount ?? 0,
        blockedActions: champion?.summary?.blockedActions ?? 0,
        championValid: championValidation.valid,
        invalidReason: championValidation.reason,
      };

      this.trainingHistory.push(generationSummary);
      this.trainingHistory = this.trainingHistory.slice(-50);

      if (championValidation.valid) {
        validChampionFound = true;
      }

      if (
        championValidation.valid &&
        (!this.champion || champion.fitness >= this.champion.fitness)
      ) {
        this.champion = champion.clone({
          generation: population.generation,
        });
        this.champion.withFitness(champion.fitness, champion.summary);
        championSaved = this.saveChampion({
          mode,
          generation: population.generation,
          populationSize,
          durationSeconds,
        });
      } else if (candidateRecord) {
        this.saveBestCandidate(candidateRecord, {
          mode,
          generation: population.generation,
          populationSize,
          durationSeconds,
        });
      }

      if (generationIndex < generations - 1) {
        population.evolve({ random });
      }
    }

    this.lastAgentResults = agentResults.slice(-populationSize * Math.max(1, generations));
    this.lastEvolutionSnapshot = createNeuralEvolutionSnapshot({
      enabled: neuralEnabled,
      mode,
      trainingActive: trainNeural,
      populationSize,
      generationStarted,
      generationsCompleted: generations,
      generationCompleted: Math.max(0, generationCompleted),
      currentGeneration: Math.max(0, generationCompleted),
      mutationRate: this.mutationRate,
      agentResults: this.lastAgentResults,
      championFitness: Number(this.champion?.fitness ?? 0),
      previousChampionFitness,
      baselineResult,
      championResult,
      championSaved,
      championValid: Boolean(this.champion),
      championStatus: this.champion ? 'valid-champion' : NO_VALID_CHAMPION_STATUS,
      bestCandidate: this.bestCandidate,
      bestCandidateFailureReason: this.bestCandidate?.failureReason ?? null,
      populationEvaluated: this.lastAgentResults.length > 0,
      agentsEvaluated: this.lastAgentResults.length,
      validChampionFound,
      trainingContaminated: this.lastAgentResults.some((agent) => agent.trainingContaminated),
      fitnessValid: this.lastAgentResults.every((agent) => agent.fitnessValid),
    });

    return this.getSnapshot();
  }

  getSnapshot() {
    return {
      enabled: Boolean(this.champion),
      generation: this.champion?.generation ?? 0,
      championFitness: round(this.champion?.fitness ?? 0),
      championValid: Boolean(this.champion),
      championStatus: this.champion ? 'valid-champion' : NO_VALID_CHAMPION_STATUS,
      bestCandidate: sanitizeBestCandidateForReport(this.bestCandidate),
      mutationRate: this.mutationRate,
      architecture: {
        inputCount: this.architecture.inputCount,
        hiddenLayers: [...this.architecture.hiddenLayers],
        outputCount: this.architecture.outputCount,
      },
      trainingHistory: this.trainingHistory.map((entry) => ({ ...entry })),
      bestRunSummary: this.champion?.summary ? { ...this.champion.summary } : null,
      agents: this.lastAgentResults.map((agent) => ({ ...agent })),
      neuralEvolution: {
        ...this.lastEvolutionSnapshot,
        agentResults: this.lastEvolutionSnapshot.agentResults?.map((agent) => ({ ...agent })) ?? [],
      },
    };
  }

  loadChampion() {
    if (!this.storage) {
      return null;
    }

    try {
      const rawValue = this.storage.getItem(this.storageKey);
      const parsed = rawValue ? JSON.parse(rawValue) : null;
      const storedChampion = resolveStoredChampion(parsed);
      const champion = storedChampion.serialized;

      if (!champion) {
        this.bestCandidate = parsed?.bestCandidate ?? null;
        this.championStatus = parsed?.championStatus ?? NO_VALID_CHAMPION_STATUS;
        return null;
      }

      this.trainingHistory = parsed.trainingHistory ?? [];
      this.bestCandidate = parsed.bestCandidate ?? createBestCandidateRecord({
        genome: storedChampion.genome,
        validation: storedChampion.validation,
        generation: champion.generation ?? parsed?.generation ?? 0,
      });
      this.championCreatedAt = parsed.createdAt ?? parsed.savedAt ?? null;
      const genome = storedChampion.genome;
      const validation = storedChampion.validation;

      if (!validation.valid) {
        this.championStatus = parsed.championStatus ?? NO_VALID_CHAMPION_STATUS;
        return null;
      }

      this.championStatus = 'valid-champion';
      return genome;
    } catch {
      return null;
    }
  }

  saveChampion(metadata = {}) {
    if (!this.storage || !this.champion) {
      return false;
    }

    const validation = validateNeuralChampionCandidate(this.champion);

    if (!validation.valid) {
      this.bestCandidate = createBestCandidateRecord({
        genome: this.champion,
        validation,
        generation: this.champion.generation,
      });
      this.champion = null;
      this.championStatus = NO_VALID_CHAMPION_STATUS;
      this.saveBestCandidate(this.bestCandidate, metadata);
      return false;
    }

    const payload = {
      schemaVersion: 1,
      createdAt: this.championCreatedAt ?? this.now(),
      updatedAt: this.now(),
      savedAt: this.now(),
      generation: this.champion.generation,
      fitness: this.champion.fitness,
      championValid: true,
      championStatus: 'valid-champion',
      mutationRate: this.mutationRate,
      architecture: this.architecture,
      trainingHistory: this.trainingHistory.map((entry) => ({ ...entry })),
      bestRunSummary: this.champion.summary ? { ...this.champion.summary } : null,
      bestCandidate: this.bestCandidate ? { ...this.bestCandidate } : null,
      metadata,
      champion: this.champion.serialize(),
    };

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(payload, null, 2));
      this.championCreatedAt = payload.createdAt;
      this.championStatus = 'valid-champion';
      return true;
    } catch {
      return false;
    }
  }

  saveBestCandidate(bestCandidate = this.bestCandidate, metadata = {}) {
    if (!this.storage || !bestCandidate) {
      return false;
    }

    let existing = null;

    try {
      const rawValue = this.storage.getItem(this.storageKey);
      existing = rawValue ? JSON.parse(rawValue) : null;
    } catch {
      existing = null;
    }

    const storedChampion = resolveStoredChampion(existing);
    const existingChampionGenome = storedChampion.genome;
    const existingChampionValidation = storedChampion.validation;
    const hasValidExistingChampion = existingChampionValidation.valid && existingChampionGenome;
    const payload = {
      ...(hasValidExistingChampion && existing?.champion ? existing : {}),
      schemaVersion: 1,
      createdAt: hasValidExistingChampion ? (existing?.createdAt ?? existing?.savedAt ?? this.now()) : null,
      updatedAt: this.now(),
      savedAt: hasValidExistingChampion ? (existing?.savedAt ?? this.now()) : null,
      generation: hasValidExistingChampion ? existingChampionGenome.generation : undefined,
      fitness: hasValidExistingChampion ? existingChampionGenome.fitness : undefined,
      mutationRate: hasValidExistingChampion ? existingChampionGenome.mutationRate : this.mutationRate,
      architecture: hasValidExistingChampion ? (existing?.architecture ?? this.architecture) : this.architecture,
      trainingHistory: hasValidExistingChampion
        ? (existing?.trainingHistory ?? this.trainingHistory.map((entry) => ({ ...entry })))
        : this.trainingHistory.map((entry) => ({ ...entry })),
      bestRunSummary: hasValidExistingChampion
        ? (existing?.bestRunSummary ?? (existingChampionGenome.summary ? { ...existingChampionGenome.summary } : null))
        : null,
      championValid: Boolean(hasValidExistingChampion),
      championStatus: hasValidExistingChampion ? 'valid-champion' : NO_VALID_CHAMPION_STATUS,
      bestCandidate: { ...bestCandidate },
      bestCandidateFailureReason: bestCandidate.failureReason ?? null,
      metadata,
      champion: hasValidExistingChampion ? existingChampionGenome.serialize() : null,
    };

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(payload, null, 2));
      this.championStatus = payload.championStatus;
      return true;
    } catch {
      return false;
    }
  }
}

export function createRunSummary(snapshot = {}) {
  const completedGoals = snapshot.planner?.goalsCompleted ?? [];
  const lastCompletedGoal = completedGoals.at(-1);
  const blockedActions = (snapshot.failedActions?.length ?? 0) +
    (snapshot.blockedGoals ?? []).reduce((total, blockedGoal) => total + Number(blockedGoal.count ?? 1), 0);

  const summary = {
    status: snapshot.status ?? 'unknown',
    elapsedSeconds: Number(snapshot.elapsedSeconds ?? 0),
    fitness: Number(snapshot.neuralAgent?.currentFitness ?? 0),
    progressionTierReached: snapshot.planner?.progressionTierReached ?? 'starter',
    bestGoalReached: lastCompletedGoal?.id ?? 'none',
    completedGoalCount: completedGoals.length,
    woodCollected: Math.max(
      Number(snapshot.currentInventory?.wood ?? 0),
      Number(snapshot.currentInventory?.woodBlocks ?? 0),
      Number(snapshot.inventoryDelta?.wood ?? 0),
      Number(snapshot.resourceDeltas?.wood ?? 0),
      completedGoals.some((goal) => goal.id === 'gatherWood') ? 1 : 0,
    ),
    deaths: Number(snapshot.failureCounts?.deathLoops ?? 0) + Number(snapshot.telemetryDeaths ?? 0),
    recoveryCount: Number(snapshot.hardRecoveryCount ?? 0),
    blockedActions,
    hardRecoveryMisuseCount: snapshot.hardRecoveryMisuseDetected ? 1 : 0,
    movementPingPongDetected: Boolean(snapshot.neuralAgent?.lastRewardReason?.toLowerCase?.()?.includes('ping-pong')),
    trainingContaminated: Boolean(snapshot.neuralEvolution?.trainingContaminated),
    fitnessValid: snapshot.neuralEvolution?.fitnessValid !== false,
    failures: (snapshot.failures ?? []).map((failure) => failure.code).slice(0, 8),
  };
  const fitnessInvalidReason = getFitnessInvalidReason(summary, snapshot);

  return {
    ...summary,
    fitnessValid: summary.fitnessValid && !fitnessInvalidReason,
    fitnessInvalidReason,
  };
}

export function createAgentEpisodeResult({
  agentId,
  agentLabel,
  generation,
  genome,
  episodeResult,
  summary,
  fitness,
} = {}) {
  const snapshot = episodeResult?.snapshot ?? {};
  const neuralAgent = snapshot.neuralAgent ?? {};

  return {
    agentId,
    agentLabel,
    generation: Number(generation ?? 0),
    genomeId: genome?.id ?? null,
    fitness: round(fitness),
    progressTier: summary?.progressionTierReached ?? 'starter',
    bestGoalReached: summary?.bestGoalReached ?? 'none',
    completedGoalCount: Number(summary?.completedGoalCount ?? 0),
    woodCollected: Number(summary?.woodCollected ?? 0),
    deaths: Number(summary?.deaths ?? 0),
    blockedCount: Number(summary?.blockedActions ?? 0),
    hardRecoveryMisuseCount: Number(summary?.hardRecoveryMisuseCount ?? 0),
    movementPingPongDetected: Boolean(summary?.movementPingPongDetected),
    trainingContaminated: Boolean(summary?.trainingContaminated),
    fitnessValid: summary?.fitnessValid !== false,
    fitnessInvalidReason: summary?.fitnessInvalidReason ?? null,
    timeAliveSeconds: Number(summary?.elapsedSeconds ?? snapshot.elapsedSeconds ?? 0),
    actionHistory: { ...(snapshot.actionCounts ?? {}) },
    sensorHistory: neuralAgent.sensorSnapshot ? [neuralAgent.sensorSnapshot] : [],
    selectedAction: neuralAgent.selectedAction ?? null,
    selectedActionExecuted: Boolean(snapshot.neuralEvolution?.selectedActionExecuted),
    selectedActionExecutionResult: snapshot.neuralEvolution?.selectedActionExecutionResult ?? null,
    neuralActionCounts: { ...(snapshot.neuralEvolution?.neuralActionCounts ?? {}) },
    neuralMineAttempts: Number(snapshot.neuralEvolution?.neuralMineAttempts ?? 0),
    neuralExploreSteps: Number(snapshot.neuralEvolution?.neuralExploreSteps ?? 0),
    neuralWoodCollected: Number(snapshot.neuralEvolution?.neuralWoodCollected ?? summary?.woodCollected ?? 0),
    nearestTargetWasNullTooLong: Boolean(snapshot.neuralEvolution?.nearestTargetWasNullTooLong),
    targetSensorFailure: Boolean(snapshot.neuralEvolution?.targetSensorFailure),
    lastRewardReason: neuralAgent.lastRewardReason ?? null,
    episodeResult: {
      status: snapshot.status ?? 'unknown',
      reportId: episodeResult?.report?.id ?? null,
    },
  };
}

export function createNeuralEvolutionSnapshot({
  enabled = false,
  mode = 'quick',
  trainingActive = false,
  populationSize = 0,
  generationStarted = 0,
  generationsCompleted = 0,
  generationCompleted = generationsCompleted,
  currentGeneration = 0,
  mutationRate = DEFAULT_NEURAL_TRAINING_OPTIONS.mutationRate,
  agentResults = [],
  championFitness = 0,
  previousChampionFitness = Number.NEGATIVE_INFINITY,
  baselineResult = null,
  championResult = null,
  championSaved = false,
  championValid = false,
  championStatus = NO_VALID_CHAMPION_STATUS,
  bestCandidate = null,
  bestCandidateFailureReason = null,
  populationEvaluated = false,
  agentsEvaluated = agentResults.length,
  validChampionFound = false,
  trainingContaminated = false,
  fitnessValid = true,
  nearestTargetWasNullTooLong = false,
  targetSensorFailure = false,
  selectedActionExecuted = false,
  selectedActionExecutionResult = null,
  neuralActionCounts = {},
  neuralMineAttempts = 0,
  neuralExploreSteps = 0,
  neuralWoodCollected = 0,
  fitnessInvalidReason = null,
} = {}) {
  const bestAgent = [...agentResults].sort((left, right) => Number(right.fitness ?? 0) - Number(left.fitness ?? 0))[0] ?? null;
  const resolvedBestCandidate = bestCandidate ?? (bestAgent ? createBestCandidateRecordFromAgent(bestAgent) : null);
  const resolvedBestCandidateFailureReason = bestCandidateFailureReason ??
    resolvedBestCandidate?.failureReason ??
    bestAgent?.fitnessInvalidReason ??
    null;
  const averageFitness = agentResults.length > 0
    ? agentResults.reduce((total, agent) => total + Number(agent.fitness ?? 0), 0) / agentResults.length
    : 0;
  const baselineFitness = Number(baselineResult?.snapshot?.neuralAgent?.currentFitness ?? baselineResult?.fitness ?? 0);
  const championEpisodeFitness = Number(championResult?.snapshot?.neuralAgent?.currentFitness ?? championResult?.fitness ?? championFitness ?? 0);
  const bestFitness = Number(bestAgent?.fitness ?? championEpisodeFitness ?? 0);
  const championImproved = Number.isFinite(previousChampionFitness) && championFitness > previousChampionFitness;
  const allFitnessValid = Boolean(fitnessValid && agentResults.every((agent) => agent.fitnessValid));

  return {
    enabled: Boolean(enabled),
    mode,
    trainingActive: Boolean(trainingActive),
    populationSize: Number(populationSize ?? 0),
    generationStarted: Number(generationStarted ?? 0),
    generationsCompleted: Number(generationsCompleted ?? 0),
    generationCompleted: Number(generationCompleted ?? generationsCompleted ?? 0),
    currentGeneration: Number(currentGeneration ?? 0),
    bestFitness: round(bestFitness),
    averageFitness: round(averageFitness),
    championFitness: round(championFitness),
    championImproved,
    neuralChampionValid: Boolean(championValid),
    championValid: Boolean(championValid),
    championStatus: championValid ? 'valid-champion' : championStatus,
    bestAgentId: bestAgent?.agentId ?? null,
    bestGoalReached: bestAgent?.bestGoalReached ?? 'none',
    bestCandidate: sanitizeBestCandidateForReport(resolvedBestCandidate),
    bestCandidateFailureReason: resolvedBestCandidateFailureReason,
    woodCollectedByBest: Number(bestAgent?.woodCollected ?? 0),
    deathsByBest: Number(bestAgent?.deaths ?? 0),
    blockedActionsByBest: Number(bestAgent?.blockedCount ?? 0),
    hardRecoveryMisuseCount: agentResults.reduce((total, agent) => total + Number(agent.hardRecoveryMisuseCount ?? 0), 0),
    movementPingPongDetected: agentResults.some((agent) => agent.movementPingPongDetected),
    trainingContaminated: Boolean(trainingContaminated || agentResults.some((agent) => agent.trainingContaminated)),
    fitnessValid: allFitnessValid,
    fitnessInvalidReason: fitnessInvalidReason ?? (!allFitnessValid ? resolvedBestCandidateFailureReason : null),
    championSaved: Boolean(championSaved && championValid),
    populationEvaluated: Boolean(populationEvaluated || agentResults.length > 0),
    agentsEvaluated: Number(agentsEvaluated ?? agentResults.length),
    validChampionFound: Boolean(validChampionFound || agentResults.some((agent) => validateNeuralChampionCandidate({
      fitness: agent.fitness,
      summary: {
        status: agent.episodeResult?.status,
        fitnessValid: agent.fitnessValid,
        trainingContaminated: agent.trainingContaminated,
        woodCollected: agent.woodCollected,
        bestGoalReached: agent.bestGoalReached,
      },
    }).valid)),
    nearestTargetWasNullTooLong: Boolean(nearestTargetWasNullTooLong || agentResults.some((agent) => agent.nearestTargetWasNullTooLong)),
    targetSensorFailure: Boolean(targetSensorFailure || agentResults.some((agent) => agent.targetSensorFailure)),
    selectedActionExecuted: Boolean(selectedActionExecuted || agentResults.some((agent) => agent.selectedActionExecuted)),
    selectedActionExecutionResult: selectedActionExecutionResult ?? bestAgent?.selectedActionExecutionResult ?? null,
    neuralActionCounts: sumNeuralActionCounts(agentResults, neuralActionCounts),
    neuralMineAttempts: Number(neuralMineAttempts || agentResults.reduce((total, agent) => total + Number(agent.neuralMineAttempts ?? 0), 0)),
    neuralExploreSteps: Number(neuralExploreSteps || agentResults.reduce((total, agent) => total + Number(agent.neuralExploreSteps ?? 0), 0)),
    neuralWoodCollected: Number(neuralWoodCollected || bestAgent?.neuralWoodCollected || bestAgent?.woodCollected || 0),
    plannerOnlyFitness: round(baselineFitness),
    championEpisodeFitness: round(championEpisodeFitness),
    neuralAssistedFitness: round(bestFitness),
    didNeuralImprove: bestFitness > baselineFitness,
    didChampionBeatPrevious: championImproved,
    strategyImproved: bestAgent?.bestGoalReached ?? 'none',
    failedStrategy: bestAgent?.blockedCount > 0 ? 'blocked-actions' : null,
    recommendedNextTrainingTarget: getRecommendedNextTrainingTarget(bestAgent),
    agentResults: agentResults.map((agent) => ({ ...agent })),
  };
}

export function createBrowserNeuralStorage() {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage;
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getRecommendedNextTrainingTarget(bestAgent = null) {
  if (!bestAgent || Number(bestAgent.woodCollected ?? 0) <= 0) {
    return 'Collect first wood reliably.';
  }

  if (bestAgent.bestGoalReached === 'gatherWood') {
    return 'Craft planks after first wood collection.';
  }

  if (bestAgent.bestGoalReached === 'craftPlanks' || bestAgent.bestGoalReached === 'craftTools') {
    return 'Craft wooden pickaxe and gather stone.';
  }

  if (bestAgent.bestGoalReached === 'gatherStone') {
    return 'Build shelter without blocked placement loops.';
  }

  return 'Extend survival chain beyond the current best goal.';
}

export function validateNeuralChampionCandidate(candidate = null) {
  const fitness = Number(candidate?.fitness ?? 0);
  const summary = candidate?.summary ?? candidate ?? {};
  const reason = getChampionInvalidReason(summary, fitness);

  return {
    valid: !reason,
    reason,
  };
}

function resolveStoredChampion(parsed = null) {
  if (!parsed) {
    return {
      serialized: null,
      genome: null,
      validation: validateNeuralChampionCandidate(null),
    };
  }

  const hasChampionField = Object.prototype.hasOwnProperty.call(parsed, 'champion');
  const serialized = hasChampionField ? parsed.champion : parsed;

  if (!serialized) {
    return {
      serialized: null,
      genome: null,
      validation: validateNeuralChampionCandidate(null),
    };
  }

  try {
    const genome = NeuralGenome.deserialize(serialized);

    return {
      serialized,
      genome,
      validation: validateNeuralChampionCandidate(genome),
    };
  } catch {
    return {
      serialized: null,
      genome: null,
      validation: validateNeuralChampionCandidate(null),
    };
  }
}

export function getChampionInvalidReason(summary = {}, fitness = 0) {
  if (!summary) {
    return 'missing-summary';
  }

  if (Number(fitness ?? summary.fitness ?? 0) <= 0) {
    return 'fitness-not-positive';
  }

  if (summary.fitnessValid === false) {
    return summary.fitnessInvalidReason ?? 'fitness-invalid';
  }

  if (summary.trainingContaminated) {
    return 'training-contaminated';
  }

  if (summary.status === 'failed') {
    return 'episode-failed';
  }

  if (Number(summary.woodCollected ?? 0) < 1) {
    return 'missing-first-wood';
  }

  if (!summary.bestGoalReached || summary.bestGoalReached === 'none') {
    return 'no-goal-progress';
  }

  return null;
}

function getFitnessInvalidReason(summary = {}, snapshot = {}) {
  const reasons = [];
  const elapsedSeconds = Number(summary.elapsedSeconds ?? snapshot.elapsedSeconds ?? 0);
  const mineCount = Number(snapshot.actionCounts?.mine ?? summary.actionHistory?.mine ?? 0);

  if (summary.status === 'failed') {
    reasons.push('episode-failed');
  }

  if (elapsedSeconds >= 60 && Number(summary.woodCollected ?? 0) <= 0) {
    reasons.push('no-wood-after-starter-window');
  }

  if (mineCount <= 0) {
    reasons.push('mine-count-zero');
  }

  if (summary.bestGoalReached === 'none') {
    reasons.push('no-goal-progress');
  }

  if (summary.progressionTierReached === 'starter' && Number(summary.completedGoalCount ?? 0) <= 0) {
    reasons.push('starter-tier-no-completions');
  }

  if (snapshot.neuralEvolution?.nearestTargetWasNullTooLong) {
    reasons.push('nearest-target-null-too-long');
  }

  if (snapshot.neuralEvolution?.selectedActionExecuted === false) {
    reasons.push('selected-action-not-executed');
  }

  if (summary.trainingContaminated) {
    reasons.push('training-contaminated');
  }

  if (Number(summary.hardRecoveryMisuseCount ?? 0) > 0) {
    reasons.push('hard-recovery-misuse');
  }

  return reasons.length > 0 ? reasons.join('; ') : null;
}

function createBestCandidateRecord({ genome, validation, generation } = {}) {
  if (!genome) {
    return null;
  }

  return {
    genomeId: genome.id ?? null,
    generation: Number(generation ?? genome.generation ?? 0),
    fitness: round(genome.fitness ?? 0),
    status: genome.summary?.status ?? 'unknown',
    progressionTierReached: genome.summary?.progressionTierReached ?? 'starter',
    bestGoalReached: genome.summary?.bestGoalReached ?? 'none',
    completedGoalCount: Number(genome.summary?.completedGoalCount ?? 0),
    woodCollected: Number(genome.summary?.woodCollected ?? 0),
    fitnessValid: genome.summary?.fitnessValid !== false,
    failureReason: validation?.reason ?? getChampionInvalidReason(genome.summary, genome.fitness),
    summary: genome.summary ? { ...genome.summary } : null,
    genome: genome.serialize(),
  };
}

function createBestCandidateRecordFromAgent(agent = null) {
  if (!agent) {
    return null;
  }

  return {
    agentId: agent.agentId ?? null,
    genomeId: agent.genomeId ?? null,
    generation: Number(agent.generation ?? 0),
    fitness: round(agent.fitness ?? 0),
    status: agent.episodeResult?.status ?? 'unknown',
    progressionTierReached: agent.progressTier ?? 'starter',
    bestGoalReached: agent.bestGoalReached ?? 'none',
    completedGoalCount: Number(agent.completedGoalCount ?? 0),
    woodCollected: Number(agent.woodCollected ?? 0),
    fitnessValid: agent.fitnessValid !== false,
    failureReason: agent.fitnessInvalidReason ?? getChampionInvalidReason({
      status: agent.episodeResult?.status,
      fitnessValid: agent.fitnessValid,
      woodCollected: agent.woodCollected,
      bestGoalReached: agent.bestGoalReached,
      trainingContaminated: agent.trainingContaminated,
    }, agent.fitness),
  };
}

function sanitizeBestCandidateForReport(candidate = null) {
  if (!candidate) {
    return null;
  }

  return {
    agentId: candidate.agentId ?? null,
    genomeId: candidate.genomeId ?? null,
    generation: Number(candidate.generation ?? 0),
    fitness: round(candidate.fitness ?? 0),
    status: candidate.status ?? candidate.summary?.status ?? 'unknown',
    progressionTierReached: candidate.progressionTierReached ?? candidate.summary?.progressionTierReached ?? 'starter',
    bestGoalReached: candidate.bestGoalReached ?? candidate.summary?.bestGoalReached ?? 'none',
    completedGoalCount: Number(candidate.completedGoalCount ?? candidate.summary?.completedGoalCount ?? 0),
    woodCollected: Number(candidate.woodCollected ?? candidate.summary?.woodCollected ?? 0),
    fitnessValid: candidate.fitnessValid !== false,
    failureReason: candidate.failureReason ?? null,
  };
}

function sumNeuralActionCounts(agentResults = [], baseCounts = {}) {
  const summed = { ...baseCounts };

  for (const agent of agentResults) {
    for (const [action, count] of Object.entries(agent.neuralActionCounts ?? {})) {
      summed[action] = Number(summed[action] ?? 0) + Number(count ?? 0);
    }
  }

  return summed;
}
