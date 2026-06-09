import { DEFAULT_NEURAL_ARCHITECTURE, createSeededRandom } from './neuralNetwork.js';
import { NeuralGenome } from './neuralGenome.js';
import { NeuralPopulation } from './neuralPopulation.js';

export const AI_NEURAL_CHAMPION_STORAGE_KEY = 'godoy:ai-neural-champion';
export const DEFAULT_NEURAL_TRAINING_OPTIONS = Object.freeze({
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
    this.champion = this.loadChampion();
  }

  async train({
    generations = DEFAULT_NEURAL_TRAINING_OPTIONS.generations,
    populationSize = DEFAULT_NEURAL_TRAINING_OPTIONS.populationSize,
    durationSeconds = DEFAULT_NEURAL_TRAINING_OPTIONS.episodeDurationSeconds,
    seed = 1337,
    runEpisode,
  } = {}) {
    if (typeof runEpisode !== 'function') {
      throw new Error('NeuralTrainer requires a runEpisode callback.');
    }

    const random = createSeededRandom(seed);
    const population = new NeuralPopulation({
      populationSize,
      mutationRate: this.mutationRate,
      mutationStrength: this.mutationStrength,
      architecture: this.architecture,
      random,
    });

    if (this.champion) {
      population.genomes[0] = this.champion.clone({
        generation: population.generation,
      });
    }

    for (let generationIndex = 0; generationIndex < generations; generationIndex += 1) {
      for (const genome of population.genomes) {
        const episodeResult = await runEpisode({
          genome,
          generation: population.generation,
          durationSeconds,
        });

        genome.withFitness(
          episodeResult.fitness,
          createRunSummary(episodeResult.snapshot),
        );
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
      };

      this.trainingHistory.push(generationSummary);
      this.trainingHistory = this.trainingHistory.slice(-50);

      if (!this.champion || champion.fitness >= this.champion.fitness) {
        this.champion = champion.clone({
          generation: population.generation,
        });
        this.champion.withFitness(champion.fitness, champion.summary);
        this.saveChampion({
          generation: population.generation,
          populationSize,
          durationSeconds,
        });
      }

      if (generationIndex < generations - 1) {
        population.evolve({ random });
      }
    }

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
      return true;
    } catch {
      return false;
    }
  }
}

export function createRunSummary(snapshot = {}) {
  const completedGoals = snapshot.planner?.goalsCompleted ?? [];
  const lastCompletedGoal = completedGoals.at(-1);

  return {
    status: snapshot.status ?? 'unknown',
    elapsedSeconds: Number(snapshot.elapsedSeconds ?? 0),
    fitness: Number(snapshot.neuralAgent?.currentFitness ?? 0),
    progressionTierReached: snapshot.planner?.progressionTierReached ?? 'starter',
    bestGoalReached: lastCompletedGoal?.id ?? 'none',
    completedGoalCount: completedGoals.length,
    woodCollected: Number(snapshot.currentInventory?.wood ?? snapshot.inventoryDelta?.wood ?? 0),
    deaths: Number(snapshot.failureCounts?.deathLoops ?? 0) + Number(snapshot.telemetryDeaths ?? 0),
    recoveryCount: Number(snapshot.hardRecoveryCount ?? 0),
    failures: (snapshot.failures ?? []).map((failure) => failure.code).slice(0, 8),
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
