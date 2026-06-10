import { DEFAULT_NEURAL_ARCHITECTURE, createSeededRandom } from './neuralNetwork.js';
import { NeuralGenome } from './neuralGenome.js';
import { NeuralPopulation } from './neuralPopulation.js';

export const AI_NEURAL_CHAMPION_STORAGE_KEY = 'godoy:ai-neural-champion';
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
    this.lastEvolutionSnapshot = createNeuralEvolutionSnapshot({
      mode: DEFAULT_NEURAL_TRAINING_OPTIONS.mode,
      mutationRate: this.mutationRate,
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
      };

      this.trainingHistory.push(generationSummary);
      this.trainingHistory = this.trainingHistory.slice(-50);

      if (!this.champion || champion.fitness >= this.champion.fitness) {
        this.champion = champion.clone({
          generation: population.generation,
        });
        this.champion.withFitness(champion.fitness, champion.summary);
        this.saveChampion({
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
      generationsCompleted: generations,
      currentGeneration: this.champion?.generation ?? 0,
      mutationRate: this.mutationRate,
      agentResults: this.lastAgentResults,
      championFitness: Number(this.champion?.fitness ?? 0),
      previousChampionFitness,
      baselineResult,
      championResult,
      championSaved: Boolean(this.champion),
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
      const champion = parsed?.champion ?? parsed;

      if (!champion) {
        return null;
      }

      this.trainingHistory = parsed.trainingHistory ?? [];
      this.championCreatedAt = parsed.createdAt ?? parsed.savedAt ?? null;
      return NeuralGenome.deserialize(champion);
    } catch {
      return null;
    }
  }

  saveChampion(metadata = {}) {
    if (!this.storage || !this.champion) {
      return false;
    }

    const payload = {
      schemaVersion: 1,
      createdAt: this.championCreatedAt ?? this.now(),
      updatedAt: this.now(),
      savedAt: this.now(),
      generation: this.champion.generation,
      fitness: this.champion.fitness,
      mutationRate: this.mutationRate,
      architecture: this.architecture,
      trainingHistory: this.trainingHistory.map((entry) => ({ ...entry })),
      bestRunSummary: this.champion.summary ? { ...this.champion.summary } : null,
      metadata,
      champion: this.champion.serialize(),
    };

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(payload, null, 2));
      this.championCreatedAt = payload.createdAt;
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

  return {
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
    woodCollected: Number(summary?.woodCollected ?? 0),
    deaths: Number(summary?.deaths ?? 0),
    blockedCount: Number(summary?.blockedActions ?? 0),
    hardRecoveryMisuseCount: Number(summary?.hardRecoveryMisuseCount ?? 0),
    movementPingPongDetected: Boolean(summary?.movementPingPongDetected),
    trainingContaminated: Boolean(summary?.trainingContaminated),
    fitnessValid: summary?.fitnessValid !== false,
    timeAliveSeconds: Number(summary?.elapsedSeconds ?? snapshot.elapsedSeconds ?? 0),
    actionHistory: { ...(snapshot.actionCounts ?? {}) },
    sensorHistory: neuralAgent.sensorSnapshot ? [neuralAgent.sensorSnapshot] : [],
    selectedAction: neuralAgent.selectedAction ?? null,
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
  generationsCompleted = 0,
  currentGeneration = 0,
  mutationRate = DEFAULT_NEURAL_TRAINING_OPTIONS.mutationRate,
  agentResults = [],
  championFitness = 0,
  previousChampionFitness = Number.NEGATIVE_INFINITY,
  baselineResult = null,
  championResult = null,
  championSaved = false,
  trainingContaminated = false,
  fitnessValid = true,
} = {}) {
  const bestAgent = [...agentResults].sort((left, right) => Number(right.fitness ?? 0) - Number(left.fitness ?? 0))[0] ?? null;
  const averageFitness = agentResults.length > 0
    ? agentResults.reduce((total, agent) => total + Number(agent.fitness ?? 0), 0) / agentResults.length
    : 0;
  const baselineFitness = Number(baselineResult?.snapshot?.neuralAgent?.currentFitness ?? baselineResult?.fitness ?? 0);
  const championEpisodeFitness = Number(championResult?.snapshot?.neuralAgent?.currentFitness ?? championResult?.fitness ?? championFitness ?? 0);
  const bestFitness = Number(bestAgent?.fitness ?? championEpisodeFitness ?? 0);
  const championImproved = Number.isFinite(previousChampionFitness) && championFitness > previousChampionFitness;

  return {
    enabled: Boolean(enabled),
    mode,
    trainingActive: Boolean(trainingActive),
    populationSize: Number(populationSize ?? 0),
    generationsCompleted: Number(generationsCompleted ?? 0),
    currentGeneration: Number(currentGeneration ?? 0),
    bestFitness: round(bestFitness),
    averageFitness: round(averageFitness),
    championFitness: round(championFitness),
    championImproved,
    bestAgentId: bestAgent?.agentId ?? null,
    bestGoalReached: bestAgent?.bestGoalReached ?? 'none',
    woodCollectedByBest: Number(bestAgent?.woodCollected ?? 0),
    deathsByBest: Number(bestAgent?.deaths ?? 0),
    blockedActionsByBest: Number(bestAgent?.blockedCount ?? 0),
    hardRecoveryMisuseCount: agentResults.reduce((total, agent) => total + Number(agent.hardRecoveryMisuseCount ?? 0), 0),
    movementPingPongDetected: agentResults.some((agent) => agent.movementPingPongDetected),
    trainingContaminated: Boolean(trainingContaminated || agentResults.some((agent) => agent.trainingContaminated)),
    fitnessValid: Boolean(fitnessValid && agentResults.every((agent) => agent.fitnessValid)),
    championSaved: Boolean(championSaved),
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
