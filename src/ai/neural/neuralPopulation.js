import { DEFAULT_NEURAL_ARCHITECTURE } from './neuralNetwork.js';
import { NeuralGenome } from './neuralGenome.js';

export class NeuralPopulation {
  constructor({
    genomes = [],
    populationSize = 32,
    generation = 0,
    mutationRate = 0.08,
    mutationStrength = 0.35,
    eliteCount = 2,
    architecture = DEFAULT_NEURAL_ARCHITECTURE,
    random = Math.random,
  } = {}) {
    this.populationSize = Math.max(1, Math.floor(Number(populationSize) || 32));
    this.generation = Number(generation ?? 0);
    this.mutationRate = Number(mutationRate ?? 0.08);
    this.mutationStrength = Number(mutationStrength ?? 0.35);
    this.eliteCount = Math.max(1, Math.floor(Number(eliteCount) || 1));
    this.architecture = {
      inputCount: architecture.inputCount,
      hiddenLayers: [...architecture.hiddenLayers],
      outputCount: architecture.outputCount,
    };
    this.genomes = genomes.length > 0
      ? genomes.map((genome) => genome instanceof NeuralGenome ? genome : NeuralGenome.deserialize(genome))
      : createRandomGenomes({
        populationSize: this.populationSize,
        architecture: this.architecture,
        generation: this.generation,
        mutationRate: this.mutationRate,
        random,
      });
  }

  getChampion() {
    return [...this.genomes]
      .sort((left, right) => right.fitness - left.fitness)[0] ?? null;
  }

  getAverageFitness() {
    if (this.genomes.length === 0) {
      return 0;
    }

    return this.genomes.reduce((total, genome) => total + Number(genome.fitness ?? 0), 0) / this.genomes.length;
  }

  evolve({ random = Math.random } = {}) {
    const sorted = [...this.genomes].sort((left, right) => right.fitness - left.fitness);
    const elites = sorted.slice(0, Math.min(this.eliteCount, sorted.length));
    const parentPool = sorted.slice(0, Math.max(2, Math.ceil(sorted.length / 3)));
    const nextGeneration = this.generation + 1;
    const nextGenomes = elites.map((elite) => elite.clone({
      generation: nextGeneration,
    }));

    while (nextGenomes.length < this.populationSize) {
      const parentA = pickParent(parentPool, random);
      const parentB = pickParent(parentPool, random);
      const child = parentA.crossover(parentB, {
        random,
        generation: nextGeneration,
      }).mutate({
        mutationRate: this.mutationRate,
        mutationStrength: this.mutationStrength,
        random,
        generation: nextGeneration,
      });

      nextGenomes.push(child);
    }

    this.generation = nextGeneration;
    this.genomes = nextGenomes;

    return this;
  }

  serialize() {
    return {
      generation: this.generation,
      populationSize: this.populationSize,
      mutationRate: this.mutationRate,
      mutationStrength: this.mutationStrength,
      eliteCount: this.eliteCount,
      architecture: {
        inputCount: this.architecture.inputCount,
        hiddenLayers: [...this.architecture.hiddenLayers],
        outputCount: this.architecture.outputCount,
      },
      genomes: this.genomes.map((genome) => genome.serialize()),
    };
  }

  static deserialize(serializedPopulation) {
    return new NeuralPopulation({
      generation: serializedPopulation?.generation ?? 0,
      populationSize: serializedPopulation?.populationSize ?? serializedPopulation?.genomes?.length ?? 32,
      mutationRate: serializedPopulation?.mutationRate ?? 0.08,
      mutationStrength: serializedPopulation?.mutationStrength ?? 0.35,
      eliteCount: serializedPopulation?.eliteCount ?? 2,
      architecture: serializedPopulation?.architecture ?? DEFAULT_NEURAL_ARCHITECTURE,
      genomes: serializedPopulation?.genomes ?? [],
    });
  }
}

function createRandomGenomes({ populationSize, architecture, generation, mutationRate, random }) {
  return Array.from({ length: populationSize }, () => NeuralGenome.random({
    architecture,
    generation,
    mutationRate,
    random,
  }));
}

function pickParent(parents, random) {
  if (parents.length === 1) {
    return parents[0];
  }

  const totalWeight = parents.reduce((total, _parent, index) => total + (parents.length - index), 0);
  let roll = random() * totalWeight;

  for (let index = 0; index < parents.length; index += 1) {
    roll -= parents.length - index;

    if (roll <= 0) {
      return parents[index];
    }
  }

  return parents[0];
}
