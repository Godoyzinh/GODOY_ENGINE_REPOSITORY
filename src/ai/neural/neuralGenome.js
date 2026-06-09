import { DEFAULT_NEURAL_ARCHITECTURE, NeuralNetwork } from './neuralNetwork.js';

let nextGenomeId = 1;

export class NeuralGenome {
  constructor({
    id = createGenomeId(),
    network = new NeuralNetwork(DEFAULT_NEURAL_ARCHITECTURE),
    generation = 0,
    fitness = 0,
    mutationRate = 0.08,
    summary = null,
  } = {}) {
    this.id = id;
    this.network = network instanceof NeuralNetwork
      ? network
      : NeuralNetwork.deserialize(network);
    this.generation = Number(generation ?? 0);
    this.fitness = Number(fitness ?? 0);
    this.mutationRate = Number(mutationRate ?? 0.08);
    this.summary = summary ? { ...summary } : null;
  }

  clone({ id = createGenomeId(), generation = this.generation } = {}) {
    return new NeuralGenome({
      id,
      network: this.network.clone(),
      generation,
      fitness: this.fitness,
      mutationRate: this.mutationRate,
      summary: this.summary,
    });
  }

  mutate({ mutationRate = this.mutationRate, mutationStrength = 0.35, random = Math.random, generation = this.generation + 1 } = {}) {
    return new NeuralGenome({
      network: this.network.mutate({
        mutationRate,
        mutationStrength,
        random,
      }),
      generation,
      fitness: 0,
      mutationRate,
    });
  }

  crossover(otherGenome, { random = Math.random, generation = this.generation + 1 } = {}) {
    const other = otherGenome instanceof NeuralGenome
      ? otherGenome
      : NeuralGenome.deserialize(otherGenome);

    return new NeuralGenome({
      network: this.network.crossover(other.network, { random }),
      generation,
      fitness: 0,
      mutationRate: (this.mutationRate + other.mutationRate) / 2,
    });
  }

  withFitness(fitness, summary = null) {
    this.fitness = Number(fitness ?? 0);
    this.summary = summary ? { ...summary } : this.summary;
    return this;
  }

  serialize() {
    return {
      id: this.id,
      generation: this.generation,
      fitness: this.fitness,
      mutationRate: this.mutationRate,
      summary: this.summary ? { ...this.summary } : null,
      network: this.network.serialize(),
    };
  }

  static random({ architecture = DEFAULT_NEURAL_ARCHITECTURE, generation = 0, mutationRate = 0.08, random = Math.random } = {}) {
    return new NeuralGenome({
      network: new NeuralNetwork({
        ...architecture,
        random,
      }),
      generation,
      mutationRate,
    });
  }

  static deserialize(serializedGenome) {
    return new NeuralGenome({
      id: serializedGenome?.id ?? createGenomeId(),
      generation: serializedGenome?.generation ?? 0,
      fitness: serializedGenome?.fitness ?? 0,
      mutationRate: serializedGenome?.mutationRate ?? 0.08,
      summary: serializedGenome?.summary ?? null,
      network: NeuralNetwork.deserialize(serializedGenome?.network ?? serializedGenome),
    });
  }
}

function createGenomeId() {
  const id = `genome-${nextGenomeId}`;

  nextGenomeId += 1;
  return id;
}
